# ODOO-HACKATHON

Odoo Hackathon 2026 - A Team Project built by NIKHITHA and THEJA

## Folder layout

- `backend/` - Django REST Framework backend application (`core`, `accounts`, `catalog`, `subscriptions`, `billing`), SQLite database, migrations, and management commands.
- `frontend/` - React frontend application.
- `docs/` - Project specifications, business rules, and API contracts (`api.md`).

## Backend setup

### 1. Installation & Local Server (Windows cmd)

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

The server will be available at `http://127.0.0.1:8080/`.

### 2. Demo Logins

The `seed` command initializes the following four demo accounts:

- **Admin**: `admin@brightloop.com` / `BrightloopAdmin2026!` (Role: admin, Brightloop Administrator)
- **Staff**: `staff@brightloop.com` / `BrightloopStaff2026!` (Role: staff, Operations Staff)
- **Customer 1**: `asha@example.com` / `AshaCustomer2026!` (Role: customer, Asha Traders)
- **Customer 2**: `ravi@example.com` / `RaviCustomer2026!` (Role: customer, Ravi Enterprises)

### 3. API Endpoint Groups

Every endpoint group currently configured in `backend/core/urls.py` and each app's routing:

- **Auth (`/api/auth/`)**: Handles signup, token login, token logout, current user profile (`/me`), and password reset request/confirmation (Public for signup, login, and password reset; Any authenticated user for logout and me).
- **Staff (`/api/staff/`)**: Lists staff members and creates new staff accounts (Admin only).
- **Customers (`/api/customers/`)**: Lists registered customers with search and pagination (Staff and Admin).
- **Products (`/api/products/`)**: Manages catalog products and their nested attribute variants (Staff and Admin can read; Admin only can create, update, or delete).
- **Plans (`/api/plans/`)**: Manages recurring subscription plans and lifecycle transitions via `/pause/`, `/resume/`, `/close/`, and `/renew/` (Staff and Admin can read; Admin only can create, update, delete, or perform actions).
- **Quotation Templates (`/api/quotation-templates/`)**: Manages reusable quote templates with predefined line items (Staff and Admin can read; Admin only can create, update, or delete).
- **Taxes (`/api/taxes/`)**: Manages tax rates applied to invoice line items (Staff and Admin can read; Admin only can create, update, or delete).
- **Discounts (`/api/discounts/`)**: Manages fixed and percentage discount rules applicable to products or subscriptions (Staff and Admin can read; Admin only can create, update, or delete).
- **Payments (`/api/payments/`)**: Records payments against confirmed invoices, invokes balance reconciliation, and filters payment records (Staff and Admin).

### 4. Running Tests

To run the automated test suite:

```cmd
cd backend
python manage.py test
```
