"""Serializers for Subscription and SubscriptionLine APIs aligned with contract."""

from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from catalog.models import Plan, Product, ProductVariant, QuotationTemplate, Tax
from subscriptions.models import Subscription, SubscriptionLine

User = get_user_model()


class SubscriptionCustomerSerializer(serializers.ModelSerializer):
    """Customer representation in subscription payload."""

    class Meta:
        model = User
        fields = ["id", "name", "email"]


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    """Plan representation in subscription payload."""

    class Meta:
        model = Plan
        fields = ["id", "name", "billing_period"]


class SubscriptionLineSerializer(serializers.ModelSerializer):
    """Line item serializer for subscription."""

    id = serializers.IntegerField(required=False)
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    variant = serializers.PrimaryKeyRelatedField(
        queryset=ProductVariant.objects.all(), required=False, allow_null=True
    )
    tax = serializers.PrimaryKeyRelatedField(
        queryset=Tax.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = SubscriptionLine
        fields = [
            "id",
            "product",
            "variant",
            "quantity",
            "unit_price",
            "tax",
            "amount",
        ]
        read_only_fields = ["amount"]


class SubscriptionSerializer(serializers.ModelSerializer):
    """
    Full subscription serializer matching docs/api.md contract.
    Includes nested customer, plan, lines, and server-computed totals.
    """

    customer = SubscriptionCustomerSerializer(read_only=True)
    plan = SubscriptionPlanSerializer(read_only=True)
    lines = SubscriptionLineSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()
    tax_total = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            "id",
            "number",
            "status",
            "customer",
            "plan",
            "template",
            "start_date",
            "expiry_date",
            "payment_term_days",
            "next_invoice_date",
            "lines",
            "subtotal",
            "tax_total",
            "total",
            "created_at",
        ]
        read_only_fields = fields

    def _calculate_totals(self, obj):
        if not hasattr(obj, "_cached_subtotal") or not hasattr(obj, "_cached_tax_total"):
            subtotal = Decimal("0.00")
            tax_sum = Decimal("0.00")
            for line in obj.lines.all():
                line_amount = Decimal(str(line.amount))
                subtotal += line_amount
                tax = line.tax or getattr(line.product, "default_tax", None)
                if tax:
                    rate = Decimal(str(tax.rate_percent))
                    tax_sum += (line_amount * rate / Decimal("100.00"))
            obj._cached_subtotal = subtotal
            obj._cached_tax_total = tax_sum.quantize(Decimal("0.01"))
        return obj._cached_subtotal, obj._cached_tax_total

    def get_subtotal(self, obj):
        subtotal, _ = self._calculate_totals(obj)
        return f"{subtotal:.2f}"

    def get_tax_total(self, obj):
        _, tax_total = self._calculate_totals(obj)
        return f"{tax_total:.2f}"

    def get_total(self, obj):
        subtotal, tax_total = self._calculate_totals(obj)
        return f"{(subtotal + tax_total):.2f}"


