"""Management command to seed the database with initial and demo data."""

from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from billing.models import Invoice, InvoiceLine, Payment
from catalog.models import (
    Discount,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    QuotationTemplateLine,
    Tax,
)
from subscriptions.models import Subscription, SubscriptionLine

User = get_user_model()


class Command(BaseCommand):
    help = "Seed database with admin, staff, customers, catalog, subscriptions, and invoices (safe to run twice)."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("Seeding database...")

        # 1. Users
        passwords = {
            "admin@brightloop.com": "BrightloopAdmin2026!",
            "staff@brightloop.com": "BrightloopStaff2026!",
            "asha@example.com": "AshaCustomer2026!",
            "ravi@example.com": "RaviCustomer2026!",
        }

        admin_user, _ = User.objects.get_or_create(
            email="admin@brightloop.com",
            defaults={
                "name": "Brightloop Administrator",
                "role": User.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        admin_user.set_password(passwords["admin@brightloop.com"])
        admin_user.role = User.Role.ADMIN
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save()

        staff_user, _ = User.objects.get_or_create(
            email="staff@brightloop.com",
            defaults={
                "name": "Operations Staff",
                "role": User.Role.STAFF,
                "is_staff": True,
            },
        )
        staff_user.set_password(passwords["staff@brightloop.com"])
        staff_user.role = User.Role.STAFF
        staff_user.is_staff = True
        staff_user.save()

        customer_asha, _ = User.objects.get_or_create(
            email="asha@example.com",
            defaults={
                "name": "Asha Traders",
                "role": User.Role.CUSTOMER,
                "is_staff": False,
            },
        )
        customer_asha.set_password(passwords["asha@example.com"])
        customer_asha.role = User.Role.CUSTOMER
        customer_asha.is_staff = False
        customer_asha.save()

        customer_ravi, _ = User.objects.get_or_create(
            email="ravi@example.com",
            defaults={
                "name": "Ravi Enterprises",
                "role": User.Role.CUSTOMER,
                "is_staff": False,
            },
        )
        customer_ravi.set_password(passwords["ravi@example.com"])
        customer_ravi.role = User.Role.CUSTOMER
        customer_ravi.is_staff = False
        customer_ravi.save()

        # 2. Taxes
        tax_5, _ = Tax.objects.get_or_create(
            name="GST 5%",
            defaults={"rate_percent": Decimal("5.00"), "is_active": True},
        )
        tax_12, _ = Tax.objects.get_or_create(
            name="GST 12%",
            defaults={"rate_percent": Decimal("12.00"), "is_active": True},
        )
        tax_18, _ = Tax.objects.get_or_create(
            name="GST 18%",
            defaults={"rate_percent": Decimal("18.00"), "is_active": True},
        )

        # 3. Products and Variants
        product_seats, _ = Product.objects.get_or_create(
            name="Pro Seats",
            defaults={
                "type": Product.ProductType.SERVICE,
                "sales_price": Decimal("1000.00"),
                "cost_price": Decimal("400.00"),
                "notes": "Subscription seats per active user",
                "default_tax": tax_18,
                "is_active": True,
            },
        )
        variant_odoo, _ = ProductVariant.objects.get_or_create(
            product=product_seats,
            attribute="Brand",
            value="Odoo",
            defaults={"extra_price": Decimal("560.00")},
        )
        ProductVariant.objects.get_or_create(
            product=product_seats,
            attribute="Brand",
            value="Community",
            defaults={"extra_price": Decimal("0.00")},
        )

        product_pos, _ = Product.objects.get_or_create(
            name="POS Terminal Device",
            defaults={
                "type": Product.ProductType.GOODS,
                "sales_price": Decimal("12000.00"),
                "cost_price": Decimal("8500.00"),
                "notes": "Dedicated countertop POS hardware",
                "default_tax": tax_18,
                "is_active": True,
            },
        )
        ProductVariant.objects.get_or_create(
            product=product_pos,
            attribute="Color",
            value="Black",
            defaults={"extra_price": Decimal("0.00")},
        )
        ProductVariant.objects.get_or_create(
            product=product_pos,
            attribute="Color",
            value="Silver",
            defaults={"extra_price": Decimal("500.00")},
        )

        Product.objects.get_or_create(
            name="Priority Support SLA",
            defaults={
                "type": Product.ProductType.ADDON,
                "sales_price": Decimal("2500.00"),
                "cost_price": Decimal("1000.00"),
                "notes": "24/7 dedicated telephone and live-chat response",
                "default_tax": tax_18,
                "is_active": True,
            },
        )

        # 4. Plans of each billing period
        today = date.today()
        plan_daily, _ = Plan.objects.get_or_create(
            name="Micro Daily",
            defaults={
                "price": Decimal("50.00"),
                "billing_period": Plan.BillingPeriod.DAILY,
                "min_quantity": 1,
                "available_from": today - timedelta(days=180),
                "available_to": today + timedelta(days=365),
                "auto_close": False,
                "allow_early_close": True,
                "allow_pause": True,
                "allow_renew": True,
                "status": Plan.PlanStatus.ACTIVE,
            },
        )
        plan_weekly, _ = Plan.objects.get_or_create(
            name="Sprint Weekly",
            defaults={
                "price": Decimal("350.00"),
                "billing_period": Plan.BillingPeriod.WEEKLY,
                "min_quantity": 1,
                "available_from": today - timedelta(days=180),
                "available_to": today + timedelta(days=365),
                "auto_close": False,
                "allow_early_close": True,
                "allow_pause": True,
                "allow_renew": True,
                "status": Plan.PlanStatus.ACTIVE,
            },
        )
        plan_monthly, _ = Plan.objects.get_or_create(
            name="Pro Monthly",
            defaults={
                "price": Decimal("1500.00"),
                "billing_period": Plan.BillingPeriod.MONTHLY,
                "min_quantity": 1,
                "available_from": today - timedelta(days=180),
                "available_to": today + timedelta(days=365),
                "auto_close": False,
                "allow_early_close": True,
                "allow_pause": True,
                "allow_renew": True,
                "status": Plan.PlanStatus.ACTIVE,
            },
        )
        plan_yearly, _ = Plan.objects.get_or_create(
            name="Enterprise Yearly",
            defaults={
                "price": Decimal("15000.00"),
                "billing_period": Plan.BillingPeriod.YEARLY,
                "min_quantity": 1,
                "available_from": today - timedelta(days=180),
                "available_to": today + timedelta(days=365),
                "auto_close": False,
                "allow_early_close": True,
                "allow_pause": True,
                "allow_renew": True,
                "status": Plan.PlanStatus.ACTIVE,
            },
        )

        # 5. Quotation Template and Line
        template, _ = QuotationTemplate.objects.get_or_create(
            name="Pro Monthly Onboarding Template",
            defaults={
                "plan": plan_monthly,
                "validity_days": 30,
            },
        )
        QuotationTemplateLine.objects.get_or_create(
            template=template,
            product=product_seats,
            defaults={
                "variant": variant_odoo,
                "quantity": 5,
                "unit_price": Decimal("1560.00"),
            },
        )

        # 6. Discount
        discount, _ = Discount.objects.get_or_create(
            name="Festive Launch 10%",
            defaults={
                "type": Discount.DiscountType.PERCENT,
                "value": Decimal("10.00"),
                "start_date": today - timedelta(days=60),
                "end_date": today + timedelta(days=90),
                "usage_limit": 100,
                "times_used": 1,
                "applies_to": Discount.AppliesTo.SUBSCRIPTION,
                "is_active": True,
            },
        )

        # 7. Subscriptions in different statuses
        sub_1, _ = Subscription.objects.get_or_create(
            number="SUB-00001",
            defaults={
                "customer": customer_asha,
                "plan": plan_monthly,
                "template": template,
                "start_date": today - timedelta(days=60),
                "expiry_date": today + timedelta(days=305),
                "payment_term_days": 15,
                "next_invoice_date": today + timedelta(days=1),
                "status": Subscription.Status.ACTIVE,
                "created_by": admin_user,
            },
        )
        SubscriptionLine.objects.get_or_create(
            subscription=sub_1,
            product=product_seats,
            defaults={
                "variant": variant_odoo,
                "quantity": 5,
                "unit_price": Decimal("1560.00"),
                "tax": tax_18,
                "amount": Decimal("7800.00"),
            },
        )

        # Invoices for SUB-00001
        inv_1, _ = Invoice.objects.get_or_create(
            number="INV-00001",
            defaults={
                "subscription": sub_1,
                "customer": customer_asha,
                "period_start": today - timedelta(days=30),
                "period_end": today - timedelta(days=1),
                "issue_date": today - timedelta(days=30),
                "due_date": today - timedelta(days=15),
                "status": Invoice.Status.CONFIRMED,
                "subtotal": Decimal("7800.00"),
                "discount_total": Decimal("780.00"),
                "tax_total": Decimal("1263.60"),
                "total": Decimal("8283.60"),
                "amount_paid": Decimal("0.00"),
                "discount": discount,
            },
        )
        InvoiceLine.objects.update_or_create(
            invoice=inv_1,
            product=product_seats,
            defaults={
                "description": "Pro seats (Odoo brand)",
                "quantity": 5,
                "unit_price": Decimal("1560.00"),
                "discount_amount": Decimal("780.00"),
                "tax_rate_percent": Decimal("18.00"),
                "tax_amount": Decimal("1263.60"),
                "amount": Decimal("8283.60"),
            },
        )

        inv_2, _ = Invoice.objects.get_or_create(
            number="INV-00002",
            defaults={
                "subscription": sub_1,
                "customer": customer_asha,
                "period_start": today - timedelta(days=60),
                "period_end": today - timedelta(days=31),
                "issue_date": today - timedelta(days=60),
                "due_date": today - timedelta(days=45),
                "status": Invoice.Status.PAID,
                "subtotal": Decimal("7800.00"),
                "discount_total": Decimal("780.00"),
                "tax_total": Decimal("1263.60"),
                "total": Decimal("8283.60"),
                "amount_paid": Decimal("8283.60"),
                "discount": discount,
            },
        )
        InvoiceLine.objects.update_or_create(
            invoice=inv_2,
            product=product_seats,
            defaults={
                "description": "Pro seats (Odoo brand)",
                "quantity": 5,
                "unit_price": Decimal("1560.00"),
                "discount_amount": Decimal("780.00"),
                "tax_rate_percent": Decimal("18.00"),
                "tax_amount": Decimal("1263.60"),
                "amount": Decimal("8283.60"),
            },
        )
        Payment.objects.get_or_create(
            invoice=inv_2,
            method=Payment.PaymentMethod.BANK_TRANSFER,
            defaults={
                "amount": Decimal("8283.60"),
                "payment_date": today - timedelta(days=50),
                "note": "Wire transfer settlement #TX99182",
                "recorded_by": admin_user,
            },
        )

        Subscription.objects.get_or_create(
            number="SUB-00002",
            defaults={
                "customer": customer_ravi,
                "plan": plan_yearly,
                "start_date": today,
                "expiry_date": today + timedelta(days=365),
                "payment_term_days": 30,
                "next_invoice_date": today,
                "status": Subscription.Status.DRAFT,
                "created_by": staff_user,
            },
        )
        Subscription.objects.get_or_create(
            number="SUB-00003",
            defaults={
                "customer": customer_asha,
                "plan": plan_daily,
                "start_date": today,
                "expiry_date": today + timedelta(days=30),
                "payment_term_days": 7,
                "next_invoice_date": today,
                "status": Subscription.Status.CONFIRMED,
                "created_by": admin_user,
            },
        )
        Subscription.objects.get_or_create(
            number="SUB-00004",
            defaults={
                "customer": customer_ravi,
                "plan": plan_weekly,
                "start_date": today - timedelta(days=60),
                "expiry_date": today - timedelta(days=1),
                "payment_term_days": 15,
                "next_invoice_date": today - timedelta(days=60),
                "status": Subscription.Status.CLOSED,
                "created_by": staff_user,
            },
        )
        Subscription.objects.get_or_create(
            number="SUB-00005",
            defaults={
                "customer": customer_ravi,
                "plan": plan_monthly,
                "start_date": today + timedelta(days=7),
                "expiry_date": today + timedelta(days=372),
                "payment_term_days": 15,
                "next_invoice_date": today + timedelta(days=7),
                "status": Subscription.Status.QUOTATION,
                "created_by": staff_user,
            },
        )

        self.stdout.write(self.style.SUCCESS("Database seeded successfully!"))
        self.stdout.write("Credentials:")
        for email, pwd in passwords.items():
            self.stdout.write(f"  {email:<22} / {pwd}")

