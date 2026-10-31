"""Views for Invoice list, detail, generation, and status actions."""

from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from accounts.pagination import StandardResultsSetPagination
from accounts.permissions import IsStaffOrAdmin
from billing.invoice_serializers import (
    InvoiceCreateSerializer,
    InvoiceGenerateSerializer,
    InvoiceSerializer,
)
from billing.models import Invoice, InvoiceLine
from catalog.models import Product
from subscriptions.models import Subscription


class InvoiceAccessPermission(permissions.BasePermission):
    """
    Invoice endpoint access rules:
    - Anonymous users: 401 Unauthorized
    - Customer users: Read-only (GET, HEAD, OPTIONS)
    - Staff / Admin users: Full read and write access
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        role = getattr(user, "role", None)
        if role in ["admin", "staff"] or getattr(user, "is_staff", False) or user.is_superuser:
            return True
        if role == "customer":
            return request.method in permissions.SAFE_METHODS
        return False


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


def create_invoice_from_subscription_data(
    subscription,
    period_start=None,
    period_end=None,
    issue_date=None,
    due_date=None,
    lines_override=None,
):
    """
    Creates an Invoice and InvoiceLine items for a subscription.
    All totals (subtotal, tax, total) are strictly computed on the server.
    """
    billing_period = getattr(subscription.plan, "billing_period", "monthly")
    period_start = period_start or subscription.next_invoice_date
    period_end = period_end or calculate_period_end(period_start, billing_period)
    issue_date = issue_date or date.today()
    payment_term_days = getattr(subscription, "payment_term_days", 15)
    due_date = due_date or (issue_date + timedelta(days=payment_term_days))

    subtotal = Decimal("0.00")
    discount_total = Decimal("0.00")
    tax_total = Decimal("0.00")

    lines_to_create = []

    if lines_override:
        for item in lines_override:
            product_id = item.get("product")
            product = Product.objects.filter(pk=product_id).first()
            if not product:
                continue
            qty = int(item.get("quantity", 1))
            unit_price = (
                Decimal(str(item.get("unit_price")))
                if item.get("unit_price") is not None
                else Decimal(str(product.sales_price))
            )
            line_subtotal = (Decimal(qty) * unit_price).quantize(Decimal("0.01"))

            tax = getattr(product, "default_tax", None)
            tax_rate = Decimal(str(tax.rate_percent)) if tax else Decimal("0.00")

            line_discount = Decimal("0.00")
            discounted_sub = line_subtotal - line_discount
            line_tax = ((discounted_sub * tax_rate) / Decimal("100.00")).quantize(Decimal("0.01"))
            line_amount = (discounted_sub + line_tax).quantize(Decimal("0.01"))

            subtotal += line_subtotal
            discount_total += line_discount
            tax_total += line_tax

            lines_to_create.append(
                {
                    "product": product,
                    "description": item.get("description") or product.name,
                    "quantity": qty,
                    "unit_price": unit_price,
                    "discount_amount": line_discount,
                    "tax_rate_percent": tax_rate,
                    "tax_amount": line_tax,
                    "amount": line_amount,
                }
            )
    else:
        for sub_line in subscription.lines.select_related("product", "product__default_tax", "tax"):
            qty = sub_line.quantity
            unit_price = Decimal(str(sub_line.unit_price))
            line_subtotal = (Decimal(qty) * unit_price).quantize(Decimal("0.01"))

            tax = sub_line.tax or getattr(sub_line.product, "default_tax", None)
            tax_rate = Decimal(str(tax.rate_percent)) if tax else Decimal("0.00")

            line_discount = Decimal("0.00")
            discounted_sub = line_subtotal - line_discount
            line_tax = ((discounted_sub * tax_rate) / Decimal("100.00")).quantize(Decimal("0.01"))
            line_amount = (discounted_sub + line_tax).quantize(Decimal("0.01"))

            subtotal += line_subtotal
            discount_total += line_discount
            tax_total += line_tax

            lines_to_create.append(
                {
                    "product": sub_line.product,
                    "description": f"{sub_line.product.name}",
                    "quantity": qty,
                    "unit_price": unit_price,
                    "discount_amount": line_discount,
                    "tax_rate_percent": tax_rate,
                    "tax_amount": line_tax,
                    "amount": line_amount,
                }
            )

    total = (subtotal - discount_total + tax_total).quantize(Decimal("0.01"))

    invoice = Invoice.objects.create(
        subscription=subscription,
        customer=subscription.customer,
        period_start=period_start,
        period_end=period_end,
        issue_date=issue_date,
        due_date=due_date,
        status=Invoice.Status.DRAFT,
        subtotal=subtotal,
        discount_total=discount_total,
        tax_total=tax_total,
        total=total,
        amount_paid=Decimal("0.00"),
    )

    for line_kwargs in lines_to_create:
        InvoiceLine.objects.create(invoice=invoice, **line_kwargs)

    return invoice


class InvoiceListCreateView(generics.ListCreateAPIView):
    """
    GET /api/invoices/?status=&customer=&subscription=&overdue=true&from=&to=&search=&page=
    POST /api/invoices/ (Staff or Admin only)
    """

    permission_classes = [InvoiceAccessPermission]
    pagination_class = StandardResultsSetPagination

    def get_serializer_class(self):
        if self.request.method == "POST":
            return InvoiceCreateSerializer
        return InvoiceSerializer

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated):
            return Invoice.objects.none()

        qs = Invoice.objects.select_related(
            "customer", "subscription", "discount"
        ).prefetch_related(
            "lines", "lines__product", "payments"
        )

        role = getattr(user, "role", None)
        if role == "customer":
            # Customers can strictly see only their own invoices
            qs = qs.filter(customer=user)
        else:
            # Staff and admin can filter by customer
            customer_param = self.request.query_params.get("customer")
            if customer_param:
                qs = qs.filter(customer_id=customer_param)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        sub_param = self.request.query_params.get("subscription")
        if sub_param:
            qs = qs.filter(subscription_id=sub_param)

        overdue_param = self.request.query_params.get("overdue")
        if overdue_param is not None:
            today = timezone.localdate()
            if overdue_param.lower() in ["true", "1"]:
                qs = qs.filter(
                    status=Invoice.Status.CONFIRMED,
                    due_date__lt=today,
                    amount_paid__lt=F("total"),
                )
            elif overdue_param.lower() in ["false", "0"]:
                qs = qs.exclude(
                    status=Invoice.Status.CONFIRMED,
                    due_date__lt=today,
                    amount_paid__lt=F("total"),
                )

        from_param = self.request.query_params.get("from")
        if from_param:
            qs = qs.filter(issue_date__gte=from_param)

        to_param = self.request.query_params.get("to")
        if to_param:
            qs = qs.filter(issue_date__lte=to_param)

        search_param = self.request.query_params.get("search")
        if search_param:
            qs = qs.filter(
                Q(number__icontains=search_param)
                | Q(customer__name__icontains=search_param)
                | Q(customer__email__icontains=search_param)
            )

        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Create draft invoice from subscription with server-computed totals."""
        input_serializer = InvoiceCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        subscription = data["subscription"]
        period_start = data.get("period_start", subscription.next_invoice_date)

        # Check unique constraint (subscription, period_start)
        if (
            Invoice.objects.filter(subscription=subscription, period_start=period_start)
            .exclude(status=Invoice.Status.CANCELLED)
            .exists()
        ):
            return Response(
                {"detail": "An active invoice for this subscription and period already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invoice = create_invoice_from_subscription_data(
            subscription=subscription,
            period_start=period_start,
            period_end=data.get("period_end"),
            issue_date=data.get("issue_date"),
            due_date=data.get("due_date"),
            lines_override=data.get("lines"),
        )

        response_serializer = InvoiceSerializer(invoice)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class InvoiceDetailView(generics.RetrieveAPIView):
    """
    GET /api/invoices/{id}/
    Customer sees only their own; gets 404 for anyone else's.
    """

    permission_classes = [InvoiceAccessPermission]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated):
            return Invoice.objects.none()

        qs = Invoice.objects.select_related(
            "customer", "subscription", "discount"
        ).prefetch_related(
            "lines", "lines__product", "payments"
        )

        role = getattr(user, "role", None)
        if role == "customer":
            return qs.filter(customer=user)

        return qs


