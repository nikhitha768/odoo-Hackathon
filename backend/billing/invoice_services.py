"""Business logic and services for Invoices, bulk generation, discounts, and notifications."""

from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from billing.models import Invoice, InvoiceLine
from catalog.models import Discount, Product, Tax
from subscriptions.models import Subscription


def advance_date_by_period(current_date, billing_period):
    """Advance a date according to plan billing period recurrence."""
    if billing_period == "daily":
        return current_date + timedelta(days=1)
    elif billing_period == "weekly":
        return current_date + timedelta(days=7)
    elif billing_period == "monthly":
        return current_date + timedelta(days=30)
    elif billing_period == "yearly":
        return current_date + timedelta(days=365)
    return current_date + timedelta(days=30)


def calculate_period_end(period_start, billing_period):
    """Compute period end date based on recurrence interval."""
    if billing_period == "daily":
        return period_start
    elif billing_period == "weekly":
        return period_start + timedelta(days=6)
    elif billing_period == "monthly":
        return period_start + timedelta(days=30)
    elif billing_period == "yearly":
        return period_start + timedelta(days=364)
    return period_start + timedelta(days=30)


def evaluate_discount_eligibility(discount, lines_data, as_of_date=None):
    """
    Evaluates whether a discount qualifies according to business rules:
    - is_active is True
    - today (or as_of_date) is within start_date and end_date
    - times_used is below usage_limit (when usage_limit is set)
    - min_purchase and min_quantity are satisfied
    - applies_to matches (product-only discounts must match at least one product)

    Returns:
        (is_eligible: bool, error_message: str or None, matching_lines: list)
    """
    if as_of_date is None:
        as_of_date = timezone.localdate()

    if not discount.is_active:
        return False, "Discount is inactive.", []

    if as_of_date < discount.start_date or as_of_date > discount.end_date:
        return False, "Discount is not valid for the current date.", []

    if discount.usage_limit is not None and discount.times_used >= discount.usage_limit:
        return False, "Discount usage limit has been reached.", []

    if discount.applies_to == Discount.AppliesTo.PRODUCT:
        # Pre-fetched or queried product IDs
        if hasattr(discount, "_prefetched_objects_cache") and "products" in discount._prefetched_objects_cache:
            discount_product_ids = {p.id for p in discount.products.all()}
        else:
            discount_product_ids = set(discount.products.values_list("id", flat=True))

        matching_lines = [
            line for line in lines_data if line["product"].id in discount_product_ids
        ]
        if not matching_lines:
            return False, "Discount products do not match any invoice line.", []

        matching_purchase = sum(line["line_subtotal"] for line in matching_lines)
        matching_quantity = sum(line["quantity"] for line in matching_lines)

        if discount.min_purchase is not None and matching_purchase < discount.min_purchase:
            return False, f"Minimum purchase amount of {discount.min_purchase} not met.", []

        if discount.min_quantity is not None and matching_quantity < discount.min_quantity:
            return False, f"Minimum quantity of {discount.min_quantity} not met.", []

        return True, None, matching_lines

    elif discount.applies_to == Discount.AppliesTo.SUBSCRIPTION:
        total_purchase = sum(line["line_subtotal"] for line in lines_data)
        total_quantity = sum(line["quantity"] for line in lines_data)

        if discount.min_purchase is not None and total_purchase < discount.min_purchase:
            return False, f"Minimum purchase amount of {discount.min_purchase} not met.", []

        if discount.min_quantity is not None and total_quantity < discount.min_quantity:
            return False, f"Minimum quantity of {discount.min_quantity} not met.", []

        return True, None, lines_data

    return False, "Unknown discount applies_to type.", []


def find_eligible_discount(lines_data, as_of_date=None, explicit_discount=None):
    """
    Finds the eligible discount to apply.
    If explicit_discount is provided, validates it.
    Otherwise searches active discounts eligible on as_of_date.
    """
    if as_of_date is None:
        as_of_date = timezone.localdate()

    if explicit_discount:
        is_ok, err, matching = evaluate_discount_eligibility(
            explicit_discount, lines_data, as_of_date=as_of_date
        )
        if not is_ok:
            raise ValidationError(err or "Selected discount is not applicable.")
        return explicit_discount, matching

    # Query active discounts within valid date range and below usage limit
    discounts = (
        Discount.objects.filter(
            is_active=True,
            start_date__lte=as_of_date,
            end_date__gte=as_of_date,
        )
        .filter(Q(usage_limit__isnull=True) | Q(times_used__lt=F("usage_limit")))
        .prefetch_related("products")
        .order_by("-value", "id")
    )

    for disc in discounts:
        is_ok, _, matching = evaluate_discount_eligibility(disc, lines_data, as_of_date=as_of_date)
        if is_ok:
            return disc, matching

    return None, []


