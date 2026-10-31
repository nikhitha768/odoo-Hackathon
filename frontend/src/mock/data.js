/**
 * Mock data shaped exactly like the examples and schemas in api.md.
 * Used when USE_MOCK is true until the backend is fully connected.
 */

export const mockUsers = [
  {
    id: 1,
    name: 'Admin Manager',
    email: 'admin@example.com',
    role: 'admin',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Staff Member',
    email: 'staff@example.com',
    role: 'staff',
    is_active: true,
    created_at: '2026-01-05T00:00:00Z',
  },
  {
    id: 12,
    name: 'Asha Traders',
    email: 'asha@example.com',
    role: 'customer',
    is_active: true,
    created_at: '2026-02-10T00:00:00Z',
  },
]

export const mockProducts = [
  {
    id: 4,
    name: 'Pro CRM Seat',
    type: 'service',
    sales_price: '1560.00',
    cost_price: '800.00',
    notes: 'Single user license for enterprise CRM',
    default_tax: 1,
    is_active: true,
    variants: [
      {
        id: 9,
        product: 4,
        attribute: 'Brand',
        value: 'Odoo',
        extra_price: '560.00',
      },
    ],
  },
  {
    id: 5,
    name: 'Standard ERP Module',
    type: 'goods',
    sales_price: '3200.00',
    cost_price: '1800.00',
    notes: 'Base ERP module pack',
    default_tax: 1,
    is_active: true,
    variants: [],
  },
]

export const mockPlans = [
  {
    id: 3,
    name: 'Pro Monthly',
    price: '1560.00',
    billing_period: 'monthly',
    min_quantity: 1,
    available_from: '2026-01-01',
    available_to: '2027-12-31',
    auto_close: false,
    allow_early_close: true,
    allow_pause: true,
    allow_renew: true,
    status: 'active',
  },
  {
    id: 4,
    name: 'Enterprise Yearly',
    price: '15000.00',
    billing_period: 'yearly',
    min_quantity: 5,
    available_from: '2026-01-01',
    available_to: '2027-12-31',
    auto_close: false,
    allow_early_close: true,
    allow_pause: true,
    allow_renew: true,
    status: 'active',
  },
]

export const mockTemplates = [
  {
    id: 1,
    name: 'Standard CRM Package',
    plan: 3,
    validity_days: 30,
    lines: [
      {
        id: 1,
        product: 4,
        variant: 9,
        quantity: 5,
        unit_price: '1560.00',
      },
    ],
  },
]

export const mockTaxes = [
  {
    id: 1,
    name: 'GST 18%',
    rate_percent: '18.00',
    is_active: true,
  },
  {
    id: 2,
    name: 'GST 5%',
    rate_percent: '5.00',
    is_active: true,
  },
  {
    id: 3,
    name: 'GST 12%',
    rate_percent: '12.00',
    is_active: true,
  },
]

export const mockDiscounts = [
  {
    id: 1,
    name: 'Annual Prepay 10%',
    type: 'percent',
    value: '10.00',
    min_purchase: '5000.00',
    min_quantity: 1,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    usage_limit: 100,
    times_used: 12,
    applies_to: 'subscription',
    products: [],
    is_active: true,
  },
]

export const mockSubscriptions = [
  {
    id: 7,
    number: 'SUB-00007',
    status: 'active',
    customer: {
      id: 12,
      name: 'Asha Traders',
      email: 'asha@example.com',
    },
    plan: {
      id: 3,
      name: 'Pro Monthly',
      billing_period: 'monthly',
    },
    start_date: '2026-11-01',
    expiry_date: '2027-10-31',
    payment_term_days: 15,
    next_invoice_date: '2026-12-01',
    lines: [
      {
        id: 21,
        product: 4,
        variant: 9,
        quantity: 5,
        unit_price: '1560.00',
        tax: 1,
        amount: '7800.00',
      },
    ],
  },
]

export const mockInvoices = [
  {
    id: 31,
    number: 'INV-00031',
    status: 'confirmed',
    subscription: 7,
    customer: {
      id: 12,
      name: 'Asha Traders',
    },
    period_start: '2026-12-01',
    period_end: '2026-12-31',
    issue_date: '2026-12-01',
    due_date: '2026-12-16',
    subtotal: '7800.00',
    discount_total: '780.00',
    tax_total: '1263.60',
    total: '8283.60',
    amount_paid: '0.00',
    lines: [
      {
        id: 90,
        product: 4,
        description: 'Pro seats (Odoo brand)',
        quantity: 5,
        unit_price: '1560.00',
        discount_amount: '780.00',
        tax_rate_percent: '18.00',
        tax_amount: '1263.60',
        amount: '7283.60',
      },
    ],
  },
]

export const mockPayments = [
  {
    id: 1,
    invoice: 31,
    method: 'bank_transfer',
    amount: '8283.60',
    payment_date: '2026-12-05',
    note: 'Initial bank transfer',
    recorded_by: 2,
  },
]

export const mockReportsSummary = {
  active_subscriptions: 12,
  total_invoiced: '45200.00',
  revenue_received: '36916.40',
  outstanding: '8283.60',
  overdue_count: 1,
  overdue_amount: '8283.60',
}

