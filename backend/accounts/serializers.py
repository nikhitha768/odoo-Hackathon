"""Serializers for accounts authentication, user management, and password reset."""

from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Serializer representing user identity and role."""

    class Meta:
        model = User
        fields = ("id", "name", "email", "role")
        read_only_fields = ("id", "role")


class SignUpSerializer(serializers.ModelSerializer):
    """Serializer for customer self-registration."""

    email = serializers.EmailField(
        required=True,
        validators=[
            UniqueValidator(
                queryset=User.objects.all(),
                message="An account with this email already exists.",
            )
        ],
    )
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ("id", "name", "email", "password", "role")
        read_only_fields = ("id", "role")

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        return name

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data["email"],
            name=validated_data["name"],
            password=validated_data["password"],
            role=User.Role.CUSTOMER,
        )


class LoginSerializer(serializers.Serializer):
    """Serializer for email and password authentication."""

    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True)

    def validate_email(self, value):
        return value.strip().lower()


class StaffCreateSerializer(serializers.ModelSerializer):
    """Serializer for administrator creating a staff member account."""

    email = serializers.EmailField(
        required=True,
        validators=[
            UniqueValidator(
                queryset=User.objects.all(),
                message="An account with this email already exists.",
            )
        ],
    )
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ("id", "name", "email", "password", "role")
        read_only_fields = ("id", "role")

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        return name

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data["email"],
            name=validated_data["name"],
            password=validated_data["password"],
            role=User.Role.STAFF,
            is_staff=True,
        )


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for requesting a password reset email."""

    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for confirming password reset with token."""

    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, write_only=True)

    def validate_new_password(self, value):
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value
