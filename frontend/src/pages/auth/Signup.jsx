import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Container,
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Link,
  InputAdornment,
  IconButton,
} from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined'
import { useAuth } from '../../auth'

export default function Signup() {
  const navigate = useNavigate()
  const { signup, login } = useAuth()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [generalError, setGeneralError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error for field on change
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }))
    }
    if (generalError) setGeneralError('')
  }

  /**
   * Browser validation for signup inputs:
   * - Name: required
   * - Email: valid format
   * - Password: MORE than 8 characters, uppercase, lowercase, special character
   */
  const validateForm = () => {
    const errors = {}

    // 1. Name validation
    if (!formData.name.trim()) {
      errors.name = 'Full name is required.'
    }

    // 2. Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email.trim()) {
      errors.email = 'Email address is required.'
    } else if (!emailRegex.test(formData.email)) {
      errors.email = 'Please enter a valid email address.'
    }

    // 3. Password validation: >8 chars, upper, lower, special
    const password = formData.password
    if (!password) {
      errors.password = 'Password is required.'
    } else if (password.length <= 8) {
      errors.password = 'Password must be more than 8 characters.'
    } else if (!/[A-Z]/.test(password)) {
      errors.password = 'Password must contain at least one uppercase letter.'
    } else if (!/[a-z]/.test(password)) {
      errors.password = 'Password must contain at least one lowercase letter.'
    } else if (!/[^A-Za-z0-9]/.test(password)) {
      errors.password = 'Password must contain at least one special character (!@#$%...).'
    }

    // 4. Confirm password validation
    if (formData.confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setLoading(true)
    setGeneralError('')
    setSuccessMessage('')

    try {
      // POST /api/auth/signup/ with { name, email, password }
      await signup(formData.name.trim(), formData.email.trim(), formData.password)
      setSuccessMessage('Account created successfully! Signing you in...')

      // Auto sign in and navigate to customer portal
      setTimeout(async () => {
        try {
          await login(formData.email.trim(), formData.password)
          navigate('/my-subscriptions', { replace: true })
        } catch {
          navigate('/login', { replace: true })
        }
      }, 1000)
    } catch (err) {
      const serverData = err.response?.data
      if (serverData && typeof serverData === 'object') {
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
        setGeneralError('Failed to create account. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 6,
          marginBottom: 6,
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
              <PersonAddOutlinedIcon />
            </Box>
            <Typography component="h1" variant="h5" fontWeight={600}>
              Create Account
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Join the Subscription Management System
            </Typography>
          </Box>

          {generalError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {generalError}
            </Alert>
          )}

          {successMessage && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {successMessage}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="name"
              label="Full Name"
              name="name"
              autoComplete="name"
              autoFocus
              value={formData.name}
              onChange={handleChange}
              error={Boolean(fieldErrors.name)}
              helperText={fieldErrors.name}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
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
              value={formData.password}
              onChange={handleChange}
              error={Boolean(fieldErrors.password)}
              helperText={
                fieldErrors.password ||
                'Must be >8 characters with uppercase, lowercase & special symbol'
              }
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

            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              error={Boolean(fieldErrors.confirmPassword)}
              helperText={fieldErrors.confirmPassword}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 2, py: 1.2, fontWeight: 600 }}
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 2.5 }}>
              <Typography variant="body2" color="text.secondary">
                Already have an account?{' '}
                <Link
                  component={RouterLink}
                  to="/login"
                  variant="body2"
                  fontWeight={600}
                  underline="hover"
                >
                  Sign In
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  )
}

