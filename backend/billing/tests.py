"""Unit tests for Invoice models and Payment REST API endpoints."""

from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from billing.models import Invoice, Payment
from catalog.models import Plan
from subscriptions.models import Subscription

User = get_user_model()


class InvoiceModelTests(TestCase):
    """Test Invoice auto-numbering, status transitions, and double-billing unique constraint."""

    def setUp(self):
        self.customer = User.objects.create_user(
            email="cust_bill@example.com",
            name="Billing Customer",
            password="ValidPass1!",
            role=User.Role.CUSTOMER,
        )
        self.plan = Plan.objects.create(
            name="Pro Monthly",
            price=Decimal("1500.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
        )
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            plan=self.plan,
            start_date=date(2026, 11, 1),
            expiry_date=date(2027, 10, 31),
            next_invoice_date=date(2026, 12, 1),
            status=Subscription.Status.ACTIVE,
        )

    def test_auto_generated_invoice_number(self):
        inv1 = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            total=Decimal("1500.00"),
        )
        self.assertEqual(inv1.number, "INV-00001")

        inv2 = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 12, 1),
            period_end=date(2026, 12, 31),
            issue_date=date(2026, 12, 1),
            due_date=date(2026, 11, 16),
            total=Decimal("1500.00"),
        )
        self.assertEqual(inv2.number, "INV-00002")

    def test_valid_invoice_status_transitions(self):
        inv = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.DRAFT,
        )
        # draft -> confirmed
        inv.transition_to(Invoice.Status.CONFIRMED)
        self.assertEqual(inv.status, Invoice.Status.CONFIRMED)

        # confirmed -> paid
        inv.transition_to(Invoice.Status.PAID)
        self.assertEqual(inv.status, Invoice.Status.PAID)

    def test_invoice_cancellation_transitions(self):
        # draft -> cancelled
        inv_draft = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.DRAFT,
        )
        inv_draft.transition_to(Invoice.Status.CANCELLED)
        self.assertEqual(inv_draft.status, Invoice.Status.CANCELLED)

        # confirmed -> cancelled
        inv_conf = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 12, 1),
            period_end=date(2026, 12, 31),
            issue_date=date(2026, 12, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.CONFIRMED,
        )
        inv_conf.transition_to(Invoice.Status.CANCELLED)
        self.assertEqual(inv_conf.status, Invoice.Status.CANCELLED)

    def test_invalid_invoice_status_transitions(self):
        inv = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.DRAFT,
        )
        # draft -> paid is invalid directly
        with self.assertRaises(ValidationError) as ctx:
            inv.transition_to(Invoice.Status.PAID)
        self.assertIn("Cannot move from draft to paid", str(ctx.exception))

        # paid -> cancelled is invalid (cannot cancel a paid invoice)
        inv.status = Invoice.Status.PAID
        inv.save()
        with self.assertRaises(ValidationError) as ctx:
            inv.transition_to(Invoice.Status.CANCELLED)
        self.assertIn("Cannot move from paid to cancelled", str(ctx.exception))

        # cancelled -> draft is invalid
        inv.status = Invoice.Status.CANCELLED
        inv.save()
        with self.assertRaises(ValidationError) as ctx:
            inv.transition_to(Invoice.Status.DRAFT)
        self.assertIn("Cannot move from cancelled to draft", str(ctx.exception))

    def test_double_billing_unique_constraint(self):
        # 1. First invoice created for period_start 2026-11-01 (confirmed)
        Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.CONFIRMED,
            total=Decimal("1500.00"),
        )

        # 2. Duplicate invoice for same (subscription, period_start) must raise IntegrityError
        with self.assertRaises(IntegrityError):
            Invoice.objects.create(
                subscription=self.subscription,
                customer=self.customer,
                period_start=date(2026, 11, 1),
                period_end=date(2026, 11, 30),
                issue_date=date(2026, 11, 1),
                due_date=date(2026, 11, 16),
                status=Invoice.Status.DRAFT,
                total=Decimal("1500.00"),
            )

    def test_double_billing_constraint_allows_new_invoice_after_cancellation(self):
        inv1 = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.CANCELLED,
            total=Decimal("1500.00"),
        )
        self.assertEqual(inv1.status, Invoice.Status.CANCELLED)

        inv2 = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.DRAFT,
            total=Decimal("1500.00"),
        )
        self.assertEqual(inv2.number, "INV-00002")
        self.assertEqual(inv2.status, Invoice.Status.DRAFT)


