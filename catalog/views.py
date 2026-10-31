"""Views for catalog, plans, quotation templates, taxes, and discounts."""

from datetime import date, datetime
from django.db.models import Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from accounts.pagination import StandardResultsSetPagination
from accounts.permissions import IsAdmin, IsStaffOrAdmin
from catalog.models import (
    Discount,
    Plan,
    Product,
    QuotationTemplate,
    Tax,
)
from catalog.serializers import (
    DiscountSerializer,
    PlanSerializer,
    ProductSerializer,
    QuotationTemplateSerializer,
    TaxSerializer,
)


class BaseCatalogListCreateView(generics.ListCreateAPIView):
    """
    Base ListCreate view enforcing:
    - Reads (GET, HEAD, OPTIONS): Staff or Admin (IsStaffOrAdmin)
    - Writes (POST): Admin only (IsAdmin)
    - Standard pagination
    """

    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [IsStaffOrAdmin()]
        return [IsAdmin()]


class BaseCatalogDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Base Detail view enforcing:
    - Reads (GET, HEAD, OPTIONS): Staff or Admin (IsStaffOrAdmin)
    - Writes (PUT, PATCH, DELETE): Admin only (IsAdmin)
    """

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [IsStaffOrAdmin()]
        return [IsAdmin()]


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


class ProductListCreateView(BaseCatalogListCreateView):
    """
    GET /api/products/?search=&type=&page=
    POST /api/products/ (Admin only)
    """

    serializer_class = ProductSerializer

    def get_queryset(self):
        queryset = Product.objects.select_related("default_tax").prefetch_related("variants").all()
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(notes__icontains=search))
        prod_type = self.request.query_params.get("type")
        if prod_type:
            queryset = queryset.filter(type=prod_type)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ["true", "1"]:
                queryset = queryset.filter(is_active=True)
            elif is_active.lower() in ["false", "0"]:
                queryset = queryset.filter(is_active=False)
        return queryset


class ProductDetailView(BaseCatalogDetailView):
    """
    GET /api/products/{id}/ (Staff or Admin)
    PUT / PATCH / DELETE /api/products/{id}/ (Admin only)
    """

    queryset = Product.objects.select_related("default_tax").prefetch_related("variants").all()
    serializer_class = ProductSerializer


# ---------------------------------------------------------------------------
# Plans & Plan Actions
# ---------------------------------------------------------------------------


class PlanListCreateView(BaseCatalogListCreateView):
    """
    GET /api/plans/?status=&billing_period=&search=
    POST /api/plans/ (Admin only)
    """

    serializer_class = PlanSerializer

    def get_queryset(self):
        queryset = Plan.objects.all()
        plan_status = self.request.query_params.get("status")
        if plan_status:
            queryset = queryset.filter(status=plan_status)
        billing_period = self.request.query_params.get("billing_period")
        if billing_period:
            queryset = queryset.filter(billing_period=billing_period)
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset


class PlanDetailView(BaseCatalogDetailView):
    """
    GET /api/plans/{id}/ (Staff or Admin)
    PUT / PATCH / DELETE /api/plans/{id}/ (Admin only)
    """

    queryset = Plan.objects.all()
    serializer_class = PlanSerializer


class PlanPauseView(generics.GenericAPIView):
    """
    POST /api/plans/{id}/pause/ (Admin only)
    Pauses an active plan if allow_pause is True.
    """

    permission_classes = [IsAdmin]
    queryset = Plan.objects.all()

    def post(self, request, pk=None):
        plan = self.get_object()
        if not plan.allow_pause:
            return Response(
                {"detail": "Plan does not allow pause."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if plan.status == Plan.PlanStatus.CLOSED:
            return Response(
                {"detail": "Cannot pause a closed plan."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plan.status = Plan.PlanStatus.PAUSED
        plan.save(update_fields=["status"])
        serializer = PlanSerializer(plan)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlanResumeView(generics.GenericAPIView):
    """
    POST /api/plans/{id}/resume/ (Admin only)
    Resumes a paused plan to active.
    """

    permission_classes = [IsAdmin]
    queryset = Plan.objects.all()

    def post(self, request, pk=None):
        plan = self.get_object()
        if plan.status == Plan.PlanStatus.CLOSED:
            return Response(
                {"detail": "Cannot resume a closed plan."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plan.status = Plan.PlanStatus.ACTIVE
        plan.save(update_fields=["status"])
        serializer = PlanSerializer(plan)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlanCloseView(generics.GenericAPIView):
    """
    POST /api/plans/{id}/close/ (Admin only)
    Closes a plan early if allow_early_close is True.
    """

    permission_classes = [IsAdmin]
    queryset = Plan.objects.all()

    def post(self, request, pk=None):
        plan = self.get_object()
        if not plan.allow_early_close:
            return Response(
                {"detail": "Plan does not allow early close."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plan.status = Plan.PlanStatus.CLOSED
        plan.save(update_fields=["status"])
        serializer = PlanSerializer(plan)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlanRenewView(generics.GenericAPIView):
    """
    POST /api/plans/{id}/renew/ (Admin only)
    Extends available_to for a plan if allow_renew is True.
    Payload: {"available_to": "YYYY-MM-DD"}
    """

    permission_classes = [IsAdmin]
    queryset = Plan.objects.all()

    def post(self, request, pk=None):
        plan = self.get_object()
        if not plan.allow_renew:
            return Response(
                {"detail": "Plan does not allow renew."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        available_to_raw = request.data.get("available_to")
        if not available_to_raw:
            return Response(
                {"available_to": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if isinstance(available_to_raw, str):
            try:
                new_date = datetime.strptime(available_to_raw, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"available_to": ["Invalid date format. Expected YYYY-MM-DD."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif isinstance(available_to_raw, date):
            new_date = available_to_raw
        else:
            return Response(
                {"available_to": ["Invalid date value."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if plan.available_from and new_date < plan.available_from:
            return Response(
                {"available_to": ["available_to date cannot be earlier than available_from date."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plan.available_to = new_date
        plan.save(update_fields=["available_to"])
        serializer = PlanSerializer(plan)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Quotation Templates
# ---------------------------------------------------------------------------


class QuotationTemplateListCreateView(BaseCatalogListCreateView):
    """
    GET /api/quotation-templates/?search=&plan=
    POST /api/quotation-templates/ (Admin only)
    """

    serializer_class = QuotationTemplateSerializer

    def get_queryset(self):
        queryset = (
            QuotationTemplate.objects.select_related("plan")
            .prefetch_related("lines__product", "lines__variant")
            .all()
        )
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)
        plan_id = self.request.query_params.get("plan")
        if plan_id:
            queryset = queryset.filter(plan_id=plan_id)
        return queryset


class QuotationTemplateDetailView(BaseCatalogDetailView):
    """
    GET /api/quotation-templates/{id}/ (Staff or Admin)
    PUT / PATCH / DELETE /api/quotation-templates/{id}/ (Admin only)
    """

    queryset = (
        QuotationTemplate.objects.select_related("plan")
        .prefetch_related("lines__product", "lines__variant")
        .all()
    )
    serializer_class = QuotationTemplateSerializer


# ---------------------------------------------------------------------------
# Taxes
# ---------------------------------------------------------------------------


class TaxListCreateView(BaseCatalogListCreateView):
    """
    GET /api/taxes/?search=&is_active=
    POST /api/taxes/ (Admin only)
    """

    serializer_class = TaxSerializer

    def get_queryset(self):
        queryset = Tax.objects.all()
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ["true", "1"]:
                queryset = queryset.filter(is_active=True)
            elif is_active.lower() in ["false", "0"]:
                queryset = queryset.filter(is_active=False)
        return queryset


class TaxDetailView(BaseCatalogDetailView):
    """
    GET /api/taxes/{id}/ (Staff or Admin)
    PUT / PATCH / DELETE /api/taxes/{id}/ (Admin only)
    """

    queryset = Tax.objects.all()
    serializer_class = TaxSerializer


# ---------------------------------------------------------------------------
# Discounts
# ---------------------------------------------------------------------------


class DiscountListCreateView(BaseCatalogListCreateView):
    """
    GET /api/discounts/?search=&type=&applies_to=&is_active=
    POST /api/discounts/ (Admin only)
    """

    serializer_class = DiscountSerializer

    def get_queryset(self):
        queryset = Discount.objects.prefetch_related("products").all()
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)
        disc_type = self.request.query_params.get("type")
        if disc_type:
            queryset = queryset.filter(type=disc_type)
        applies_to = self.request.query_params.get("applies_to")
        if applies_to:
            queryset = queryset.filter(applies_to=applies_to)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ["true", "1"]:
                queryset = queryset.filter(is_active=True)
            elif is_active.lower() in ["false", "0"]:
                queryset = queryset.filter(is_active=False)
        return queryset


class DiscountDetailView(BaseCatalogDetailView):
    """
    GET /api/discounts/{id}/ (Staff or Admin)
    PUT / PATCH / DELETE /api/discounts/{id}/ (Admin only)
    """

    queryset = Discount.objects.prefetch_related("products").all()
    serializer_class = DiscountSerializer
