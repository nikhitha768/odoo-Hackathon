"""Comprehensive tests for accounts models, validators, permissions, and REST API endpoints."""

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.exceptions import ValidationError
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from accounts.permissions import IsAdmin, IsStaffOrAdmin
from accounts.validators import CustomPasswordValidator

User = get_user_model()


class UserModelTests(APITestCase):
    """Test custom User model creation, fields, and roles."""

    def test_create_customer_user(self):
        user = User.objects.create_user(
            email="customer@example.com",
            name="Alice Customer",
            password="ValidPass1!",
        )
        self.assertEqual(user.email, "customer@example.com")
        self.assertEqual(user.name, "Alice Customer")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertFalse(user.is_staff)
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.is_customer)
        self.assertFalse(user.is_staff_member)
        self.assertFalse(user.is_admin)
        self.assertIsNotNone(user.created_at)
        self.assertTrue(user.check_password("ValidPass1!"))

    def test_create_superuser_has_admin_role(self):
        admin = User.objects.create_superuser(
            email="admin@example.com",
            name="Site Admin",
            password="ValidPass1!",
        )
        self.assertEqual(admin.role, User.Role.ADMIN)
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.is_admin)
        self.assertTrue(admin.is_staff_member)
        self.assertFalse(admin.is_customer)

    def test_email_must_be_set(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", name="No Email", password="ValidPass1!")


class PasswordValidatorTests(APITestCase):
    """Test custom password complexity validator rules."""

    def setUp(self):
        self.validator = CustomPasswordValidator()

    def test_valid_password(self):
        try:
            self.validator.validate("ValidPass1!")
        except ValidationError:
            self.fail("CustomPasswordValidator raised ValidationError unexpectedly.")

    def test_too_short(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("Short1!")
        self.assertTrue(any("at least 9 characters" in str(e) for e in ctx.exception))

    def test_missing_uppercase(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("lowercase1!")
        self.assertTrue(any("uppercase" in str(e) for e in ctx.exception))

    def test_missing_lowercase(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("UPPERCASE1!")
        self.assertTrue(any("lowercase" in str(e) for e in ctx.exception))

    def test_missing_special(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("NoSpecial123")
        self.assertTrue(any("special" in str(e) for e in ctx.exception))


class PermissionClassesTests(APITestCase):
    """Test DRF permission classes IsAdmin and IsStaffOrAdmin."""

    def setUp(self):
        self.is_admin_perm = IsAdmin()
        self.is_staff_or_admin_perm = IsStaffOrAdmin()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            name="Admin User",
            password="ValidPass1!",
        )
        self.staff = User.objects.create_user(
            email="staff@example.com",
            name="Staff User",
            password="ValidPass1!",
            role=User.Role.STAFF,
        )
        self.customer = User.objects.create_user(
            email="cust@example.com",
            name="Cust User",
            password="ValidPass1!",
            role=User.Role.CUSTOMER,
        )

    def _mock_request(self, user):
        class MockRequest:
            def __init__(self, u):
                self.user = u

        return MockRequest(user)

    def test_is_admin(self):
        self.assertTrue(self.is_admin_perm.has_permission(self._mock_request(self.admin), None))
        self.assertFalse(self.is_admin_perm.has_permission(self._mock_request(self.staff), None))
        self.assertFalse(self.is_admin_perm.has_permission(self._mock_request(self.customer), None))

    def test_is_staff_or_admin(self):
        self.assertTrue(self.is_staff_or_admin_perm.has_permission(self._mock_request(self.admin), None))
        self.assertTrue(self.is_staff_or_admin_perm.has_permission(self._mock_request(self.staff), None))
        self.assertFalse(self.is_staff_or_admin_perm.has_permission(self._mock_request(self.customer), None))


class AuthEndpointsTests(APITestCase):
    """Test all authentication, password reset, and user endpoints."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            name="Admin User",
            password="ValidPass1!",
        )
        self.staff = User.objects.create_user(
            email="staff@example.com",
            name="Staff User",
            password="ValidPass1!",
            role=User.Role.STAFF,
        )
        self.customer = User.objects.create_user(
            email="customer@example.com",
            name="Customer User",
            password="ValidPass1!",
            role=User.Role.CUSTOMER,
        )

        self.admin_token, _ = Token.objects.get_or_create(user=self.admin)
        self.staff_token, _ = Token.objects.get_or_create(user=self.staff)
        self.customer_token, _ = Token.objects.get_or_create(user=self.customer)

    # 1. POST /api/auth/signup/
    def test_signup_success(self):
        response = self.client.post(
            "/api/auth/signup/",
            {
                "name": "Jane Doe",
                "email": "janedoe@example.com",
                "password": "ValidPass1!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Jane Doe")
        self.assertEqual(response.data["email"], "janedoe@example.com")
        self.assertEqual(response.data["role"], "customer")
        self.assertIn("id", response.data)

        user = User.objects.get(email="janedoe@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertFalse(user.is_staff)

    def test_signup_duplicate_email(self):
        response = self.client.post(
            "/api/auth/signup/",
            {
                "name": "Another User",
                "email": "customer@example.com",
                "password": "ValidPass1!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertEqual(
            response.data["email"], ["An account with this email already exists."]
        )

    def test_signup_invalid_password(self):
        response = self.client.post(
            "/api/auth/signup/",
            {
                "name": "Weak Pass User",
                "email": "weak@example.com",
                "password": "short",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertTrue(isinstance(response.data["password"], list))

    # 2. POST /api/auth/login/
    def test_login_success(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": "customer@example.com", "password": "ValidPass1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["id"], self.customer.id)
        self.assertEqual(response.data["user"]["name"], "Customer User")
        self.assertEqual(response.data["user"]["email"], "customer@example.com")
        self.assertEqual(response.data["user"]["role"], "customer")

    def test_login_invalid_password(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": "customer@example.com", "password": "WrongPassword1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)
        self.assertEqual(response.data["detail"], "Invalid email or password.")

    def test_login_disabled_account(self):
        self.customer.is_active = False
        self.customer.save()
        response = self.client.post(
            "/api/auth/login/",
            {"email": "customer@example.com", "password": "ValidPass1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    # 3. POST /api/auth/logout/
    def test_logout_success(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.customer_token.key}")
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Token.objects.filter(key=self.customer_token.key).exists())

    def test_logout_unauthenticated(self):
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 4. GET /api/auth/me/
    def test_me_success(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.customer_token.key}")
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "id": self.customer.id,
                "name": "Customer User",
                "email": "customer@example.com",
                "role": "customer",
            },
        )

    def test_me_unauthenticated(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 5. POST /api/auth/password-reset/
    def test_password_reset_existing_email(self):
        import re
        from urllib.parse import parse_qs, urlparse

        mail.outbox.clear()
        response = self.client.post(
            "/api/auth/password-reset/",
            {"email": "customer@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {"detail": "If the email exists, a reset link was sent."},
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Brightloop Software Password Reset")

        email_body = mail.outbox[0].body
        self.assertIn("This link expires in 1 hour", email_body)
        self.assertIn("If you did not request this, ignore this email.", email_body)

        # Extract uid and token from the link in the body
        match = re.search(r"https?://[^\s]+/reset-password\?[^\s]+", email_body)
        self.assertIsNotNone(match, "Reset link not found in email body")
        reset_link = match.group(0)
        parsed_url = urlparse(reset_link)
        query_params = parse_qs(parsed_url.query)
        self.assertIn("uid", query_params)
        self.assertIn("token", query_params)
        uid = query_params["uid"][0]
        token = query_params["token"][0]

        # Post them with a valid new password to the confirm endpoint
        new_password = "BrandNewPass1!"
        confirm_response = self.client.post(
            "/api/auth/password-reset/confirm/",
            {
                "uid": uid,
                "token": token,
                "new_password": new_password,
            },
            format="json",
        )
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_response.data, {"detail": "Password updated."})

        # Log in with the new password
        login_response = self.client.post(
            "/api/auth/login/",
            {
                "email": "customer@example.com",
                "password": new_password,
            },
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertIn("token", login_response.data)

    def test_password_reset_non_existing_email(self):
        mail.outbox.clear()
        response = self.client.post(
            "/api/auth/password-reset/",
            {"email": "nonexistent@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {"detail": "If the email exists, a reset link was sent."},
        )
        self.assertEqual(len(mail.outbox), 0)

    # 6. POST /api/auth/password-reset/confirm/
    def test_password_reset_confirm_success(self):
        uid = urlsafe_base64_encode(force_bytes(self.customer.pk))
        token = default_token_generator.make_token(self.customer)

        response = self.client.post(
            "/api/auth/password-reset/confirm/",
            {
                "uid": uid,
                "token": token,
                "new_password": "NewValidPass1!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"detail": "Password updated."})

        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password("NewValidPass1!"))

    def test_password_reset_confirm_invalid_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.customer.pk))
        response = self.client.post(
            "/api/auth/password-reset/confirm/",
            {
                "uid": uid,
                "token": "invalid-token",
                "new_password": "NewValidPass1!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)
        self.assertEqual(response.data["detail"], "Invalid or expired token.")

    def test_password_reset_confirm_invalid_password_rules(self):
        uid = urlsafe_base64_encode(force_bytes(self.customer.pk))
        token = default_token_generator.make_token(self.customer)

        response = self.client.post(
            "/api/auth/password-reset/confirm/",
            {
                "uid": uid,
                "token": token,
                "new_password": "short",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)
        self.assertTrue(isinstance(response.data["new_password"], list))

    # 7. POST /api/staff/
    def test_staff_create_admin_only(self):
        # Unauthenticated: 401
        response = self.client.post("/api/staff/", {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Customer: 403
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.customer_token.key}")
        response = self.client.post(
            "/api/staff/",
            {"name": "New Staff", "email": "staff2@example.com", "password": "ValidPass1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Staff: 403
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")
        response = self.client.post(
            "/api/staff/",
            {"name": "New Staff", "email": "staff2@example.com", "password": "ValidPass1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Admin: 201
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        response = self.client.post(
            "/api/staff/",
            {"name": "New Staff", "email": "staff2@example.com", "password": "ValidPass1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "New Staff")
        self.assertEqual(response.data["email"], "staff2@example.com")
        self.assertEqual(response.data["role"], "staff")

        new_staff = User.objects.get(email="staff2@example.com")
        self.assertEqual(new_staff.role, User.Role.STAFF)
        self.assertTrue(new_staff.is_staff)

    # 8. GET /api/staff/
    def test_staff_list_admin_only(self):
        # Customer: 403
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.customer_token.key}")
        response = self.client.get("/api/staff/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Staff: 403
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")
        response = self.client.get("/api/staff/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Admin: 200 with pagination
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        response = self.client.get("/api/staff/?page=1&page_size=20")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("count", response.data)
        self.assertIn("next", response.data)
        self.assertIn("previous", response.data)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["email"], "staff@example.com")
        self.assertEqual(response.data["results"][0]["role"], "staff")

    # 9. GET /api/customers/
    def test_customers_list_staff_plus(self):
        # Customer: 403
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.customer_token.key}")
        response = self.client.get("/api/customers/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Staff: 200
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")
        response = self.client.get("/api/customers/?page=1&page_size=20")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("count", response.data)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["email"], "customer@example.com")
        self.assertEqual(response.data["results"][0]["role"], "customer")

        # Admin: 200
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        response = self.client.get("/api/customers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_customers_list_search(self):
        User.objects.create_user(
            email="special@brightloop.com",
            name="Zoe Special",
            password="ValidPass1!",
            role=User.Role.CUSTOMER,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        # Search matches name
        response = self.client.get("/api/customers/?search=Zoe")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Zoe Special")

        # Search matches email
        response = self.client.get("/api/customers/?search=brightloop.com")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["email"], "special@brightloop.com")

        # Search non-matching
        response = self.client.get("/api/customers/?search=nonexistent")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
