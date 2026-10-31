"""DRF permission classes for Brightloop REST API."""

from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Allows access only to authenticated admin users."""

    message = "Administrator access required."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return getattr(user, "role", None) == "admin" or user.is_superuser


class IsStaffOrAdmin(BasePermission):
    """Allows access to authenticated staff or admin users (Staff+)."""

    message = "Staff or Administrator access required."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        role = getattr(user, "role", None)
        return role in ["admin", "staff"] or getattr(user, "is_staff", False) or user.is_superuser
