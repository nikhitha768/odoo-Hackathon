"""Serializers for Invoices and Invoice Lines aligned with API contract."""

from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework import serializers

from billing.models import Invoice, InvoiceLine, Payment
from subscriptions.models import Subscription

User = get_user_model()


class InvoiceCustomerSerializer(serializers.ModelSerializer):
    """Minimal customer representation in invoice response."""

    class Meta:
        model = User
        fields = ["id", "name", "email"]


class InvoiceLineSerializer(serializers.ModelSerializer):
    """Line item serializer for invoice."""

    product = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = InvoiceLine
        fields = [
            "id",
            "product",
            "description",
            "quantity",
            "unit_price",
            "discount_amount",
            "tax_rate_percent",
            "tax_amount",
            "amount",
        ]


class InvoicePaymentSerializer(serializers.ModelSerializer):
    """Payment record nested inside invoice detail."""

    class Meta:
        model = Payment
        fields = [
            "id",
            "method",
            "amount",
            "payment_date",
            "note",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    """
    Invoice representation matching docs/api.md.
    Nested customer: {id, name}, subscription ID, nested lines, and nested payments.
    """

    customer = InvoiceCustomerSerializer(read_only=True)
    subscription = serializers.PrimaryKeyRelatedField(read_only=True)
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = InvoicePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "status",
            "subscription",
            "customer",
            "period_start",
            "period_end",
            "issue_date",
            "due_date",
            "sent_at",
            "subtotal",
            "discount_total",
            "tax_total",
            "total",
            "amount_paid",
            "lines",
            "payments",
        ]
        read_only_fields = fields


class InvoiceCreateLineInputSerializer(serializers.Serializer):
    """Optional manual line item input when creating an invoice."""

    product = serializers.IntegerField(required=True)
    description = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.IntegerField(required=False, default=1, min_value=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class InvoiceCreateSerializer(serializers.Serializer):
    """
    Serializer for creating an invoice from a subscription.
    All totals and amounts are strictly computed on the server.
    """

    subscription = serializers.PrimaryKeyRelatedField(
        queryset=Subscription.objects.all(), required=True
    )
    period_start = serializers.DateField(required=False)
    period_end = serializers.DateField(required=False)
    issue_date = serializers.DateField(required=False)
    due_date = serializers.DateField(required=False)
    lines = InvoiceCreateLineInputSerializer(many=True, required=False)

    # Any client-provided totals are explicitly write-only and ignored on server
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_total = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    tax_total = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class InvoiceGenerateSerializer(serializers.Serializer):
    """Input serializer for batch invoice generation."""

    as_of_date = serializers.DateField(required=False)

