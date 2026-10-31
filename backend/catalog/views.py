"""REST API viewsets for catalog models: Products, Plans, Templates, Taxes, and Discounts."""

from datetime import date, datetime
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from .models import (
    Discount,
    Plan,
    Product,
    QuotationTemplate,
    Tax,
)
from .serializers import (
    DiscountSerializer,
    PlanSerializer,
    ProductSerializer,
    QuotationTemplateSerializer,
    TaxSerializer,
)


class CatalogAccessPermission(BasePermission):
    """Allow Staff and Admin to read; allow Admin only to create, update, delete, or perform actions."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        role = getattr(user, "role", None)
        is_admin = role == "admin" or user.is_superuser
        is_staff_or_admin = is_admin or role == "staff" or getattr(user, "is_staff", False)

        if request.method in SAFE_METHODS:
            return is_staff_or_admin

        return is_admin


class ProductViewSet(viewsets.ModelViewSet):
    """ViewSet for managing Products and their nested variants."""

    permission_classes = [CatalogAccessPermission]
    serializer_class = ProductSerializer

    def get_queryset(self):
        queryset = (
            Product.objects.select_related("default_tax")
            .prefetch_related("variants")
            .order_by("id")
        )
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(notes__icontains=search)
            )
        return queryset


class PlanViewSet(viewsets.ModelViewSet):
    """ViewSet for subscription Plans with state control actions and auto-close check."""

    permission_classes = [CatalogAccessPermission]
    serializer_class = PlanSerializer

    def get_queryset(self):
        today = date.today()
        # Auto-close plans whose available_to has passed
        Plan.objects.filter(
            auto_close=True,
            available_to__lt=today,
        ).exclude(status=Plan.PlanStatus.CLOSED).update(status=Plan.PlanStatus.CLOSED)

        queryset = Plan.objects.all().order_by("id")
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        billing_period = self.request.query_params.get("billing_period")
        if billing_period:
            queryset = queryset.filter(billing_period=billing_period)

        return queryset

    def get_object(self):
        obj = super().get_object()
        obj.check_auto_close()
        return obj

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        """Pause plan if allow_pause is True."""
        plan = self.get_object()
        if not plan.allow_pause:
            return Response(
                {"detail": "Plan does not allow pause."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plan.status = Plan.PlanStatus.PAUSED
        plan.save(update_fields=["status"])
        return Response(self.get_serializer(plan).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        """Resume paused plan."""
        plan = self.get_object()
        plan.status = Plan.PlanStatus.ACTIVE
        plan.save(update_fields=["status"])
        return Response(self.get_serializer(plan).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Close plan early if allow_early_close is True."""
        plan = self.get_object()
        if not plan.allow_early_close:
            return Response(
                {"detail": "Plan does not allow early close."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plan.status = Plan.PlanStatus.CLOSED
        plan.save(update_fields=["status"])
        return Response(self.get_serializer(plan).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def renew(self, request, pk=None):
        """Extend available_to date if allow_renew is True."""
        plan = self.get_object()
        if not plan.allow_renew:
            return Response(
                {"detail": "Plan does not allow renew."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_available_to = request.data.get("available_to")
        if not new_available_to:
            return Response(
                {"available_to": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            parsed_date = datetime.strptime(str(new_available_to), "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return Response(
                {"available_to": ["Date has wrong format. Use YYYY-MM-DD."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if plan.available_from and parsed_date < plan.available_from:
            return Response(
                {"available_to": ["available_to cannot be before available_from."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plan.available_to = parsed_date
        # If renewed into the future and was closed due to auto_close expiration, reactivate
        if date.today() <= parsed_date and plan.status == Plan.PlanStatus.CLOSED:
            plan.status = Plan.PlanStatus.ACTIVE
            plan.save(update_fields=["available_to", "status"])
        else:
            plan.save(update_fields=["available_to"])

        return Response(self.get_serializer(plan).data, status=status.HTTP_200_OK)


class QuotationTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for Quotation Templates with nested lines."""

    permission_classes = [CatalogAccessPermission]
    serializer_class = QuotationTemplateSerializer

    def get_queryset(self):
        return (
            QuotationTemplate.objects.select_related("plan")
            .prefetch_related("lines__product", "lines__variant")
            .order_by("id")
        )


class TaxViewSet(viewsets.ModelViewSet):
    """ViewSet for Tax rules."""

    permission_classes = [CatalogAccessPermission]
    serializer_class = TaxSerializer
    queryset = Tax.objects.all().order_by("id")


class DiscountViewSet(viewsets.ModelViewSet):
    """ViewSet for Discount rules."""

    permission_classes = [CatalogAccessPermission]
    serializer_class = DiscountSerializer

    def get_queryset(self):
        return Discount.objects.prefetch_related("products").order_by("id")