def calculate_invoice_totals_and_lines(
    subscription,
    lines_override=None,
    as_of_date=None,
    explicit_discount=None,
):
    """
    Calculates subtotal, discounts, taxes, and totals strictly on the server.
    Order of calculation:
    1. Line subtotal = quantity x unit_price
    2. Apply eligible discount
    3. Tax on the discounted amount
    4. Totals = subtotal - discount_total + tax_total
    """
    if as_of_date is None:
        as_of_date = timezone.localdate()

    lines_data = []

    if lines_override:
        for item in lines_override:
            product_id = item.get("product")
            product = Product.objects.filter(pk=product_id).select_related("default_tax").first()
            if not product:
                continue
            qty = int(item.get("quantity", 1))
            unit_price = (
                Decimal(str(item.get("unit_price")))
                if item.get("unit_price") is not None
                else Decimal(str(product.sales_price))
            )
            tax = getattr(product, "default_tax", None)
            line_subtotal = (Decimal(qty) * unit_price).quantize(Decimal("0.01"))

            lines_data.append(
                {
                    "product": product,
                    "description": item.get("description") or product.name,
                    "quantity": qty,
                    "unit_price": unit_price,
                    "tax": tax,
                    "line_subtotal": line_subtotal,
                    "discount_amount": Decimal("0.00"),
                }
            )
    else:
        sub_lines = subscription.lines.select_related(
            "product", "product__default_tax", "tax"
        )
        for sub_line in sub_lines:
            qty = sub_line.quantity
            unit_price = Decimal(str(sub_line.unit_price))
            tax = sub_line.tax or getattr(sub_line.product, "default_tax", None)
            line_subtotal = (Decimal(qty) * unit_price).quantize(Decimal("0.01"))

            lines_data.append(
                {
                    "product": sub_line.product,
                    "description": f"{sub_line.product.name}",
                    "quantity": qty,
                    "unit_price": unit_price,
                    "tax": tax,
                    "line_subtotal": line_subtotal,
                    "discount_amount": Decimal("0.00"),
                }
            )

    applied_discount, matching_lines = find_eligible_discount(
        lines_data, as_of_date=as_of_date, explicit_discount=explicit_discount
    )

    if applied_discount and matching_lines:
        matching_subtotal = sum(line["line_subtotal"] for line in matching_lines)

        if applied_discount.type == Discount.DiscountType.PERCENT:
            for line in matching_lines:
                disc_val = (
                    (line["line_subtotal"] * applied_discount.value) / Decimal("100.00")
                ).quantize(Decimal("0.01"))
                line["discount_amount"] = min(disc_val, line["line_subtotal"])
        elif applied_discount.type == Discount.DiscountType.FIXED:
            # Fixed discount is a flat amount, never taking total below zero
            total_fixed_disc = min(applied_discount.value, matching_subtotal)
            remaining_disc = total_fixed_disc
            for line in matching_lines:
                alloc = min(remaining_disc, line["line_subtotal"])
                line["discount_amount"] = alloc
                remaining_disc -= alloc

    # Now calculate line taxes and amounts on discounted base
    lines_to_create = []
    subtotal = Decimal("0.00")
    discount_total = Decimal("0.00")
    tax_total = Decimal("0.00")

    for line in lines_data:
        l_sub = line["line_subtotal"]
        l_disc = line["discount_amount"]
        discounted_sub = max(Decimal("0.00"), l_sub - l_disc)

        tax = line["tax"]
        tax_rate = Decimal(str(tax.rate_percent)) if tax else Decimal("0.00")
        line_tax = ((discounted_sub * tax_rate) / Decimal("100.00")).quantize(Decimal("0.01"))
        line_amount = (discounted_sub + line_tax).quantize(Decimal("0.01"))

        subtotal += l_sub
        discount_total += l_disc
        tax_total += line_tax

        lines_to_create.append(
            {
                "product": line["product"],
                "description": line["description"],
                "quantity": line["quantity"],
                "unit_price": line["unit_price"],
                "discount_amount": l_disc,
                "tax_rate_percent": tax_rate,
                "tax_amount": line_tax,
                "amount": line_amount,
            }
        )

    total = (subtotal - discount_total + tax_total).quantize(Decimal("0.01"))

    return {
        "subtotal": subtotal,
        "discount_total": discount_total,
        "tax_total": tax_total,
        "total": total,
        "lines_to_create": lines_to_create,
        "applied_discount": applied_discount,
    }


