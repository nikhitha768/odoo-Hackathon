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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
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
  Stack,
  Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircle'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircle'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import client from '../api/client'
import { useAuth } from '../auth'

const BILLING_PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

function getDefaultAvailableToStr() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

export default function Plans() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.is_superuser

  // List view state
  const [plans, setPlans] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [statusFilter, setStatusFilter] = useState('all')
  const [billingPeriodFilter, setBillingPeriodFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Create / Edit modal state
  const [openModal, setOpenModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [generalError, setGeneralError] = useState('')

  const [formData, setFormData] = useState(() => ({
    name: '',
    price: '0.00',
    billing_period: 'monthly',
    min_quantity: 1,
    available_from: getTodayStr(),
    available_to: getDefaultAvailableToStr(),
    auto_close: false,
    allow_early_close: true,
    allow_pause: true,
    allow_renew: true,
  }))

  // Renew Dialog
  const [renewDialogOpen, setRenewDialogOpen] = useState(false)
  const [planToRenew, setPlanToRenew] = useState(null)
  const [renewDate, setRenewDate] = useState(getDefaultAvailableToStr)
  const [renewing, setRenewing] = useState(false)
  const [renewError, setRenewError] = useState('')

  // Delete Dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [planToDelete, setPlanToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch plans
  useEffect(() => {
    let ignore = false

    const fetchPlans = async () => {
      try {
        const params = {
          page: page + 1,
        }
        if (statusFilter !== 'all') {
          params.status = statusFilter
        }
        if (billingPeriodFilter !== 'all') {
          params.billing_period = billingPeriodFilter
        }

        const res = await client.get('/plans/', { params })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setPlans(data)
            setTotalCount(data.length)
          } else {
            setPlans(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch plans.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchPlans()
    return () => {
      ignore = true
    }
  }, [page, statusFilter, billingPeriodFilter, refreshTrigger])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingPlan(null)
    setFormData({
      name: '',
      price: '0.00',
      billing_period: 'monthly',
      min_quantity: 1,
      available_from: getTodayStr(),
      available_to: getDefaultAvailableToStr(),
      auto_close: false,
      allow_early_close: true,
      allow_pause: true,
      allow_renew: true,
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (plan) => {
    setEditingPlan(plan)
    setFormData({
      name: plan.name || '',
      price: plan.price || '0.00',
      billing_period: plan.billing_period || 'monthly',
      min_quantity: plan.min_quantity || 1,
      available_from: plan.available_from || getTodayStr(),
      available_to: plan.available_to || getDefaultAvailableToStr(),
      auto_close: Boolean(plan.auto_close),
      allow_early_close: Boolean(plan.allow_early_close),
      allow_pause: Boolean(plan.allow_pause),
      allow_renew: Boolean(plan.allow_renew),
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Form Validation
  const validateForm = () => {
    const errors = {}
    if (!formData.name.trim()) {
      errors.name = 'Plan name is required.'
    }
    const price = parseFloat(formData.price)
    if (isNaN(price) || price < 0) {
      errors.price = 'Price must be a non-negative number.'
    }
    const minQty = parseInt(formData.min_quantity, 10)
    if (isNaN(minQty) || minQty < 1) {
      errors.min_quantity = 'Minimum quantity must be >= 1.'
    }
    if (formData.available_from && formData.available_to && formData.available_to < formData.available_from) {
      errors.available_to = 'available_to cannot be before available_from.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Submit Plan
  const handleSubmitPlan = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError('')

    const payload = {
      name: formData.name.trim(),
      price: parseFloat(formData.price).toFixed(2),
      billing_period: formData.billing_period,
      min_quantity: parseInt(formData.min_quantity, 10),
      available_from: formData.available_from || null,
      available_to: formData.available_to || null,
      auto_close: formData.auto_close,
      allow_early_close: formData.allow_early_close,
      allow_pause: formData.allow_pause,
      allow_renew: formData.allow_renew,
    }

    try {
      if (editingPlan) {
        await client.put(`/plans/${editingPlan.id}/`, payload)
        setSnackbar({ open: true, message: 'Plan updated successfully.', severity: 'success' })
      } else {
        await client.post('/plans/', payload)
        setSnackbar({ open: true, message: 'Plan created successfully.', severity: 'success' })
      }
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
        setGeneralError('Failed to save plan.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // State Transition Actions (Pause, Resume, Close, Renew)
  const handlePause = async (plan) => {
    try {
      await client.post(`/plans/${plan.id}/pause/`)
      setSnackbar({ open: true, message: `Plan ${plan.name} paused.`, severity: 'info' })
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to pause plan.',
        severity: 'error',
      })
    }
  }

  const handleResume = async (plan) => {
    try {
      await client.post(`/plans/${plan.id}/resume/`)
      setSnackbar({ open: true, message: `Plan ${plan.name} resumed.`, severity: 'success' })
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to resume plan.',
        severity: 'error',
      })
    }
  }

  const handleClosePlan = async (plan) => {
    try {
      await client.post(`/plans/${plan.id}/close/`)
      setSnackbar({ open: true, message: `Plan ${plan.name} closed.`, severity: 'warning' })
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to close plan.',
        severity: 'error',
      })
    }
  }

  const handleOpenRenewDialog = (plan) => {
    setPlanToRenew(plan)
    setRenewDate(getDefaultAvailableToStr())
    setRenewError('')
    setRenewDialogOpen(true)
  }

  const handleConfirmRenew = async () => {
    if (!planToRenew) return
    setRenewing(true)
    setRenewError('')

    try {
      await client.post(`/plans/${planToRenew.id}/renew/`, { available_to: renewDate })
      setSnackbar({ open: true, message: `Plan ${planToRenew.name} renewed to ${renewDate}.`, severity: 'success' })
      setRenewDialogOpen(false)
      setPlanToRenew(null)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setRenewError(
        err.response?.data?.detail ||
        (err.response?.data?.available_to && err.response.data.available_to[0]) ||
        'Failed to renew plan.'
      )
    } finally {
      setRenewing(false)
    }
  }

  // Delete Plan
  const handleDeleteClick = (plan) => {
    setPlanToDelete(plan)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!planToDelete) return
    setDeleting(true)
    try {
      await client.delete(`/plans/${planToDelete.id}/`)
      setSnackbar({ open: true, message: 'Plan deleted successfully.', severity: 'info' })
      setDeleteDialogOpen(false)
      setPlanToDelete(null)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to delete plan. Subscriptions may be attached.',
        severity: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'paused':
        return 'warning'
      case 'closed':
        return 'default'
      default:
        return 'default'
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
            Subscription Plans
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure recurring plans, cycle terms, pause/resume rules and auto-expiration
          </Typography>
        </Box>

        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ fontWeight: 600 }}
          >
            New Plan
          </Button>
        )}
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }} elevation={1}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="plan-status-filter-label">Status</InputLabel>
              <Select
                labelId="plan-status-filter-label"
                value={statusFilter}
                label="Status"
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(0)
                  setLoading(true)
                }}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="paused">Paused</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="plan-period-filter-label">Billing Period</InputLabel>
              <Select
                labelId="plan-period-filter-label"
                value={billingPeriodFilter}
                label="Billing Period"
                onChange={(e) => {
                  setBillingPeriodFilter(e.target.value)
                  setPage(0)
                  setLoading(true)
                }}
              >
                <MenuItem value="all">All Periods</MenuItem>
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="yearly">Yearly</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

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
              Loading plans...
            </Typography>
          </Box>
        ) : plans.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No subscription plans found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Try adjusting your filter options or add a new plan.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Plan Name</strong></TableCell>
                <TableCell align="right"><strong>Price</strong></TableCell>
                <TableCell><strong>Period</strong></TableCell>
                <TableCell align="center"><strong>Min Qty</strong></TableCell>
                <TableCell><strong>Availability</strong></TableCell>
                <TableCell><strong>Rules (Flags)</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                {isAdmin && <TableCell align="right"><strong>Actions</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {plans.map((plan) => {
                const canPause = plan.status === 'active' && plan.allow_pause
                const canResume = plan.status === 'paused'
                const canClose = plan.status !== 'closed' && plan.allow_early_close
                const canRenew = plan.allow_renew

                return (
                  <TableRow key={plan.id} hover>
                    <TableCell>#{plan.id}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {plan.name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <strong>â‚¹{plan.price}</strong>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={plan.billing_period ? plan.billing_period.toUpperCase() : 'MONTHLY'}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                    </TableCell>
                    <TableCell align="center">{plan.min_quantity}</TableCell>
                    <TableCell>
                      <Typography variant="caption" display="block">
                        {plan.available_from || 'Always'} to {plan.available_to || 'Unlimited'}
                      </Typography>
                      {plan.auto_close && (
                        <Chip label="Auto-close on expiry" size="small" color="secondary" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {plan.allow_pause && <Chip label="Pause" size="small" sx={{ height: 20, fontSize: '0.65rem' }} />}
                        {plan.allow_early_close && <Chip label="Close-early" size="small" sx={{ height: 20, fontSize: '0.65rem' }} />}
                        {plan.allow_renew && <Chip label="Renew" size="small" sx={{ height: 20, fontSize: '0.65rem' }} />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={plan.status ? plan.status.toUpperCase() : 'UNKNOWN'}
                        color={getStatusColor(plan.status)}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>

                    {isAdmin && (
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          {/* Pause Action */}
                          {canPause && (
                            <Tooltip title="Pause Plan">
                              <IconButton size="small" color="warning" onClick={() => handlePause(plan)}>
                                <PauseCircleOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}

                          {/* Resume Action */}
                          {canResume && (
                            <Tooltip title="Resume Plan">
                              <IconButton size="small" color="success" onClick={() => handleResume(plan)}>
                                <PlayCircleOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}

                          {/* Close Action */}
                          {canClose && (
                            <Tooltip title="Close Plan Early">
                              <IconButton size="small" color="error" onClick={() => handleClosePlan(plan)}>
                                <CancelOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}

                          {/* Renew Action */}
                          {canRenew && (
                            <Tooltip title="Renew Plan">
                              <IconButton size="small" color="info" onClick={() => handleOpenRenewDialog(plan)}>
                                <AutorenewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}

                          {/* Edit */}
                          <Tooltip title="Edit Plan">
                            <IconButton size="small" color="primary" onClick={() => handleOpenEdit(plan)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          {/* Delete */}
                          <Tooltip title="Delete Plan">
                            <IconButton size="small" color="error" onClick={() => handleDeleteClick(plan)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
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

      {/* CREATE / EDIT PLAN DIALOG */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>
            {editingPlan ? `Edit Plan #${editingPlan.id}` : 'New Subscription Plan'}
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
                label="Plan Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
              />
            </Grid>

            {/* Price */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Price (â‚¹) *"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                error={Boolean(formErrors.price)}
                helperText={formErrors.price}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Grid>

            {/* Billing Period */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="billing-period-label">Billing Period *</InputLabel>
                <Select
                  labelId="billing-period-label"
                  value={formData.billing_period}
                  label="Billing Period *"
                  onChange={(e) => setFormData({ ...formData, billing_period: e.target.value })}
                >
                  {BILLING_PERIODS.map((bp) => (
                    <MenuItem key={bp.value} value={bp.value}>
                      {bp.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Minimum Quantity */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Minimum Quantity *"
                type="number"
                value={formData.min_quantity}
                onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
                error={Boolean(formErrors.min_quantity)}
                helperText={formErrors.min_quantity}
                inputProps={{ min: 1 }}
              />
            </Grid>

            {/* Available From */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Available From"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={formData.available_from}
                onChange={(e) => setFormData({ ...formData, available_from: e.target.value })}
              />
            </Grid>

            {/* Available To */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Available To"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={formData.available_to}
                onChange={(e) => setFormData({ ...formData, available_to: e.target.value })}
                error={Boolean(formErrors.available_to)}
                helperText={formErrors.available_to}
              />
            </Grid>

            {/* Four Rule Flags */}
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.auto_close}
                    onChange={(e) => setFormData({ ...formData, auto_close: e.target.checked })}
                    color="secondary"
                  />
                }
                label="Auto close at expiration"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.allow_early_close}
                    onChange={(e) => setFormData({ ...formData, allow_early_close: e.target.checked })}
                    color="primary"
                  />
                }
                label="Allow early close"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.allow_pause}
                    onChange={(e) => setFormData({ ...formData, allow_pause: e.target.checked })}
                    color="primary"
                  />
                }
                label="Allow pause"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.allow_renew}
                    onChange={(e) => setFormData({ ...formData, allow_renew: e.target.checked })}
                    color="primary"
                  />
                }
                label="Allow renew"
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitPlan}
            disabled={submitting}
            sx={{ fontWeight: 600 }}
          >
            {submitting ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Plan'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* RENEW PLAN DIALOG */}
      <Dialog open={renewDialogOpen} onClose={() => setRenewDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Renew Plan: {planToRenew?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set a new &quot;Available To&quot; expiration date to renew this subscription plan.
          </Typography>

          {renewError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {renewError}
            </Alert>
          )}

          <TextField
            fullWidth
            size="small"
            label="New Available To Date *"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={renewDate}
            onChange={(e) => setRenewDate(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRenewDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="info"
            onClick={handleConfirmRenew}
            disabled={renewing || !renewDate}
            sx={{ fontWeight: 600 }}
          >
            {renewing ? 'Renewing...' : 'Renew Plan'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE PLAN DIALOG */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete plan <strong>{planToDelete?.name}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleting}
            sx={{ fontWeight: 600 }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
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
