"""Serializers for catalog models with nested variants, lines, and validation."""

from decimal import Decimal
from rest_framework import serializers

from .models import (
    Discount,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    QuotationTemplateLine,
    Tax,
)


class TaxSerializer(serializers.ModelSerializer):
    """Serializer for Tax rules."""

    class Meta:
        model = Tax
        fields = ("id", "name", "rate_percent", "is_active")

    def validate_rate_percent(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Tax rate must be between 0 and 100.")
        return value


class ProductVariantSerializer(serializers.ModelSerializer):
    """Serializer for Product variants."""

    id = serializers.IntegerField(required=False)
    extra_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    class Meta:
        model = ProductVariant
        fields = ("id", "attribute", "value", "extra_price")

    def validate_extra_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value


class ProductSerializer(serializers.ModelSerializer):
    """Serializer for Product with nested variants."""

    variants = ProductVariantSerializer(many=True, required=False)
    default_tax = serializers.PrimaryKeyRelatedField(
        queryset=Tax.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "type",
            "sales_price",
            "cost_price",
            "notes",
            "default_tax",
            "variants",
            "is_active",
        )

    def validate_sales_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate_cost_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def create(self, validated_data):
        variants_data = validated_data.pop("variants", [])
        product = Product.objects.create(**validated_data)
        for variant_data in variants_data:
            variant_data.pop("id", None)
            ProductVariant.objects.create(product=product, **variant_data)
        return product

    def update(self, instance, validated_data):
        variants_data = validated_data.pop("variants", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if variants_data is not None:
            existing_variants = {v.id: v for v in instance.variants.all()}
            seen_ids = set()
            for v_data in variants_data:
                v_id = v_data.get("id")
                if v_id and v_id in existing_variants:
                    variant = existing_variants[v_id]
                    for k, val in v_data.items():
                        if k != "id":
                            setattr(variant, k, val)
                    variant.save()
                    seen_ids.add(v_id)
                else:
                    new_v_data = {k: val for k, val in v_data.items() if k != "id"}
                    new_v = ProductVariant.objects.create(product=instance, **new_v_data)
                    seen_ids.add(new_v.id)
            for v_id, variant in existing_variants.items():
                if v_id not in seen_ids:
                    variant.delete()

        return instance


class PlanSerializer(serializers.ModelSerializer):
    """Serializer for Subscription Plan."""

    class Meta:
        model = Plan
        fields = (
            "id",
            "name",
            "price",
            "billing_period",
            "min_quantity",
            "available_from",
            "available_to",
            "auto_close",
            "allow_early_close",
            "allow_pause",
            "allow_renew",
            "status",
        )

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate(self, data):
        available_from = data.get("available_from")
        if available_from is None and self.instance:
            available_from = self.instance.available_from

        available_to = data.get("available_to")
        if available_to is None and self.instance:
            available_to = self.instance.available_to

        if available_from and available_to and available_to < available_from:
            raise serializers.ValidationError(
                {"available_to": ["available_to cannot be before available_from."]}
            )
        return data

    def to_representation(self, instance):
        instance.check_auto_close()
        return super().to_representation(instance)


class QuotationTemplateLineSerializer(serializers.ModelSerializer):
    """Serializer for Quotation Template Line item."""

    id = serializers.IntegerField(required=False)
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    variant = serializers.PrimaryKeyRelatedField(
        queryset=ProductVariant.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = QuotationTemplateLine
        fields = ("id", "product", "variant", "quantity", "unit_price")

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value


class QuotationTemplateSerializer(serializers.ModelSerializer):
    """Serializer for Quotation Template with nested lines."""

    lines = QuotationTemplateLineSerializer(many=True, required=False)
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.all())

    class Meta:
        model = QuotationTemplate
        fields = ("id", "name", "plan", "validity_days", "lines")

    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])
        template = QuotationTemplate.objects.create(**validated_data)
        for line_data in lines_data:
            line_data.pop("id", None)
            QuotationTemplateLine.objects.create(template=template, **line_data)
        return template

    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if lines_data is not None:
            instance.lines.all().delete()
            for line_data in lines_data:
                line_data.pop("id", None)
                QuotationTemplateLine.objects.create(template=instance, **line_data)

        return instance


class DiscountSerializer(serializers.ModelSerializer):
    """Serializer for Discount rules with products represented as list of IDs."""

    products = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Product.objects.all(),
        required=False,
    )

    class Meta:
        model = Discount
        fields = (
            "id",
            "name",
            "type",
            "value",
            "min_purchase",
            "min_quantity",
            "start_date",
            "end_date",
            "usage_limit",
            "times_used",
            "applies_to",
            "products",
            "is_active",
        )

    def validate_value(self, value):
        if value < 0:
            raise serializers.ValidationError("Value cannot be negative.")
        return value

    def validate_min_purchase(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate(self, data):
        dtype = data.get("type")
        if dtype is None and self.instance:
            dtype = self.instance.type

        val = data.get("value")
        if val is None and self.instance:
            val = self.instance.value

        if dtype == Discount.DiscountType.PERCENT and val is not None:
            if val < 0 or val > 100:
                raise serializers.ValidationError(
                    {"value": ["Percent discount must be between 0 and 100."]}
                )

        start_date = data.get("start_date")
        if start_date is None and self.instance:
            start_date = self.instance.start_date

        end_date = data.get("end_date")
        if end_date is None and self.instance:
            end_date = self.instance.end_date

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": ["end_date cannot be before start_date."]}
            )

        return data

