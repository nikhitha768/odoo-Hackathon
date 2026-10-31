"""URL patterns for Reports REST API endpoints."""

from django.urls import path
from core.report_views import (
    ReportOverdueInvoicesView,
    ReportRevenueByMonthView,
    ReportSummaryView,
)

urlpatterns = [
    path("reports/summary/", ReportSummaryView.as_view(), name="report-summary"),
    path(
        "reports/overdue-invoices/",
        ReportOverdueInvoicesView.as_view(),
        name="report-overdue-invoices",
    ),
    path(
        "reports/revenue-by-month/",
        ReportRevenueByMonthView.as_view(),
        name="report-revenue-by-month",
    ),
]

