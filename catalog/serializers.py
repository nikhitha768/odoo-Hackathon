"""Serializers for catalog, plans, quotation templates, taxes, and discounts."""

from decimal import Decimal
from django.db import transaction
from rest_framework import serializers

from catalog.models import (
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
        fields = ["id", "name", "rate_percent", "is_active"]


class ProductVariantSerializer(serializers.ModelSerializer):
    """Serializer for ProductVariant nested within Product."""

    id = serializers.IntegerField(required=False)

    class Meta:
        model = ProductVariant
        fields = ["id", "attribute", "value", "extra_price"]


class ProductSerializer(serializers.ModelSerializer):
    """
    Serializer for Product with nested variants.
    Creating and updating also writes the variants.
    """

    variants = ProductVariantSerializer(many=True, required=False)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "type",
            "sales_price",
            "cost_price",
            "notes",
            "default_tax",
            "is_active",
            "variants",
        ]

    @transaction.atomic
    def create(self, validated_data):
        """Create a product along with its nested variants."""
        variants_data = validated_data.pop("variants", [])
        product = Product.objects.create(**validated_data)
        for variant_data in variants_data:
            variant_data.pop("id", None)
            ProductVariant.objects.create(product=product, **variant_data)
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        """Update a product and synchronize its nested variants."""
        variants_data = validated_data.pop("variants", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if variants_data is not None:
            existing_variants = {v.id: v for v in instance.variants.all()}
            retained_ids = []
            for variant_data in variants_data:
                variant_id = variant_data.get("id")
                if variant_id and variant_id in existing_variants:
                    variant_obj = existing_variants[variant_id]
                    for attr, val in variant_data.items():
                        if attr != "id":
                            setattr(variant_obj, attr, val)
                    variant_obj.save()
                    retained_ids.append(variant_obj.id)
                else:
                    data_clean = {k: v for k, v in variant_data.items() if k != "id"}
                    new_var = ProductVariant.objects.create(product=instance, **data_clean)
                    retained_ids.append(new_var.id)

            instance.variants.exclude(id__in=retained_ids).delete()

        return instance


class PlanSerializer(serializers.ModelSerializer):
    """Serializer for subscription Plans."""

    class Meta:
        model = Plan
        fields = [
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
        ]

    def validate(self, attrs):
        """Validate date range consistency: available_to must not be earlier than available_from."""
        available_from = attrs.get(
            "available_from",
            getattr(self.instance, "available_from", None),
        )
        available_to = attrs.get(
            "available_to",
            getattr(self.instance, "available_to", None),
        )
        if available_from and available_to and available_to < available_from:
            raise serializers.ValidationError(
                {"available_to": ["available_to date cannot be earlier than available_from date."]}
            )
        return attrs


class QuotationTemplateLineSerializer(serializers.ModelSerializer):
    """Serializer for QuotationTemplateLine nested within QuotationTemplate."""

    id = serializers.IntegerField(required=False)

    class Meta:
        model = QuotationTemplateLine
        fields = ["id", "product", "variant", "quantity", "unit_price"]

    def validate(self, attrs):
        """Ensure variant belongs to the selected product if both are specified."""
        product = attrs.get("product")
        variant = attrs.get("variant")

        if self.instance:
            if product is None:
                product = self.instance.product
            if "variant" not in attrs:
                variant = self.instance.variant

        if variant and product and variant.product_id != product.id:
            raise serializers.ValidationError(
                {"variant": ["Selected variant does not belong to the selected product."]}
            )
        return attrs


class QuotationTemplateSerializer(serializers.ModelSerializer):
    """
    Serializer for QuotationTemplate with nested lines.
    Creating and updating also writes the template lines.
    """

    lines = QuotationTemplateLineSerializer(many=True, required=False)

    class Meta:
        model = QuotationTemplate
        fields = ["id", "name", "plan", "validity_days", "lines"]

    @transaction.atomic
    def create(self, validated_data):
        """Create a quotation template and nested lines."""
        lines_data = validated_data.pop("lines", [])
        template = QuotationTemplate.objects.create(**validated_data)
        for line_data in lines_data:
            line_data.pop("id", None)
            QuotationTemplateLine.objects.create(template=template, **line_data)
        return template

    @transaction.atomic
    def update(self, instance, validated_data):
        """Update a quotation template and synchronize its nested lines."""
        lines_data = validated_data.pop("lines", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if lines_data is not None:
            existing_lines = {l.id: l for l in instance.lines.all()}
            retained_ids = []
            for line_data in lines_data:
                line_id = line_data.get("id")
                if line_id and line_id in existing_lines:
                    line_obj = existing_lines[line_id]
                    for attr, val in line_data.items():
                        if attr != "id":
                            setattr(line_obj, attr, val)
                    line_obj.save()
                    retained_ids.append(line_obj.id)
                else:
                    data_clean = {k: v for k, v in line_data.items() if k != "id"}
                    new_line = QuotationTemplateLine.objects.create(template=instance, **data_clean)
                    retained_ids.append(new_line.id)

            instance.lines.exclude(id__in=retained_ids).delete()

        return instance


class DiscountSerializer(serializers.ModelSerializer):
    """
    Serializer for promotional discounts.
    Validates percent values (0 to 100) and date ranges.
    """

    products = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Product.objects.all(),
        required=False,
    )

    class Meta:
        model = Discount
        fields = [
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
        ]
        read_only_fields = ["id", "times_used"]

    def validate(self, attrs):
        """
        Validate percent discounts are between 0 and 100,
        and end_date is not before start_date.
        """
        discount_type = attrs.get(
            "type",
            getattr(self.instance, "type", Discount.DiscountType.FIXED),
        )
        value = attrs.get(
            "value",
            getattr(self.instance, "value", None),
        )

        if discount_type == Discount.DiscountType.PERCENT and value is not None:
            if value < Decimal("0.00") or value > Decimal("100.00"):
                raise serializers.ValidationError(
                    {"value": ["Percent discount must be between 0 and 100."]}
                )

        start_date = attrs.get(
            "start_date",
            getattr(self.instance, "start_date", None),
        )
        end_date = attrs.get(
            "end_date",
            getattr(self.instance, "end_date", None),
        )
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": ["End date cannot be before start date."]}
            )

        return attrs