def generate_invoice_for_subscription(
    subscription,
    period_start=None,
    period_end=None,
    issue_date=None,
    due_date=None,
    lines_override=None,
    explicit_discount=None,
):
    """
    Creates an Invoice and InvoiceLines for an Active subscription.
    Enforces 'never bill twice' constraint and increments discount.times_used via F().
    """
    # 1. Only subscriptions in Active status can be invoiced
    if subscription.status != Subscription.Status.ACTIVE:
        raise ValidationError("Only active subscriptions can be invoiced.")

    billing_period = getattr(subscription.plan, "billing_period", "monthly")
    period_start = period_start or subscription.next_invoice_date
    period_end = period_end or calculate_period_end(period_start, billing_period)
    issue_date = issue_date or timezone.localdate()
    payment_term_days = getattr(subscription, "payment_term_days", 15)
    due_date = due_date or (issue_date + timedelta(days=payment_term_days))

    # 2. Never bill twice for the same subscription and period
    existing = (
        Invoice.objects.filter(subscription=subscription, period_start=period_start)
        .exclude(status=Invoice.Status.CANCELLED)
        .first()
    )
    if existing:
        raise ValidationError("An active invoice for this subscription and period already exists.")

    calculation = calculate_invoice_totals_and_lines(
        subscription=subscription,
        lines_override=lines_override,
        as_of_date=issue_date,
        explicit_discount=explicit_discount,
    )

    applied_discount = calculation["applied_discount"]

    with transaction.atomic():
        invoice = Invoice.objects.create(
            subscription=subscription,
            customer=subscription.customer,
            period_start=period_start,
            period_end=period_end,
            issue_date=issue_date,
            due_date=due_date,
            status=Invoice.Status.DRAFT,
            subtotal=calculation["subtotal"],
            discount_total=calculation["discount_total"],
            tax_total=calculation["tax_total"],
            total=calculation["total"],
            amount_paid=Decimal("0.00"),
            discount=applied_discount,
        )

        for line_kwargs in calculation["lines_to_create"]:
            InvoiceLine.objects.create(invoice=invoice, **line_kwargs)

        if applied_discount:
            Discount.objects.filter(pk=applied_discount.pk).update(times_used=F("times_used") + 1)

    return invoice


def bulk_generate_invoices(as_of_date=None):
    """
    Bulk billing run for Active subscriptions due on or before as_of_date.
    Uses select_related and prefetch_related for high performance.
    Uses transaction.atomic per subscription so one failure does not stop the run.
    """
    if as_of_date is None:
        as_of_date = timezone.localdate()

    subscriptions = (
        Subscription.objects.filter(
            status=Subscription.Status.ACTIVE,
            next_invoice_date__lte=as_of_date,
        )
        .select_related("customer", "plan")
        .prefetch_related(
            "lines",
            "lines__product",
            "lines__product__default_tax",
            "lines__tax",
            "lines__variant",
        )
        .order_by("id")
    )

    existing_periods = set(
        Invoice.objects.filter(subscription__in=subscriptions)
        .exclude(status=Invoice.Status.CANCELLED)
        .values_list("subscription_id", "period_start")
    )

    created_ids = []
    created = 0
    skipped = 0
    reasons = []

    for sub in subscriptions:
        period_start = sub.next_invoice_date
        if (sub.id, period_start) in existing_periods:
            skipped += 1
            reasons.append(
                {
                    "subscription_id": sub.id,
                    "number": sub.number,
                    "reason": "An active invoice for this subscription and period already exists.",
                }
            )
            continue

        try:
            with transaction.atomic():
                invoice = generate_invoice_for_subscription(
                    subscription=sub,
                    period_start=period_start,
                    issue_date=as_of_date,
                )
                created_ids.append(invoice.id)
                created += 1

                # Advance next_invoice_date by plan's billing period
                billing_period = getattr(sub.plan, "billing_period", "monthly")
                sub.next_invoice_date = advance_date_by_period(
                    sub.next_invoice_date, billing_period
                )
                sub.save(update_fields=["next_invoice_date"])

        except Exception as exc:
            skipped += 1
            msg = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            reasons.append(
                {
                    "subscription_id": sub.id,
                    "number": sub.number,
                    "reason": msg,
                }
            )

    return {
        "created": created,
        "skipped": skipped,
        "invoice_ids": created_ids,
        "reasons": reasons,
        "skipped_reasons": reasons,
    }


def send_invoice_email(invoice):
    """
    Sends invoice summary email to the customer and sets sent_at timestamp.
    """
    invoice.sent_at = timezone.now()
    invoice.save(update_fields=["sent_at"])

    if invoice.customer and invoice.customer.email:
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "billing@brightloop.local")
        subject = f"Invoice {invoice.number}"
        message = (
            f"Dear {invoice.customer.name},\n\n"
            f"Your invoice {invoice.number} is ready.\n"
            f"Period: {invoice.period_start} to {invoice.period_end}\n"
            f"Total Amount: {invoice.total}\n"
            f"Due Date: {invoice.due_date}\n\n"
            f"Thank you for your business."
        )
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[invoice.customer.email],
                fail_silently=True,
            )
        except Exception:
            pass

    return invoice

