# Subscription Management System: Tables and API Contract

Stack: Django + Django REST Framework, React + Vite, PostgreSQL.
This file is the single source of truth. If you need a new field or endpoint, edit this file first, then tell the other person.

Ownership: models, migrations, indexes and seed data are Person B's (database). Each endpoint below is marked with its backend owner: **[A]** or **[B]**.
(A = frontend person, who also owns accounts, catalog and payments in the backend. B = database person, who also owns subscriptions, billing and reports.)

---

## 1. Conventions

- Base URL: `/api/`. All bodies are JSON.
- Auth: DRF TokenAuthentication. Send header `Authorization: Token <key>`.
- Money: decimal strings with 2 places, e.g. `"1560.00"`. Dates: `YYYY-MM-DD`. Timestamps: ISO 8601.
- Lists are paginated: `?page=1&page_size=20` returns
  `{"count": 120, "next": "...", "previous": null, "results": [ ... ]}`
- Errors:
  - Validation (400): `{"field_name": ["message"]}`
  - Other (400/401/403/404): `{"detail": "message"}`
- Roles: `admin`, `staff`, `customer`.
  - admin: everything.
  - staff: day-to-day work, no admin-only actions.
  - customer: read-only, only their own subscriptions and invoices.

Permission shorthand used below: **Admin**, **Staff+** (staff or admin), **Customer-own** (customer sees only their own rows; staff and admin see all), **Public**.

---

## 2. Tables

### accounts
**User** (custom user model, login by email)
- id, name, email (unique), password (hashed), role (`admin|staff|customer`), is_active, created_at

### catalog
**Product**
- id, name, type (`service|goods|addon`), sales_price, cost_price, notes, default_tax (FK Tax, null), is_active

**ProductVariant**
- id, product (FK), attribute (e.g. `Brand`), value (e.g. `Odoo`), extra_price (e.g. `560.00`)

**Plan**
- id, name, price, billing_period (`daily|weekly|monthly|yearly`), min_quantity, available_from, available_to
- auto_close (bool, closes itself at available_to), allow_early_close (bool), allow_pause (bool), allow_renew (bool)
- status (`active|paused|closed`)

**QuotationTemplate**
- id, name, plan (FK), validity_days

**QuotationTemplateLine**
- id, template (FK), product (FK), variant (FK, null), quantity, unit_price

### billing rules
**Tax**
- id, name, rate_percent, is_active

**Discount**
- id, name, type (`fixed|percent`), value
- min_purchase (null), min_quantity (null), start_date, end_date, usage_limit (null), times_used (default 0)
- applies_to (`product|subscription`), products (M2M Product, used when applies_to = product), is_active

### subscriptions
**Subscription**
- id, number (unique, auto, e.g. `SUB-00001`), customer (FK User), plan (FK), template (FK, null)
- start_date, expiry_date, payment_term_days (0, 15, 30...), next_invoice_date
- status (`draft|quotation|confirmed|active|closed`), created_by (FK User), created_at

**SubscriptionLine**
- id, subscription (FK), product (FK), variant (FK, null), quantity, unit_price, tax (FK, null), amount

### billing
**Invoice**
- id, number (unique, e.g. `INV-00001`), subscription (FK), customer (FK User)
- period_start, period_end, issue_date, due_date
- status (`draft|confirmed|paid|cancelled`), sent_at (null)
- subtotal, discount_total, tax_total, total, amount_paid
- discount (FK, null)
- **Constraint:** unique (subscription, period_start) where status != `cancelled`. This is what guarantees nothing is billed twice.

**InvoiceLine**
- id, invoice (FK), product (FK), description, quantity, unit_price, discount_amount, tax_rate_percent, tax_amount, amount

### payments
**Payment**
- id, invoice (FK), method (`cash|bank_transfer|upi|card|cheque`), amount, payment_date, note, recorded_by (FK User)

### Suggested indexes (two-second requirement)
- Subscription: status, customer, next_invoice_date
- Invoice: status, due_date, customer, subscription
- Payment: invoice, payment_date
- Always use `select_related` / `prefetch_related` on list endpoints and paginate.

---

## 3. Status flows

**Subscription:** `draft -> quotation -> confirmed -> active -> closed`
- Only these forward steps are allowed. Any other jump returns 400.
- Closing is also allowed from `confirmed` and `active`. (Edit here if you decide otherwise.)

**Invoice:** `draft -> confirmed -> paid`
- `cancelled` is allowed from `draft` or `confirmed` (not from `paid`).
- An invoice becomes `paid` automatically when the sum of its payments is at least its total.
- Only `confirmed` invoices can receive payments.

**Plan:** `active <-> paused`, `active|paused -> closed`
- Pause, close-early and renew are allowed only if the plan's `allow_*` flag is true.
- A plan with `auto_close = true` becomes `closed` on its own after `available_to`.

---

