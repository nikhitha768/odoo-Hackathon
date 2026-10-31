"""URL routing for catalog REST API endpoints."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DiscountViewSet,
    PlanViewSet,
    ProductViewSet,
    QuotationTemplateViewSet,
    TaxViewSet,
)

router = DefaultRouter()
router.register(r"products", ProductViewSet, basename="product")
router.register(r"plans", PlanViewSet, basename="plan")
router.register(r"quotation-templates", QuotationTemplateViewSet, basename="quotation-template")
router.register(r"taxes", TaxViewSet, basename="tax")
router.register(r"discounts", DiscountViewSet, basename="discount")

urlpatterns = [
    path("", include(router.urls)),
]