class SubscriptionLineInputSerializer(serializers.Serializer):
    """Input serializer for line items when creating or updating subscriptions."""

    id = serializers.IntegerField(required=False)
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=True)
    variant = serializers.PrimaryKeyRelatedField(
        queryset=ProductVariant.objects.all(), required=False, allow_null=True
    )
    quantity = serializers.IntegerField(required=False, default=1, min_value=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    tax = serializers.PrimaryKeyRelatedField(
        queryset=Tax.objects.all(), required=False, allow_null=True
    )
    # Bogus amount from client is explicitly ignored; amount is server-computed
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class SubscriptionCreateUpdateSerializer(serializers.Serializer):
    """
    Serializer for creating and updating subscriptions with nested lines.
    Calculates line amounts and totals on the server.
    """

    customer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.all(), required=False)
    template_id = serializers.IntegerField(required=False, allow_null=True)
    template = serializers.PrimaryKeyRelatedField(
        queryset=QuotationTemplate.objects.all(), required=False, allow_null=True
    )
    start_date = serializers.DateField(required=False)
    expiry_date = serializers.DateField(required=False)
    payment_term_days = serializers.IntegerField(required=False, default=15, min_value=0)
    next_invoice_date = serializers.DateField(required=False)
    lines = SubscriptionLineInputSerializer(many=True, required=False)

    def validate(self, attrs):
        template_id = attrs.get("template_id")
        if template_id and not attrs.get("template"):
            template = QuotationTemplate.objects.filter(pk=template_id).first()
            if not template:
                raise serializers.ValidationError({"template_id": ["Template does not exist."]})
            attrs["template"] = template

        template = attrs.get("template")
        if not attrs.get("plan") and template:
            attrs["plan"] = template.plan

        if not attrs.get("plan"):
            # Check instance on update
            if self.instance and self.instance.plan:
                attrs["plan"] = self.instance.plan
            else:
                raise serializers.ValidationError({"plan": ["This field is required."]})

        start_date = attrs.get("start_date") or (self.instance.start_date if self.instance else None)
        expiry_date = attrs.get("expiry_date") or (self.instance.expiry_date if self.instance else None)
        if start_date and expiry_date and expiry_date < start_date:
            raise serializers.ValidationError(
                {"expiry_date": ["Expiry date cannot be earlier than start date."]}
            )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        request = self.context.get("request")
        customer = validated_data.get("customer")
        if not customer:
            if request and request.user.is_authenticated:
                customer = request.user
            else:
                raise serializers.ValidationError({"customer": ["Customer is required."]})

        plan = validated_data["plan"]
        template = validated_data.get("template")
        start_date = validated_data.get("start_date")
        if not start_date:
            from datetime import date
            start_date = date.today()

        expiry_date = validated_data.get("expiry_date")
        if not expiry_date:
            from datetime import timedelta
            expiry_date = start_date + timedelta(days=365)

        next_invoice_date = validated_data.get("next_invoice_date") or start_date
        payment_term_days = validated_data.get("payment_term_days", 15)

        created_by = request.user if request and request.user.is_authenticated else None

        subscription = Subscription.objects.create(
            customer=customer,
            plan=plan,
            template=template,
            start_date=start_date,
            expiry_date=expiry_date,
            payment_term_days=payment_term_days,
            next_invoice_date=next_invoice_date,
            status=Subscription.Status.DRAFT,
            created_by=created_by,
        )

        lines_data = validated_data.get("lines")
        if lines_data:
            for line_item in lines_data:
                product = line_item["product"]
                variant = line_item.get("variant")
                quantity = line_item.get("quantity", 1)
                unit_price = line_item.get("unit_price")
                if unit_price is None:
                    extra = variant.extra_price if variant else Decimal("0.00")
                    unit_price = product.sales_price + extra
                unit_price = Decimal(str(unit_price))

                tax = line_item.get("tax") or getattr(product, "default_tax", None)
                # Compute line amount strictly on the server: quantity * unit_price
                amount = (Decimal(quantity) * unit_price).quantize(Decimal("0.01"))

                SubscriptionLine.objects.create(
                    subscription=subscription,
                    product=product,
                    variant=variant,
                    quantity=quantity,
                    unit_price=unit_price,
                    tax=tax,
                    amount=amount,
                )
        elif template:
            # Copy template lines if template is given and lines is empty
            for tpl_line in template.lines.select_related("product", "product__default_tax", "variant"):
                unit_price = Decimal(str(tpl_line.unit_price))
                amount = (Decimal(tpl_line.quantity) * unit_price).quantize(Decimal("0.01"))
                SubscriptionLine.objects.create(
                    subscription=subscription,
                    product=tpl_line.product,
                    variant=tpl_line.variant,
                    quantity=tpl_line.quantity,
                    unit_price=unit_price,
                    tax=getattr(tpl_line.product, "default_tax", None),
                    amount=amount,
                )

        return subscription

    @transaction.atomic
    def update(self, instance, validated_data):
        if instance.status != Subscription.Status.DRAFT:
            raise serializers.ValidationError(
                {"detail": "Subscriptions can only be updated while in draft status."}
            )

        # Update scalar fields
        for field in ["plan", "template", "start_date", "expiry_date", "payment_term_days", "next_invoice_date"]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()

        # Update nested lines if provided
        if "lines" in validated_data:
            lines_data = validated_data.get("lines") or []
            existing_lines = {line.id: line for line in instance.lines.all()}
            retained_ids = []

            for line_item in lines_data:
                line_id = line_item.get("id")
                product = line_item["product"]
                variant = line_item.get("variant")
                quantity = line_item.get("quantity", 1)
                unit_price = line_item.get("unit_price")
                if unit_price is None:
                    extra = variant.extra_price if variant else Decimal("0.00")
                    unit_price = product.sales_price + extra
                unit_price = Decimal(str(unit_price))

                tax = line_item.get("tax") or getattr(product, "default_tax", None)
                amount = (Decimal(quantity) * unit_price).quantize(Decimal("0.01"))

                if line_id and line_id in existing_lines:
                    line_obj = existing_lines[line_id]
                    line_obj.product = product
                    line_obj.variant = variant
                    line_obj.quantity = quantity
                    line_obj.unit_price = unit_price
                    line_obj.tax = tax
                    line_obj.amount = amount
                    line_obj.save()
                    retained_ids.append(line_obj.id)
                else:
                    new_line = SubscriptionLine.objects.create(
                        subscription=instance,
                        product=product,
                        variant=variant,
                        quantity=quantity,
                        unit_price=unit_price,
                        tax=tax,
                        amount=amount,
                    )
                    retained_ids.append(new_line.id)

            instance.lines.exclude(id__in=retained_ids).delete()

        return instance

