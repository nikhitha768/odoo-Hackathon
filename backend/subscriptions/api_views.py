"""API views for Subscription listing, retrieval, creation, updating, and status transitions."""

from django.core.exceptions import ValidationError
from django.db.models import Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from accounts.pagination import StandardResultsSetPagination
from accounts.permissions import IsStaffOrAdmin
from subscriptions.models import Subscription
from subscriptions.serializers import (
    SubscriptionCreateUpdateSerializer,
    SubscriptionSerializer,
)


class SubscriptionListCreateView(generics.ListCreateAPIView):
    """
    GET /api/subscriptions/?status=&customer=&search=&page=
    POST /api/subscriptions/ (Staff+ only)
    """

    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsStaffOrAdmin()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return SubscriptionCreateUpdateSerializer
        return SubscriptionSerializer

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated):
            return Subscription.objects.none()

        qs = Subscription.objects.select_related(
            "customer", "plan", "template", "created_by"
        ).prefetch_related(
            "lines", "lines__product", "lines__variant", "lines__tax"
        )

        role = getattr(user, "role", None)
        if role == "customer":
            return qs.filter(customer=user)

        # Staff and admin can filter by customer
        customer_param = self.request.query_params.get("customer")
        if customer_param:
            qs = qs.filter(customer_id=customer_param)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        search_param = self.request.query_params.get("search")
        if search_param:
            qs = qs.filter(
                Q(number__icontains=search_param)
                | Q(customer__name__icontains=search_param)
                | Q(customer__email__icontains=search_param)
                | Q(plan__name__icontains=search_param)
            )

        return qs

    def create(self, request, *args, **kwargs):
        input_serializer = SubscriptionCreateUpdateSerializer(
            data=request.data, context={"request": request}
        )
        input_serializer.is_valid(raise_exception=True)
        subscription = input_serializer.save()

        # Re-fetch with select_related and prefetch_related for clean response
        refreshed_instance = self.get_queryset().get(pk=subscription.pk)
        output_serializer = SubscriptionSerializer(refreshed_instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class SubscriptionDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/subscriptions/{id}/ (Customer-own: sees own, gets 404 for others)
    PUT / PATCH /api/subscriptions/{id}/ (Only while status is draft)
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return SubscriptionCreateUpdateSerializer
        return SubscriptionSerializer

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated):
            return Subscription.objects.none()

        qs = Subscription.objects.select_related(
            "customer", "plan", "template", "created_by"
        ).prefetch_related(
            "lines", "lines__product", "lines__variant", "lines__tax"
        )

        role = getattr(user, "role", None)
        if role == "customer":
            return qs.filter(customer=user)

        return qs

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        # Contract: Only while status is draft
        if instance.status != Subscription.Status.DRAFT:
            return Response(
                {"detail": "Subscriptions can only be edited while in draft status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        input_serializer = SubscriptionCreateUpdateSerializer(
            instance, data=request.data, partial=partial, context={"request": request}
        )
        input_serializer.is_valid(raise_exception=True)
        updated_instance = input_serializer.save()

        # Clear prefetched cache by re-fetching with full relations
        refreshed_instance = self.get_queryset().get(pk=updated_instance.pk)
        output_serializer = SubscriptionSerializer(refreshed_instance)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class SubscriptionTransitionView(generics.GenericAPIView):
    """
    POST /api/subscriptions/{id}/transition/ (Staff+ only)
    Body: {"to": "quotation"|"confirmed"|"active"|"closed"}
    Transitions subscription to next allowed status.
    Returns 400 {"detail": "Cannot move from X to Y"} on invalid jump.
    """

    permission_classes = [IsStaffOrAdmin]
    queryset = Subscription.objects.all()

    def post(self, request, pk=None):
        subscription = self.get_object()
        target_status = request.data.get("to") or request.data.get("status")

        if not target_status:
            return Response(
                {"to": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_status = target_status.lower().strip()
        if target_status not in Subscription.Status.values:
            return Response(
                {"detail": f"Invalid target status '{target_status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            subscription.transition_to(target_status)
        except ValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        refreshed_instance = (
            Subscription.objects.select_related("customer", "plan", "template", "created_by")
            .prefetch_related("lines", "lines__product", "lines__variant", "lines__tax")
            .get(pk=subscription.pk)
        )
        serializer = SubscriptionSerializer(refreshed_instance)
        return Response(serializer.data, status=status.HTTP_200_OK)
