"""Tests for catalog API endpoints, permissions, and plan action rules."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import (
    Discount,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    QuotationTemplateLine,
    Tax,
)

User = get_user_model()


class CatalogAPIBaseTestCase(APITestCase):
    """Base test case providing user fixtures for admin, staff, and customer roles."""

    def setUp(self):
        super().setUp()
        self.admin_user = User.objects.create_user(
            email="admin@brightloop.local",
            password="AdminPassword123!",
            name="Admin User",
            role=User.Role.ADMIN,
        )
        self.staff_user = User.objects.create_user(
            email="staff@brightloop.local",
            password="StaffPassword123!",
            name="Staff User",
            role=User.Role.STAFF,
        )
        self.customer_user = User.objects.create_user(
            email="customer@brightloop.local",
            password="CustomerPassword123!",
            name="Customer User",
            role=User.Role.CUSTOMER,
        )

        self.tax = Tax.objects.create(name="GST 18%", rate_percent=Decimal("18.00"))
        self.plan = Plan.objects.create(
            name="Gold Plan",
            price=Decimal("100.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            min_quantity=1,
            available_from=date.today(),
            available_to=date.today() + timedelta(days=365),
            allow_pause=True,
            allow_early_close=True,
            allow_renew=True,
            status=Plan.PlanStatus.ACTIVE,
        )


class CatalogPermissionTests(CatalogAPIBaseTestCase):
    """Test RBAC permission rules (Admin vs Staff vs Customer vs Anonymous)."""

    def test_anonymous_access_is_unauthorized(self):
        """Unauthenticated requests must receive 401 Unauthorized."""
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.post("/api/products/", {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_access_is_forbidden(self):
        """Customer role must receive 403 Forbidden on all catalog endpoints."""
        self.client.force_authenticate(user=self.customer_user)

        endpoints = [
            "/api/products/",
            "/api/plans/",
            "/api/quotation-templates/",
            "/api/taxes/",
            "/api/discounts/",
        ]
        for url in endpoints:
            response = self.client.get(url)
            self.assertEqual(
                response.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Customer should be forbidden from GET {url}",
            )
            response = self.client.post(url, {})
            self.assertEqual(
                response.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Customer should be forbidden from POST {url}",
            )

    def test_staff_can_read_but_cannot_write(self):
        """Staff role can perform GET operations, but write operations must return 403."""
        self.client.force_authenticate(user=self.staff_user)

        # GET should succeed (200 OK)
        for url in ["/api/products/", "/api/plans/", "/api/taxes/", "/api/discounts/"]:
            response = self.client.get(url)
            self.assertEqual(
                response.status_code,
                status.HTTP_200_OK,
                f"Staff should be allowed GET {url}",
            )

        # POST should be forbidden (403)
        product_payload = {
            "name": "Staff Attempt Product",
            "type": "service",
            "sales_price": "50.00",
            "cost_price": "20.00",
        }
        response = self.client.post("/api/products/", product_payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # PUT should be forbidden (403)
        response = self.client.put(f"/api/plans/{self.plan.id}/", {"name": "Staff Update"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # DELETE should be forbidden (403)
        response = self.client.delete(f"/api/taxes/{self.tax.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_has_full_crud_access(self):
        """Admin role can perform GET, POST, PUT, and DELETE operations."""
        self.client.force_authenticate(user=self.admin_user)

        # Read
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Create
        create_payload = {
            "name": "Cloud Backup Service",
            "type": "service",
            "sales_price": "199.99",
            "cost_price": "50.00",
            "notes": "Daily backup service",
            "default_tax": self.tax.id,
            "variants": [
                {"attribute": "Retention", "value": "30 Days", "extra_price": "0.00"},
                {"attribute": "Retention", "value": "90 Days", "extra_price": "49.00"},
            ],
        }
        create_res = self.client.post("/api/products/", create_payload, format="json")
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        product_id = create_res.data["id"]

        # Detail Read
        detail_res = self.client.get(f"/api/products/{product_id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail_res.data["variants"]), 2)

        # Update
        update_payload = {
            "name": "Cloud Backup Service Enterprise",
            "type": "service",
            "sales_price": "249.99",
            "cost_price": "60.00",
            "notes": "Updated notes",
            "default_tax": self.tax.id,
            "variants": [
                {"attribute": "Retention", "value": "365 Days", "extra_price": "100.00"}
            ],
        }
        update_res = self.client.put(f"/api/products/{product_id}/", update_payload, format="json")
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)
        self.assertEqual(update_res.data["name"], "Cloud Backup Service Enterprise")
        self.assertEqual(len(update_res.data["variants"]), 1)
        self.assertEqual(update_res.data["variants"][0]["value"], "365 Days")

        # Delete
        delete_res = self.client.delete(f"/api/products/{product_id}/")
        self.assertEqual(delete_res.status_code, status.HTTP_204_NO_CONTENT)


class ProductAndVariantTests(CatalogAPIBaseTestCase):
    """Test Product and nested ProductVariant creation, update, and search."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin_user)

    def test_product_nested_variant_creation_and_search(self):
        """Create product with variants and search with query param."""
        payload = {
            "name": "Odoo CRM Enterprise",
            "type": "service",
            "sales_price": "1500.00",
            "cost_price": "500.00",
            "notes": "Enterprise tier CRM",
            "variants": [
                {"attribute": "Tier", "value": "Standard", "extra_price": "0.00"},
                {"attribute": "Tier", "value": "Premium", "extra_price": "300.00"},
            ],
        }
        res = self.client.post("/api/products/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["variants"]), 2)

        # Search by name
        search_res = self.client.get("/api/products/?search=Odoo")
        self.assertEqual(search_res.status_code, status.HTTP_200_OK)
        self.assertEqual(search_res.data["count"], 1)
        self.assertEqual(search_res.data["results"][0]["name"], "Odoo CRM Enterprise")

        # Search with non-matching query
        no_match_res = self.client.get("/api/products/?search=NonExistentProductXYZ")
        self.assertEqual(no_match_res.status_code, status.HTTP_200_OK)
        self.assertEqual(no_match_res.data["count"], 0)


class PlanActionTests(CatalogAPIBaseTestCase):
    """Test plan actions (pause, resume, close, renew) and business rule constraints."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin_user)

    def test_pause_action_allowed_and_disallowed(self):
        """Pause action transitions status to paused if allow_pause is True; fails if False."""
        # Allowed case
        plan_pausable = Plan.objects.create(
            name="Pausable Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date.today(),
            allow_pause=True,
            status=Plan.PlanStatus.ACTIVE,
        )
        res = self.client.post(f"/api/plans/{plan_pausable.id}/pause/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], Plan.PlanStatus.PAUSED)
        plan_pausable.refresh_from_db()
        self.assertEqual(plan_pausable.status, Plan.PlanStatus.PAUSED)

        # Disallowed case (allow_pause = False)
        plan_unpausable = Plan.objects.create(
            name="Unpausable Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date.today(),
            allow_pause=False,
            status=Plan.PlanStatus.ACTIVE,
        )
        res_disallowed = self.client.post(f"/api/plans/{plan_unpausable.id}/pause/")
        self.assertEqual(res_disallowed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res_disallowed.data)
        self.assertIn("does not allow pause", res_disallowed.data["detail"].lower())

    def test_resume_action(self):
        """Resume action transitions paused plan back to active."""
        paused_plan = Plan.objects.create(
            name="Paused Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date.today(),
            allow_pause=True,
            status=Plan.PlanStatus.PAUSED,
        )
        res = self.client.post(f"/api/plans/{paused_plan.id}/resume/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], Plan.PlanStatus.ACTIVE)
        paused_plan.refresh_from_db()
        self.assertEqual(paused_plan.status, Plan.PlanStatus.ACTIVE)

        # Resuming a closed plan must return 400
        closed_plan = Plan.objects.create(
            name="Closed Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date.today(),
            status=Plan.PlanStatus.CLOSED,
        )
        res_closed = self.client.post(f"/api/plans/{closed_plan.id}/resume/")
        self.assertEqual(res_closed.status_code, status.HTTP_400_BAD_REQUEST)

    def test_close_action_allowed_and_disallowed(self):
        """Close action transitions status to closed if allow_early_close is True; fails if False."""
        plan_closeable = Plan.objects.create(
            name="Closeable Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date.today(),
            allow_early_close=True,
            status=Plan.PlanStatus.ACTIVE,
        )
        res = self.client.post(f"/api/plans/{plan_closeable.id}/close/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], Plan.PlanStatus.CLOSED)
        plan_closeable.refresh_from_db()
        self.assertEqual(plan_closeable.status, Plan.PlanStatus.CLOSED)

        plan_uncloseable = Plan.objects.create(
            name="Uncloseable Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date.today(),
            allow_early_close=False,
            status=Plan.PlanStatus.ACTIVE,
        )
        res_disallowed = self.client.post(f"/api/plans/{plan_uncloseable.id}/close/")
        self.assertEqual(res_disallowed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res_disallowed.data)
        self.assertIn("does not allow early close", res_disallowed.data["detail"].lower())

    def test_renew_action_validation_and_rules(self):
        """Renew action requires allow_renew=True and valid available_to date >= available_from."""
        # allow_renew=False
        plan_non_renewable = Plan.objects.create(
            name="Non-Renewable Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date(2026, 1, 1),
            allow_renew=False,
        )
        res_disallowed = self.client.post(
            f"/api/plans/{plan_non_renewable.id}/renew/",
            {"available_to": "2027-01-01"},
            format="json",
        )
        self.assertEqual(res_disallowed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res_disallowed.data)

        # allow_renew=True but missing available_to
        renewable_plan = Plan.objects.create(
            name="Renewable Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date(2026, 1, 1),
            available_to=date(2026, 12, 31),
            allow_renew=True,
        )
        res_missing = self.client.post(
            f"/api/plans/{renewable_plan.id}/renew/",
            {},
            format="json",
        )
        self.assertEqual(res_missing.status_code, status.HTTP_400_BAD_REQUEST)

        # available_to before available_from
        res_past = self.client.post(
            f"/api/plans/{renewable_plan.id}/renew/",
            {"available_to": "2025-12-31"},
            format="json",
        )
        self.assertEqual(res_past.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid renewal
        res_valid = self.client.post(
            f"/api/plans/{renewable_plan.id}/renew/",
            {"available_to": "2027-12-31"},
            format="json",
        )
        self.assertEqual(res_valid.status_code, status.HTTP_200_OK)
        self.assertEqual(res_valid.data["available_to"], "2027-12-31")
        renewable_plan.refresh_from_db()
        self.assertEqual(str(renewable_plan.available_to), "2027-12-31")

    def test_plan_actions_staff_and_customer_forbidden(self):
        """Staff and Customer cannot perform plan actions (pause, resume, close, renew)."""
        plan = self.plan

        # Staff
        self.client.force_authenticate(user=self.staff_user)
        for action in ["pause", "resume", "close", "renew"]:
            res = self.client.post(f"/api/plans/{plan.id}/{action}/", {"available_to": "2027-12-31"})
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Customer
        self.client.force_authenticate(user=self.customer_user)
        for action in ["pause", "resume", "close", "renew"]:
            res = self.client.post(f"/api/plans/{plan.id}/{action}/", {"available_to": "2027-12-31"})
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class QuotationTemplateTests(CatalogAPIBaseTestCase):
    """Test QuotationTemplate creation and update with nested lines."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin_user)
        self.product = Product.objects.create(
            name="Consulting Hour",
            type="service",
            sales_price=Decimal("150.00"),
            cost_price=Decimal("50.00"),
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            attribute="Seniority",
            value="Principal",
            extra_price=Decimal("100.00"),
        )

    def test_create_and_update_quotation_template_with_lines(self):
        """Create a template with nested lines and update them."""
        payload = {
            "name": "Standard Onboarding",
            "plan": self.plan.id,
            "validity_days": 45,
            "lines": [
                {
                    "product": self.product.id,
                    "variant": self.variant.id,
                    "quantity": 10,
                    "unit_price": "250.00",
                }
            ],
        }
        res = self.client.post("/api/quotation-templates/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["lines"]), 1)
        self.assertEqual(res.data["lines"][0]["quantity"], 10)
        template_id = res.data["id"]

        # Update lines
        update_payload = {
            "name": "Standard Onboarding Revised",
            "plan": self.plan.id,
            "validity_days": 60,
            "lines": [
                {
                    "product": self.product.id,
                    "variant": None,
                    "quantity": 5,
                    "unit_price": "150.00",
                }
            ],
        }
        update_res = self.client.put(
            f"/api/quotation-templates/{template_id}/",
            update_payload,
            format="json",
        )
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)
        self.assertEqual(update_res.data["validity_days"], 60)
        self.assertEqual(len(update_res.data["lines"]), 1)
        self.assertEqual(update_res.data["lines"][0]["quantity"], 5)


class DiscountValidationTests(CatalogAPIBaseTestCase):
    """Test validation rules for Discounts (percent bounds and start/end dates)."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin_user)

    def test_percent_discount_validation(self):
        """Percent discount value must be between 0 and 100."""
        # Value > 100
        invalid_payload = {
            "name": "Over 100 Percent",
            "type": "percent",
            "value": "120.00",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "applies_to": "subscription",
        }
        res = self.client.post("/api/discounts/", invalid_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("value", res.data)

        # Valid percent
        valid_payload = {
            "name": "Valid 20 Percent",
            "type": "percent",
            "value": "20.00",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "applies_to": "subscription",
        }
        res_valid = self.client.post("/api/discounts/", valid_payload, format="json")
        self.assertEqual(res_valid.status_code, status.HTTP_201_CREATED)

    def test_date_range_validation(self):
        """Discount end_date cannot be earlier than start_date."""
        invalid_dates = {
            "name": "Invalid Date Range",
            "type": "fixed",
            "value": "50.00",
            "start_date": "2026-06-01",
            "end_date": "2026-05-01",
            "applies_to": "subscription",
        }
        res = self.client.post("/api/discounts/", invalid_dates, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", res.data)
