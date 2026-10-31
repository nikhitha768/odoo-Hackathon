"""Subscription models: Subscription and SubscriptionLine."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class Subscription(models.Model):
    """Customer subscription to a plan with scheduled recurrence."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        QUOTATION = "quotation", "Quotation"
        CONFIRMED = "confirmed", "Confirmed"
        ACTIVE = "active", "Active"
        CLOSED = "closed", "Closed"

    number = models.CharField(max_length=50, unique=True, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    plan = models.ForeignKey(
        "catalog.Plan",
        on_delete=models.PROTECT,
        related_name="subscriptions",
    )
    template = models.ForeignKey(
        "catalog.QuotationTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    start_date = models.DateField()
    expiry_date = models.DateField()
    payment_term_days = models.PositiveIntegerField(default=15)
    next_invoice_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_subscriptions",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "Subscription"
        verbose_name_plural = "Subscriptions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["customer"]),
            models.Index(fields=["next_invoice_date"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.number} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.number:
            last = Subscription.objects.exclude(number="").order_by("-id").first()
            num = 1
            if last and last.number and last.number.startswith("SUB-"):
                try:
                    num = int(last.number.split("-")[1]) + 1
                except (IndexError, ValueError):
                    num = (last.id or 0) + 1
            self.number = f"SUB-{num:05d}"
            while Subscription.objects.filter(number=self.number).exists():
                num += 1
                self.number = f"SUB-{num:05d}"
        super().save(*args, **kwargs)

    def transition_to(self, target_status):
        """Transition subscription status according to allowed forward steps."""
        allowed_transitions = {
            self.Status.DRAFT: [self.Status.QUOTATION],
            self.Status.QUOTATION: [self.Status.CONFIRMED],
            self.Status.CONFIRMED: [self.Status.ACTIVE, self.Status.CLOSED],
            self.Status.ACTIVE: [self.Status.CLOSED],
            self.Status.CLOSED: [],
        }
        allowed = allowed_transitions.get(self.status, [])
        if target_status not in allowed:
            raise ValidationError(f"Cannot move from {self.status} to {target_status}")
        self.status = target_status
        self.save(update_fields=["status"])


class SubscriptionLine(models.Model):
    """Product line item included in a subscription."""

    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="subscription_lines",
    )
    variant = models.ForeignKey(
        "catalog.ProductVariant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscription_lines",
    )
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax = models.ForeignKey(
        "catalog.Tax",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscription_lines",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        verbose_name = "Subscription Line"
        verbose_name_plural = "Subscription Lines"

    def __str__(self):
        return f"{self.subscription.number} - {self.product.name}"

    def save(self, *args, **kwargs):
        if self.amount is None:
            self.amount = self.unit_price * self.quantity
        super().save(*args, **kwargs)
