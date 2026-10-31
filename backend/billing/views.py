"""REST API views for billing: Payments endpoints and invoice interactions."""

from rest_framework import status, viewsets
from rest_framework.response import Response

from accounts.permissions import IsStaffOrAdmin
from .models import Payment
from .serializers import PaymentSerializer
from .services import apply_payment


class PaymentViewSet(viewsets.ModelViewSet):
    """ViewSet for recording (POST) and retrieving/filtering (GET) payments."""

    permission_classes = [IsStaffOrAdmin]
    serializer_class = PaymentSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = (
            Payment.objects.select_related("invoice", "recorded_by")
            .order_by("-payment_date", "-id")
        )

        invoice_id = self.request.query_params.get("invoice")
        if invoice_id:
            queryset = queryset.filter(invoice_id=invoice_id)

        method = self.request.query_params.get("method")
        if method:
            queryset = queryset.filter(method=method)

        from_date = self.request.query_params.get("from")
        if from_date:
            queryset = queryset.filter(payment_date__gte=from_date)

        to_date = self.request.query_params.get("to")
        if to_date:
            queryset = queryset.filter(payment_date__lte=to_date)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save(recorded_by=request.user)

        # Call the billing helper written by [B]
        updated_invoice = apply_payment(payment.invoice)
        payment.invoice = updated_invoice

        response_serializer = self.get_serializer(payment)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
