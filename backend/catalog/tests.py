"""Tests for catalog REST API: permissions, nested variants, plan actions, auto-close, and validations."""

from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from catalog.models import (
    Discount,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    Tax,
)

User = get_user_model()


class CatalogAPITests(APITestCase):
    """Test suite covering catalog API endpoints, permissions, validations, and plan actions."""

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

        self.tax = Tax.objects.create(name="GST 18%", rate_percent=Decimal("18.00"))

    # 1. Permissions Tests
    def test_unauthenticated_blocked(self):
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_forbidden(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.customer_token.key}")
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.client.get("/api/plans/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.client.post("/api/taxes/", {"name": "Test", "rate_percent": "5.00"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_read_but_not_mutate(self):
        product = Product.objects.create(
            name="Base Service",
            type=Product.ProductType.SERVICE,
            sales_price=Decimal("100.00"),
            cost_price=Decimal("50.00"),
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        # List & Detail: 200 OK
        list_resp = self.client.get("/api/products/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)

        detail_resp = self.client.get(f"/api/products/{product.id}/")
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)

        # Create: 403 Forbidden
        create_resp = self.client.post(
            "/api/products/",
            {
                "name": "New Product",
                "type": "goods",
                "sales_price": "200.00",
                "cost_price": "100.00",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Update: 403 Forbidden
        update_resp = self.client.put(
            f"/api/products/{product.id}/",
            {
                "name": "Updated",
                "type": "service",
                "sales_price": "120.00",
                "cost_price": "60.00",
            },
            format="json",
        )
        self.assertEqual(update_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Delete: 403 Forbidden
        del_resp = self.client.delete(f"/api/products/{product.id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_403_FORBIDDEN)

    # 2. Nested Variants on Products
    def test_product_nested_variants_create_and_read(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        data = {
            "name": "Pro Seats",
            "type": "service",
            "sales_price": "1000.00",
            "cost_price": "400.00",
            "notes": "Software seat license",
            "default_tax": self.tax.id,
            "variants": [
                {"attribute": "Brand", "value": "Odoo", "extra_price": "560.00"},
                {"attribute": "Brand", "value": "Community", "extra_price": "0.00"},
            ],
        }
        response = self.client.post("/api/products/", data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["variants"]), 2)
        self.assertEqual(response.data["default_tax"], self.tax.id)

        product_id = response.data["id"]
        product = Product.objects.get(id=product_id)
        self.assertEqual(product.variants.count(), 2)

        # Read back via GET
        get_resp = self.client.get(f"/api/products/{product_id}/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(get_resp.data["variants"]), 2)

    def test_product_nested_variants_update(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        product = Product.objects.create(
            name="Hardware Item",
            type=Product.ProductType.GOODS,
            sales_price=Decimal("500.00"),
            cost_price=Decimal("300.00"),
        )
        v1 = ProductVariant.objects.create(
            product=product,
            attribute="Color",
            value="Black",
            extra_price=Decimal("0.00"),
        )

        update_data = {
            "name": "Hardware Item Renamed",
            "type": "goods",
            "sales_price": "550.00",
            "cost_price": "320.00",
            "variants": [
                {"id": v1.id, "attribute": "Color", "value": "Black", "extra_price": "10.00"},
                {"attribute": "Color", "value": "White", "extra_price": "25.00"},
            ],
        }
        response = self.client.put(f"/api/products/{product.id}/", update_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["variants"]), 2)
        v1.refresh_from_db()
        self.assertEqual(v1.extra_price, Decimal("10.00"))
        self.assertEqual(product.variants.count(), 2)

    def test_product_search(self):
        Product.objects.create(
            name="Alpha ERP",
            type=Product.ProductType.SERVICE,
            sales_price=Decimal("100.00"),
            cost_price=Decimal("50.00"),
        )
        Product.objects.create(
            name="Beta Hardware",
            type=Product.ProductType.GOODS,
            sales_price=Decimal("200.00"),
            cost_price=Decimal("150.00"),
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        response = self.client.get("/api/products/?search=Alpha")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Alpha ERP")

    # 3. Plan Actions: pause, resume, close, renew
    def test_plan_actions_pause_and_resume(self):
        plan = Plan.objects.create(
            name="Monthly Plan",
            price=Decimal("100.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            allow_pause=True,
            status=Plan.PlanStatus.ACTIVE,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        # Pause
        pause_resp = self.client.post(f"/api/plans/{plan.id}/pause/")
        self.assertEqual(pause_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(pause_resp.data["status"], "paused")
        plan.refresh_from_db()
        self.assertEqual(plan.status, Plan.PlanStatus.PAUSED)

        # Resume
        resume_resp = self.client.post(f"/api/plans/{plan.id}/resume/")
        self.assertEqual(resume_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resume_resp.data["status"], "active")
        plan.refresh_from_db()
        self.assertEqual(plan.status, Plan.PlanStatus.ACTIVE)

    def test_plan_pause_not_allowed(self):
        plan = Plan.objects.create(
            name="No Pause Plan",
            price=Decimal("100.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            allow_pause=False,
            status=Plan.PlanStatus.ACTIVE,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        response = self.client.post(f"/api/plans/{plan.id}/pause/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_plan_close_action(self):
        plan_allowed = Plan.objects.create(
            name="Closable Plan",
            price=Decimal("100.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            allow_early_close=True,
            status=Plan.PlanStatus.ACTIVE,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        response = self.client.post(f"/api/plans/{plan_allowed.id}/close/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "closed")

        plan_disallowed = Plan.objects.create(
            name="No Early Close",
            price=Decimal("100.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            allow_early_close=False,
            status=Plan.PlanStatus.ACTIVE,
        )
        resp_dis = self.client.post(f"/api/plans/{plan_disallowed.id}/close/")
        self.assertEqual(resp_dis.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", resp_dis.data)

    def test_plan_renew_action(self):
        today = date.today()
        plan = Plan.objects.create(
            name="Renewable Plan",
            price=Decimal("100.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=today,
            available_to=today + timedelta(days=30),
            allow_renew=True,
            status=Plan.PlanStatus.ACTIVE,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        # Missing available_to
        bad_resp = self.client.post(f"/api/plans/{plan.id}/renew/", {})
        self.assertEqual(bad_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("available_to", bad_resp.data)

        # Successful renewal
        new_date_str = (today + timedelta(days=90)).strftime("%Y-%m-%d")
        good_resp = self.client.post(
            f"/api/plans/{plan.id}/renew/",
            {"available_to": new_date_str},
            format="json",
        )
        self.assertEqual(good_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(good_resp.data["available_to"], new_date_str)
        plan.refresh_from_db()
        self.assertEqual(plan.available_to.strftime("%Y-%m-%d"), new_date_str)

        # Disallowed renewal
        plan.allow_renew = False
        plan.save()
        dis_resp = self.client.post(
            f"/api/plans/{plan.id}/renew/",
            {"available_to": new_date_str},
            format="json",
        )
        self.assertEqual(dis_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", dis_resp.data)

    # 4. Auto-Close Plan on Read
    def test_plan_auto_close_on_read(self):
        yesterday = date.today() - timedelta(days=1)
        plan = Plan.objects.create(
            name="Auto Expired Plan",
            price=Decimal("50.00"),
            billing_period=Plan.BillingPeriod.DAILY,
            available_from=yesterday - timedelta(days=10),
            available_to=yesterday,
            auto_close=True,
            status=Plan.PlanStatus.ACTIVE,
        )
        self.assertEqual(plan.status, Plan.PlanStatus.ACTIVE)

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")
        response = self.client.get(f"/api/plans/{plan.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "closed")

        plan.refresh_from_db()
        self.assertEqual(plan.status, Plan.PlanStatus.CLOSED)

    # 5. Validation Rules
    def test_negative_prices_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        # Product negative price
        resp = self.client.post(
            "/api/products/",
            {
                "name": "Negative Price",
                "type": "goods",
                "sales_price": "-10.00",
                "cost_price": "5.00",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sales_price", resp.data)

        # Plan negative price
        resp_plan = self.client.post(
            "/api/plans/",
            {
                "name": "Neg Plan",
                "price": "-50.00",
                "billing_period": "monthly",
            },
            format="json",
        )
        self.assertEqual(resp_plan.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("price", resp_plan.data)

    def test_plan_available_to_before_from_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        resp = self.client.post(
            "/api/plans/",
            {
                "name": "Bad Dates Plan",
                "price": "100.00",
                "billing_period": "monthly",
                "available_from": "2026-12-01",
                "available_to": "2026-11-01",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("available_to", resp.data)

    def test_discount_validations(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        # Percent discount out of range
        resp_pct = self.client.post(
            "/api/discounts/",
            {
                "name": "Over 100",
                "type": "percent",
                "value": "120.00",
                "start_date": "2026-11-01",
                "end_date": "2026-11-30",
            },
            format="json",
        )
        self.assertEqual(resp_pct.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("value", resp_pct.data)

        # End date before start date
        resp_dates = self.client.post(
            "/api/discounts/",
            {
                "name": "Bad Dates",
                "type": "fixed",
                "value": "20.00",
                "start_date": "2026-11-30",
                "end_date": "2026-11-01",
            },
            format="json",
        )
        self.assertEqual(resp_dates.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", resp_dates.data)

    def test_discounts_products_as_ids(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        p1 = Product.objects.create(name="P1", type="goods", sales_price=10, cost_price=5)
        p2 = Product.objects.create(name="P2", type="goods", sales_price=20, cost_price=10)

        data = {
            "name": "Bundle Discount",
            "type": "fixed",
            "value": "15.00",
            "start_date": "2026-11-01",
            "end_date": "2026-11-30",
            "applies_to": "product",
            "products": [p1.id, p2.id],
        }
        resp = self.client.post("/api/discounts/", data, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set(resp.data["products"]), {p1.id, p2.id})

    # 6. Quotation Templates with nested lines
    def test_quotation_template_nested_lines(self):
        plan = Plan.objects.create(
            name="Template Plan",
            price=Decimal("100.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
        )
        product = Product.objects.create(
            name="Line Product",
            type="service",
            sales_price=Decimal("50.00"),
            cost_price=Decimal("20.00"),
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        data = {
            "name": "Standard Onboarding",
            "plan": plan.id,
            "validity_days": 15,
            "lines": [
                {"product": product.id, "quantity": 3, "unit_price": "45.00"},
            ],
        }
        resp = self.client.post("/api/quotation-templates/", data, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(resp.data["lines"]), 1)
        self.assertEqual(resp.data["lines"][0]["product"], product.id)
        self.assertEqual(resp.data["lines"][0]["quantity"], 3)
