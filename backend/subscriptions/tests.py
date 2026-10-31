"""Unit tests for Subscription number generation and status transitions."""

from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from catalog.models import Plan
from subscriptions.models import Subscription

User = get_user_model()


class SubscriptionModelTests(TestCase):
    """Test auto-generated numbers and state machine transitions for Subscription."""

    def setUp(self):
        self.customer = User.objects.create_user(
            email="cust_sub@example.com",
            name="Sub Customer",
            password="ValidPass1!",
            role=User.Role.CUSTOMER,
        )
        self.plan = Plan.objects.create(
            name="Basic Monthly",
            price=99.00,
            billing_period=Plan.BillingPeriod.MONTHLY,
        )

    def test_auto_generated_subscription_number(self):
        sub1 = Subscription.objects.create(
            customer=self.customer,
            plan=self.plan,
            start_date=date.today(),
            expiry_date=date.today() + timedelta(days=365),
            next_invoice_date=date.today(),
        )
        self.assertEqual(sub1.number, "SUB-00001")

        sub2 = Subscription.objects.create(
            customer=self.customer,
            plan=self.plan,
            start_date=date.today(),
            expiry_date=date.today() + timedelta(days=365),
            next_invoice_date=date.today(),
        )
        self.assertEqual(sub2.number, "SUB-00002")

    def test_valid_status_transitions(self):
        sub = Subscription.objects.create(
            customer=self.customer,
            plan=self.plan,
            start_date=date.today(),
            expiry_date=date.today() + timedelta(days=365),
            next_invoice_date=date.today(),
            status=Subscription.Status.DRAFT,
        )
        # draft -> quotation
        sub.transition_to(Subscription.Status.QUOTATION)
        self.assertEqual(sub.status, Subscription.Status.QUOTATION)

        # quotation -> confirmed
        sub.transition_to(Subscription.Status.CONFIRMED)
        self.assertEqual(sub.status, Subscription.Status.CONFIRMED)

        # confirmed -> active
        sub.transition_to(Subscription.Status.ACTIVE)
        self.assertEqual(sub.status, Subscription.Status.ACTIVE)

        # active -> closed
        sub.transition_to(Subscription.Status.CLOSED)
        self.assertEqual(sub.status, Subscription.Status.CLOSED)

    def test_confirmed_direct_to_closed(self):
        sub = Subscription.objects.create(
            customer=self.customer,
            plan=self.plan,
            start_date=date.today(),
            expiry_date=date.today() + timedelta(days=365),
            next_invoice_date=date.today(),
            status=Subscription.Status.CONFIRMED,
        )
        # confirmed -> closed is allowed per section 3
        sub.transition_to(Subscription.Status.CLOSED)
        self.assertEqual(sub.status, Subscription.Status.CLOSED)

    def test_invalid_status_transitions_raise_validation_error(self):
        sub = Subscription.objects.create(
            customer=self.customer,
            plan=self.plan,
            start_date=date.today(),
            expiry_date=date.today() + timedelta(days=365),
            next_invoice_date=date.today(),
            status=Subscription.Status.DRAFT,
        )
        # draft -> active is invalid
        with self.assertRaises(ValidationError) as ctx:
            sub.transition_to(Subscription.Status.ACTIVE)
        self.assertIn("Cannot move from draft to active", str(ctx.exception))

        # draft -> closed is invalid
        with self.assertRaises(ValidationError) as ctx:
            sub.transition_to(Subscription.Status.CLOSED)
        self.assertIn("Cannot move from draft to closed", str(ctx.exception))

        # closed -> draft is invalid
        sub.status = Subscription.Status.CLOSED
        sub.save()
        with self.assertRaises(ValidationError) as ctx:
            sub.transition_to(Subscription.Status.DRAFT)
        self.assertIn("Cannot move from closed to draft", str(ctx.exception))
