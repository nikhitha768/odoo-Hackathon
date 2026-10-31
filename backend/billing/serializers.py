"""Serializers for billing models, invoices, and payments."""

import datetime
from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers

from .models import Invoice, Payment


class SafeDateField(serializers.DateField):
    """DateField that safely coerces datetime to date during serialization."""

    def to_representation(self, value):
        if isinstance(value, datetime.datetime):
            value = value.date()
        return super().to_representation(value)


class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for recording and displaying payments with validations."""

    invoice_status = serializers.CharField(source="invoice.status", read_only=True)
    payment_date = SafeDateField(default=timezone.localdate, required=False)

    class Meta:
        model = Payment
        fields = (
            "id",
            "invoice",
            "method",
            "amount",
            "payment_date",
            "note",
            "recorded_by",
            "invoice_status",
        )
        read_only_fields = ("id", "recorded_by", "invoice_status")

    def validate_amount(self, value):
        if value <= Decimal("0.00"):
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        invoice = attrs.get("invoice")
        amount = attrs.get("amount")

        if invoice is not None:
            # 1. No paying an already-paid invoice
            if invoice.status == Invoice.Status.PAID:
                raise serializers.ValidationError(
                    {"invoice": ["Invoice is already paid."]}
                )

            # 2. Only confirmed invoices can receive payments
            if invoice.status != Invoice.Status.CONFIRMED:
                raise serializers.ValidationError(
                    {"invoice": ["Only confirmed invoices can receive payments."]}
                )

            # 3. No overpaying an invoice beyond outstanding balance
            current_paid = (
                Decimal(str(invoice.amount_paid))
                if invoice.amount_paid is not None
                else Decimal("0.00")
            )
            total = (
                Decimal(str(invoice.total))
                if invoice.total is not None
                else Decimal("0.00")
            )
            outstanding = total - current_paid
            if amount is not None and amount > outstanding:
                raise serializers.ValidationError(
                    {"amount": ["Amount exceeds the outstanding balance of the invoice."]}
                )

        return attrs
