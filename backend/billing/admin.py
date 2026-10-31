"""Admin configuration for billing models."""

from django.contrib import admin

from .models import Invoice, InvoiceLine, Payment


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 1


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ("payment_date", "recorded_by")


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_select_related = ("subscription", "customer")
    list_display = (
        "number",
        "subscription",
        "customer",
        "status",
        "period_start",
        "period_end",
        "issue_date",
        "due_date",
        "total",
        "amount_paid",
        "sent_at",
    )
    list_filter = ("status", "customer", "subscription")
    search_fields = ("number", "customer__name", "customer__email")
    readonly_fields = ("number",)
    inlines = [InvoiceLineInline, PaymentInline]


@admin.register(InvoiceLine)
class InvoiceLineAdmin(admin.ModelAdmin):
    list_display = (
        "invoice",
        "product",
        "quantity",
        "unit_price",
        "discount_amount",
        "tax_amount",
        "amount",
    )
    list_filter = ("invoice", "product")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_select_related = ("invoice", "recorded_by")
    list_display = (
        "id",
        "invoice",
        "method",
        "amount",
        "payment_date",
        "recorded_by",
    )
    list_filter = ("method", "payment_date")
    search_fields = ("invoice__number", "note")
