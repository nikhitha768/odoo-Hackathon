"""Admin configuration for catalog models."""

from django.contrib import admin

from .models import (
    Discount,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    QuotationTemplateLine,
    Tax,
)


@admin.register(Tax)
class TaxAdmin(admin.ModelAdmin):
    list_display = ("name", "rate_percent", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_select_related = ("default_tax",)
    list_display = ("name", "type", "sales_price", "cost_price", "default_tax", "is_active")
    list_filter = ("type", "is_active", "default_tax")
    search_fields = ("name", "notes")
    inlines = [ProductVariantInline]


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_select_related = ("product",)
    list_display = ("product", "attribute", "value", "extra_price")
    list_filter = ("attribute", "product")
    search_fields = ("attribute", "value", "product__name")


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "price",
        "billing_period",
        "status",
        "auto_close",
        "allow_early_close",
        "allow_pause",
        "allow_renew",
    )
    list_filter = ("billing_period", "status", "auto_close")
    search_fields = ("name",)


class QuotationTemplateLineInline(admin.TabularInline):
    model = QuotationTemplateLine
    extra = 1


@admin.register(QuotationTemplate)
class QuotationTemplateAdmin(admin.ModelAdmin):
    list_select_related = ("plan",)
    list_display = ("name", "plan", "validity_days")
    list_filter = ("plan",)
    search_fields = ("name",)
    inlines = [QuotationTemplateLineInline]


@admin.register(QuotationTemplateLine)
class QuotationTemplateLineAdmin(admin.ModelAdmin):
    list_select_related = ("template", "product", "variant")
    list_display = ("template", "product", "variant", "quantity", "unit_price")
    list_filter = ("template", "product")


@admin.register(Discount)
class DiscountAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "type",
        "value",
        "applies_to",
        "start_date",
        "end_date",
        "times_used",
        "usage_limit",
        "is_active",
    )
    list_filter = ("type", "applies_to", "is_active")
    search_fields = ("name",)
    filter_horizontal = ("products",)
