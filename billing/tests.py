"""Unit tests for Invoice number generation, status transitions, and double-billing constraint."""

from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase

from billing.models import Invoice
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
            due_date=date(2026, 12, 16),
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
            due_date=date(2026, 12, 16),
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
        # If the existing invoice for the period is cancelled, a new invoice can be generated
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

        # Second invoice for the same subscription and period_start succeeds because previous was cancelled
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
