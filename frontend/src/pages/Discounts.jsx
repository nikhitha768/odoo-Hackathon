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
  OutlinedInput,
  Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import client from '../api/client'

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

function getDefaultExpiryStr() {
  const d = new Date()
  d.setMonth(d.getMonth() + 3)
  return d.toISOString().split('T')[0]
}

export default function Discounts() {
  // List view state
  const [discounts, setDiscounts] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Products list for multi-select
  const [products, setProducts] = useState([])

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Create / Edit modal state
  const [openModal, setOpenModal] = useState(false)
  const [editingDiscount, setEditingDiscount] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [generalError, setGeneralError] = useState('')

  const [formData, setFormData] = useState(() => ({
    name: '',
    type: 'percent',
    value: '10.00',
    min_purchase: '',
    min_quantity: '',
    start_date: getTodayStr(),
    end_date: getDefaultExpiryStr(),
    usage_limit: '',
    applies_to: 'subscription',
    products: [],
    is_active: true,
  }))

  // Delete modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [discountToDelete, setDiscountToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch discounts
  useEffect(() => {
    let ignore = false

    const fetchDiscounts = async () => {
      try {
        const res = await client.get('/discounts/', { params: { page: page + 1 } })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setDiscounts(data)
            setTotalCount(data.length)
          } else {
            setDiscounts(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch discounts.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchDiscounts()
    return () => {
      ignore = true
    }
  }, [page, refreshTrigger])

  // Load products for multi-select
  useEffect(() => {
    client
      .get('/products/')
      .then((res) => {
        const d = res.data
        setProducts(Array.isArray(d) ? d : d.results || [])
      })
      .catch(() => {})
  }, [])

  // Open Create
  const handleOpenCreate = () => {
    setEditingDiscount(null)
    setFormData({
      name: '',
      type: 'percent',
      value: '10.00',
      min_purchase: '',
      min_quantity: '',
      start_date: getTodayStr(),
      end_date: getDefaultExpiryStr(),
      usage_limit: '',
      applies_to: 'subscription',
      products: [],
      is_active: true,
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Open Edit
  const handleOpenEdit = (d) => {
    setEditingDiscount(d)
    setFormData({
      name: d.name || '',
      type: d.type || 'percent',
      value: d.value || '0.00',
      min_purchase: d.min_purchase !== null && d.min_purchase !== undefined ? String(d.min_purchase) : '',
      min_quantity: d.min_quantity !== null && d.min_quantity !== undefined ? String(d.min_quantity) : '',
      start_date: d.start_date || getTodayStr(),
      end_date: d.end_date || getDefaultExpiryStr(),
      usage_limit: d.usage_limit !== null && d.usage_limit !== undefined ? String(d.usage_limit) : '',
      applies_to: d.applies_to || 'subscription',
      products: Array.isArray(d.products) ? d.products : [],
      is_active: d.is_active !== undefined ? d.is_active : true,
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Form Validation
  const validateForm = () => {
    const errors = {}
    if (!formData.name.trim()) {
      errors.name = 'Discount name is required.'
    }

    const val = parseFloat(formData.value)
    if (isNaN(val) || val < 0) {
      errors.value = 'Discount value must be non-negative.'
    } else if (formData.type === 'percent' && val > 100) {
      errors.value = 'Percentage discount cannot exceed 100%.'
    }

    if (formData.min_purchase !== '') {
      const minP = parseFloat(formData.min_purchase)
      if (isNaN(minP) || minP < 0) {
        errors.min_purchase = 'Minimum purchase must be >= 0.'
      }
    }

    if (formData.min_quantity !== '') {
      const minQ = parseInt(formData.min_quantity, 10)
      if (isNaN(minQ) || minQ < 0) {
        errors.min_quantity = 'Minimum quantity must be >= 0.'
      }
    }

    if (formData.usage_limit !== '') {
      const limit = parseInt(formData.usage_limit, 10)
      if (isNaN(limit) || limit < 1) {
        errors.usage_limit = 'Usage limit must be at least 1.'
      }
    }

    if (!formData.start_date) {
      errors.start_date = 'Start date is required.'
    }
    if (!formData.end_date) {
      errors.end_date = 'End date is required.'
    } else if (formData.start_date && formData.end_date < formData.start_date) {
      errors.end_date = 'End date cannot be earlier than start date.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Submit Discount
  const handleSubmitDiscount = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError('')

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      value: parseFloat(formData.value).toFixed(2),
      min_purchase: formData.min_purchase !== '' ? parseFloat(formData.min_purchase).toFixed(2) : null,
      min_quantity: formData.min_quantity !== '' ? parseInt(formData.min_quantity, 10) : null,
      start_date: formData.start_date,
      end_date: formData.end_date,
      usage_limit: formData.usage_limit !== '' ? parseInt(formData.usage_limit, 10) : null,
      applies_to: formData.applies_to,
      products: formData.applies_to === 'product' ? formData.products : [],
      is_active: formData.is_active,
    }

    try {
      if (editingDiscount) {
        await client.put(`/discounts/${editingDiscount.id}/`, payload)
        setSnackbar({ open: true, message: 'Discount rule updated.', severity: 'success' })
      } else {
        await client.post('/discounts/', payload)
        setSnackbar({ open: true, message: 'Discount rule created.', severity: 'success' })
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
        setGeneralError('Failed to save discount rule.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Delete Discount
  const handleDeleteClick = (d) => {
    setDiscountToDelete(d)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!discountToDelete) return
    setDeleting(true)
    try {
      await client.delete(`/discounts/${discountToDelete.id}/`)
      setSnackbar({ open: true, message: 'Discount deleted.', severity: 'info' })
      setDeleteDialogOpen(false)
      setDiscountToDelete(null)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to delete discount rule.',
        severity: 'error',
      })
    } finally {
      setDeleting(false)
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
            Discounts & Coupons
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure promotional rules, usage caps, and auto-applied invoice discounts
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ fontWeight: 600 }}
        >
          New Discount
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
              Loading discount rules...
            </Typography>
          </Box>
        ) : discounts.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No discounts found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Add a promotion rule to automatically apply savings to invoices.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Discount Name</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell align="right"><strong>Value</strong></TableCell>
                <TableCell><strong>Scope</strong></TableCell>
                <TableCell><strong>Validity Period</strong></TableCell>
                <TableCell align="center"><strong>Usage</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {discounts.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>#{d.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {d.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={d.type ? d.type.toUpperCase() : 'PERCENT'}
                      size="small"
                      color={d.type === 'percent' ? 'primary' : 'secondary'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <strong>{d.type === 'percent' ? `${d.value}%` : `₹${d.value}`}</strong>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={d.applies_to === 'product' ? 'Products' : 'Entire Subscription'}
                      size="small"
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" display="block">
                      {d.start_date} to {d.end_date}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={`Used ${d.times_used || 0} times`}>
                      <Typography variant="body2">
                        {d.times_used || 0} / {d.usage_limit || '∞'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={d.is_active ? 'ACTIVE' : 'INACTIVE'}
                      size="small"
                      color={d.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="primary" onClick={() => handleOpenEdit(d)} title="Edit Discount">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteClick(d)} title="Delete Discount">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
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

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>
            {editingDiscount ? `Edit Discount #${editingDiscount.id}` : 'New Discount Rule'}
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
                label="Discount Name *"
                placeholder="e.g. Summer Promo 2026"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
              />
            </Grid>

            {/* Type */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="discount-type-label">Type *</InputLabel>
                <Select
                  labelId="discount-type-label"
                  value={formData.type}
                  label="Type *"
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <MenuItem value="percent">Percentage (%)</MenuItem>
                  <MenuItem value="fixed">Fixed Amount (₹)</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Value */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label={formData.type === 'percent' ? 'Discount Rate (%) *' : 'Discount Amount (₹) *'}
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                error={Boolean(formErrors.value)}
                helperText={formErrors.value}
                inputProps={{ min: 0, max: formData.type === 'percent' ? 100 : undefined, step: '0.01' }}
              />
            </Grid>

            {/* Applies To */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="applies-to-label">Applies To *</InputLabel>
                <Select
                  labelId="applies-to-label"
                  value={formData.applies_to}
                  label="Applies To *"
                  onChange={(e) => setFormData({ ...formData, applies_to: e.target.value })}
                >
                  <MenuItem value="subscription">Entire Subscription</MenuItem>
                  <MenuItem value="product">Selected Products</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Multi-Select Products (if applies_to === 'product') */}
            {formData.applies_to === 'product' && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="select-products-label">Specific Products</InputLabel>
                  <Select
                    labelId="select-products-label"
                    multiple
                    value={formData.products}
                    onChange={(e) => setFormData({ ...formData, products: e.target.value })}
                    input={<OutlinedInput label="Specific Products" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((val) => {
                          const prod = products.find((p) => p.id === val)
                          return <Chip key={val} label={prod?.name || `#${val}`} size="small" />
                        })}
                      </Box>
                    )}
                  >
                    {products.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* Start Date */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Start Date *"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                error={Boolean(formErrors.start_date)}
                helperText={formErrors.start_date}
              />
            </Grid>

            {/* End Date */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="End Date *"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                error={Boolean(formErrors.end_date)}
                helperText={formErrors.end_date}
              />
            </Grid>

            {/* Min Purchase */}
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="Min Purchase (₹)"
                type="number"
                placeholder="Optional"
                value={formData.min_purchase}
                onChange={(e) => setFormData({ ...formData, min_purchase: e.target.value })}
                error={Boolean(formErrors.min_purchase)}
                helperText={formErrors.min_purchase}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Grid>

            {/* Min Quantity */}
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="Min Quantity"
                type="number"
                placeholder="Optional"
                value={formData.min_quantity}
                onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
                error={Boolean(formErrors.min_quantity)}
                helperText={formErrors.min_quantity}
                inputProps={{ min: 0 }}
              />
            </Grid>

            {/* Usage Limit */}
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="Usage Limit"
                type="number"
                placeholder="Unlimited"
                value={formData.usage_limit}
                onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                error={Boolean(formErrors.usage_limit)}
                helperText={formErrors.usage_limit}
                inputProps={{ min: 1 }}
              />
            </Grid>

            {/* Active */}
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    color="primary"
                  />
                }
                label="Active Discount Rule"
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitDiscount}
            disabled={submitting}
            sx={{ fontWeight: 600 }}
          >
            {submitting ? 'Saving...' : editingDiscount ? 'Save Changes' : 'Create Discount'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete discount rule <strong>{discountToDelete?.name}</strong>?
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
