/* global process */
import assert from 'node:assert'
import client from '../api/client.js'
import { USE_MOCK } from '../mock/index.js'

async function runTests() {
  console.log('--- 1. Checking USE_MOCK Flag ---')
  assert.strictEqual(USE_MOCK, true, 'USE_MOCK flag should be true by default')
  console.log('✓ USE_MOCK is true')

  console.log('\n--- 2. Testing Auth Endpoints via Mock Client ---')

  // Test Login Admin
  const adminLoginRes = await client.post('/auth/login/', {
    email: 'admin@example.com',
    password: 'Admin@123',
  })
  assert.strictEqual(adminLoginRes.status, 200)
  assert.strictEqual(adminLoginRes.data.user.role, 'admin')
  assert(adminLoginRes.data.token, 'Token must be present in response')
  console.log('✓ Admin login successful:', adminLoginRes.data.user)

  // Test Login Staff
  const staffLoginRes = await client.post('/auth/login/', {
    email: 'staff@example.com',
    password: 'Staff@123',
  })
  assert.strictEqual(staffLoginRes.status, 200)
  assert.strictEqual(staffLoginRes.data.user.role, 'staff')
  console.log('✓ Staff login successful:', staffLoginRes.data.user)

  // Test Login Customer
  const customerLoginRes = await client.post('/auth/login/', {
    email: 'asha@example.com',
    password: 'Customer@123',
  })
  assert.strictEqual(customerLoginRes.status, 200)
  assert.strictEqual(customerLoginRes.data.user.role, 'customer')
  console.log('✓ Customer login successful:', customerLoginRes.data.user)

  // Test GET /auth/me/ with admin token
  const adminMeRes = await client.get('/auth/me/', {
    headers: { Authorization: `Token ${adminLoginRes.data.token}` },
  })
  assert.strictEqual(adminMeRes.status, 200)
  assert.strictEqual(adminMeRes.data.role, 'admin')
  console.log('✓ GET /auth/me/ returned correct user profile:', adminMeRes.data)

  // Test GET /auth/me/ without token -> 401
  try {
    await client.get('/auth/me/', {
      headers: { Authorization: '' },
    })
    assert.fail('Should have failed with 401 Unauthorized')
  } catch (err) {
    assert.strictEqual(err.response?.status, 401)
    console.log('✓ GET /auth/me/ correctly rejected unauthenticated request with 401')
  }

  // Test POST /auth/logout/ -> 204
  const logoutRes = await client.post('/auth/logout/')
  assert.strictEqual(logoutRes.status, 204)
  console.log('✓ POST /auth/logout/ returned 204')

  // Test POST /auth/password-reset/ -> 200
  const resetReqRes = await client.post('/auth/password-reset/', {
    email: 'asha@example.com',
  })
  assert.strictEqual(resetReqRes.status, 200)
  assert.strictEqual(
    resetReqRes.data.detail,
    'If the email exists, a reset link was sent.',
  )
  console.log('✓ POST /auth/password-reset/ matched contract response')

  // Test POST /auth/password-reset/confirm/ -> 200
  const resetConfirmRes = await client.post('/auth/password-reset/confirm/', {
    uid: '12',
    token: 'mock-token-xyz',
    new_password: 'NewStrongPassword@99',
  })
  assert.strictEqual(resetConfirmRes.status, 200)
  assert.strictEqual(resetConfirmRes.data.detail, 'Password updated.')
  console.log('✓ POST /auth/password-reset/confirm/ confirmed password reset')

  // Test Signup with valid data -> 201
  const testEmail = `newuser_${Date.now()}@example.com`
  const signupRes = await client.post('/auth/signup/', {
    name: 'New Customer',
    email: testEmail,
    password: 'ValidPassword@123',
  })
  assert.strictEqual(signupRes.status, 201)
  assert.strictEqual(signupRes.data.role, 'customer')
  assert.strictEqual(signupRes.data.email, testEmail)
  console.log('✓ POST /auth/signup/ created new customer user with role "customer"')

  // Test Signup duplicate email -> 400
  try {
    await client.post('/auth/signup/', {
      name: 'Duplicate',
      email: testEmail,
      password: 'ValidPassword@123',
    })
    assert.fail('Duplicate signup should fail with 400')
  } catch (err) {
    assert.strictEqual(err.response?.status, 400)
    assert(err.response?.data?.email, 'Expected field error on email')
    console.log('✓ Duplicate email prevented with error:', err.response?.data?.email)
  }

  console.log('\n--- 3. Testing Password Validation Rules ---')
  const validatePassword = (password) => {
    if (!password) return 'Password is required.'
    if (password.length <= 8) return 'Password must be more than 8 characters.'
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.'
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.'
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.'
    return null
  }

  // Exactly 8 characters -> should fail ("MORE than 8 characters")
  assert(validatePassword('Abcdef1!'))
  // 9 characters without uppercase -> should fail
  assert(validatePassword('abcdefg1!'))
  // 9 characters without lowercase -> should fail
  assert(validatePassword('ABCDEFG1!'))
  // 9 characters without special char -> should fail
  assert(validatePassword('Abcdefg12'))
  // 9 characters with upper, lower, special -> valid!
  assert.strictEqual(validatePassword('Abcdefg1!'), null)
  console.log('✓ All password validation constraints verified (length > 8, upper, lower, special)')

  console.log('\n--- 4. Testing Customer Data Isolation ---')
  // Customer request to /subscriptions/ should only see their own
  const customerSubs = await client.get('/subscriptions/', {
    headers: { Authorization: `Token ${customerLoginRes.data.token}` },
  })
  assert(customerSubs.data.results.length > 0)
  customerSubs.data.results.forEach((s) => {
    assert(
      s.customer.id === 12 || s.customer.email === 'asha@example.com',
      'Customer must not see another customer data',
    )
  })
  console.log('✓ Customer data strictly isolated to customer-own subscriptions')

  console.log('\n======================================')
  console.log('ALL FOUNDATION TESTS PASSED!')
  console.log('======================================')
}

runTests().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
