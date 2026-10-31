import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Snackbar,
  Alert,
  CircularProgress,
  InputAdornment,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import client from '../api/client'

export default function Staff() {
  // List view state
  const [staffList, setStaffList] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Create Staff Modal State
  const [openModal, setOpenModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [generalError, setGeneralError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  })

  // Fetch staff
  useEffect(() => {
    let ignore = false

    const fetchStaff = async () => {
      try {
        const res = await client.get('/staff/', { params: { page: page + 1 } })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setStaffList(data)
            setTotalCount(data.length)
          } else {
            setStaffList(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch staff members.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchStaff()
    return () => {
      ignore = true
    }
  }, [page, refreshTrigger])

  const handleOpenCreate = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
    })
    setShowPassword(false)
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Password rule browser validation:
  // "more than 8 characters, uppercase, lowercase, special character"
  const validateForm = () => {
    const errors = {}

    if (!formData.name.trim()) {
      errors.name = 'Full name is required.'
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email.trim()) {
      errors.email = 'Email address is required.'
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address.'
    }

    const p = formData.password
    if (!p) {
      errors.password = 'Password is required.'
    } else if (p.length <= 8) {
      errors.password = 'Password must be more than 8 characters.'
    } else if (!/[A-Z]/.test(p)) {
      errors.password = 'Password must contain at least one uppercase letter.'
    } else if (!/[a-z]/.test(p)) {
      errors.password = 'Password must contain at least one lowercase letter.'
    } else if (!/[^A-Za-z0-9]/.test(p)) {
      errors.password = 'Password must contain at least one special character.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmitStaff = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError('')

    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
    }

    try {
      await client.post('/staff/', payload)
      setSnackbar({ open: true, message: 'Staff account registered successfully.', severity: 'success' })
      setOpenModal(false)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        const nextErrors = {}
        Object.keys(data).forEach((key) => {
          if (key === 'detail' || key === 'non_field_errors') {
            setGeneralError(Array.isArray(data[key]) ? data[key][0] : data[key])
          } else {
            nextErrors[key] = Array.isArray(data[key]) ? data[key][0] : data[key]
          }
        })
        setFormErrors(nextErrors)
      } else {
        setGeneralError('Failed to create staff account.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Staff Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage administrative and staff accounts with system access
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ fontWeight: 600 }}
        >
          Add Staff Member
        </Button>
      </Box>

      {listError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {listError}
        </Alert>
      )}

      {/* Table Container */}
      <TableContainer component={Paper} sx={{ borderRadius: 2 }} elevation={1}>
        {loading ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Loading staff accounts...
            </Typography>
          </Box>
        ) : staffList.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No staff members registered
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Click &quot;Add Staff Member&quot; to authorize an internal team member.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Full Name</strong></TableCell>
                <TableCell><strong>Email</strong></TableCell>
                <TableCell><strong>System Role</strong></TableCell>
                <TableCell><strong>Account Status</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {staffList.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>#{s.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {s.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={s.role ? s.role.toUpperCase() : 'STAFF'}
                      size="small"
                      color="info"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={s.is_active !== false ? 'ACTIVE' : 'SUSPENDED'}
                      size="small"
                      color={s.is_active !== false ? 'success' : 'default'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, newPage) => {
            setPage(newPage)
            setLoading(true)
          }}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[10]}
        />
      </TableContainer>

      {/* CREATE STAFF DIALOG */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>
            New Staff Member
          </Typography>
          <IconButton size="small" onClick={() => setOpenModal(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {generalError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {generalError}
            </Alert>
          )}

          <Grid container spacing={2}>
            {/* Name */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Full Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
              />
            </Grid>

            {/* Email */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Email Address *"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={Boolean(formErrors.email)}
                helperText={formErrors.email}
              />
            </Grid>

            {/* Password */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Password *"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                error={Boolean(formErrors.password)}
                helperText={
                  formErrors.password ||
                  'Must be >8 characters with uppercase, lowercase and special character.'
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitStaff}
            disabled={submitting}
            sx={{ fontWeight: 600 }}
          >
            {submitting ? 'Registering...' : 'Create Staff User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Global Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
