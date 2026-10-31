import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, ProtectedRoute } from './auth'
import Layout from './components/Layout'

// Public Auth Pages
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'

// Protected Pages
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Plans from './pages/Plans'
import Templates from './pages/Templates'
import Taxes from './pages/Taxes'
import Discounts from './pages/Discounts'
import Subscriptions from './pages/Subscriptions'
import Invoices from './pages/Invoices'
import Payments from './pages/Payments'
import Staff from './pages/Staff'
import MySubscriptions from './pages/MySubscriptions'
import MyInvoices from './pages/MyInvoices'

/**
 * Directs authenticated users to their role-appropriate default page.
 */
function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'customer') return <Navigate to="/my-subscriptions" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public Authentication Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />

      {/* Protected App Routes wrapped by Layout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Default landing redirects based on user role */}
          <Route path="/" element={<HomeRedirect />} />

          {/* Shared Admin and Staff Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'staff']} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/payments" element={<Payments />} />
          </Route>

          {/* Admin Only Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/taxes" element={<Taxes />} />
            <Route path="/discounts" element={<Discounts />} />
            <Route path="/staff" element={<Staff />} />
          </Route>

          {/* Customer Only Routes */}
          <Route element={<ProtectedRoute allowedRoles={['customer']} />}>
            <Route path="/my-subscriptions" element={<MySubscriptions />} />
            <Route path="/my-invoices" element={<MyInvoices />} />
          </Route>
        </Route>
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
