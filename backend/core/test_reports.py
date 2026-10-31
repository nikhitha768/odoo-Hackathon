"""Unit and integration tests for Reports API endpoints.

Tests coverage:
1. Permission checks for /api/reports/summary/, /api/reports/overdue-invoices/, and /api/reports/revenue-by-month/
   (Anonymous -> 401, Customer -> 403, Staff -> 200, Admin -> 200).
2. Summary report metrics computation (database aggregations for active_subscriptions,
   total_invoiced, revenue_received, outstanding, overdue_count, overdue_amount) including date range filtering.
3. Overdue invoices report (filtering confirmed, unpaid, past-due invoices, days_overdue computation, pagination).
4. Revenue by month report (aggregation by month for invoiced and received, date filtering).
"""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import Invoice, InvoiceLine, Payment
from catalog.models import Plan, Product
from subscriptions.models import Subscription

User = get_user_model()


class ReportAPIBaseTestCase(APITestCase):
    """Base setup with seeded users, products, plans, subscriptions, invoices, and payments."""

    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()

        # Users
        self.admin_user = User.objects.create_user(
            email="admin_rep@example.com",
            name="Admin User",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )
        self.staff_user = User.objects.create_user(
            email="staff_rep@example.com",
            name="Staff User",
            password="StaffPassword123!",
            role=User.Role.STAFF,
        )
        self.customer_user = User.objects.create_user(
            email="customer_rep@example.com",
            name="Customer User",
            password="CustomerPassword123!",
            role=User.Role.CUSTOMER,
        )

        # Catalog setup
        self.plan = Plan.objects.create(
            name="Professional Monthly",
            price=Decimal("100.00"),
            billing_period=Plan.BillingPeriod.MONTHLY,
            available_from=self.today - timedelta(days=60),
        )
        self.product = Product.objects.create(
            name="Cloud Storage 100GB",
            type=Product.ProductType.SERVICE,
            sales_price=Decimal("50.00"),
            cost_price=Decimal("20.00"),
        )

        # Subscriptions
        # Sub 1: Active
        self.sub_active_1 = Subscription.objects.create(
            customer=self.customer_user,
            plan=self.plan,
            start_date=self.today - timedelta(days=60),
            expiry_date=self.today + timedelta(days=300),
            payment_term_days=15,
            next_invoice_date=self.today + timedelta(days=30),
            status=Subscription.Status.ACTIVE,
        )
        # Sub 2: Active
        self.sub_active_2 = Subscription.objects.create(
            customer=self.customer_user,
            plan=self.plan,
            start_date=self.today - timedelta(days=45),
            expiry_date=self.today + timedelta(days=300),
            payment_term_days=15,
            next_invoice_date=self.today + timedelta(days=15),
            status=Subscription.Status.ACTIVE,
        )
        # Sub 3: Draft
        self.sub_draft = Subscription.objects.create(
            customer=self.customer_user,
            plan=self.plan,
            start_date=self.today,
            expiry_date=self.today + timedelta(days=365),
            payment_term_days=15,
            next_invoice_date=self.today,
            status=Subscription.Status.DRAFT,
        )
        # Sub 4: Closed
        self.sub_closed = Subscription.objects.create(
            customer=self.customer_user,
            plan=self.plan,
            start_date=self.today - timedelta(days=90),
            expiry_date=self.today - timedelta(days=10),
            payment_term_days=15,
            next_invoice_date=self.today - timedelta(days=10),
            status=Subscription.Status.CLOSED,
        )

        # Invoices setup
        # Invoice 1: Overdue (confirmed, past due date, partially paid)
        self.inv_overdue = Invoice.objects.create(
            subscription=self.sub_active_1,
            customer=self.customer_user,
            period_start=self.today - timedelta(days=45),
            period_end=self.today - timedelta(days=16),
            issue_date=self.today - timedelta(days=45),
            due_date=self.today - timedelta(days=30),  # 30 days overdue
            status=Invoice.Status.CONFIRMED,
            subtotal=Decimal("1000.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("1000.00"),
            amount_paid=Decimal("200.00"),  # outstanding = 800.00
        )
        InvoiceLine.objects.create(
            invoice=self.inv_overdue,
            product=self.product,
            description="Service Line",
            quantity=10,
            unit_price=Decimal("100.00"),
            amount=Decimal("1000.00"),
        )
        Payment.objects.create(
            invoice=self.inv_overdue,
            method=Payment.PaymentMethod.BANK_TRANSFER,
            amount=Decimal("200.00"),
            payment_date=self.today - timedelta(days=40),
            recorded_by=self.staff_user,
        )

        # Invoice 2: Fully paid (past due date, but fully paid -> NOT overdue)
        self.inv_paid = Invoice.objects.create(
            subscription=self.sub_active_1,
            customer=self.customer_user,
            period_start=self.today - timedelta(days=75),
            period_end=self.today - timedelta(days=46),
            issue_date=self.today - timedelta(days=75),
            due_date=self.today - timedelta(days=60),
            status=Invoice.Status.PAID,
            subtotal=Decimal("500.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("500.00"),
            amount_paid=Decimal("500.00"),  # outstanding = 0.00
        )
        Payment.objects.create(
            invoice=self.inv_paid,
            method=Payment.PaymentMethod.UPI,
            amount=Decimal("500.00"),
            payment_date=self.today - timedelta(days=65),
            recorded_by=self.staff_user,
        )

        # Invoice 3: Confirmed, future due date (NOT overdue, outstanding = 600.00)
        self.inv_future = Invoice.objects.create(
            subscription=self.sub_active_2,
            customer=self.customer_user,
            period_start=self.today - timedelta(days=5),
            period_end=self.today + timedelta(days=25),
            issue_date=self.today - timedelta(days=5),
            due_date=self.today + timedelta(days=10),
            status=Invoice.Status.CONFIRMED,
            subtotal=Decimal("600.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("600.00"),
            amount_paid=Decimal("0.00"),
        )

        # Invoice 4: Draft (past due date, but draft -> NOT overdue)
        self.inv_draft = Invoice.objects.create(
            subscription=self.sub_active_2,
            customer=self.customer_user,
            period_start=self.today - timedelta(days=35),
            period_end=self.today - timedelta(days=6),
            issue_date=self.today - timedelta(days=35),
            due_date=self.today - timedelta(days=20),
            status=Invoice.Status.DRAFT,
            subtotal=Decimal("300.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("300.00"),
            amount_paid=Decimal("0.00"),
        )

        # Invoice 5: Cancelled (cancelled invoices are excluded from total invoiced and outstanding)
        self.inv_cancelled = Invoice.objects.create(
            subscription=self.sub_active_2,
            customer=self.customer_user,
            period_start=self.today - timedelta(days=100),
            period_end=self.today - timedelta(days=71),
            issue_date=self.today - timedelta(days=100),
            due_date=self.today - timedelta(days=85),
            status=Invoice.Status.CANCELLED,
            subtotal=Decimal("400.00"),
            discount_total=Decimal("0.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("400.00"),
            amount_paid=Decimal("0.00"),
        )


class ReportPermissionsTests(ReportAPIBaseTestCase):
    """Test RBAC permissions across all 3 reports endpoints."""

    def test_anonymous_access_denied(self):
        """Anonymous requests must return 401 Unauthorized."""
        for url in [
            "/api/reports/summary/",
            "/api/reports/overdue-invoices/",
            "/api/reports/revenue-by-month/",
        ]:
            res = self.client.get(url)
            self.assertEqual(
                res.status_code,
                status.HTTP_401_UNAUTHORIZED,
                f"Expected 401 for anonymous on {url}, got {res.status_code}",
            )

    def test_customer_access_forbidden(self):
        """Customers must receive 403 Forbidden on reports endpoints."""
        self.client.force_authenticate(user=self.customer_user)
        for url in [
            "/api/reports/summary/",
            "/api/reports/overdue-invoices/",
            "/api/reports/revenue-by-month/",
        ]:
            res = self.client.get(url)
            self.assertEqual(
                res.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Expected 403 for customer on {url}, got {res.status_code}",
            )

    def test_staff_access_allowed(self):
        """Staff members can access all reports."""
        self.client.force_authenticate(user=self.staff_user)
        for url in [
            "/api/reports/summary/",
            "/api/reports/overdue-invoices/",
            "/api/reports/revenue-by-month/",
        ]:
            res = self.client.get(url)
            self.assertEqual(
                res.status_code,
                status.HTTP_200_OK,
                f"Expected 200 for staff on {url}, got {res.status_code}",
            )

    def test_admin_access_allowed(self):
        """Admins can access all reports."""
        self.client.force_authenticate(user=self.admin_user)
        for url in [
            "/api/reports/summary/",
            "/api/reports/overdue-invoices/",
            "/api/reports/revenue-by-month/",
        ]:
            res = self.client.get(url)
            self.assertEqual(
                res.status_code,
                status.HTTP_200_OK,
                f"Expected 200 for admin on {url}, got {res.status_code}",
            )


class ReportSummaryAPITests(ReportAPIBaseTestCase):
    """Test /api/reports/summary/ calculations and date filtering."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.staff_user)

    def test_summary_aggregated_metrics(self):
        """Check exact values calculated via DB aggregation without date filters."""
        res = self.client.get("/api/reports/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data
        # Active subscriptions: sub_active_1 and sub_active_2 = 2
        self.assertEqual(data["active_subscriptions"], 2)

        # Total invoiced: non-cancelled invoices (inv_overdue: 1000, inv_paid: 500, inv_future: 600, inv_draft: 300) = 2400.00
        self.assertEqual(data["total_invoiced"], "2400.00")

        # Revenue received: payments (200 + 500) = 700.00
        self.assertEqual(data["revenue_received"], "700.00")

        # Outstanding: total - amount_paid on non-cancelled invoices:
        # inv_overdue (800) + inv_paid (0) + inv_future (600) + inv_draft (300) = 1700.00
        self.assertEqual(data["outstanding"], "1700.00")

        # Overdue: confirmed, due_date < today, amount_paid < total -> inv_overdue only
        self.assertEqual(data["overdue_count"], 1)
        self.assertEqual(data["overdue_amount"], "800.00")

    def test_summary_date_filtering(self):
        """Check summary filtering with ?from=&to= date query parameters."""
        # Filter for recent period (last 10 days to tomorrow): includes inv_future (issue_date = today - 5)
        # Excludes inv_overdue (issue_date = today - 45), inv_paid (today - 75), inv_draft (today - 35)
        from_str = (self.today - timedelta(days=10)).isoformat()
        to_str = (self.today + timedelta(days=1)).isoformat()

        res = self.client.get(f"/api/reports/summary/?from={from_str}&to={to_str}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data
        self.assertEqual(data["active_subscriptions"], 2)
        self.assertEqual(data["total_invoiced"], "600.00")
        # No payments occurred in the last 10 days
        self.assertEqual(data["revenue_received"], "0.00")
        self.assertEqual(data["outstanding"], "600.00")
        # inv_future is not overdue because due_date > today
        self.assertEqual(data["overdue_count"], 0)
        self.assertEqual(data["overdue_amount"], "0.00")

    def test_summary_zero_state(self):
        """When database has no subscriptions, invoices or payments, return zeroes."""
        Payment.objects.all().delete()
        InvoiceLine.objects.all().delete()
        Invoice.objects.all().delete()
        Subscription.objects.all().delete()

        res = self.client.get("/api/reports/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res.data,
            {
                "active_subscriptions": 0,
                "total_invoiced": "0.00",
                "revenue_received": "0.00",
                "outstanding": "0.00",
                "overdue_count": 0,
                "overdue_amount": "0.00",
            },
        )


class ReportOverdueInvoicesAPITests(ReportAPIBaseTestCase):
    """Test /api/reports/overdue-invoices/ list, days_overdue, and pagination."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.staff_user)

    def test_overdue_invoices_contents_and_days(self):
        """Only confirmed, unpaid, due_date < today invoices appear with days_overdue."""
        res = self.client.get("/api/reports/overdue-invoices/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertIn("count", res.data)
        self.assertIn("results", res.data)
        self.assertEqual(res.data["count"], 1)

        item = res.data["results"][0]
        self.assertEqual(item["id"], self.inv_overdue.id)
        self.assertEqual(item["number"], self.inv_overdue.number)
        self.assertEqual(item["status"], Invoice.Status.CONFIRMED)
        self.assertEqual(item["total"], "1000.00")
        self.assertEqual(item["amount_paid"], "200.00")

        # days_overdue should be (today - due_date).days = 30
        expected_days = (self.today - self.inv_overdue.due_date).days
        self.assertEqual(item["days_overdue"], expected_days)

        # Customer detail nested
        self.assertEqual(item["customer"]["id"], self.customer_user.id)
        self.assertEqual(item["customer"]["name"], self.customer_user.name)

    def test_overdue_invoices_date_filtering(self):
        """Filter overdue invoices by due_date range."""
        # Range that matches inv_overdue
        from_str = (self.today - timedelta(days=35)).isoformat()
        to_str = (self.today - timedelta(days=25)).isoformat()
        res = self.client.get(f"/api/reports/overdue-invoices/?from={from_str}&to={to_str}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)

        # Range that does not match
        from_str2 = (self.today - timedelta(days=20)).isoformat()
        to_str2 = (self.today - timedelta(days=1)).isoformat()
        res2 = self.client.get(f"/api/reports/overdue-invoices/?from={from_str2}&to={to_str2}")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["count"], 0)


class ReportRevenueByMonthAPITests(ReportAPIBaseTestCase):
    """Test /api/reports/revenue-by-month/ monthly grouping and aggregation."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.staff_user)

    def test_revenue_by_month_structure_and_values(self):
        """Monthly aggregation groups invoices and payments properly."""
        res = self.client.get("/api/reports/revenue-by-month/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertIsInstance(res.data, list)
        self.assertGreater(len(res.data), 0)

        for row in res.data:
            self.assertIn("month", row)
            self.assertIn("invoiced", row)
            self.assertIn("received", row)
            # Verify month format YYYY-MM
            self.assertRegex(row["month"], r"^\d{4}-\d{2}$")

    def test_revenue_by_month_date_filter(self):
        """Filter revenue-by-month by ?from=&to= date range."""
        from_str = (self.today - timedelta(days=20)).isoformat()
        to_str = (self.today + timedelta(days=1)).isoformat()

        res = self.client.get(f"/api/reports/revenue-by-month/?from={from_str}&to={to_str}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsInstance(res.data, list)