class PaymentAPITests(APITestCase):
    """Test suite covering Payments API endpoints, permissions, validations, and helper execution."""

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

        self.plan = Plan.objects.create(
            name="Monthly Plan",
            price=Decimal("1000.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
        )
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            plan=self.plan,
            start_date=date(2026, 11, 1),
            expiry_date=date(2027, 10, 31),
            next_invoice_date=date(2026, 12, 1),
            status=Subscription.Status.ACTIVE,
        )
        self.invoice = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 11, 1),
            period_end=date(2026, 11, 30),
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 16),
            status=Invoice.Status.CONFIRMED,
            total=Decimal("1000.00"),
            amount_paid=Decimal("0.00"),
        )

    # 1. Permissions
    def test_unauthenticated_blocked(self):
        resp = self.client.get("/api/payments/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        resp = self.client.post("/api/payments/", {})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_forbidden(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.customer_token.key}")

        resp_get = self.client.get("/api/payments/")
        self.assertEqual(resp_get.status_code, status.HTTP_403_FORBIDDEN)

        resp_post = self.client.post(
            "/api/payments/",
            {
                "invoice": self.invoice.id,
                "method": "bank_transfer",
                "amount": "500.00",
            },
            format="json",
        )
        self.assertEqual(resp_post.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_allowed(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        resp_get = self.client.get("/api/payments/")
        self.assertEqual(resp_get.status_code, status.HTTP_200_OK)

        resp_post = self.client.post(
            "/api/payments/",
            {
                "invoice": self.invoice.id,
                "method": "bank_transfer",
                "amount": "300.00",
            },
            format="json",
        )
        self.assertEqual(resp_post.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_post.data["recorded_by"], self.staff.id)

    # 2. Validations
    def test_non_positive_amount_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        # Zero amount
        resp_zero = self.client.post(
            "/api/payments/",
            {
                "invoice": self.invoice.id,
                "method": "cash",
                "amount": "0.00",
            },
            format="json",
        )
        self.assertEqual(resp_zero.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount", resp_zero.data)

        # Negative amount
        resp_neg = self.client.post(
            "/api/payments/",
            {
                "invoice": self.invoice.id,
                "method": "cash",
                "amount": "-50.00",
            },
            format="json",
        )
        self.assertEqual(resp_neg.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount", resp_neg.data)

    def test_non_confirmed_invoice_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        # Draft invoice
        draft_inv = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 12, 1),
            period_end=date(2026, 12, 31),
            issue_date=date(2026, 12, 1),
            due_date=date(2026, 12, 16),
            status=Invoice.Status.DRAFT,
            total=Decimal("1000.00"),
        )
        resp = self.client.post(
            "/api/payments/",
            {
                "invoice": draft_inv.id,
                "method": "cash",
                "amount": "100.00",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invoice", resp.data)

    def test_already_paid_invoice_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        paid_inv = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=date(2026, 10, 1),
            period_end=date(2026, 10, 31),
            issue_date=date(2026, 10, 1),
            due_date=date(2026, 10, 16),
            status=Invoice.Status.PAID,
            total=Decimal("1000.00"),
            amount_paid=Decimal("1000.00"),
        )
        resp = self.client.post(
            "/api/payments/",
            {
                "invoice": paid_inv.id,
                "method": "upi",
                "amount": "100.00",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invoice", resp.data)

    def test_overpayment_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        resp = self.client.post(
            "/api/payments/",
            {
                "invoice": self.invoice.id,
                "method": "card",
                "amount": "1000.01",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount", resp.data)

    # 3. Helper Execution & State Updates
    def test_partial_payment_and_full_payment_updates_invoice(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        # Partial payment: 400.00
        resp1 = self.client.post(
            "/api/payments/",
            {
                "invoice": self.invoice.id,
                "method": "bank_transfer",
                "amount": "400.00",
                "payment_date": "2026-11-05",
                "note": "First installment",
            },
            format="json",
        )
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp1.data["invoice_status"], "confirmed")

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("400.00"))
        self.assertEqual(self.invoice.status, Invoice.Status.CONFIRMED)

        # Overpaying remainder (600.01) is rejected
        resp_over = self.client.post(
            "/api/payments/",
            {
                "invoice": self.invoice.id,
                "method": "bank_transfer",
                "amount": "600.01",
            },
            format="json",
        )
        self.assertEqual(resp_over.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount", resp_over.data)

        # Full payment of remainder (600.00)
        resp2 = self.client.post(
            "/api/payments/",
            {
                "invoice": self.invoice.id,
                "method": "bank_transfer",
                "amount": "600.00",
                "payment_date": "2026-11-10",
                "note": "Final settlement",
            },
            format="json",
        )
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp2.data["invoice_status"], "paid")

        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, Decimal("1000.00"))
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)

    # 4. List and Filtering
    def test_payments_list_and_filters(self):
        Payment.objects.create(
            invoice=self.invoice,
            method="cash",
            amount=Decimal("100.00"),
            payment_date=date(2026, 11, 2),
            recorded_by=self.staff,
        )
        Payment.objects.create(
            invoice=self.invoice,
            method="card",
            amount=Decimal("200.00"),
            payment_date=date(2026, 11, 8),
            recorded_by=self.staff,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        # List all
        resp_all = self.client.get("/api/payments/")
        self.assertEqual(resp_all.status_code, status.HTTP_200_OK)
        self.assertIn("count", resp_all.data)
        self.assertEqual(resp_all.data["count"], 2)

        # Filter by method
        resp_method = self.client.get("/api/payments/?method=cash")
        self.assertEqual(resp_method.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_method.data["count"], 1)
        self.assertEqual(resp_method.data["results"][0]["method"], "cash")

        # Filter by date range
        resp_date = self.client.get("/api/payments/?from=2026-11-05&to=2026-11-10")
        self.assertEqual(resp_date.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_date.data["count"], 1)
        self.assertEqual(resp_date.data["results"][0]["method"], "card")
