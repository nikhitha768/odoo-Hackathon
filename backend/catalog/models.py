"""Catalog models: Tax, Product, ProductVariant, Plan, QuotationTemplate, QuotationTemplateLine, Discount."""

from django.db import models


class Tax(models.Model):
    """Tax rule definition with rate percentage."""

    name = models.CharField(max_length=255)
    rate_percent = models.DecimalField(max_digits=5, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Tax"
        verbose_name_plural = "Taxes"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.rate_percent}%)"


class Product(models.Model):
    """Sellable item: service, goods, or add-on."""

    class ProductType(models.TextChoices):
        SERVICE = "service", "Service"
        GOODS = "goods", "Goods"
        ADDON = "addon", "Addon"

    name = models.CharField(max_length=255)
    type = models.CharField(
        max_length=20,
        choices=ProductType.choices,
        default=ProductType.SERVICE,
    )
    sales_price = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.TextField(blank=True, default="")
    default_tax = models.ForeignKey(
        Tax,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Product"
        verbose_name_plural = "Products"
        ordering = ["name"]

    def __str__(self):
        return self.name


class ProductVariant(models.Model):
    """Variant attribute and extra price adjustment for a product."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="variants",
    )
    attribute = models.CharField(max_length=100)
    value = models.CharField(max_length=100)
    extra_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    class Meta:
        verbose_name = "Product Variant"
        verbose_name_plural = "Product Variants"
        ordering = ["product", "attribute", "value"]

    def __str__(self):
        return f"{self.product.name} - {self.attribute}: {self.value}"


class Plan(models.Model):
    """Subscription recurrence plan."""

    class BillingPeriod(models.TextChoices):
        DAILY = "daily", "Daily"
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"
        YEARLY = "yearly", "Yearly"

    class PlanStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        CLOSED = "closed", "Closed"

    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    billing_period = models.CharField(
        max_length=20,
        choices=BillingPeriod.choices,
        default=BillingPeriod.MONTHLY,
    )
    min_quantity = models.PositiveIntegerField(default=1)
    available_from = models.DateField(null=True, blank=True)
    available_to = models.DateField(null=True, blank=True)
    auto_close = models.BooleanField(default=False)
    allow_early_close = models.BooleanField(default=False)
    allow_pause = models.BooleanField(default=False)
    allow_renew = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20,
        choices=PlanStatus.choices,
        default=PlanStatus.ACTIVE,
    )

    class Meta:
        verbose_name = "Plan"
        verbose_name_plural = "Plans"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def check_auto_close(self):
        """If auto_close is True and available_to has passed, mark status as closed."""
        if self.auto_close and self.available_to and self.status != self.PlanStatus.CLOSED:
            from datetime import date
            if date.today() > self.available_to:
                self.status = self.PlanStatus.CLOSED
                self.save(update_fields=["status"])


class QuotationTemplate(models.Model):
    """Preset template for generating quotations with default product lines."""

    name = models.CharField(max_length=255)
    plan = models.ForeignKey(
        Plan,
        on_delete=models.CASCADE,
        related_name="quotation_templates",
    )
    validity_days = models.PositiveIntegerField(default=30)

    class Meta:
        verbose_name = "Quotation Template"
        verbose_name_plural = "Quotation Templates"
        ordering = ["name"]

    def __str__(self):
        return self.name


class QuotationTemplateLine(models.Model):
    """Item line within a quotation template."""

    template = models.ForeignKey(
        QuotationTemplate,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="quotation_template_lines",
    )
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotation_template_lines",
    )
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        verbose_name = "Quotation Template Line"
        verbose_name_plural = "Quotation Template Lines"

    def __str__(self):
        return f"{self.template.name} - {self.product.name}"


class Discount(models.Model):
    """Promotional or volume discount rule."""

    class DiscountType(models.TextChoices):
        FIXED = "fixed", "Fixed"
        PERCENT = "percent", "Percent"

    class AppliesTo(models.TextChoices):
        PRODUCT = "product", "Product"
        SUBSCRIPTION = "subscription", "Subscription"

    name = models.CharField(max_length=255)
    type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        default=DiscountType.PERCENT,
    )
    value = models.DecimalField(max_digits=12, decimal_places=2)
    min_purchase = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    min_quantity = models.PositiveIntegerField(null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    times_used = models.PositiveIntegerField(default=0)
    applies_to = models.CharField(
        max_length=20,
        choices=AppliesTo.choices,
        default=AppliesTo.SUBSCRIPTION,
    )
    products = models.ManyToManyField(
        Product,
        blank=True,
        related_name="discounts",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Discount"
        verbose_name_plural = "Discounts"
        ordering = ["name"]

    def __str__(self):
        return self.name
