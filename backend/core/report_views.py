"""API views for financial and operational reports."""

from datetime import date
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value, ExpressionWrapper, fields
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from rest_framework import generics, serializers
from rest_framework.response import Response

from accounts.pagination import StandardResultsSetPagination
from accounts.permissions import IsStaffOrAdmin
from billing.invoice_serializers import InvoiceCustomerSerializer
from billing.models import Invoice, Payment
from subscriptions.models import Subscription


class OverdueInvoiceSerializer(serializers.ModelSerializer):
    """Serializer for overdue invoices including days_overdue."""

    customer = InvoiceCustomerSerializer(read_only=True)
    days_overdue = serializers.SerializerMethodField()

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
            "subtotal",
            "discount_total",
            "tax_total",
            "total",
            "amount_paid",
            "days_overdue",
        ]

    def get_days_overdue(self, obj):
        val = getattr(obj, "days_overdue", None)
        if val is not None:
            return val.days if hasattr(val, "days") else int(val)
        today = timezone.localdate()
        if obj.due_date:
            return max(0, (today - obj.due_date).days)
        return 0


class ReportSummaryView(generics.GenericAPIView):
    """
    GET /api/reports/summary/?from=&to=
    Returns summary statistics computed via database aggregation:
    {active_subscriptions, total_invoiced, revenue_received, outstanding, overdue_count, overdue_amount}
    """

    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        from_param = request.query_params.get("from")
        to_param = request.query_params.get("to")
        today = timezone.localdate()

        # 1. Active subscriptions count
        active_sub_agg = Subscription.objects.filter(
            status=Subscription.Status.ACTIVE
        ).aggregate(count=Count("id"))
        active_subscriptions = active_sub_agg["count"] or 0

        # Invoices base query (non-cancelled invoices)
        invoice_qs = Invoice.objects.exclude(status=Invoice.Status.CANCELLED)
        if from_param:
            invoice_qs = invoice_qs.filter(issue_date__gte=from_param)
        if to_param:
            invoice_qs = invoice_qs.filter(issue_date__lte=to_param)

        # 2. Total Invoiced and Outstanding (database aggregation)
        invoice_agg = invoice_qs.aggregate(
            total_invoiced=Coalesce(
                Sum("total"), Value(Decimal("0.00")), output_field=DecimalField()
            ),
            outstanding=Coalesce(
                Sum(F("total") - F("amount_paid")),
                Value(Decimal("0.00")),
                output_field=DecimalField(),
            ),
        )
        total_invoiced = Decimal(str(invoice_agg["total_invoiced"]))
        outstanding = Decimal(str(invoice_agg["outstanding"]))

        # 3. Revenue Received (database aggregation on Payment)
        payment_qs = Payment.objects.all()
        if from_param:
            payment_qs = payment_qs.filter(payment_date__gte=from_param)
        if to_param:
            payment_qs = payment_qs.filter(payment_date__lte=to_param)

        pay_agg = payment_qs.aggregate(
            revenue_received=Coalesce(
                Sum("amount"), Value(Decimal("0.00")), output_field=DecimalField()
            )
        )
        revenue_received = Decimal(str(pay_agg["revenue_received"]))

        # 4. Overdue count and Overdue amount (database aggregation)
        overdue_qs = invoice_qs.filter(
            status=Invoice.Status.CONFIRMED,
            due_date__lt=today,
            amount_paid__lt=F("total"),
        )
        overdue_agg = overdue_qs.aggregate(
            count=Count("id"),
            amount=Coalesce(
                Sum(F("total") - F("amount_paid")),
                Value(Decimal("0.00")),
                output_field=DecimalField(),
            ),
        )
        overdue_count = overdue_agg["count"] or 0
        overdue_amount = Decimal(str(overdue_agg["amount"]))

        return Response(
            {
                "active_subscriptions": active_subscriptions,
                "total_invoiced": f"{total_invoiced:.2f}",
                "revenue_received": f"{revenue_received:.2f}",
                "outstanding": f"{outstanding:.2f}",
                "overdue_count": overdue_count,
                "overdue_amount": f"{overdue_amount:.2f}",
            }
        )


class ReportOverdueInvoicesView(generics.ListAPIView):
    """
    GET /api/reports/overdue-invoices/?from=&to=&page=
    Paginated overdue invoices with days_overdue.
    """

    permission_classes = [IsStaffOrAdmin]
    pagination_class = StandardResultsSetPagination
    serializer_class = OverdueInvoiceSerializer

    def get_queryset(self):
        today = timezone.localdate()
        qs = (
            Invoice.objects.filter(
                status=Invoice.Status.CONFIRMED,
                due_date__lt=today,
                amount_paid__lt=F("total"),
            )
            .select_related("customer", "subscription")
            .annotate(
                days_overdue=ExpressionWrapper(
                    Value(today) - F("due_date"), output_field=fields.DurationField()
                )
            )
            .order_by("due_date", "id")
        )

        from_param = self.request.query_params.get("from")
        if from_param:
            qs = qs.filter(due_date__gte=from_param)
        to_param = self.request.query_params.get("to")
        if to_param:
            qs = qs.filter(due_date__lte=to_param)

        return qs


class ReportRevenueByMonthView(generics.GenericAPIView):
    """
    GET /api/reports/revenue-by-month/?from=&to=
    Returns monthly aggregated invoiced and received revenue:
    [{"month": "YYYY-MM", "invoiced": "...", "received": "..."}]
    """

    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        from_param = request.query_params.get("from")
        to_param = request.query_params.get("to")

        invoice_qs = Invoice.objects.exclude(status=Invoice.Status.CANCELLED)
        payment_qs = Payment.objects.all()

        if from_param:
            invoice_qs = invoice_qs.filter(issue_date__gte=from_param)
            payment_qs = payment_qs.filter(payment_date__gte=from_param)
        if to_param:
            invoice_qs = invoice_qs.filter(issue_date__lte=to_param)
            payment_qs = payment_qs.filter(payment_date__lte=to_param)

        # Database aggregation with values().annotate()
        invoice_monthly = (
            invoice_qs.annotate(month=TruncMonth("issue_date"))
            .values("month")
            .annotate(invoiced=Sum("total"))
            .order_by("month")
        )

        payment_monthly = (
            payment_qs.annotate(month=TruncMonth("payment_date"))
            .values("month")
            .annotate(received=Sum("amount"))
            .order_by("month")
        )

        months_map = {}

        for item in invoice_monthly:
            m = item["month"]
            if not m:
                continue
            month_str = m.strftime("%Y-%m") if hasattr(m, "strftime") else str(m)[:7]
            months_map.setdefault(month_str, {"invoiced": Decimal("0.00"), "received": Decimal("0.00")})
            months_map[month_str]["invoiced"] = Decimal(str(item["invoiced"] or 0))

        for item in payment_monthly:
            m = item["month"]
            if not m:
                continue
            month_str = m.strftime("%Y-%m") if hasattr(m, "strftime") else str(m)[:7]
            months_map.setdefault(month_str, {"invoiced": Decimal("0.00"), "received": Decimal("0.00")})
            months_map[month_str]["received"] = Decimal(str(item["received"] or 0))

        results = [
            {
                "month": month_str,
                "invoiced": f"{data['invoiced']:.2f}",
                "received": f"{data['received']:.2f}",
            }
            for month_str, data in sorted(months_map.items())
        ]

        return Response(results)

