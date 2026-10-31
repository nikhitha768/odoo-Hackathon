"""Admin configuration for subscriptions app."""

from django.contrib import admin

from .models import Subscription, SubscriptionLine


class SubscriptionLineInline(admin.TabularInline):
    model = SubscriptionLine
    extra = 1


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "number",
        "customer",
        "plan",
        "status",
        "start_date",
        "expiry_date",
        "payment_term_days",
        "next_invoice_date",
        "created_at",
    )
    list_filter = ("status", "plan", "customer")
    search_fields = ("number", "customer__name", "customer__email")
    readonly_fields = ("number", "created_at")
    inlines = [SubscriptionLineInline]


@admin.register(SubscriptionLine)
class SubscriptionLineAdmin(admin.ModelAdmin):
    list_display = (
        "subscription",
        "product",
        "variant",
        "quantity",
        "unit_price",
        "tax",
        "amount",
    )
    list_filter = ("subscription", "product")
