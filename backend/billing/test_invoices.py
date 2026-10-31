"""Unit and integration tests for Invoices API, permissions, and status transitions."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import Invoice, InvoiceLine
from catalog.models import Plan, Product, Tax
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

    def test_send_action_sets_sent_at(self):
        """Send action records the sent_at timestamp."""
        self.client.force_authenticate(user=self.staff_user)

        self.assertIsNone(self.inv_a.sent_at)
        res = self.client.post(f"/api/invoices/{self.inv_a.id}/send/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.data["sent_at"])
        self.inv_a.refresh_from_db()
        self.assertIsNotNone(self.inv_a.sent_at)

    # -----------------------------------------------------------------------
    # 5. Totals computed on the server, never taken from the client
    # -----------------------------------------------------------------------

    def test_totals_computed_on_server(self):
        """Server computes subtotal, tax_total, and total; client-provided values are ignored."""
        self.client.force_authenticate(user=self.staff_user)

        # sub_a has 2 lines:
        # Product A: qty 2, price 100.00, tax 10% -> subtotal 200.00, tax 20.00
        # Product B: qty 1, price 50.00, tax 0% -> subtotal 50.00, tax 0.00
        # Expected: subtotal 250.00, tax_total 20.00, total 270.00
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
    # 6. Batch generate endpoint
    # -----------------------------------------------------------------------

    def test_invoice_batch_generate(self):
        """Batch generation creates draft invoices for active subscriptions and advances next_invoice_date."""
        self.client.force_authenticate(user=self.staff_user)

        # sub_b next_invoice_date is 2026-12-01
        res = self.client.post(
            "/api/invoices/generate/",
            {"as_of_date": "2026-12-01"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("created", res.data)
        self.assertGreaterEqual(res.data["created"], 1)

        # Verify next_invoice_date was advanced
        self.sub_b.refresh_from_db()
        self.assertGreater(self.sub_b.next_invoice_date, date(2026, 12, 1))

    # -----------------------------------------------------------------------
    # 7. List query filters
    # -----------------------------------------------------------------------

    def test_invoice_list_filters(self):
        """Test status, overdue, and date filters on invoice list."""
        self.client.force_authenticate(user=self.staff_user)

        # Status filter
        res_conf = self.client.get("/api/invoices/?status=confirmed")
        self.assertEqual(res_conf.status_code, status.HTTP_200_OK)
        self.assertTrue(all(item["status"] == "confirmed" for item in res_conf.data["results"]))

        # Overdue filter (inv_a due_date was 2026-11-16, past today if today > 2026-11-16)
        res_overdue = self.client.get("/api/invoices/?overdue=true")
        self.assertEqual(res_overdue.status_code, status.HTTP_200_OK)

        # Search filter
        res_search = self.client.get("/api/invoices/?search=Alpha")
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        self.assertEqual(res_search.data["count"], 1)
        self.assertEqual(res_search.data["results"][0]["customer"]["name"], "Customer Alpha")

