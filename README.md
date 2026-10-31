# Subscription Management System

Subscription Management System for Brightloop Software (Django REST backend + React frontend).

---

## Tech Stack

- **Backend**: Python, Django 6, Django REST Framework (DRF)
- **Database**: SQLite
- **CORS**: `django-cors-headers`
- **Frontend**: React 19, Vite, React Router, Material UI (MUI), Axios

---

## Features

### Accounts & Authentication
- **Role-Based Access Control (RBAC)**: Distinct permissions for `admin`, `staff`, and `customer`.
- **Token Authentication**: Secure token-based API authentication via Django REST Framework.
- **Strict Password Rules**: Enforces minimum 9 characters, uppercase, lowercase, numbers, and special characters.
- **Password Reset via Email Link**: Generates a secure UID/token password reset link pointing to the React frontend (`/reset-password?uid=...&token=...`) with a 1-hour expiration.

### Catalog
- **Products & Variants**: Products with sales prices, cost prices, default taxes, and attribute variants with extra pricing (e.g., storage capacity, user tiers).
- **Recurring Plans**: Daily, weekly, monthly, and yearly billing frequencies. Lifecycle controls for pause, resume, close, and renew, plus automatic closing for expired plans past `available_to`.
- **Quotation Templates**: Predefined reusable plan configurations with default product line items and validity periods.
- **Taxes**: Configurable tax rates (e.g., GST 5%, GST 12%, GST 18%) calculated on invoice lines.
- **Discounts**: Fixed and percentage-based discounts with date validity, usage limits, and minimum spend/quantity conditions applied to products or subscriptions.

### Subscriptions
- **Strict Status Lifecycle**: Linear state transitions:
  Draft → Quotation → Confirmed → Active → Closed
- **Sequential Numbering**: Automatic generation of unique subscription identifiers (`SUB-XXXXX`).
- **Server-Computed Totals**: Subtotals, line-level taxes, and total amounts calculated strictly on the backend.
- **Nested Line Items**: Full support for lines tied to products, variants, and optional custom tax rates.

### Billing & Invoicing
- **Automatic Invoice Generation**: Generates draft invoices for active subscriptions due on or before a specified date.
- **Never Billed Twice**: Enforces non-overlapping billing periods per subscription so customers are never billed twice for the same timeframe.
- **Automatic Discount & Tax Calculations**: Matches eligible active discounts and applies appropriate tax rates on discounted line amounts.
- **Sequential Invoice Numbering**: Unique identifiers formatted as `INV-XXXXX`.
- **Invoice Lifecycle**: Transitions across `draft`, `confirmed`, `paid`, and `cancelled` states. Supports sending email notifications and print-ready representations.
- **Payment Processing**: Record payments against confirmed invoices (Cash, Bank Transfer, UPI, Card, Cheque) with balance tracking and automatic transition to `paid`.

### Finance Dashboard & Reports
- **Real-Time Financial Metrics**: Aggregated metrics for active subscriptions, total revenue, outstanding balances, and overdue invoices.
- **Granular Reports**: Dedicated endpoints and visual reports for Revenue, Subscription Status breakdowns, and Aging Receivables.

---

## Project Structure

```text
odoo-Hackathon/
├── backend/                  # Django REST Framework backend
│   ├── manage.py             # Django CLI runner
│   ├── requirements.txt      # Python dependencies
│   ├── core/                 # Project configuration, URLs, reports, and seed commands
│   ├── accounts/             # User model, RBAC, auth views, password validation/reset
│   ├── catalog/              # Products, variants, plans, templates, taxes, discounts
│   ├── subscriptions/        # Subscription state machine, line items, transitions
│   └── billing/              # Invoices, bulk generation services, payments
├── frontend/                 # React single-page application (Vite)
│   ├── src/                  # React source code (components, pages, API client)
│   └── package.json          # Node.js dependencies and scripts
├── docs/                     # Project documentation and API contract
│   └── api.md                # REST API specifications and contract
└── README.md                 # Project documentation
```

### Backend App Roles
- **`core`**: Global Django settings, root routing (`core.urls`), custom exception handlers, report endpoints (`report_views.py`), end-to-end integration tests (`test_flow.py`), and database seeding (`core/management/commands/seed.py`).
- **`accounts`**: Custom email-based User model, authentication endpoints (`signup`, `login`, `logout`, `me`), staff management, customer listings, and password reset workflows.
- **`catalog`**: Manages the product catalog, product variants, recurring billing plans, quotation templates, tax rates, and discount rules.
- **`subscriptions`**: Handles subscription records, nested line items, lifecycle status transitions, and renewal schedules.
- **`billing`**: Handles invoice generation, discount application, invoice lifecycle transitions, payment recording, and customer email alerts.

---

## Backend Setup (Windows cmd)

From the project root folder in Windows Command Prompt (`cmd`):

```cmd
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py seed
python manage.py runserver 8080
```

The Django REST API will run at `http://localhost:8080/`.

---

## Frontend Setup

In a separate terminal, navigate to the `frontend` directory:

```cmd
cd frontend
npm install
```

Create a `.env` file in the `frontend/` directory (`frontend/.env`):

```env
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:8080/api
```

Start the Vite development server:

```cmd
npm run dev
```

The frontend application will be accessible at `http://localhost:5173/`.

---

## Environment Variables

The backend uses the following environment variables (with sensible defaults for local development):

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `FRONTEND_URL` | `http://localhost:5173` | Base frontend URL used when generating password reset links. |
| `EMAIL_HOST_USER` | `""` (Empty) | When provided, the backend enables SMTP email sending via `smtp.gmail.com:587` with TLS. |
| `EMAIL_HOST_PASSWORD` | `""` (Empty) | App password for Gmail SMTP authentication. |

> [!NOTE]
> By default, `EMAIL_HOST_USER` is not set, so Django uses the console email backend (`django.core.mail.backends.console.EmailBackend`). All password reset and notification emails print directly to the terminal running the backend server.

---

## Demo Logins

The `python manage.py seed` command initializes the following demo accounts:

| Role | Email | Password | Display Name |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@brightloop.com` | `BrightloopAdmin2026!` | Brightloop Administrator |
| **Staff** | `staff@brightloop.com` | `BrightloopStaff2026!` | Operations Staff |
| **Customer** | `asha@example.com` | `AshaCustomer2026!` | Asha Traders |
| **Customer** | `ravi@example.com` | `RaviCustomer2026!` | Ravi Enterprises |

---

## API Overview

Detailed API specifications, request/response schemas, validation rules, and error handling are documented in:

- [docs/api.md](docs/api.md)

---

## Running Tests

To run the full backend test suite, activate the virtual environment and execute:

```cmd
cd backend
python manage.py test --noinput
```

*(Note: The full test suite runs 110 tests across all apps and takes a few minutes to complete).*

---

## Team

- **Nikhitha** — Backend Architecture, Django REST Framework, Data Models & Business Logic
- **ThejaSri** — Frontend Development, React SPA, Material UI & User Workflows