class InvoiceGenerateView(generics.GenericAPIView):
    """
    POST /api/invoices/generate/ (Staff+ only)
    Payload: {"as_of_date": "YYYY-MM-DD"} (optional)
    Generates draft invoices for active subscriptions whose next_invoice_date <= as_of_date.
    """

    permission_classes = [IsStaffOrAdmin]

    @transaction.atomic
    def post(self, request):
        input_serializer = InvoiceGenerateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        as_of_date = input_serializer.validated_data.get("as_of_date") or date.today()

        subscriptions = (
            Subscription.objects.select_for_update()
            .filter(
                status=Subscription.Status.ACTIVE,
                next_invoice_date__lte=as_of_date,
            )
            .select_related("customer", "plan")
            .prefetch_related("lines", "lines__product", "lines__tax")
        )

        created = 0
        skipped = 0
        invoice_ids = []

        for sub in subscriptions:
            period_start = sub.next_invoice_date
            if (
                Invoice.objects.filter(subscription=sub, period_start=period_start)
                .exclude(status=Invoice.Status.CANCELLED)
                .exists()
            ):
                skipped += 1
                continue

            invoice = create_invoice_from_subscription_data(
                subscription=sub,
                period_start=period_start,
                issue_date=as_of_date,
            )
            invoice_ids.append(invoice.id)
            created += 1

            # Advance next_invoice_date by plan billing period
            billing_period = getattr(sub.plan, "billing_period", "monthly")
            sub.next_invoice_date = advance_date_by_period(sub.next_invoice_date, billing_period)
            sub.save(update_fields=["next_invoice_date"])

        return Response(
            {
                "created": created,
                "skipped": skipped,
                "invoice_ids": invoice_ids,
            },
            status=status.HTTP_200_OK,
        )