## 4. Business rules

1. **Invoice generation** (button): for every subscription with status `active` and `next_invoice_date <= as_of_date`, create one `draft` invoice for the period starting at `next_invoice_date`, then advance `next_invoice_date` by the plan's billing period. If an invoice for that (subscription, period) already exists, skip it. Run inside a transaction.
2. **Invoice amounts** are filled from the subscription: customer, lines, taxes, totals. Order of calculation: line amount = quantity x unit_price; apply an eligible discount; then tax on the discounted amount.
3. **Discounts** apply automatically to the next invoice when: today is within start_date and end_date, `times_used < usage_limit` (or no limit), and the minimum purchase and minimum quantity are met. It applies to the listed products or to the whole subscription, depending on `applies_to`. Increase `times_used` when an invoice using it is generated.
4. **Due date** = issue_date + subscription.payment_term_days.
5. **Overdue** = invoice is `confirmed`, `due_date < today`, and amount_paid < total.
6. **Outstanding** = total - amount_paid on non-cancelled invoices.
7. **Passwords:** more than 8 characters, with an uppercase letter, a lowercase letter and a special character. Emails are unique.
8. **Customers** can only read their own subscriptions and invoices. Never return other customers' data, even by ID.
9. **Only admin** can create staff and create or edit discounts, taxes, products and plans.

---

## 5. Endpoints

### Auth and accounts [A]

