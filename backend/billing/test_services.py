"""Unit tests for apply_payment service in backend/billing/services.py."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from billing.models import Invoice, InvoiceLine, Payment
from billing.services import apply_payment
from catalog.models import Plan, Product
from subscriptions.models import Subscription

User = get_user_model()


class ApplyPaymentServiceTests(TestCase):
    """Test suite for apply_payment(invoice) business logic."""

    def setUp(self):
        super().setUp()
        self.customer = User.objects.create_user(
            email="service_customer@example.com",
            name="Service Test Customer",
            password="TestPassword123!",
            role=User.Role.CUSTOMER,
        )
        self.plan = Plan.objects.create(
            name="Business Monthly",
            price=Decimal("200.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=date(2026, 1, 1),
        )
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            plan=self.plan,
            start_date=date(2026, 11, 1),
            expiry_date=date(2027, 10, 31),
            next_invoice_date=date(2026, 12, 1),
            status=Subscription.Status.ACTIVE,
        )
        self.product = Product.objects.create(
            name="Business User Seat",
            type=Product.ProductType.SERVICE,
            sales_price=Decimal("200.00"),
            cost_price=Decimal("50.00"),
        )

    def _create_invoice(
        self,
        total=Decimal("200.00"),
        status=Invoice.Status.CONFIRMED,
        period_start=date(2026, 11, 1),
    ):
        """Helper to create an invoice and corresponding line item."""
        invoice = Invoice.objects.create(
            subscription=self.subscription,
            customer=self.customer,
            period_start=period_start,
            period_end=period_start + timedelta(days=30),
            issue_date=period_start,
            due_date=period_start + timedelta(days=15),
            status=status,
            subtotal=total,
            total=total,
            amount_paid=Decimal("0.00"),
        )
        InvoiceLine.objects.create(
            invoice=invoice,
            product=self.product,
            description="Seat License",
            quantity=1,
            unit_price=total,
            amount=total,
        )
        return invoice

    def test_partial_payment_leaves_status_unchanged(self):
        """Partial payment updates amount_paid but leaves status unchanged."""
        invoice = self._create_invoice(total=Decimal("200.00"), status=Invoice.Status.CONFIRMED)

        # Create payment for 80.00 (less than 200.00 total)
        Payment.objects.create(
            invoice=invoice,
            method=Payment.PaymentMethod.BANK_TRANSFER,
            amount=Decimal("80.00"),
            payment_date=date.today(),
            note="Partial payment 1",
        )

        refreshed = apply_payment(invoice)

        self.assertEqual(refreshed.status, Invoice.Status.CONFIRMED)
        self.assertEqual(refreshed.amount_paid, Decimal("80.00"))

        # Verify database record matches
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.CONFIRMED)
        self.assertEqual(invoice.amount_paid, Decimal("80.00"))

    def test_exact_payment_sets_paid(self):
        """Exact payment sets invoice status to paid and updates amount_paid."""
        invoice = self._create_invoice(total=Decimal("200.00"), status=Invoice.Status.CONFIRMED)

        # Create exact payment matching total
        Payment.objects.create(
            invoice=invoice,
            method=Payment.PaymentMethod.CARD,
            amount=Decimal("200.00"),
            payment_date=date.today(),
            note="Full payment",
        )

        refreshed = apply_payment(invoice)

        self.assertEqual(refreshed.status, Invoice.Status.PAID)
        self.assertEqual(refreshed.amount_paid, Decimal("200.00"))

        # Verify database record matches
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)
        self.assertEqual(invoice.amount_paid, Decimal("200.00"))

    def test_multiple_payments_summing_to_total_sets_paid(self):
        """Multiple partial payments reaching invoice total transition status to paid."""
        invoice = self._create_invoice(total=Decimal("200.00"), status=Invoice.Status.CONFIRMED)

        # First partial payment
        Payment.objects.create(
            invoice=invoice,
            method=Payment.PaymentMethod.UPI,
            amount=Decimal("120.00"),
            payment_date=date.today(),
        )
        res1 = apply_payment(invoice)
        self.assertEqual(res1.status, Invoice.Status.CONFIRMED)
        self.assertEqual(res1.amount_paid, Decimal("120.00"))

        # Second payment completing the balance
        Payment.objects.create(
            invoice=invoice,
            method=Payment.PaymentMethod.CASH,
            amount=Decimal("80.00"),
            payment_date=date.today(),
        )
        res2 = apply_payment(invoice)
        self.assertEqual(res2.status, Invoice.Status.PAID)
        self.assertEqual(res2.amount_paid, Decimal("200.00"))

    def test_payment_above_total_sets_paid(self):
        """Payment above total sets status to paid and records full amount paid."""
        invoice = self._create_invoice(total=Decimal("200.00"), status=Invoice.Status.CONFIRMED)

        # Overpayment of 250.00 against 200.00
        Payment.objects.create(
            invoice=invoice,
            method=Payment.PaymentMethod.CHEQUE,
            amount=Decimal("250.00"),
            payment_date=date.today(),
            note="Overpayment",
        )

        refreshed = apply_payment(invoice)

        self.assertEqual(refreshed.status, Invoice.Status.PAID)
        self.assertEqual(refreshed.amount_paid, Decimal("250.00"))

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)
        self.assertEqual(invoice.amount_paid, Decimal("250.00"))

    def test_calling_apply_payment_twice_gives_same_result(self):
        """Calling apply_payment twice is idempotent and does not accumulate running totals."""
        invoice = self._create_invoice(total=Decimal("200.00"), status=Invoice.Status.CONFIRMED)

        Payment.objects.create(
            invoice=invoice,
            method=Payment.PaymentMethod.BANK_TRANSFER,
            amount=Decimal("200.00"),
            payment_date=date.today(),
        )

        first_result = apply_payment(invoice)
        self.assertEqual(first_result.status, Invoice.Status.PAID)
        self.assertEqual(first_result.amount_paid, Decimal("200.00"))

        second_result = apply_payment(invoice)
        self.assertEqual(second_result.status, Invoice.Status.PAID)
        self.assertEqual(second_result.amount_paid, Decimal("200.00"))

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)
        self.assertEqual(invoice.amount_paid, Decimal("200.00"))

    def test_no_payments_leaves_everything_unchanged(self):
        """If there are no payments on the invoice, status and amount_paid remain unchanged."""
        invoice = self._create_invoice(total=Decimal("200.00"), status=Invoice.Status.CONFIRMED)

        refreshed = apply_payment(invoice)

        self.assertEqual(refreshed.status, Invoice.Status.CONFIRMED)
        self.assertEqual(refreshed.amount_paid, Decimal("0.00"))

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.CONFIRMED)
        self.assertEqual(invoice.amount_paid, Decimal("0.00"))

    def test_apply_payment_with_invoice_pk(self):
        """apply_payment accepts an invoice primary key integer directly."""
        invoice = self._create_invoice(total=Decimal("150.00"), status=Invoice.Status.CONFIRMED)

        Payment.objects.create(
            invoice=invoice,
            method=Payment.PaymentMethod.CARD,
            amount=Decimal("150.00"),
            payment_date=date.today(),
        )

        refreshed = apply_payment(invoice.pk)

        self.assertEqual(refreshed.status, Invoice.Status.PAID)
        self.assertEqual(refreshed.amount_paid, Decimal("150.00"))
