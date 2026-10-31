"""URL routing for Subscriptions REST API."""

from django.urls import path
from subscriptions import api_views

urlpatterns = [
    path("subscriptions/", api_views.SubscriptionListCreateView.as_view(), name="subscription-list-create"),
    path("subscriptions/<int:pk>/", api_views.SubscriptionDetailView.as_view(), name="subscription-detail"),
    path("subscriptions/<int:pk>/transition/", api_views.SubscriptionTransitionView.as_view(), name="subscription-transition"),
]

