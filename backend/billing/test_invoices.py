"""Unit and integration tests for Invoices API, permissions, and status transitions."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import Invoice, InvoiceLine
from catalog.models import Discount, Plan, Product, Tax
from subscriptions.models import Subscription, SubscriptionLine

User = get_user_model()


class InvoiceAPITests(APITestCase):
    """Test suite covering Invoices permissions, actions, and server-side calculations."""

    def setUp(self):
        super().setUp()

        self.admin_user = User.objects.create_user(
            email="admin_inv@example.com",
            name="Admin Inv",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )
        self.staff_user = User.objects.create_user(
            email="staff_inv@example.com",
            name="Staff Inv",
            password="StaffPassword123!",
            role=User.Role.STAFF,
        )
        self.customer_a = User.objects.create_user(
            email="cust_a@example.com",
            name="Customer Alpha",
            password="CustPassword123!",
            role=User.Role.CUSTOMER,
        )
        self.customer_b = User.objects.create_user(
            email="cust_b@example.com",
            name="Customer Beta",
            password="CustPassword123!",
            role=User.Role.CUSTOMER,
        )

        self.tax_10 = Tax.objects.create(name="GST 10%", rate_percent=Decimal("10.00"))
        self.product_a = Product.objects.create(
            name="Product A",
            type=Product.ProductType.SERVICE,
            sales_price=Decimal("100.00"),
            cost_price=Decimal("40.00"),
            default_tax=self.tax_10,
        )
        self.product_b = Product.objects.create(
            name="Product B",
            type=Product.ProductType.SERVICE,
            sales_price=Decimal("50.00"),
            cost_price=Decimal("20.00"),
        )

        self.plan = Plan.objects.create(
            name="Standard Monthly",
            price=Decimal("150.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date(2026, 1, 1),
        )

        # Subscription for Customer A
        self.sub_a = Subscription.objects.create(
            customer=self.customer_a,
            plan=self.plan,
            start_date=date(2026, 11, 1),
            expiry_date=date(2027, 10, 31),
            payment_term_days=15,
            next_invoice_date=date(2026, 12, 1),
            status=Subscription.Status.ACTIVE,
        )
        SubscriptionLine.objects.create(
            subscription=self.sub_a,
            product=self.product_a,
            quantity=2,
            unit_price=Decimal("100.00"),
            tax=self.tax_10,
            amount=Decimal("200.00"),
        )
        SubscriptionLine.objects.create(
            subscription=self.sub_a,
            product=self.product_b,
            quantity=1,
            unit_price=Decimal("50.00"),
            amount=Decimal("50.00"),
        )

        # Subscription for Customer B
        self.sub_b = Subscription.objects.create(
            customer=self.customer_b,
            plan=self.plan,
            start_date=date(2026, 11, 1),
            expiry_date=date(2027, 10, 31),
            payment_term_days=15,
            next_invoice_date=date(2026, 12, 1),
            status=Subscription.Status.ACTIVE,
        )

        # Invoice for Customer A
        self.inv_a = Invoice.objects.create(
            subscription=self.sub_a,
            customer=self.customer_a,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.CONFIRMED,
            subtotal=Decimal("250.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("20.00"),
            total=Decimal("270.00"),
            amount_paid=Decimal("0.00"),
        )
        InvoiceLine.objects.create(
            invoice=self.inv_a,
            product=self.product_a,
            description="Product A x2",
            quantity=2,
            unit_price=Decimal("100.00"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount=Decimal("20.00"),
            amount=Decimal("220.00"),
        )

        # Invoice for Customer B
        self.inv_b = Invoice.objects.create(
            subscription=self.sub_b,
            customer=self.customer_b,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.DRAFT,
            subtotal=Decimal("150.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("150.00"),
            amount_paid=Decimal("0.00"),
        )

    # -----------------------------------------------------------------------
    # 1. Customer sees only their own; gets 404 for anyone else's
    # -----------------------------------------------------------------------

    def test_customer_sees_only_their_own_invoices(self):
        """Customer lists only own invoices and cannot see other customers' rows."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.get("/api/invoices/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only contain Customer A's invoice
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.inv_a.id)
        self.assertEqual(res.data["results"][0]["customer"]["id"], self.customer_a.id)

    def test_customer_retrieves_own_invoice(self):
        """Customer retrieves their own invoice with nested lines and payments."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.get(f"/api/invoices/{self.inv_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], self.inv_a.id)
        self.assertEqual(res.data["customer"]["id"], self.customer_a.id)
        self.assertEqual(len(res.data["lines"]), 1)
        self.assertIn("payments", res.data)

    def test_customer_gets_404_for_other_customers_invoice(self):
        """Customer attempting to retrieve another customer's invoice receives 404, not 403."""
        self.client.force_authenticate(user=self.customer_a)

        res = self.client.get(f"/api/invoices/{self.inv_b.id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_and_admin_see_all_invoices(self):
        """Staff and Admin can list all invoices and filter by customer."""
        self.client.force_authenticate(user=self.staff_user)

        res = self.client.get("/api/invoices/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)

        # Filter by customer
        res_filter = self.client.get(f"/api/invoices/?customer={self.customer_a.id}")
        self.assertEqual(res_filter.status_code, status.HTTP_200_OK)
        self.assertEqual(res_filter.data["count"], 1)
        self.assertEqual(res_filter.data["results"][0]["id"], self.inv_a.id)

    # -----------------------------------------------------------------------
    # 2. Customer cannot write (POST, confirm, cancel, send) -> 403
    # -----------------------------------------------------------------------

    def test_customer_cannot_write_invoices(self):
        """Customer attempting write operations receives 403 Forbidden."""
        self.client.force_authenticate(user=self.customer_a)

        # POST /api/invoices/
        res_create = self.client.post("/api/invoices/", {"subscription": self.sub_a.id})
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

        # POST /api/invoices/generate/
        res_gen = self.client.post("/api/invoices/generate/", {})
        self.assertEqual(res_gen.status_code, status.HTTP_403_FORBIDDEN)

        # POST confirm
        res_confirm = self.client.post(f"/api/invoices/{self.inv_a.id}/confirm/")
        self.assertEqual(res_confirm.status_code, status.HTTP_403_FORBIDDEN)

        # POST cancel
        res_cancel = self.client.post(f"/api/invoices/{self.inv_a.id}/cancel/")
        self.assertEqual(res_cancel.status_code, status.HTTP_403_FORBIDDEN)

        # POST send
        res_send = self.client.post(f"/api/invoices/{self.inv_a.id}/send/")
        self.assertEqual(res_send.status_code, status.HTTP_403_FORBIDDEN)

    # -----------------------------------------------------------------------
    # 3. Anonymous gets 401
    # -----------------------------------------------------------------------

    def test_anonymous_requests_receive_401(self):
        """Unauthenticated requests receive 401 Unauthorized across all endpoints."""
        endpoints = [
            ("get", "/api/invoices/"),
            ("get", f"/api/invoices/{self.inv_a.id}/"),
            ("get", f"/api/invoices/{self.inv_a.id}/print/"),
            ("post", "/api/invoices/"),
            ("post", "/api/invoices/generate/"),
            ("post", f"/api/invoices/{self.inv_a.id}/confirm/"),
            ("post", f"/api/invoices/{self.inv_a.id}/cancel/"),
            ("post", f"/api/invoices/{self.inv_a.id}/send/"),
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
    # 4. Each status action allowed and rejected
    # -----------------------------------------------------------------------

    def test_confirm_action_allowed_and_rejected(self):
        """Confirm action transitions draft -> confirmed; rejects non-draft with 400."""
        self.client.force_authenticate(user=self.staff_user)

        # Draft invoice inv_b can be confirmed
        self.assertEqual(self.inv_b.status, Invoice.Status.DRAFT)
        res_ok = self.client.post(f"/api/invoices/{self.inv_b.id}/confirm/")
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(res_ok.data["status"], Invoice.Status.CONFIRMED)
        self.inv_b.refresh_from_db()
        self.assertEqual(self.inv_b.status, Invoice.Status.CONFIRMED)

        # Confirming an already confirmed invoice returns 400
        res_fail = self.client.post(f"/api/invoices/{self.inv_b.id}/confirm/")
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res_fail.data)
        self.assertIn("cannot move", res_fail.data["detail"].lower())

    def test_cancel_action_allowed_from_draft_and_confirmed(self):
        """Cancel action transitions draft -> cancelled and confirmed -> cancelled."""
        self.client.force_authenticate(user=self.staff_user)

        # From confirmed (inv_a)
        res_cancel_conf = self.client.post(f"/api/invoices/{self.inv_a.id}/cancel/")
        self.assertEqual(res_cancel_conf.status_code, status.HTTP_200_OK)
        self.assertEqual(res_cancel_conf.data["status"], Invoice.Status.CANCELLED)

        # Cancelling an already cancelled invoice returns 400
        res_cancel_again = self.client.post(f"/api/invoices/{self.inv_a.id}/cancel/")
        self.assertEqual(res_cancel_again.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res_cancel_again.data)

    def test_cancel_action_rejected_on_paid_invoice(self):
        """Cancelling a paid invoice is disallowed and returns 400."""
        self.client.force_authenticate(user=self.staff_user)

        paid_invoice = Invoice.objects.create(
            subscription=self.sub_a,
            customer=self.customer_a,
            period_start=date(2026, 10, 1),
            period_end=date(2026, 10, 31),
            issue_date=date(2026, 10, 1),
            due_date=date(2026, 10, 16),
            status=Invoice.Status.PAID,
            total=Decimal("100.00"),
            amount_paid=Decimal("100.00"),
        )
        res = self.client.post(f"/api/invoices/{paid_invoice.id}/cancel/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res.data)

    def test_send_action_sets_sent_at_and_sends_email(self):
        """Send action records the sent_at timestamp and sends email."""
        self.client.force_authenticate(user=self.staff_user)

        self.assertIsNone(self.inv_a.sent_at)
        res = self.client.post(f"/api/invoices/{self.inv_a.id}/send/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.data["sent_at"])
        self.inv_a.refresh_from_db()
        self.assertIsNotNone(self.inv_a.sent_at)

    def test_print_endpoint_returns_printable_invoice(self):
        """Print endpoint returns invoice details for customer and staff."""
        self.client.force_authenticate(user=self.staff_user)
        res = self.client.get(f"/api/invoices/{self.inv_a.id}/print/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], self.inv_a.id)
        self.assertIn("lines", res.data)

    # -----------------------------------------------------------------------
    # 5. Totals computed on the server, never taken from the client
    # -----------------------------------------------------------------------

    def test_totals_computed_on_server(self):
        """Server computes subtotal, tax_total, and total; client-provided values are ignored."""
        self.client.force_authenticate(user=self.staff_user)

        payload = {
            "subscription": self.sub_a.id,
            "period_start": "2027-01-01",
            "period_end": "2027-01-31",
            # Bogus client totals:
            "subtotal": "1.00",
            "tax_total": "0.00",
            "total": "1.00",
            "amount_paid": "999.00",
        }
        res = self.client.post("/api/invoices/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Server overrides client values with true calculated totals
        self.assertEqual(Decimal(res.data["subtotal"]), Decimal("250.00"))
        self.assertEqual(Decimal(res.data["tax_total"]), Decimal("20.00"))
        self.assertEqual(Decimal(res.data["total"]), Decimal("270.00"))
        self.assertEqual(Decimal(res.data["amount_paid"]), Decimal("0.00"))
        self.assertEqual(len(res.data["lines"]), 2)

    # -----------------------------------------------------------------------
    # 6. Never bill twice for the same subscription and period
    # -----------------------------------------------------------------------

    def test_invoicing_same_subscription_twice_creates_one_invoice(self):
        """Invoicing the same subscription for the same period twice creates only one invoice."""
        self.client.force_authenticate(user=self.staff_user)

        payload = {
            "subscription": self.sub_a.id,
            "period_start": "2027-03-01",
            "period_end": "2027-03-31",
        }
        # First creation succeeds
        res1 = self.client.post("/api/invoices/", payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Second creation for the exact same period fails
        res2 = self.client.post("/api/invoices/", payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already exists", res2.data["detail"].lower())

        # Verify only 1 invoice exists for that period
        count = Invoice.objects.filter(
            subscription=self.sub_a, period_start="2027-03-01"
        ).count()
        self.assertEqual(count, 1)

    # -----------------------------------------------------------------------
    # 7. Only Active subscriptions can be invoiced
    # -----------------------------------------------------------------------

    def test_only_active_subscriptions_can_be_invoiced(self):
        """Non-active subscriptions (draft, closed, quotation) cannot be invoiced."""
        self.client.force_authenticate(user=self.staff_user)

        draft_sub = Subscription.objects.create(
            customer=self.customer_a,
            plan=self.plan,
            start_date=date(2026, 12, 1),
            expiry_date=date(2027, 12, 1),
            payment_term_days=15,
            next_invoice_date=date(2026, 12, 1),
            status=Subscription.Status.DRAFT,
        )

        res = self.client.post(
            "/api/invoices/",
            {"subscription": draft_sub.id, "period_start": "2026-12-01"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("only active subscriptions", res.data["detail"].lower())

        # Bulk run must ignore non-active subscriptions
        res_bulk = self.client.post(
            "/api/invoices/generate/",
            {"as_of_date": "2026-12-01"},
            format="json",
        )
        self.assertEqual(res_bulk.status_code, status.HTTP_200_OK)
        # Ensure draft_sub was not billed
        self.assertFalse(Invoice.objects.filter(subscription=draft_sub).exists())

    # -----------------------------------------------------------------------
    # 8. Bulk billing run counts and reasons
    # -----------------------------------------------------------------------

    def test_bulk_run_counts_and_reasons(self):
        """Bulk billing run returns created and skipped counts with detailed reasons."""
        self.client.force_authenticate(user=self.staff_user)

        # sub_a already has inv_a for 2026-11-01, but its next_invoice_date is 2026-12-01
        # sub_b has inv_b for 2026-11-01, and next_invoice_date is 2026-12-01
        # Let's create an existing invoice for sub_b at 2026-12-01 so it will be skipped
        Invoice.objects.create(
            subscription=self.sub_b,
            customer=self.customer_b,
            period_start=date(2026, 12, 1),
            period_end=date(2026, 12, 31),
            issue_date=date(2026, 12, 1),
            due_date=date(2026, 12, 16),
            status=Invoice.Status.DRAFT,
            total=Decimal("150.00"),
        )

        res = self.client.post(
            "/api/invoices/generate/",
            {"as_of_date": "2026-12-01"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # sub_a should be created (1), sub_b should be skipped (1)
        self.assertEqual(res.data["created"], 1)
        self.assertEqual(res.data["skipped"], 1)
        self.assertIn("reasons", res.data)
        self.assertGreaterEqual(len(res.data["reasons"]), 1)
        self.assertIn("already exists", res.data["reasons"][0]["reason"].lower())

    # -----------------------------------------------------------------------
    # 9. Discount rules: expired, usage limit reached, min quantity, product-only
    # -----------------------------------------------------------------------

    def test_discount_expired_is_not_applied(self):
        """Expired discount is ignored during invoice creation."""
        self.client.force_authenticate(user=self.staff_user)
        today = timezone.localdate()

        disc = Discount.objects.create(
            name="Expired Promo",
            type=Discount.DiscountType.PERCENT,
            value=Decimal("20.00"),
            start_date=today - timedelta(days=30),
            end_date=today - timedelta(days=1),  # Expired yesterday
            applies_to=Discount.AppliesTo.SUBSCRIPTION,
            is_active=True,
        )

        payload = {
            "subscription": self.sub_a.id,
            "period_start": "2027-04-01",
            "period_end": "2027-04-30",
        }
        res = self.client.post("/api/invoices/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(res.data["discount_total"]), Decimal("0.00"))
        self.assertIsNone(res.data["discount"])

    def test_discount_usage_limit_reached_is_not_applied(self):
        """Discount with usage limit reached is not applied."""
        self.client.force_authenticate(user=self.staff_user)
        today = timezone.localdate()

        disc = Discount.objects.create(
            name="Maxed Promo",
            type=Discount.DiscountType.PERCENT,
            value=Decimal("15.00"),
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=10),
            usage_limit=2,
            times_used=2,  # Limit reached
            applies_to=Discount.AppliesTo.SUBSCRIPTION,
            is_active=True,
        )

        payload = {
            "subscription": self.sub_a.id,
            "period_start": "2027-05-01",
            "period_end": "2027-05-31",
        }
        res = self.client.post("/api/invoices/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(res.data["discount_total"]), Decimal("0.00"))

    def test_discount_min_quantity_rule(self):
        """Discount is only applied when min_quantity is met."""
        self.client.force_authenticate(user=self.staff_user)
        today = timezone.localdate()

        # Requires at least 5 items
        disc = Discount.objects.create(
            name="Bulk 5+ items",
            type=Discount.DiscountType.PERCENT,
            value=Decimal("10.00"),
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=10),
            min_quantity=5,
            applies_to=Discount.AppliesTo.SUBSCRIPTION,
            is_active=True,
        )

        # sub_a only has 3 items (2 of Product A, 1 of Product B) -> Should NOT apply
        payload = {
            "subscription": self.sub_a.id,
            "period_start": "2027-06-01",
            "period_end": "2027-06-30",
        }
        res = self.client.post("/api/invoices/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(res.data["discount_total"]), Decimal("0.00"))

        # Add line override with 6 items -> Should apply!
        payload_qualifies = {
            "subscription": self.sub_a.id,
            "period_start": "2027-07-01",
            "period_end": "2027-07-31",
            "lines": [
                {"product": self.product_a.id, "quantity": 6, "unit_price": "100.00"}
            ],
        }
        res2 = self.client.post("/api/invoices/", payload_qualifies, format="json")
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        # Subtotal: 600.00, 10% discount: 60.00
        self.assertEqual(Decimal(res2.data["discount_total"]), Decimal("60.00"))

    def test_discount_product_only_applies_strictly_to_matching_products(self):
        """Product-only discount reduces only the matching product lines."""
        self.client.force_authenticate(user=self.staff_user)
        today = timezone.localdate()

        disc = Discount.objects.create(
            name="Product A Special",
            type=Discount.DiscountType.PERCENT,
            value=Decimal("20.00"),
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=10),
            applies_to=Discount.AppliesTo.PRODUCT,
            is_active=True,
        )
        disc.products.add(self.product_a)

        payload = {
            "subscription": self.sub_a.id,
            "period_start": "2027-08-01",
            "period_end": "2027-08-31",
        }
        res = self.client.post("/api/invoices/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Lines on sub_a:
        # Product A: qty 2, price 100.00 -> 200.00 subtotal, 20% discount = 40.00
        # Product B: qty 1, price 50.00 -> 50.00 subtotal, 0 discount
        # Total discount: 40.00
        self.assertEqual(Decimal(res.data["discount_total"]), Decimal("40.00"))

        lines = {l["product"]: l for l in res.data["lines"]}
        self.assertEqual(Decimal(lines[self.product_a.id]["discount_amount"]), Decimal("40.00"))
        self.assertEqual(Decimal(lines[self.product_b.id]["discount_amount"]), Decimal("0.00"))

    # -----------------------------------------------------------------------
    # 10. Discount times_used increments once via F()
    # -----------------------------------------------------------------------

    def test_discount_times_used_increments_once(self):
        """Applying a discount increments its times_used counter exactly once."""
        self.client.force_authenticate(user=self.staff_user)
        today = timezone.localdate()

        disc = Discount.objects.create(
            name="One Time Promo",
            type=Discount.DiscountType.FIXED,
            value=Decimal("25.00"),
            start_date=today - timedelta(days=5),
            end_date=today + timedelta(days=5),
            applies_to=Discount.AppliesTo.SUBSCRIPTION,
            times_used=0,
            is_active=True,
        )

        payload = {
            "subscription": self.sub_a.id,
            "period_start": "2027-09-01",
            "period_end": "2027-09-30",
        }
        res = self.client.post("/api/invoices/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(res.data["discount_total"]), Decimal("25.00"))

        disc.refresh_from_db()
        self.assertEqual(disc.times_used, 1)

    # -----------------------------------------------------------------------
    # 11. Overdue filter and is_overdue field
    # -----------------------------------------------------------------------

    def test_is_overdue_field_and_overdue_list_filter(self):
        """Invoices with due_date in past and status not paid/cancelled have is_overdue=True."""
        self.client.force_authenticate(user=self.staff_user)
        today = timezone.localdate()

        # Overdue invoice: confirmed, due date in past
        overdue_inv = Invoice.objects.create(
            subscription=self.sub_a,
            customer=self.customer_a,
            period_start=today - timedelta(days=40),
            period_end=today - timedelta(days=11),
            issue_date=today - timedelta(days=40),
            due_date=today - timedelta(days=25),
            status=Invoice.Status.CONFIRMED,
            total=Decimal("100.00"),
            amount_paid=Decimal("0.00"),
        )

        # Non-overdue invoice: paid, even though due date in past
        paid_inv = Invoice.objects.create(
            subscription=self.sub_a,
            customer=self.customer_a,
            period_start=today - timedelta(days=70),
            period_end=today - timedelta(days=41),
            issue_date=today - timedelta(days=70),
            due_date=today - timedelta(days=55),
            status=Invoice.Status.PAID,
            total=Decimal("100.00"),
            amount_paid=Decimal("100.00"),
        )

        # Future due invoice: confirmed, due date in future
        future_inv = Invoice.objects.create(
            subscription=self.sub_a,
            customer=self.customer_a,
            period_start=today,
            period_end=today + timedelta(days=30),
            issue_date=today,
            due_date=today + timedelta(days=15),
            status=Invoice.Status.CONFIRMED,
            total=Decimal("100.00"),
            amount_paid=Decimal("0.00"),
        )

        # Check is_overdue field on detail responses
        res_od = self.client.get(f"/api/invoices/{overdue_inv.id}/")
        self.assertTrue(res_od.data["is_overdue"])

        res_paid = self.client.get(f"/api/invoices/{paid_inv.id}/")
        self.assertFalse(res_paid.data["is_overdue"])

        res_fut = self.client.get(f"/api/invoices/{future_inv.id}/")
        self.assertFalse(res_fut.data["is_overdue"])

        # Filter by overdue=true
        res_filter_true = self.client.get("/api/invoices/?overdue=true")
        self.assertEqual(res_filter_true.status_code, status.HTTP_200_OK)
        returned_ids = [item["id"] for item in res_filter_true.data["results"]]
        self.assertIn(overdue_inv.id, returned_ids)
        self.assertNotIn(paid_inv.id, returned_ids)
        self.assertNotIn(future_inv.id, returned_ids)

        # Filter by overdue=false
        res_filter_false = self.client.get("/api/invoices/?overdue=false")
        self.assertEqual(res_filter_false.status_code, status.HTTP_200_OK)
        returned_ids_false = [item["id"] for item in res_filter_false.data["results"]]
        self.assertNotIn(overdue_inv.id, returned_ids_false)
        self.assertIn(paid_inv.id, returned_ids_false)
        self.assertIn(future_inv.id, returned_ids_false)
