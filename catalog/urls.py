"""URL patterns for catalog API."""

from django.urls import path
from catalog import views

urlpatterns = [
    # Products
    path("products/", views.ProductListCreateView.as_view(), name="product-list"),
    path("products/<int:pk>/", views.ProductDetailView.as_view(), name="product-detail"),

    # Plans & Plan Actions
    path("plans/", views.PlanListCreateView.as_view(), name="plan-list"),
    path("plans/<int:pk>/", views.PlanDetailView.as_view(), name="plan-detail"),
    path("plans/<int:pk>/pause/", views.PlanPauseView.as_view(), name="plan-pause"),
    path("plans/<int:pk>/resume/", views.PlanResumeView.as_view(), name="plan-resume"),
    path("plans/<int:pk>/close/", views.PlanCloseView.as_view(), name="plan-close"),
    path("plans/<int:pk>/renew/", views.PlanRenewView.as_view(), name="plan-renew"),

    # Quotation Templates
    path("quotation-templates/", views.QuotationTemplateListCreateView.as_view(), name="quotation-template-list"),
    path("quotation-templates/<int:pk>/", views.QuotationTemplateDetailView.as_view(), name="quotation-template-detail"),

    # Taxes
    path("taxes/", views.TaxListCreateView.as_view(), name="tax-list"),
    path("taxes/<int:pk>/", views.TaxDetailView.as_view(), name="tax-detail"),

    # Discounts
    path("discounts/", views.DiscountListCreateView.as_view(), name="discount-list"),
    path("discounts/<int:pk>/", views.DiscountDetailView.as_view(), name="discount-detail"),
]

