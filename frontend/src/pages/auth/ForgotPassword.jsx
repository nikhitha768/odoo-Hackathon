import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Container,
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Link,
} from '@mui/material'
import MailOutlinedIcon from '@mui/icons-material/MailOutlined'
import client from '../../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    if (!email.trim()) {
      setFieldError('Email address is required.')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('Please enter a valid email address.')
      return false
    }
    setFieldError('')
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setGeneralError('')
    setSuccessMessage('')

    try {
      // POST /api/auth/password-reset/ with { email }
      const response = await client.post('/auth/password-reset/', { email: email.trim() })
      setSuccessMessage(
        response.data?.detail || 'If the email exists, a reset link was sent.',
      )
    } catch (err) {
      const serverData = err.response?.data
      setGeneralError(
        serverData?.detail || 'Unable to process password reset. Please try again.',
      )
    } finally {
      setLoading(false)
    }
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
              <MailOutlinedIcon />
            </Box>
            <Typography component="h1" variant="h5" fontWeight={600}>
              Forgot Password
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Enter your email to receive a password reset link
            </Typography>
          </Box>

          {generalError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {generalError}
            </Alert>
          )}

          {successMessage && (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="body2">{successMessage}</Typography>
              <Box sx={{ mt: 1 }}>
                <Link
                  component={RouterLink}
                  to="/reset-password?uid=12&token=mock-token-demo"
                  variant="caption"
                  fontWeight={600}
                >
                  [Demo shortcut: Test Reset Password page]
                </Link>
              </Box>
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
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldError) setFieldError('')
                if (generalError) setGeneralError('')
              }}
              error={Boolean(fieldError)}
              helperText={fieldError}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 2, py: 1.2, fontWeight: 600 }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 2.5 }}>
              <Link
                component={RouterLink}
                to="/login"
                variant="body2"
                fontWeight={600}
                underline="hover"
              >
                Back to Sign In
              </Link>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  )
}
