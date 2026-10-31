import { useState } from 'react'
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Container,
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Link,
  Divider,
  Chip,
  Stack,
  InputAdornment,
  IconButton,
} from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { useAuth } from '../../auth'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error on change
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }))
    }
    if (generalError) setGeneralError('')
  }

  const validate = () => {
    const errors = {}
    if (!formData.email.trim()) {
      errors.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address.'
    }

    if (!formData.password) {
      errors.password = 'Password is required.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setGeneralError('')

    try {
      const user = await login(formData.email, formData.password)
      const redirectPath =
        location.state?.from?.pathname ||
        (user.role === 'customer' ? '/my-subscriptions' : '/dashboard')
      navigate(redirectPath, { replace: true })
    } catch (err) {
      const serverData = err.response?.data
      if (serverData) {
        if (typeof serverData === 'object') {
          const newFieldErrors = {}
          Object.keys(serverData).forEach((key) => {
            if (key === 'detail' || key === 'non_field_errors') {
              setGeneralError(
                Array.isArray(serverData[key]) ? serverData[key][0] : serverData[key],
              )
            } else {
              newFieldErrors[key] = Array.isArray(serverData[key])
                ? serverData[key][0]
                : serverData[key]
            }
          })
          setFieldErrors(newFieldErrors)
        } else {
          setGeneralError('Invalid login credentials.')
        }
      } else {
        setGeneralError('Unable to connect to server. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Helper for 1-click test credentials during hackathon evaluation
  const handleQuickDemo = (email, password) => {
    setFormData({ email, password })
    setFieldErrors({})
    setGeneralError('')
  }

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          marginBottom: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            borderRadius: 2,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'white',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 1,
              }}
            >
              <LockOutlinedIcon />
            </Box>
            <Typography component="h1" variant="h5" fontWeight={600}>
              Sign In
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Subscription Management System
            </Typography>
          </Box>

          {generalError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {generalError}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={formData.email}
              onChange={handleChange}
              error={Boolean(fieldErrors.email)}
              helperText={fieldErrors.email}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, mb: 2 }}>
              <Link
                component={RouterLink}
                to="/forgot-password"
                variant="body2"
                underline="hover"
              >
                Forgot password?
              </Link>
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ py: 1.2, fontWeight: 600 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 2.5 }}>
              <Typography variant="body2" color="text.secondary">
                Don&apos;t have an account?{' '}
                <Link
                  component={RouterLink}
                  to="/signup"
                  variant="body2"
                  fontWeight={600}
                  underline="hover"
                >
                  Sign Up
                </Link>
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              DEMO ACCOUNTS (1-CLICK)
            </Typography>
          </Divider>

          <Stack direction="row" spacing={1} justifyContent="center">
            <Chip
              label="Admin"
              color="primary"
              size="small"
              clickable
              onClick={() => handleQuickDemo('admin@example.com', 'Admin@123')}
            />
            <Chip
              label="Staff"
              color="info"
              size="small"
              clickable
              onClick={() => handleQuickDemo('staff@example.com', 'Staff@123')}
            />
            <Chip
              label="Customer"
              color="success"
              size="small"
              clickable
              onClick={() => handleQuickDemo('asha@example.com', 'Customer@123')}
            />
          </Stack>
        </Paper>
      </Box>
    </Container>
  )
}

