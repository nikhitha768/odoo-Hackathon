"""Billing models: Invoice, InvoiceLine, and Payment."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class Invoice(models.Model):
    """Customer invoice issued against a subscription."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CONFIRMED = "confirmed", "Confirmed"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"

    number = models.CharField(max_length=50, unique=True, editable=False)
    subscription = models.ForeignKey(
        "subscriptions.Subscription",
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    period_start = models.DateField()
    period_end = models.DateField()
    issue_date = models.DateField()
    due_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    discount = models.ForeignKey(
        "catalog.Discount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )

    class Meta:
        verbose_name = "Invoice"
        verbose_name_plural = "Invoices"
        ordering = ["-issue_date", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["subscription", "period_start"],
                condition=~models.Q(status="cancelled"),
                name="unique_invoice_period_per_subscription",
            )
        ]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["due_date"]),
            models.Index(fields=["customer"]),
            models.Index(fields=["subscription"]),
        ]

    def __str__(self):
        return f"{self.number} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.number:
            last = Invoice.objects.exclude(number="").order_by("-id").first()
            num = 1
            if last and last.number and last.number.startswith("INV-"):
                try:
                    num = int(last.number.split("-")[1]) + 1
                except (IndexError, ValueError):
                    num = (last.id or 0) + 1
            self.number = f"INV-{num:05d}"
            while Invoice.objects.filter(number=self.number).exists():
                num += 1
                self.number = f"INV-{num:05d}"
        super().save(*args, **kwargs)

    def transition_to(self, target_status):
        """Transition invoice status according to allowed flows."""
        allowed_transitions = {
            self.Status.DRAFT: [self.Status.CONFIRMED, self.Status.CANCELLED],
            self.Status.CONFIRMED: [self.Status.PAID, self.Status.CANCELLED],
            self.Status.PAID: [],
            self.Status.CANCELLED: [],
        }
        allowed = allowed_transitions.get(self.status, [])
        if target_status not in allowed:
            raise ValidationError(f"Cannot move from {self.status} to {target_status}")
        self.status = target_status
        self.save(update_fields=["status"])


class InvoiceLine(models.Model):
    """Line item on an invoice."""

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="invoice_lines",
    )
    description = models.CharField(max_length=255, blank=True, default="")
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_rate_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    class Meta:
        verbose_name = "Invoice Line"
        verbose_name_plural = "Invoice Lines"

    def __str__(self):
        return f"{self.invoice.number} - {self.product.name}"


class Payment(models.Model):
    """Payment recorded against a confirmed invoice."""

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        UPI = "upi", "UPI"
        CARD = "card", "Card"
        CHEQUE = "cheque", "Cheque"

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.BANK_TRANSFER,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField(default=timezone.now)
    note = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_payments",
    )

    class Meta:
        verbose_name = "Payment"
        verbose_name_plural = "Payments"
        ordering = ["-payment_date", "-id"]
        indexes = [
            models.Index(fields=["invoice"]),
            models.Index(fields=["payment_date"]),
        ]

    def __str__(self):
        return f"Payment {self.id} for {self.invoice.number} ({self.amount})"