| Method | URL | Permission | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/signup/` | Public | `{name, email, password}` | 201 `{id, name, email, role: "customer"}` |
| POST | `/api/auth/login/` | Public | `{email, password}` | 200 `{token, user: {id, name, email, role}}` |
| POST | `/api/auth/logout/` | Any logged in | none | 204 |
| GET | `/api/auth/me/` | Any logged in | none | `{id, name, email, role}` |
| POST | `/api/auth/password-reset/` | Public | `{email}` | 200 `{detail: "If the email exists, a reset link was sent."}` (same response whether or not the email exists) |
| POST | `/api/auth/password-reset/confirm/` | Public | `{uid, token, new_password}` | 200 `{detail: "Password updated."}` |
| POST | `/api/staff/` | Admin | `{name, email, password}` | 201 user with role `staff` |
| GET | `/api/staff/` | Admin | none | paginated users with role `staff` |
| GET | `/api/customers/` | Staff+ | `?search=` | paginated users with role `customer` |

### Catalog [A]

| Method | URL | Permission | Notes |
|---|---|---|---|
| GET | `/api/products/` | Staff+ | `?search=&page=`. Each item includes `variants: [...]` |
| POST | `/api/products/` | Admin | `{name, type, sales_price, cost_price, notes, default_tax, variants: [{attribute, value, extra_price}]}` |
| GET/PUT/DELETE | `/api/products/{id}/` | GET Staff+, others Admin | |
| GET | `/api/plans/` | Staff+ | `?status=&billing_period=` |
| POST | `/api/plans/` | Admin | `{name, price, billing_period, min_quantity, available_from, available_to, auto_close, allow_early_close, allow_pause, allow_renew}` |
| GET/PUT/DELETE | `/api/plans/{id}/` | GET Staff+, others Admin | |
| POST | `/api/plans/{id}/pause/` | Admin | 400 if `allow_pause` is false |
| POST | `/api/plans/{id}/resume/` | Admin | |
| POST | `/api/plans/{id}/close/` | Admin | 400 if `allow_early_close` is false |
| POST | `/api/plans/{id}/renew/` | Admin | `{available_to}` new end date. 400 if `allow_renew` is false |
| GET/POST | `/api/quotation-templates/` | GET Staff+, POST Admin | `{name, plan, validity_days, lines: [{product, variant, quantity, unit_price}]}` |
| GET/PUT/DELETE | `/api/quotation-templates/{id}/` | GET Staff+, others Admin | |

### Taxes and discounts (rules managed by [A], applied by [B])

| Method | URL | Permission | Body |
|---|---|---|---|
| GET | `/api/taxes/` | Staff+ | |
| POST/PUT/DELETE | `/api/taxes/` and `/api/taxes/{id}/` | Admin | `{name, rate_percent, is_active}` |
| GET | `/api/discounts/` | Staff+ | |
| POST/PUT/DELETE | `/api/discounts/` and `/api/discounts/{id}/` | Admin | `{name, type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, applies_to, products: [ids], is_active}` |

### Subscriptions [B]

| Method | URL | Permission | Notes |
|---|---|---|---|
| GET | `/api/subscriptions/` | Customer-own | `?status=&customer=&search=&page=` |
| POST | `/api/subscriptions/` | Staff+ | `{customer, plan, start_date, expiry_date, payment_term_days, template_id (optional), lines: [{product, variant, quantity, unit_price, tax}]}`. If `template_id` is given and `lines` is empty, copy the template's lines. Creates in `draft`. |
| GET | `/api/subscriptions/{id}/` | Customer-own | Includes `lines` and `status` |
| PUT/PATCH | `/api/subscriptions/{id}/` | Staff+ | Only while status is `draft` |
| POST | `/api/subscriptions/{id}/transition/` | Staff+ | `{to: "quotation"|"confirmed"|"active"|"closed"}`. 400 `{detail: "Cannot move from X to Y"}` on an invalid jump. |

Subscription JSON example:
```json
{
  "id": 7, "number": "SUB-00007", "status": "active",
  "customer": {"id": 12, "name": "Asha Traders", "email": "asha@example.com"},
  "plan": {"id": 3, "name": "Pro Monthly", "billing_period": "monthly"},
  "start_date": "2026-11-01", "expiry_date": "2027-10-31",
  "payment_term_days": 15, "next_invoice_date": "2026-12-01",
  "lines": [
    {"id": 21, "product": 4, "variant": 9, "quantity": 5,
     "unit_price": "1560.00", "tax": 1, "amount": "7800.00"}
  ]
}
```

### Invoices [B]

| Method | URL | Permission | Notes |
|---|---|---|---|
| GET | `/api/invoices/` | Customer-own | `?status=&customer=&subscription=&overdue=true&from=&to=&page=` |
| GET | `/api/invoices/{id}/` | Customer-own | Includes `lines` and `payments` |
| POST | `/api/invoices/generate/` | Staff+ | `{as_of_date}` (optional, defaults to today). Returns `{created: 14, skipped: 3, invoice_ids: [..]}` |
| POST | `/api/invoices/{id}/confirm/` | Staff+ | `draft -> confirmed` |
| POST | `/api/invoices/{id}/cancel/` | Staff+ | from `draft` or `confirmed` |
| POST | `/api/invoices/{id}/send/` | Staff+ | Sets `sent_at`. Emails the customer if email is configured. |

Printing: the frontend prints the invoice detail page with a print stylesheet (`window.print()`). No endpoint needed.

Invoice JSON example:
```json
{
  "id": 31, "number": "INV-00031", "status": "confirmed",
  "subscription": 7, "customer": {"id": 12, "name": "Asha Traders"},
  "period_start": "2026-12-01", "period_end": "2026-12-31",
  "issue_date": "2026-12-01", "due_date": "2026-12-16",
  "subtotal": "7800.00", "discount_total": "780.00", "tax_total": "1263.60",
  "total": "8283.60", "amount_paid": "0.00",
  "lines": [
    {"id": 90, "product": 4, "description": "Pro seats (Odoo brand)", "quantity": 5,
     "unit_price": "1560.00", "discount_amount": "780.00",
     "tax_rate_percent": "18.00", "tax_amount": "1263.60", "amount": "7283.60"}
  ]
}
```

### Payments [A], calls a helper written by [B]

| Method | URL | Permission | Notes |
|---|---|---|---|
| POST | `/api/payments/` | Staff+ | `{invoice, method, amount, payment_date, note}`. 400 if the invoice is not `confirmed` or the amount exceeds the outstanding balance. After saving, call `billing.services.apply_payment(invoice)`, which updates `amount_paid` and sets `paid` when fully covered. Returns 201 payment and the updated invoice status. |
| GET | `/api/payments/` | Staff+ | `?invoice=&method=&from=&to=&page=` |

### Reports [B]

| Method | URL | Permission | Returns |
|---|---|---|---|
| GET | `/api/reports/summary/` | Staff+ | `?from=&to=` returns `{active_subscriptions, total_invoiced, revenue_received, outstanding, overdue_count, overdue_amount}` |
| GET | `/api/reports/overdue-invoices/` | Staff+ | paginated invoices that are overdue, with `days_overdue` |
| GET | `/api/reports/revenue-by-month/` | Staff+ | `[{month: "2026-11", invoiced: "...", received: "..."}]` (optional, for a chart) |

Other filters for the finance view (active subscriptions, payments) reuse the list endpoints above with their filters.

---

## 6. Open decisions (settle in the first 30 minutes)

- [ ] Token auth (as written) or JWT? Token is built into DRF, so it is the default here.
- [ ] Customer role: can staff create customer accounts, or only self-signup? (Currently: both work.)
- [ ] Which tax rates to seed? (e.g. GST 5%, 12%, 18%)
- [ ] Email for password reset and invoice send: Gmail SMTP app password, or a local mail catcher for the demo.
- [ ] Payment gateway: none. Payments are recorded manually. (Confirmed by the evaluator's answers: no need for online payment.)

## 7. Ownership of shared files

- `core/settings.py`, `core/urls.py`, `requirements.txt`: set up once at the start, then tell the other person before editing.
- `models.py` in every app: Person B only. Ask B for field changes.
- `.env`: never committed. Commit `.env.example` with placeholders.
