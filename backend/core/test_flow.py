"""End-to-end integration flow test for Brightloop Subscription Management System."""

from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from billing.models import Invoice
from subscriptions.models import Subscription


class EndToEndFlowTest(APITestCase):
    """End-to-end flow test walking product, plan, subscription, invoice, and payment lifecycles."""

    def setUp(self):
        super().setUp()
        # Seed the test database with demo accounts and initial data
        call_command("seed", stdout=StringIO())

    def test_customer_forbidden_on_admin_endpoints(self):
        """Verify that customer accounts receive 403 Forbidden on admin-only endpoints."""
        # Login as customer Asha
        login_res = self.client.post(
            "/api/auth/login/",
            {"email": "asha@example.com", "password": "AshaCustomer2026!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        token = login_res.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        # Attempt creating a plan (admin-only)
        plan_res = self.client.post(
            "/api/plans/",
            {
                "name": "Customer Plan Attempt",
                "price": "99.00",
                "billing_period": "monthly",
            },
            format="json",
        )
        self.assertEqual(
            plan_res.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Customer should get 403 on POST /api/plans/, got {plan_res.status_code}",
        )

        # Attempt creating a tax (admin-only)
        tax_res = self.client.post(
            "/api/taxes/",
            {
                "name": "Customer Tax Attempt",
                "rate_percent": "15.00",
            },
            format="json",
        )
        self.assertEqual(
            tax_res.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Customer should get 403 on POST /api/taxes/, got {tax_res.status_code}",
        )

        # Attempt creating a discount (admin-only)
        discount_res = self.client.post(
            "/api/discounts/",
            {
                "name": "Customer Discount Attempt",
                "type": "percent",
                "value": "10.00",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "applies_to": "subscription",
            },
            format="json",
        )
        self.assertEqual(
            discount_res.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Customer should get 403 on POST /api/discounts/, got {discount_res.status_code}",
        )

    def test_full_business_flow(self):
        """
        Walk the full lifecycle:
        1. Login with admin demo account
        2. Create product
        3. Create plan
        4. Create subscription for customer (in draft)
        5. Negative check: direct draft to confirmed transition returns 400
        6. Walk contract status transitions: draft -> quotation -> confirmed -> active (assert 200 on each)
        7. Only after it is active, call POST /api/invoices/generate/, assert invoice exists
        8. Confirm the invoice
        9. Record payment through /api/payments/
        10. Assert invoice ends up paid
        """
        # Step 1: Login as Admin
        login_res = self.client.post(
            "/api/auth/login/",
            {"email": "admin@brightloop.com", "password": "BrightloopAdmin2026!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        token = login_res.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        # Step 2: Create product
        prod_res = self.client.post(
            "/api/products/",
            {
                "name": "E2E Cloud Platform",
                "type": "service",
                "sales_price": "250.00",
                "cost_price": "100.00",
                "notes": "E2E product",
                "variants": [],
            },
            format="json",
        )
        self.assertEqual(
            prod_res.status_code,
            status.HTTP_201_CREATED,
            f"POST /api/products/ failed: {prod_res.data}",
        )
        product_id = prod_res.data.get("id")

        # Step 3: Create plan
        plan_res = self.client.post(
            "/api/plans/",
            {
                "name": "E2E Annual Enterprise",
                "price": "250.00",
                "billing_period": "monthly",
                "min_quantity": 1,
                "available_from": "2026-01-01",
                "available_to": "2027-12-31",
                "auto_close": False,
                "allow_early_close": True,
                "allow_pause": True,
                "allow_renew": True,
            },
            format="json",
        )
        self.assertEqual(
            plan_res.status_code,
            status.HTTP_201_CREATED,
            f"POST /api/plans/ failed: {plan_res.data}",
        )
        plan_id = plan_res.data.get("id")

        # Step 4: Create subscription for customer Asha
        customer = User.objects.get(email="asha@example.com")
        sub_res = self.client.post(
            "/api/subscriptions/",
            {
                "customer": customer.id,
                "plan": plan_id,
                "start_date": "2026-11-01",
                "expiry_date": "2027-10-31",
                "payment_term_days": 15,
                "lines": [
                    {
                        "product": product_id,
                        "quantity": 2,
                        "unit_price": "250.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(
            sub_res.status_code,
            status.HTTP_201_CREATED,
            f"POST /api/subscriptions/ failed: {sub_res.data}",
        )
        sub_id = sub_res.data.get("id")
        self.assertEqual(sub_res.data.get("status"), "draft")

        # Step 5: Negative check: direct draft to confirmed transition returns 400
        neg_res = self.client.post(
            f"/api/subscriptions/{sub_id}/transition/",
            {"to": "confirmed"},
            format="json",
        )
        self.assertEqual(
            neg_res.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for direct draft->confirmed transition, got {neg_res.status_code}",
        )
        self.assertIn("detail", neg_res.data)
        self.assertEqual(neg_res.data["detail"], "Cannot move from draft to confirmed")

        # Step 6: Walk the contract's order: draft -> quotation -> confirmed -> active (assert 200 on each)
        # 6a: draft -> quotation
        quot_res = self.client.post(
            f"/api/subscriptions/{sub_id}/transition/",
            {"to": "quotation"},
            format="json",
        )
        self.assertEqual(
            quot_res.status_code,
            status.HTTP_200_OK,
            f"POST transition to quotation failed: {quot_res.data}",
        )
        self.assertEqual(quot_res.data.get("status"), "quotation")

        # 6b: quotation -> confirmed
        conf_sub_res = self.client.post(
            f"/api/subscriptions/{sub_id}/transition/",
            {"to": "confirmed"},
            format="json",
        )
        self.assertEqual(
            conf_sub_res.status_code,
            status.HTTP_200_OK,
            f"POST transition to confirmed failed: {conf_sub_res.data}",
        )
        self.assertEqual(conf_sub_res.data.get("status"), "confirmed")

        # 6c: confirmed -> active
        act_res = self.client.post(
            f"/api/subscriptions/{sub_id}/transition/",
            {"to": "active"},
            format="json",
        )
        self.assertEqual(
            act_res.status_code,
            status.HTTP_200_OK,
            f"POST transition to active failed: {act_res.data}",
        )
        self.assertEqual(act_res.data.get("status"), "active")

        # Step 7: Only after it is active, call POST /api/invoices/generate/, assert invoice exists
        gen_res = self.client.post(
            "/api/invoices/generate/",
            {"as_of_date": "2026-12-01"},
            format="json",
        )
        self.assertEqual(
            gen_res.status_code,
            status.HTTP_200_OK,
            f"POST /api/invoices/generate/ failed: {gen_res.data}",
        )
        created_invoices = Invoice.objects.filter(subscription_id=sub_id)
        self.assertTrue(
            created_invoices.exists(),
            f"Expected an invoice generated for active subscription {sub_id}, but none found. Response: {gen_res.data}",
        )
        invoice = created_invoices.first()
        invoice_id = invoice.id

        # Step 8: Confirm the invoice (draft -> confirmed)
        conf_inv_res = self.client.post(
            f"/api/invoices/{invoice_id}/confirm/",
            format="json",
        )
        self.assertEqual(
            conf_inv_res.status_code,
            status.HTTP_200_OK,
            f"POST /api/invoices/{invoice_id}/confirm/ failed: {conf_inv_res.data}",
        )
        self.assertEqual(conf_inv_res.data.get("status"), "confirmed")

        # Step 9: Record payment through /api/payments/
        invoice.refresh_from_db()
        pay_res = self.client.post(
            "/api/payments/",
            {
                "invoice": invoice_id,
                "method": "bank_transfer",
                "amount": str(invoice.total),
                "note": "Full payment for E2E flow test",
            },
            format="json",
        )
        self.assertEqual(
            pay_res.status_code,
            status.HTTP_201_CREATED,
            f"POST /api/payments/ failed: {pay_res.data}",
        )

        # Step 10: Assert the invoice is paid
        inv_detail_res = self.client.get(f"/api/invoices/{invoice_id}/")
        self.assertEqual(inv_detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            inv_detail_res.data.get("status"),
            "paid",
            f"Invoice {invoice_id} status should be 'paid', got '{inv_detail_res.data.get('status')}'",
        )
        self.assertEqual(
            Decimal(str(inv_detail_res.data.get("amount_paid"))),
            Decimal(str(inv_detail_res.data.get("total"))),
            "Invoice amount_paid does not equal total.",
        )
