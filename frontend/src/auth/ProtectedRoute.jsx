import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import { useAuth } from './useAuth.js'

/**
 * Route wrapper that ensures authentication and role authorization.
 * Redirects unauthenticated users to /login and unauthorized roles to their home page.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, token, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '70vh',
        }}
      >
        <CircularProgress size={44} />
      </Box>
    )
  }

  // Redirect to /login if no valid token or user
  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Role authorization check
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    const fallbackPath = user.role === 'customer' ? '/my-subscriptions' : '/dashboard'
    return <Navigate to={fallbackPath} replace />
  }

  return children ? children : <Outlet />
}
