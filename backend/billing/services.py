"""Billing services for managing invoices and payments."""

from decimal import Decimal
from django.db import transaction
from django.db.models import Sum

from billing.models import Invoice


def apply_payment(invoice):
    """
    Apply payments to an invoice by recomputing the total paid amount from
    Payment records and updating invoice status to paid if total paid >= invoice total.

    Steps:
    1. Wrap in transaction.atomic() and re-fetch invoice with select_for_update().
    2. Compute total paid as Sum of Payment amounts for this invoice, treating None as 0.
    3. Update the stored amount_paid field if present on the invoice.
    4. If total paid >= invoice total, set invoice status to 'paid' (Invoice.Status.PAID).
       Otherwise, leave status unchanged.
    5. Save only the changed fields using update_fields and return refreshed invoice.
    """
    with transaction.atomic():
        invoice_id = invoice.pk if hasattr(invoice, "pk") else invoice
        locked_invoice = Invoice.objects.select_for_update().get(pk=invoice_id)

        # Compute total paid as Sum of Payment amounts for this invoice, using Decimal and treating None as 0
        payments_sum = locked_invoice.payments.aggregate(total=Sum("amount"))["total"]
        total_paid = Decimal(str(payments_sum)) if payments_sum is not None else Decimal("0.00")

        update_fields = []

        # If Invoice has a stored paid-amount field, save the recomputed value into it
        if hasattr(locked_invoice, "amount_paid"):
            current_amount_paid = (
                Decimal(str(locked_invoice.amount_paid))
                if locked_invoice.amount_paid is not None
                else Decimal("0.00")
            )
            if current_amount_paid != total_paid:
                locked_invoice.amount_paid = total_paid
                update_fields.append("amount_paid")

        # If total paid is greater than or equal to invoice total, set status to paid;
        # otherwise leave status unchanged.
        invoice_total = (
            Decimal(str(locked_invoice.total))
            if locked_invoice.total is not None
            else Decimal("0.00")
        )
        if total_paid >= invoice_total:
            if locked_invoice.status != Invoice.Status.PAID:
                locked_invoice.status = Invoice.Status.PAID
                update_fields.append("status")

        # Save only the fields that were changed
        if update_fields:
            locked_invoice.save(update_fields=update_fields)

        # Refresh from database to ensure fresh state
        locked_invoice.refresh_from_db()

        # Keep original instance in sync if passed as an object
        if hasattr(invoice, "pk") and invoice is not locked_invoice:
            if hasattr(invoice, "amount_paid"):
                invoice.amount_paid = locked_invoice.amount_paid
            invoice.status = locked_invoice.status

        return locked_invoice

