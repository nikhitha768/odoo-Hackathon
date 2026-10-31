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
  // Strip origin if present (e.g. http://localhost:8000)
  path = path.replace(/^https?:\/\/[^/]+/i, '')
  // Strip query string
  path = path.split('?')[0]
  // Normalize leading slash
  if (!path.startsWith('/')) path = '/' + path
  // Strip redundant /api prefix if double-prepended
  path = path.replace(/^\/api\/api\//, '/api/')
  // Ensure starts with /api/
  if (!path.startsWith('/api/')) {
    path = '/api' + path
  }
  // Ensure ends with /
  if (!path.endsWith('/')) {
    path = path + '/'
  }
  return path
}

/**
 * In-memory state for mock sessions and dynamically created accounts.
 */
let dynamicUsers = [...mockUsers]

/**
 * Custom Axios adapter that mocks API responses according to api.md contract.
 */
export async function mockAdapter(config) {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 150))

  const method = (config.method || 'get').toUpperCase()
  const path = normalizePath(config.url)
  const authHeader = config.headers?.Authorization || ''
  const token = authHeader.replace(/^Token\s+/i, '').trim()

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
      throw createAxiosError(400, { detail: 'Email and password are required.' }, config)
    }

    const matchedUser = dynamicUsers.find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    )

    if (matchedUser) {
      const generatedToken = `mock-token-${matchedUser.role}-${matchedUser.id}`
      return {
        data: {
          token: generatedToken,
          user: {
            id: matchedUser.id,
            name: matchedUser.name,
            email: matchedUser.email,
            role: matchedUser.role,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    // Default fallback for quick demo logins if unknown email
    if (password.length > 5) {
      const newUser = {
        id: dynamicUsers.length + 10,
        name: email.split('@')[0],
        email: email,
        role: email.includes('admin') ? 'admin' : email.includes('staff') ? 'staff' : 'customer',
      }
      dynamicUsers.push(newUser)
      return {
        data: {
          token: `mock-token-${newUser.role}-${newUser.id}`,
          user: newUser,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    throw createAxiosError(400, { detail: 'Invalid email or password.' }, config)
  }

  // POST /api/auth/signup/
  if (path === '/api/auth/signup/' && method === 'POST') {
    const { name, email, password } = body
    const errors = {}

    if (!name || !name.trim()) errors.name = ['Name is required.']
    if (!email || !email.includes('@')) errors.email = ['Valid email is required.']
    if (!password || password.length <= 8) {
      errors.password = ['Password must be more than 8 characters.']
    }

    if (Object.keys(errors).length > 0) {
      throw createAxiosError(400, errors, config)
    }

    const existing = dynamicUsers.find((u) => u.email.toLowerCase() === email.toLowerCase())
    if (existing) {
      throw createAxiosError(400, { email: ['A user with this email already exists.'] }, config)
    }

    const newUser = {
      id: dynamicUsers.length + 10,
      name: name.trim(),
      email: email.trim(),
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString(),
    }
    dynamicUsers.push(newUser)

    return {
      data: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
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

  // --- Paginated list endpoints helper ---
  const paginate = (items) => ({
    count: items.length,
    next: null,
    previous: null,
    results: items,
  })

  // GET /api/subscriptions/
  if (path === '/api/subscriptions/' && method === 'GET') {
    let items = [...mockSubscriptions]
    if (currentUser?.role === 'customer') {
      items = items.filter((s) => s.customer.id === currentUser.id || s.customer.email === currentUser.email)
    }
    return { data: paginate(items), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/invoices/
  if (path === '/api/invoices/' && method === 'GET') {
    let items = [...mockInvoices]
    if (currentUser?.role === 'customer') {
      items = items.filter((inv) => inv.customer.id === currentUser.id)
    }
    return { data: paginate(items), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/products/
  if (path === '/api/products/' && method === 'GET') {
    return { data: paginate(mockProducts), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/plans/
  if (path === '/api/plans/' && method === 'GET') {
    return { data: paginate(mockPlans), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/quotation-templates/
  if (path === '/api/quotation-templates/' && method === 'GET') {
    return { data: paginate(mockTemplates), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/taxes/
  if (path === '/api/taxes/' && method === 'GET') {
    return { data: paginate(mockTaxes), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/discounts/
  if (path === '/api/discounts/' && method === 'GET') {
    return { data: paginate(mockDiscounts), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/payments/
  if (path === '/api/payments/' && method === 'GET') {
    return { data: paginate(mockPayments), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/staff/
  if (path === '/api/staff/' && method === 'GET') {
    const staffList = dynamicUsers.filter((u) => u.role === 'staff')
    return { data: paginate(staffList), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/customers/
  if (path === '/api/customers/' && method === 'GET') {
    const customerList = dynamicUsers.filter((u) => u.role === 'customer')
    return { data: paginate(customerList), status: 200, statusText: 'OK', headers: {}, config }
  }

  // GET /api/reports/summary/
  if (path === '/api/reports/summary/' && method === 'GET') {
    return { data: mockReportsSummary, status: 200, statusText: 'OK', headers: {}, config }
  }

  // Default fallback for any unmatched GET request
  return {
    data: { detail: 'Mock endpoint found', results: [] },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}
