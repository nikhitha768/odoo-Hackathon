import {
  mockUsers,
  mockProducts,
  mockPlans,
  mockTemplates,
  mockTaxes,
  mockDiscounts,
  mockSubscriptions,
  mockInvoices,
  mockPayments,
  mockReportsSummary,
} from './data.js'

/**
 * Creates an Axios-compatible error response matching DRF convention.
 */
function createAxiosError(status, data, config) {
  const message = `Request failed with status code ${status}`
  const error = new Error(message)
  error.name = 'AxiosError'
  error.isAxiosError = true
  error.config = config
  error.response = {
    data,
    status,
    statusText: status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : 'Forbidden',
    headers: {},
    config,
  }
  return error
}

/**
 * Normalizes URL path regardless of whether baseURL or leading/trailing slashes are present.
 */
function normalizePath(url) {
  let path = url || ''
  path = path.replace(/^https?:\/\/[^/]+/i, '')
  path = path.split('?')[0]
  if (!path.startsWith('/')) path = '/' + path
  path = path.replace(/^\/api\/api\//, '/api/')
  if (!path.startsWith('/api/')) {
    path = '/api' + path
  }
  if (!path.endsWith('/')) {
    path = path + '/'
  }
  return path
}

/**
 * In-memory state for mock sessions and dynamically created entities.
 */
let dynamicUsers = [...mockUsers]
let dynamicSubscriptions = JSON.parse(JSON.stringify(mockSubscriptions))
let dynamicInvoices = JSON.parse(JSON.stringify(mockInvoices))
let dynamicPayments = JSON.parse(JSON.stringify(mockPayments))

/**
 * Custom Axios adapter that mocks API responses according to api.md contract.
 */
export async function mockAdapter(config) {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 80))

  const method = (config.method || 'get').toUpperCase()
  const rawUrl = config.url || ''
  const path = normalizePath(rawUrl)
  const authHeader = config.headers?.Authorization || ''
  const token = authHeader.replace(/^Token\s+/i, '').trim()

  // Parse query params from URL or config.params
  let queryParams = {}
  if (config.params) {
    queryParams = { ...config.params }
  }
  if (rawUrl.includes('?')) {
    const qStr = rawUrl.split('?')[1]
    const searchParams = new URLSearchParams(qStr)
    searchParams.forEach((val, key) => {
      queryParams[key] = val
    })
  }

  let body = {}
  if (config.data) {
    try {
      body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    } catch {
      body = {}
    }
  }

  // Determine user by token
  let currentUser = null
  if (token) {
    if (token.startsWith('mock-token-admin')) {
      currentUser = dynamicUsers.find((u) => u.role === 'admin') || dynamicUsers[0]
    } else if (token.startsWith('mock-token-staff')) {
      currentUser = dynamicUsers.find((u) => u.role === 'staff') || dynamicUsers[1]
    } else if (token.startsWith('mock-token-customer')) {
      currentUser = dynamicUsers.find((u) => u.role === 'customer') || dynamicUsers[2]
    } else {
      const matched = dynamicUsers.find((u) => String(u.id) === token.replace('mock-token-', ''))
      currentUser = matched || dynamicUsers[0]
    }
  }

  // --- Auth endpoints ---

  // POST /api/auth/login/
  if (path === '/api/auth/login/' && method === 'POST') {
    const { email, password } = body
    if (!email || !password) {
      throw createAxiosError(400, { non_field_errors: ['Must include "email" and "password".'] }, config)
    }

    const found = dynamicUsers.find((u) => u.email.toLowerCase() === email.toLowerCase())
    if (!found) {
      throw createAxiosError(400, { non_field_errors: ['Unable to log in with provided credentials.'] }, config)
    }

    let tokenStr = `mock-token-${found.role}-${found.id}`
    return {
      data: {
        token: tokenStr,
        user: {
          id: found.id,
          name: found.name,
          email: found.email,
          role: found.role,
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }

  // POST /api/auth/signup/
  if (path === '/api/auth/signup/' && method === 'POST') {
    const { name, email, password } = body
    const errors = {}

    if (!name || !name.trim()) {
      errors.name = ['This field may not be blank.']
    }

    if (!email || !email.trim()) {
      errors.email = ['This field may not be blank.']
    } else if (dynamicUsers.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      errors.email = ['A user with this email already exists.']
    }

    if (!password) {
      errors.password = ['This field may not be blank.']
    } else if (password.length <= 8) {
      errors.password = ['Password must be more than 8 characters.']
    } else if (!/[A-Z]/.test(password)) {
      errors.password = ['Password must contain at least one uppercase letter.']
    } else if (!/[a-z]/.test(password)) {
      errors.password = ['Password must contain at least one lowercase letter.']
    } else if (!/[^A-Za-z0-9]/.test(password)) {
      errors.password = ['Password must contain at least one special character.']
    }

    if (Object.keys(errors).length > 0) {
      throw createAxiosError(400, errors, config)
    }

    const newUser = {
      id: dynamicUsers.length + 1,
      name: name.trim(),
      email: email.trim(),
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString(),
    }
    dynamicUsers.push(newUser)

    return {
      data: newUser,
      status: 201,
      statusText: 'Created',
      headers: {},
      config,
    }
  }

  // GET /api/auth/me/
  if (path === '/api/auth/me/' && method === 'GET') {
    if (!currentUser) {
      throw createAxiosError(401, { detail: 'Authentication credentials were not provided.' }, config)
    }
    return {
      data: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }

  // POST /api/auth/logout/
  if (path === '/api/auth/logout/' && method === 'POST') {
    return {
      data: null,
      status: 204,
      statusText: 'No Content',
      headers: {},
      config,
    }
  }

  // POST /api/auth/password-reset/
  if (path === '/api/auth/password-reset/' && method === 'POST') {
    return {
      data: { detail: 'If the email exists, a reset link was sent.' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }

  // POST /api/auth/password-reset/confirm/
  if (path === '/api/auth/password-reset/confirm/' && method === 'POST') {
    const { uid, token: resetToken, new_password } = body
    if (!uid || !resetToken) {
      throw createAxiosError(400, { detail: 'Invalid or missing reset token.' }, config)
    }
    if (!new_password || new_password.length <= 8) {
      throw createAxiosError(
        400,
        { new_password: ['Password must be more than 8 characters with upper, lower and special characters.'] },
        config,
      )
    }
    return {
      data: { detail: 'Password updated.' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }

  // Helper for pagination
  const paginate = (items) => {
    const page = parseInt(queryParams.page || 1, 10)
    const pageSize = 10
    const start = (page - 1) * pageSize
    const pagedItems = items.slice(start, start + pageSize)
    return {
      count: items.length,
      next: start + pageSize < items.length ? `?page=${page + 1}` : null,
      previous: page > 1 ? `?page=${page - 1}` : null,
      results: pagedItems,
    }
  }

  // --- Subscriptions endpoints ---

  // POST /api/subscriptions/:id/transition/
  const transitionMatch = path.match(/^\/api\/subscriptions\/(\d+)\/transition\/$/)
  if (transitionMatch && method === 'POST') {
    const subId = parseInt(transitionMatch[1], 10)
    const sub = dynamicSubscriptions.find((s) => s.id === subId)
    if (!sub) {
      throw createAxiosError(404, { detail: 'Not found.' }, config)
    }
    const targetStatus = (body.to || body.status || '').toLowerCase().trim()
    const allowed = {
      draft: ['quotation'],
      quotation: ['confirmed'],
      confirmed: ['active', 'closed'],
      active: ['closed'],
      closed: [],
    }
    if (!allowed[sub.status]?.includes(targetStatus)) {
      throw createAxiosError(400, { detail: `Cannot move from ${sub.status} to ${targetStatus}` }, config)
    }
    sub.status = targetStatus
    return { data: sub, status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/subscriptions/:id/
  const subDetailMatch = path.match(/^\/api\/subscriptions\/(\d+)\/$/)
  if (subDetailMatch && method === 'GET') {
    const subId = parseInt(subDetailMatch[1], 10)
    const sub = dynamicSubscriptions.find((s) => s.id === subId)
    if (!sub) {
      throw createAxiosError(404, { detail: 'Not found.' }, config)
    }
    return { data: sub, status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/subscriptions/
  if (path === '/api/subscriptions/' && method === 'GET') {
    let items = [...dynamicSubscriptions]
    if (currentUser?.role === 'customer') {
      items = items.filter((s) => s.customer.id === currentUser.id || s.customer.email === currentUser.email)
    }
    if (queryParams.customer) {
      items = items.filter((s) => String(s.customer.id) === String(queryParams.customer))
    }
    if (queryParams.status && queryParams.status !== 'all') {
      items = items.filter((s) => s.status === queryParams.status)
    }
    if (queryParams.search) {
      const q = queryParams.search.toLowerCase()
      items = items.filter(
        (s) =>
          s.number.toLowerCase().includes(q) ||
          s.customer.name.toLowerCase().includes(q) ||
          s.plan.name.toLowerCase().includes(q),
      )
    }
    return { data: paginate(items), status: 200, statusText: 'OK', headers: {}, config }
  }

  // POST /api/subscriptions/
  if (path === '/api/subscriptions/' && method === 'POST') {
    const customerObj = dynamicUsers.find((u) => String(u.id) === String(body.customer)) || {
      id: body.customer || 12,
      name: 'Selected Customer',
      email: 'customer@example.com',
    }
    const planObj = mockPlans.find((p) => String(p.id) === String(body.plan)) || mockPlans[0]
    const lines = (body.lines || []).map((l, idx) => {
      const product = mockProducts.find((p) => String(p.id) === String(l.product)) || mockProducts[0]
      const unitPrice = parseFloat(l.unit_price || product.sales_price || 0)
      const qty = parseInt(l.quantity || 1, 10)
      return {
        id: idx + 1,
        product: product.id,
        quantity: qty,
        unit_price: unitPrice.toFixed(2),
        tax: l.tax || null,
        amount: (unitPrice * qty).toFixed(2),
      }
    })
    const subtotal = lines.reduce((acc, cur) => acc + parseFloat(cur.amount), 0)
    const taxTotal = subtotal * 0.18
    const total = subtotal + taxTotal

    const newSub = {
      id: dynamicSubscriptions.length + 1,
      number: `SUB-${String(dynamicSubscriptions.length + 1).padStart(5, '0')}`,
      status: 'draft',
      customer: { id: customerObj.id, name: customerObj.name, email: customerObj.email },
      plan: { id: planObj.id, name: planObj.name, billing_period: planObj.billing_period },
      template: body.template || null,
      start_date: body.start_date || new Date().toISOString().split('T')[0],
      expiry_date: body.expiry_date || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      payment_term_days: body.payment_term_days || 15,
      next_invoice_date: body.start_date || new Date().toISOString().split('T')[0],
      lines,
      subtotal: subtotal.toFixed(2),
      tax_total: taxTotal.toFixed(2),
      total: total.toFixed(2),
      created_at: new Date().toISOString(),
    }
    dynamicSubscriptions.unshift(newSub)
    return { data: newSub, status: 201, statusText: 'Created', headers: {}, config }
  }

  // --- Invoices endpoints ---

  // POST /api/invoices/generate/
  if (path === '/api/invoices/generate/' && method === 'POST') {
    return {
      data: {
        created: 2,
        skipped: 1,
        invoice_ids: [dynamicInvoices.length + 1, dynamicInvoices.length + 2],
        reasons: [{ subscription_id: 3, number: 'SUB-00003', reason: 'Already invoiced for this period' }],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }

  // POST /api/invoices/:id/confirm/
  const invoiceConfirmMatch = path.match(/^\/api\/invoices\/(\d+)\/confirm\/$/)
  if (invoiceConfirmMatch && method === 'POST') {
    const invId = parseInt(invoiceConfirmMatch[1], 10)
    const inv = dynamicInvoices.find((i) => i.id === invId)
    if (!inv) throw createAxiosError(404, { detail: 'Not found.' }, config)
    if (inv.status !== 'draft') {
      throw createAxiosError(400, { detail: `Cannot confirm invoice with status ${inv.status}` }, config)
    }
    inv.status = 'confirmed'
    return { data: inv, status: 200, statusText: 'OK', headers: {}, config }
  }

  // POST /api/invoices/:id/cancel/
  const invoiceCancelMatch = path.match(/^\/api\/invoices\/(\d+)\/cancel\/$/)
  if (invoiceCancelMatch && method === 'POST') {
    const invId = parseInt(invoiceCancelMatch[1], 10)
    const inv = dynamicInvoices.find((i) => i.id === invId)
    if (!inv) throw createAxiosError(404, { detail: 'Not found.' }, config)
    if (inv.status === 'paid' || inv.status === 'cancelled') {
      throw createAxiosError(400, { detail: `Cannot cancel invoice with status ${inv.status}` }, config)
    }
    inv.status = 'cancelled'
    return { data: inv, status: 200, statusText: 'OK', headers: {}, config }
  }

  // POST /api/invoices/:id/send/
  const invoiceSendMatch = path.match(/^\/api\/invoices\/(\d+)\/send\/$/)
  if (invoiceSendMatch && method === 'POST') {
    const invId = parseInt(invoiceSendMatch[1], 10)
    const inv = dynamicInvoices.find((i) => i.id === invId)
    if (!inv) throw createAxiosError(404, { detail: 'Not found.' }, config)
    inv.sent_at = new Date().toISOString()
    return { data: inv, status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/invoices/:id/
  const invoiceDetailMatch = path.match(/^\/api\/invoices\/(\d+)\/$/)
  if (invoiceDetailMatch && method === 'GET') {
    const invId = parseInt(invoiceDetailMatch[1], 10)
    const inv = dynamicInvoices.find((i) => i.id === invId)
    if (!inv) throw createAxiosError(404, { detail: 'Not found.' }, config)
    return { data: inv, status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/invoices/
  if (path === '/api/invoices/' && method === 'GET') {
    let items = [...dynamicInvoices]
    if (currentUser?.role === 'customer') {
      items = items.filter((inv) => inv.customer.id === currentUser.id)
    }
    if (queryParams.customer) {
      items = items.filter((inv) => String(inv.customer.id) === String(queryParams.customer))
    }
    if (queryParams.status && queryParams.status !== 'all') {
      items = items.filter((inv) => inv.status === queryParams.status)
    }
    if (queryParams.overdue === 'true' || queryParams.overdue === true) {
      items = items.filter((inv) => inv.is_overdue)
    }
    if (queryParams.search) {
      const q = queryParams.search.toLowerCase()
      items = items.filter(
        (inv) =>
          inv.number.toLowerCase().includes(q) ||
          inv.customer.name.toLowerCase().includes(q),
      )
    }
    return { data: paginate(items), status: 200, statusText: 'OK', headers: {}, config }
  }

  // --- Payments endpoints ---

  // POST /api/payments/
  if (path === '/api/payments/' && method === 'POST') {
    const invoiceId = body.invoice
    const inv = dynamicInvoices.find((i) => i.id === invoiceId)
    if (!inv) {
      throw createAxiosError(400, { invoice: ['Invoice does not exist.'] }, config)
    }
    if (inv.status !== 'confirmed') {
      throw createAxiosError(400, { invoice: ['Only confirmed invoices can receive payments.'] }, config)
    }
    const amount = parseFloat(body.amount || 0)
    const outstanding = parseFloat(inv.total) - parseFloat(inv.amount_paid)
    if (amount <= 0) {
      throw createAxiosError(400, { amount: ['Amount must be greater than zero.'] }, config)
    }
    if (amount > outstanding + 0.001) {
      throw createAxiosError(400, { amount: ['Amount exceeds the outstanding balance of the invoice.'] }, config)
    }

    const newPayment = {
      id: dynamicPayments.length + 1,
      invoice: inv.id,
      method: body.method || 'bank_transfer',
      amount: amount.toFixed(2),
      payment_date: body.payment_date || new Date().toISOString().split('T')[0],
      note: body.note || '',
      invoice_status: inv.status,
    }
    dynamicPayments.unshift(newPayment)

    inv.amount_paid = (parseFloat(inv.amount_paid) + amount).toFixed(2)
    if (parseFloat(inv.amount_paid) >= parseFloat(inv.total)) {
      inv.status = 'paid'
    }
    inv.payments = inv.payments || []
    inv.payments.push(newPayment)

    return { data: newPayment, status: 201, statusText: 'Created', headers: {}, config }
  }

  // GET /api/payments/
  if (path === '/api/payments/' && method === 'GET') {
    let items = [...dynamicPayments]
    if (queryParams.method && queryParams.method !== 'all') {
      items = items.filter((p) => p.method === queryParams.method)
    }
    if (queryParams.invoice) {
      items = items.filter((p) => String(p.invoice) === String(queryParams.invoice))
    }
    if (queryParams.from) {
      items = items.filter((p) => p.payment_date >= queryParams.from)
    }
    if (queryParams.to) {
      items = items.filter((p) => p.payment_date <= queryParams.to)
    }
    return { data: paginate(items), status: 200, statusText: 'OK', headers: {}, config }
  }

  // --- Catalog and other endpoints ---
  if (path === '/api/products/' && method === 'GET') {
    return { data: paginate(mockProducts), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (path === '/api/plans/' && method === 'GET') {
    return { data: paginate(mockPlans), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (path === '/api/quotation-templates/' && method === 'GET') {
    return { data: paginate(mockTemplates), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (path === '/api/taxes/' && method === 'GET') {
    return { data: paginate(mockTaxes), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (path === '/api/discounts/' && method === 'GET') {
    return { data: paginate(mockDiscounts), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (path === '/api/staff/' && method === 'GET') {
    const staffList = dynamicUsers.filter((u) => u.role === 'staff')
    return { data: paginate(staffList), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (path === '/api/customers/' && method === 'GET') {
    let customerList = dynamicUsers.filter((u) => u.role === 'customer')
    if (queryParams.search) {
      const q = queryParams.search.toLowerCase()
      customerList = customerList.filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
      )
    }
    return { data: paginate(customerList), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (path === '/api/reports/summary/' && method === 'GET') {
    return { data: mockReportsSummary, status: 200, statusText: 'OK', headers: {}, config }
  }

  // Default fallback
  return {
    data: { detail: 'Mock endpoint found', results: [] },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}
