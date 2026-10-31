"""Views for Invoice list, detail, generation, status transitions, sending, and printing."""

from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from accounts.pagination import StandardResultsSetPagination
from accounts.permissions import IsStaffOrAdmin
from billing.invoice_serializers import (
    InvoiceCreateSerializer,
    InvoiceGenerateSerializer,
    InvoiceSerializer,
)
from billing.invoice_services import (
    advance_date_by_period,
    bulk_generate_invoices,
    calculate_period_end,
    generate_invoice_for_subscription,
    send_invoice_email,
)
from billing.models import Invoice
from subscriptions.models import Subscription


class InvoiceAccessPermission(permissions.BasePermission):
    """
    Invoice endpoint access rules:
    - Anonymous users: 401 Unauthorized
    - Customer users: Read-only (GET, HEAD, OPTIONS) for own data
    - Staff / Admin users: Full read and write access
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        role = getattr(user, "role", None)
        if role in ["admin", "staff"] or getattr(user, "is_staff", False) or user.is_superuser:
            return True
        if role == "customer":
            return request.method in permissions.SAFE_METHODS
        return False


class InvoiceListCreateView(generics.ListCreateAPIView):
    """
    GET /api/invoices/?status=&customer=&subscription=&overdue=true&from=&to=&search=&page=
    POST /api/invoices/ (Staff or Admin only)
    """

    permission_classes = [InvoiceAccessPermission]
    pagination_class = StandardResultsSetPagination

    def get_serializer_class(self):
        if self.request.method == "POST":
            return InvoiceCreateSerializer
        return InvoiceSerializer

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated):
            return Invoice.objects.none()

        qs = (
            Invoice.objects.select_related("customer", "subscription", "discount")
            .prefetch_related("lines", "lines__product", "payments")
        )

        role = getattr(user, "role", None)
        if role == "customer":
            # Customers strictly see only their own invoices
            qs = qs.filter(customer=user)
        else:
            # Staff and admin can filter by customer
            customer_param = self.request.query_params.get("customer")
            if customer_param:
                qs = qs.filter(customer_id=customer_param)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        sub_param = self.request.query_params.get("subscription")
        if sub_param:
            qs = qs.filter(subscription_id=sub_param)

        overdue_param = self.request.query_params.get("overdue")
        if overdue_param is not None:
            today = timezone.localdate()
            if overdue_param.lower() in ["true", "1"]:
                qs = qs.filter(
                    due_date__lt=today,
                ).exclude(status__in=[Invoice.Status.PAID, Invoice.Status.CANCELLED])
            elif overdue_param.lower() in ["false", "0"]:
                qs = qs.exclude(
                    Q(due_date__lt=today)
                    & ~Q(status__in=[Invoice.Status.PAID, Invoice.Status.CANCELLED])
                )

        from_param = self.request.query_params.get("from")
        if from_param:
            qs = qs.filter(issue_date__gte=from_param)

        to_param = self.request.query_params.get("to")
        if to_param:
            qs = qs.filter(issue_date__lte=to_param)

        search_param = self.request.query_params.get("search")
        if search_param:
            qs = qs.filter(
                Q(number__icontains=search_param)
                | Q(customer__name__icontains=search_param)
                | Q(customer__email__icontains=search_param)
            )

        return qs

    def create(self, request, *args, **kwargs):
        """Create draft invoice from subscription with server-computed totals."""
        input_serializer = InvoiceCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        subscription = data["subscription"]
        period_start = data.get("period_start", subscription.next_invoice_date)

        try:
            invoice = generate_invoice_for_subscription(
                subscription=subscription,
                period_start=period_start,
                period_end=data.get("period_end"),
                issue_date=data.get("issue_date"),
                due_date=data.get("due_date"),
                lines_override=data.get("lines"),
                explicit_discount=data.get("discount"),
            )
        except ValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        response_serializer = InvoiceSerializer(invoice)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class InvoiceDetailView(generics.RetrieveAPIView):
    """
    GET /api/invoices/{id}/
    Customer sees only their own; gets 404 for anyone else's.
    """

    permission_classes = [InvoiceAccessPermission]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated):
            return Invoice.objects.none()

        qs = (
            Invoice.objects.select_related("customer", "subscription", "discount")
            .prefetch_related("lines", "lines__product", "payments")
        )

        role = getattr(user, "role", None)
        if role == "customer":
            return qs.filter(customer=user)

        return qs


class InvoiceGenerateView(generics.GenericAPIView):
    """
    POST /api/invoices/generate/ (Staff+ only)
    Payload: {"as_of_date": "YYYY-MM-DD"} or {"date": "YYYY-MM-DD"} (optional)
    Generates draft invoices for active subscriptions due on or before the given date.
    Returns counts of created and skipped subscriptions with reasons.
    """

    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        input_serializer = InvoiceGenerateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        as_of_date = (
            input_serializer.validated_data.get("as_of_date")
            or input_serializer.validated_data.get("date")
            or timezone.localdate()
        )

        result = bulk_generate_invoices(as_of_date=as_of_date)
        return Response(result, status=status.HTTP_200_OK)


class InvoiceConfirmView(generics.GenericAPIView):
    """
    POST /api/invoices/{id}/confirm/ (Staff+ only)
    Transitions invoice from draft to confirmed.
    """

    permission_classes = [IsStaffOrAdmin]
    queryset = Invoice.objects.all()

    def post(self, request, pk=None):
        invoice = self.get_object()
        try:
            invoice.transition_to(Invoice.Status.CONFIRMED)
        except ValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = InvoiceSerializer(invoice)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InvoiceCancelView(generics.GenericAPIView):
    """
    POST /api/invoices/{id}/cancel/ (Staff+ only)
    Transitions invoice from draft or confirmed to cancelled.
    """

    permission_classes = [IsStaffOrAdmin]
    queryset = Invoice.objects.all()

    def post(self, request, pk=None):
        invoice = self.get_object()
        try:
            invoice.transition_to(Invoice.Status.CANCELLED)
        except ValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = InvoiceSerializer(invoice)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InvoiceSendView(generics.GenericAPIView):
    """
    POST /api/invoices/{id}/send/ (Staff+ only)
    Sets sent_at timestamp and emails invoice summary to the customer.
    """

    permission_classes = [IsStaffOrAdmin]
    queryset = Invoice.objects.all()

    def post(self, request, pk=None):
        invoice = self.get_object()
        updated_invoice = send_invoice_email(invoice)
        serializer = InvoiceSerializer(updated_invoice)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InvoicePrintView(generics.RetrieveAPIView):
    """
    GET /api/invoices/{id}/print/
    Returns invoice representation suitable for printing.
    Accessible to Staff+ and Customer-own.
    """

    permission_classes = [InvoiceAccessPermission]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated):
            return Invoice.objects.none()

        qs = (
            Invoice.objects.select_related("customer", "subscription", "discount")
            .prefetch_related("lines", "lines__product", "payments")
        )

        role = getattr(user, "role", None)
        if role == "customer":
            return qs.filter(customer=user)

        return qs
