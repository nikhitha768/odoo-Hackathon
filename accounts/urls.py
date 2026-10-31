"""URL routing for accounts REST API endpoints."""

from django.urls import path

from . import views

urlpatterns = [
    # Auth endpoints
    path("auth/signup/", views.SignUpView.as_view(), name="signup"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("auth/password-reset/", views.PasswordResetRequestView.as_view(), name="password_reset"),
    path(
        "auth/password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password_reset_confirm",
    ),
    # Staff and Customers endpoints
    path("staff/", views.StaffListCreateView.as_view(), name="staff_list_create"),
    path("customers/", views.CustomerListView.as_view(), name="customer_list"),
]
