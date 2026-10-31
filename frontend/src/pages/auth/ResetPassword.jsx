import { useState } from 'react'
import { Link as RouterLink, useSearchParams, useParams, useNavigate } from 'react-router-dom'
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
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined'
import client from '../../api/client'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const params = useParams()

  // Support query params (?uid=...&token=...), route params (/:uid/:token), or direct input
  const initialUid = searchParams.get('uid') || params.uid || ''
  const initialToken = searchParams.get('token') || params.token || ''

  const [uid, setUid] = useState(initialUid)
  const [token, setToken] = useState(initialToken)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [generalError, setGeneralError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const validate = () => {
    const errors = {}

    if (!uid.trim()) {
      errors.uid = 'Reset UID is required (paste from reset email).'
    }

    if (!token.trim()) {
      errors.token = 'Reset Token is required (paste from reset email).'
    }

    if (!newPassword) {
      errors.newPassword = 'New password is required.'
    } else if (newPassword.length <= 8) {
      errors.newPassword = 'Password must be more than 8 characters.'
    } else if (!/[A-Z]/.test(newPassword)) {
      errors.newPassword = 'Password must contain at least one uppercase letter.'
    } else if (!/[a-z]/.test(newPassword)) {
      errors.newPassword = 'Password must contain at least one lowercase letter.'
    } else if (!/[^A-Za-z0-9]/.test(newPassword)) {
      errors.newPassword = 'Password must contain at least one special character.'
    }

    if (confirmPassword !== newPassword) {
      errors.confirmPassword = 'Passwords do not match.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setGeneralError('')
    setSuccessMessage('')

    try {
      // POST /api/auth/password-reset/confirm/ with { uid, token, new_password }
      const response = await client.post('/auth/password-reset/confirm/', {
        uid: uid.trim(),
        token: token.trim(),
        new_password: newPassword,
      })
      setSuccessMessage(response.data?.detail || 'Password updated successfully.')
    } catch (err) {
      const serverData = err.response?.data
      if (serverData && typeof serverData === 'object') {
        const nextErrors = {}
        if (serverData.detail) {
          setGeneralError(serverData.detail)
        }
        if (serverData.new_password) {
          nextErrors.newPassword = Array.isArray(serverData.new_password)
            ? serverData.new_password[0]
            : serverData.new_password
        }
        if (serverData.uid) {
          nextErrors.uid = Array.isArray(serverData.uid) ? serverData.uid[0] : serverData.uid
        }
        if (serverData.token) {
          nextErrors.token = Array.isArray(serverData.token) ? serverData.token[0] : serverData.token
        }
        if (Object.keys(nextErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...nextErrors }))
        } else if (!serverData.detail) {
          setGeneralError('Invalid or expired token. Please request a new link.')
        }
      } else {
        setGeneralError('Failed to reset password. Please verify the reset link or request a new one.')
      }
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
              <KeyOutlinedIcon />
            </Box>
            <Typography component="h1" variant="h5" fontWeight={600}>
              Set New Password
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Enter your UID, Token and your new password
            </Typography>
          </Box>

          {generalError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {generalError}
            </Alert>
          )}

          {successMessage ? (
            <Box sx={{ textAlign: 'center' }}>
              <Alert severity="success" sx={{ mb: 3 }}>
                {successMessage}
              </Alert>
              <Button
                variant="contained"
                fullWidth
                onClick={() => navigate('/login')}
                sx={{ py: 1.2, fontWeight: 600 }}
              >
                Go to Sign In
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <TextField
                margin="normal"
                required
                fullWidth
                id="uid"
                label="Reset UID"
                name="uid"
                value={uid}
                onChange={(e) => {
                  setUid(e.target.value)
                  if (fieldErrors.uid) setFieldErrors((prev) => ({ ...prev, uid: '' }))
                  if (generalError) setGeneralError('')
                }}
                error={Boolean(fieldErrors.uid)}
                helperText={fieldErrors.uid || 'From URL or email: Reset UID: {uid}'}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                id="token"
                label="Reset Token"
                name="token"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value)
                  if (fieldErrors.token) setFieldErrors((prev) => ({ ...prev, token: '' }))
                  if (generalError) setGeneralError('')
                }}
                error={Boolean(fieldErrors.token)}
                helperText={fieldErrors.token || 'From URL or email: Reset Token: {token}'}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                id="newPassword"
                label="New Password"
                name="newPassword"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  if (fieldErrors.newPassword) {
                    setFieldErrors((prev) => ({ ...prev, newPassword: '' }))
                  }
                  if (generalError) setGeneralError('')
                }}
                error={Boolean(fieldErrors.newPassword)}
                helperText={
                  fieldErrors.newPassword ||
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
                id="confirmPassword"
                label="Confirm New Password"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }))
                  }
                }}
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
                {loading ? 'Updating...' : 'Update Password'}
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
          )}
        </Paper>
      </Box>
    </Container>
  )
}
