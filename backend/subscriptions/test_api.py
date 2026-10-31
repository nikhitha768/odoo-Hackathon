"""Unit and integration tests for Subscriptions REST API."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Plan, Product, QuotationTemplate, QuotationTemplateLine, Tax
from subscriptions.models import Subscription, SubscriptionLine

User = get_user_model()


class SubscriptionAPITests(APITestCase):
    """Test suite for Subscriptions REST API: ownership, status transitions, server totals, and nested lines."""

    def setUp(self):
        super().setUp()

        self.admin_user = User.objects.create_user(
            email="admin_sub@example.com",
            name="Admin Sub",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )
        self.staff_user = User.objects.create_user(
            email="staff_sub@example.com",
            name="Staff Sub",
            password="StaffPassword123!",
            role=User.Role.STAFF,
        )
        self.customer_a = User.objects.create_user(
            email="customer_a@example.com",
            name="Customer A",
            password="CustomerPassword123!",
            role=User.Role.CUSTOMER,
        )
        self.customer_b = User.objects.create_user(
            email="customer_b@example.com",
            name="Customer B",
            password="CustomerPassword123!",
            role=User.Role.CUSTOMER,
        )

        self.tax_18 = Tax.objects.create(name="GST 18%", rate_percent=Decimal("18.00"))
        self.product_1 = Product.objects.create(
            name="Cloud Server",
            type=Product.ProductType.SERVICE,
            sales_price=Decimal("100.00"),
            cost_price=Decimal("40.00"),
            default_tax=self.tax_18,
        )
        self.product_2 = Product.objects.create(
            name="Support Hours",
            type=Product.ProductType.SERVICE,
            sales_price=Decimal("50.00"),
            cost_price=Decimal("20.00"),
        )

        self.plan = Plan.objects.create(
            name="Enterprise Monthly",
            price=Decimal("200.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date(2026, 1, 1),
        )

        # Template with lines
        self.template = QuotationTemplate.objects.create(
            name="Enterprise Onboarding",
            plan=self.plan,
            validity_days=30,
        )
        QuotationTemplateLine.objects.create(
            template=self.template,
            product=self.product_1,
            quantity=2,
            unit_price=Decimal("100.00"),
        )

        # Subscription for Customer A (draft)
        self.sub_a = Subscription.objects.create(
            customer=self.customer_a,
            plan=self.plan,
            start_date=date(2026, 11, 1),
            expiry_date=date(2027, 10, 31),
            payment_term_days=15,
            next_invoice_date=date(2026, 11, 1),
            status=Subscription.Status.DRAFT,
        )
        self.line_a = SubscriptionLine.objects.create(
            subscription=self.sub_a,
            product=self.product_1,
            quantity=2,
            unit_price=Decimal("100.00"),
            tax=self.tax_18,
            amount=Decimal("200.00"),
        )

        # Subscription for Customer B (active)
        self.sub_b = Subscription.objects.create(
            customer=self.customer_b,
            plan=self.plan,
            start_date=date(2026, 11, 1),
            expiry_date=date(2027, 10, 31),
            payment_term_days=15,
            next_invoice_date=date(2026, 12, 1),
            status=Subscription.Status.ACTIVE,
        )

    # -----------------------------------------------------------------------
    # 1. Ownership & Permissions
    # -----------------------------------------------------------------------

    def test_customer_lists_only_own_subscriptions(self):
        """Customer sees only their own subscriptions and not other customers' data."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.get("/api/subscriptions/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.sub_a.id)
        self.assertEqual(res.data["results"][0]["customer"]["id"], self.customer_a.id)

    def test_customer_retrieves_own_subscription(self):
        """Customer retrieves own subscription with nested lines."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.get(f"/api/subscriptions/{self.sub_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], self.sub_a.id)
        self.assertEqual(len(res.data["lines"]), 1)

    def test_customer_gets_404_for_other_customers_subscription(self):
        """Customer receives 404 when attempting to retrieve another customer's subscription."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.get(f"/api/subscriptions/{self.sub_b.id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_gets_404_when_updating_other_customers_subscription(self):
        """Customer receives 404 when attempting to update another customer's subscription."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.patch(
            f"/api/subscriptions/{self.sub_b.id}/",
            {"payment_term_days": 30},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_can_change_own_draft_subscription(self):
        """Customer can update their own draft subscription."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.patch(
            f"/api/subscriptions/{self.sub_a.id}/",
            {"payment_term_days": 30},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["payment_term_days"], 30)
        self.sub_a.refresh_from_db()
        self.assertEqual(self.sub_a.payment_term_days, 30)

    def test_staff_and_admin_see_all_and_can_filter(self):
        """Staff and Admin can view all subscriptions and filter by customer."""
        self.client.force_authenticate(user=self.staff_user)

        res = self.client.get("/api/subscriptions/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)

        # Filter by customer A
        res_filtered = self.client.get(f"/api/subscriptions/?customer={self.customer_a.id}")
        self.assertEqual(res_filtered.status_code, status.HTTP_200_OK)
        self.assertEqual(res_filtered.data["count"], 1)
        self.assertEqual(res_filtered.data["results"][0]["id"], self.sub_a.id)

    def test_anonymous_requests_receive_401(self):
        """Unauthenticated requests receive 401 Unauthorized across all endpoints."""
        endpoints = [
            ("get", "/api/subscriptions/"),
            ("get", f"/api/subscriptions/{self.sub_a.id}/"),
            ("post", "/api/subscriptions/"),
            ("patch", f"/api/subscriptions/{self.sub_a.id}/"),
            ("post", f"/api/subscriptions/{self.sub_a.id}/transition/"),
        ]
        for method, url in endpoints:
            client_fn = getattr(self.client, method)
            res = client_fn(url)
            self.assertEqual(
                res.status_code,
                status.HTTP_401_UNAUTHORIZED,
                f"Anonymous request to {method.upper()} {url} did not return 401",
            )

    # -----------------------------------------------------------------------
    # 2. Status Transitions (Allowed & Rejected)
    # -----------------------------------------------------------------------

    def test_status_transitions_flow(self):
        """Test allowed step-by-step forward transitions draft -> quotation -> confirmed -> active -> closed."""
        self.client.force_authenticate(user=self.staff_user)

        # 1. Draft -> Quotation (Allowed)
        res1 = self.client.post(
            f"/api/subscriptions/{self.sub_a.id}/transition/",
            {"to": "quotation"},
            format="json",
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data["status"], Subscription.Status.QUOTATION)

        # 2. Quotation -> Active (Illegal jump, must go to confirmed first)
        res_bad = self.client.post(
            f"/api/subscriptions/{self.sub_a.id}/transition/",
            {"to": "active"},
            format="json",
        )
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res_bad.data)
        self.assertIn("cannot move", res_bad.data["detail"].lower())

        # 3. Quotation -> Confirmed (Allowed)
        res2 = self.client.post(
            f"/api/subscriptions/{self.sub_a.id}/transition/",
            {"to": "confirmed"},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["status"], Subscription.Status.CONFIRMED)

        # 4. Confirmed -> Active (Allowed)
        res3 = self.client.post(
            f"/api/subscriptions/{self.sub_a.id}/transition/",
            {"to": "active"},
            format="json",
        )
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        self.assertEqual(res3.data["status"], Subscription.Status.ACTIVE)

        # 5. Active -> Closed (Allowed)
        res4 = self.client.post(
            f"/api/subscriptions/{self.sub_a.id}/transition/",
            {"to": "closed"},
            format="json",
        )
        self.assertEqual(res4.status_code, status.HTTP_200_OK)
        self.assertEqual(res4.data["status"], Subscription.Status.CLOSED)

        # 6. From Closed -> any transition is rejected
        res_closed_fail = self.client.post(
            f"/api/subscriptions/{self.sub_a.id}/transition/",
            {"to": "active"},
            format="json",
        )
        self.assertEqual(res_closed_fail.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_transition_subscription(self):
        """Customer cannot trigger status transitions (Staff+ only)."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.post(
            f"/api/subscriptions/{self.sub_a.id}/transition/",
            {"to": "quotation"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # -----------------------------------------------------------------------
    # 3. Totals Computed on the Server
    # -----------------------------------------------------------------------

    def test_totals_and_amounts_computed_on_server(self):
        """Server computes line amounts and totals; client-provided amounts are ignored."""
        self.client.force_authenticate(user=self.staff_user)

        payload = {
            "customer": self.customer_a.id,
            "plan": self.plan.id,
            "start_date": "2026-11-01",
            "expiry_date": "2027-10-31",
            "payment_term_days": 15,
            "lines": [
                {
                    "product": self.product_1.id,
                    "quantity": 3,
                    "unit_price": "100.00",
                    # Bogus amount from client:
                    "amount": "0.01",
                },
                {
                    "product": self.product_2.id,
                    "quantity": 2,
                    "unit_price": "50.00",
                    "amount": "1.00",
                },
            ],
        }

        res = self.client.post("/api/subscriptions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Verify line amounts are computed on server:
        # Line 1: 3 * 100.00 = 300.00
        # Line 2: 2 * 50.00 = 100.00
        lines = res.data["lines"]
        self.assertEqual(len(lines), 2)
        self.assertEqual(Decimal(lines[0]["amount"]), Decimal("300.00"))
        self.assertEqual(Decimal(lines[1]["amount"]), Decimal("100.00"))

        # Verify subtotal: 300 + 100 = 400.00
        self.assertEqual(Decimal(res.data["subtotal"]), Decimal("400.00"))

    # -----------------------------------------------------------------------
    # 4. Nested Lines Created and Updated
    # -----------------------------------------------------------------------

    def test_create_subscription_from_template(self):
        """Creating subscription with template_id copies lines from the quotation template."""
        self.client.force_authenticate(user=self.staff_user)

        payload = {
            "customer": self.customer_a.id,
            "plan": self.plan.id,
            "template_id": self.template.id,
            "start_date": "2026-11-01",
        }
        res = self.client.post("/api/subscriptions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["lines"]), 1)
        self.assertEqual(res.data["lines"][0]["product"], self.product_1.id)
        self.assertEqual(res.data["lines"][0]["quantity"], 2)
        self.assertEqual(Decimal(res.data["lines"][0]["amount"]), Decimal("200.00"))

    def test_nested_lines_update_on_draft_subscription(self):
        """Updating lines on a draft subscription synchronizes items in database."""
        self.client.force_authenticate(user=self.staff_user)

        # Initially sub_a has line_a (quantity 2, product_1)
        update_payload = {
            "payment_term_days": 20,
            "lines": [
                {
                    "id": self.line_a.id,
                    "product": self.product_1.id,
                    "quantity": 5,  # Changed quantity from 2 to 5
                    "unit_price": "100.00",
                },
                {
                    # New line added
                    "product": self.product_2.id,
                    "quantity": 3,
                    "unit_price": "50.00",
                },
            ],
        }

        res = self.client.put(f"/api/subscriptions/{self.sub_a.id}/", update_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["lines"]), 2)

        # Line 1: 5 * 100 = 500.00
        # Line 2: 3 * 50 = 150.00
        self.assertEqual(Decimal(res.data["lines"][0]["amount"]), Decimal("500.00"))
        self.assertEqual(Decimal(res.data["lines"][1]["amount"]), Decimal("150.00"))
        self.assertEqual(Decimal(res.data["subtotal"]), Decimal("650.00"))

        # Verify DB records
        self.line_a.refresh_from_db()
        self.assertEqual(self.line_a.quantity, 5)
        self.assertEqual(self.line_a.amount, Decimal("500.00"))

    def test_updating_non_draft_subscription_rejected(self):
        """Updating a subscription whose status is not draft returns 400 Bad Request."""
        self.client.force_authenticate(user=self.staff_user)

        # sub_b status is active
        self.assertEqual(self.sub_b.status, Subscription.Status.ACTIVE)
        res = self.client.patch(
            f"/api/subscriptions/{self.sub_b.id}/",
            {"payment_term_days": 30},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res.data)
        self.assertIn("draft", res.data["detail"].lower())