class InvoiceConfirmView(generics.GenericAPIView):
    """
    POST /api/invoices/{id}/confirm/ (Staff+ only)
    Transitions invoice from draft to confirmed.
    """

    permission_classes = [IsStaffOrAdmin]
    queryset = Invoice.objects.all()

    def post(self, request, pk=None):
        invoice = self.get_object()
        try:
            invoice.transition_to(Invoice.Status.CONFIRMED)
        except ValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = InvoiceSerializer(invoice)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InvoiceCancelView(generics.GenericAPIView):
    """
    POST /api/invoices/{id}/cancel/ (Staff+ only)
    Transitions invoice from draft or confirmed to cancelled.
    """

    permission_classes = [IsStaffOrAdmin]
    queryset = Invoice.objects.all()

    def post(self, request, pk=None):
        invoice = self.get_object()
        try:
            invoice.transition_to(Invoice.Status.CANCELLED)
        except ValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = InvoiceSerializer(invoice)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InvoiceSendView(generics.GenericAPIView):
    """
    POST /api/invoices/{id}/send/ (Staff+ only)
    Sets sent_at timestamp and optionally sends email to customer.
    """

    permission_classes = [IsStaffOrAdmin]
    queryset = Invoice.objects.all()

    def post(self, request, pk=None):
        invoice = self.get_object()
        invoice.sent_at = timezone.now()
        invoice.save(update_fields=["sent_at"])

        try:
            from django.conf import settings
            from django.core.mail import send_mail

            if invoice.customer and invoice.customer.email:
                send_mail(
                    subject=f"Invoice {invoice.number}",
                    message=f"Hello {invoice.customer.name},\nYour invoice {invoice.number} is ready. Total: {invoice.total}.",
                    from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "billing@brightloop.local"),
                    recipient_list=[invoice.customer.email],
                    fail_silently=True,
                )
        except Exception:
            pass

        serializer = InvoiceSerializer(invoice)
        return Response(serializer.data, status=status.HTTP_200_OK)

