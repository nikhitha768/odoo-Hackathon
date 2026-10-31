"""User and role models for accounts app aligned with API contract."""

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Custom manager for User model with email as primary identifier."""

    def create_user(self, email, password=None, **extra_fields):
        """Create and return a regular user with customer role by default."""
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        extra_fields.setdefault("role", User.Role.CUSTOMER)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("role") in [User.Role.ADMIN, User.Role.STAFF]:
            extra_fields.setdefault("is_staff", True)
        else:
            extra_fields.setdefault("is_staff", False)

        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Create and return a superuser with admin role."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("name", "Admin")
        extra_fields["role"] = User.Role.ADMIN

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user model using email instead of username."""

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        STAFF = "staff", "Staff"
        CUSTOMER = "customer", "Customer"

    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CUSTOMER,
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.email} ({self.get_role_display()})"

    def save(self, *args, **kwargs):
        """Synchronize is_staff with role."""
        if self.role in [self.Role.ADMIN, self.Role.STAFF]:
            self.is_staff = True
        elif not self.is_superuser:
            self.is_staff = False
        super().save(*args, **kwargs)

    @property
    def is_admin(self):
        """Return True if user is an admin or superuser."""
        return self.role == self.Role.ADMIN or self.is_superuser

    @property
    def is_staff_member(self):
        """Return True if user has staff or admin role."""
        return self.role in [self.Role.ADMIN, self.Role.STAFF] or self.is_staff or self.is_superuser

    @property
    def is_customer(self):
        """Return True if user has customer role."""
        return self.role == self.Role.CUSTOMER
