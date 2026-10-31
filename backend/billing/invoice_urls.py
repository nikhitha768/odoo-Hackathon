"""URL routes for Invoices API."""

from django.urls import path
from billing import invoice_views

urlpatterns = [
    # Invoice collection & batch generation
    path("invoices/", invoice_views.InvoiceListCreateView.as_view(), name="invoice-list-create"),
    path("invoices/generate/", invoice_views.InvoiceGenerateView.as_view(), name="invoice-generate"),

    # Invoice detail & status actions
    path("invoices/<int:pk>/", invoice_views.InvoiceDetailView.as_view(), name="invoice-detail"),
    path("invoices/<int:pk>/confirm/", invoice_views.InvoiceConfirmView.as_view(), name="invoice-confirm"),
    path("invoices/<int:pk>/cancel/", invoice_views.InvoiceCancelView.as_view(), name="invoice-cancel"),
    path("invoices/<int:pk>/send/", invoice_views.InvoiceSendView.as_view(), name="invoice-send"),
]

