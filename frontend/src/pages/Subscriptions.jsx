import { useState, useEffect, useRef } from 'react'
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
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  Grid,
  IconButton,
  Snackbar,
  Alert,
  CircularProgress,
  Divider,
  Stack,
  Card,
  CardContent,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CloseIcon from '@mui/icons-material/Close'
import client from '../api/client'
import { useAuth } from '../auth'

const STATUS_STEPS = ['draft', 'quotation', 'confirmed', 'active', 'closed']

const NEXT_STATUS_MAP = {
  draft: { target: 'quotation', label: 'Submit as Quotation', color: 'primary' },
  quotation: { target: 'confirmed', label: 'Confirm Subscription', color: 'info' },
  confirmed: { target: 'active', label: 'Activate Subscription', color: 'success' },
  active: { target: 'closed', label: 'Close Subscription', color: 'error' },
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

function getDefaultExpiryStr() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

export default function Subscriptions() {
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'
  const lineCounterRef = useRef(1)

  // List view state
  const [subscriptions, setSubscriptions] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Options for creation
  const [customers, setCustomers] = useState([])
  const [plans, setPlans] = useState([])
  const [templates, setTemplates] = useState([])
  const [products, setProducts] = useState([])
  const [taxes, setTaxes] = useState([])

  // Create modal state
  const [openCreate, setOpenCreate] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createErrors, setCreateErrors] = useState({})
  const [createGeneralError, setCreateGeneralError] = useState('')

  const [formData, setFormData] = useState(() => ({
    customer: '',
    plan: '',
    template: '',
    start_date: getTodayStr(),
    expiry_date: getDefaultExpiryStr(),
    payment_term_days: 15,
    lines: [],
  }))

  // Detail modal state
  const [openDetail, setOpenDetail] = useState(false)
  const [selectedSub, setSelectedSub] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [transitionLoading, setTransitionLoading] = useState(false)
  const [transitionError, setTransitionError] = useState('')

  // Fetch subscriptions
  useEffect(() => {
    let ignore = false

    const fetchSubscriptions = async () => {
      try {
        const params = {
          page: page + 1,
        }
        if (statusFilter !== 'all') {
          params.status = statusFilter
        }
        if (searchTerm.trim()) {
          params.search = searchTerm.trim()
        }
        const res = await client.get('/subscriptions/', { params })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setSubscriptions(data)
            setTotalCount(data.length)
          } else {
            setSubscriptions(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch subscriptions.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchSubscriptions()
    return () => {
      ignore = true
    }
  }, [page, statusFilter, searchTerm, refreshTrigger])

  // Load dropdown resources
  const loadOptions = async () => {
    try {
      const [custRes, planRes, tplRes, prodRes, taxRes] = await Promise.allSettled([
        client.get('/customers/'),
        client.get('/plans/'),
        client.get('/quotation-templates/'),
        client.get('/products/'),
        client.get('/taxes/'),
      ])

      if (custRes.status === 'fulfilled') {
        const d = custRes.value.data
        setCustomers(Array.isArray(d) ? d : d.results || [])
      }
      if (planRes.status === 'fulfilled') {
        const d = planRes.value.data
        setPlans(Array.isArray(d) ? d : d.results || [])
      }
      if (tplRes.status === 'fulfilled') {
        const d = tplRes.value.data
        setTemplates(Array.isArray(d) ? d : d.results || [])
      }
      if (prodRes.status === 'fulfilled') {
        const d = prodRes.value.data
        setProducts(Array.isArray(d) ? d : d.results || [])
      }
      if (taxRes.status === 'fulfilled') {
        const d = taxRes.value.data
        setTaxes(Array.isArray(d) ? d : d.results || [])
      }
    } catch (e) {
      console.error('Failed to load selection options', e)
    }
  }

  const handleOpenCreate = () => {
    loadOptions()
    setFormData({
      customer: isCustomer ? user?.id : '',
      plan: '',
      template: '',
      start_date: getTodayStr(),
      expiry_date: getDefaultExpiryStr(),
      payment_term_days: 15,
      lines: [],
    })
    setCreateErrors({})
    setCreateGeneralError('')
    setOpenCreate(true)
  }

  // Template change
  const handleTemplateChange = (templateId) => {
    setFormData((prev) => ({ ...prev, template: templateId }))
    if (!templateId) return

    const tpl = templates.find((t) => t.id === templateId)
    if (tpl) {
      setFormData((prev) => {
        const next = { ...prev, template: templateId }
        if (tpl.plan && !prev.plan) {
          next.plan = tpl.plan
        }
        if (Array.isArray(tpl.lines) && tpl.lines.length > 0) {
          next.lines = tpl.lines.map((tl) => ({
            keyId: ++lineCounterRef.current,
            product: tl.product,
            quantity: tl.quantity || 1,
            unit_price: tl.unit_price || '',
            tax: tl.tax || '',
          }))
        }
        return next
      })
    }
  }

  // Line item manipulation
  const handleAddLine = () => {
    setFormData((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          keyId: ++lineCounterRef.current,
          product: '',
          quantity: 1,
          unit_price: '',
          tax: '',
        },
      ],
    }))
  }

  const handleRemoveLine = (index) => {
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, idx) => idx !== index),
    }))
  }

  const handleLineChange = (index, field, value) => {
    setFormData((prev) => {
      const nextLines = [...prev.lines]
      const targetLine = { ...nextLines[index], [field]: value }

      if (field === 'product') {
        const matchedProd = products.find((p) => p.id === value)
        if (matchedProd) {
          if (!targetLine.unit_price) {
            targetLine.unit_price = matchedProd.sales_price || '0.00'
          }
          if (!targetLine.tax && matchedProd.default_tax) {
            targetLine.tax = matchedProd.default_tax
          }
        }
      }

      nextLines[index] = targetLine
      return { ...prev, lines: nextLines }
    })
  }

  // Validate Create
  const validateCreate = () => {
    const errors = {}
    if (!isCustomer && !formData.customer) {
      errors.customer = 'Customer is required.'
    }
    if (!formData.plan && !formData.template) {
      errors.plan = 'Plan is required.'
    }
    if (!formData.start_date) {
      errors.start_date = 'Start date is required.'
    }
    if (!formData.expiry_date) {
      errors.expiry_date = 'Expiry date is required.'
    } else if (formData.start_date && formData.expiry_date < formData.start_date) {
      errors.expiry_date = 'Expiry date cannot be earlier than start date.'
    }
    if (formData.payment_term_days === '' || Number(formData.payment_term_days) < 0) {
      errors.payment_term_days = 'Payment term must be a non-negative number.'
    }

    formData.lines.forEach((l, idx) => {
      if (!l.product) {
        errors[`line_${idx}_product`] = 'Product is required.'
      }
      if (Number(l.quantity) < 1) {
        errors[`line_${idx}_quantity`] = 'Quantity must be >= 1.'
      }
      if (Number(l.unit_price) < 0) {
        errors[`line_${idx}_unit_price`] = 'Unit price must be >= 0.'
      }
    })

    setCreateErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!validateCreate()) return

    setCreateSubmitting(true)
    setCreateGeneralError('')

    const payload = {
      customer: formData.customer ? Number(formData.customer) : undefined,
      plan: formData.plan ? Number(formData.plan) : undefined,
      template: formData.template ? Number(formData.template) : null,
      start_date: formData.start_date,
      expiry_date: formData.expiry_date,
      payment_term_days: Number(formData.payment_term_days),
      lines: formData.lines.map((l) => ({
        product: Number(l.product),
        quantity: Number(l.quantity) || 1,
        unit_price: l.unit_price ? String(l.unit_price) : undefined,
        tax: l.tax ? Number(l.tax) : null,
      })),
    }

    try {
      await client.post('/subscriptions/', payload)
      setSnackbar({
        open: true,
        message: 'Subscription created successfully!',
        severity: 'success',
      })
      setOpenCreate(false)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        const nextErrors = {}
        Object.keys(data).forEach((key) => {
          if (key === 'detail' || key === 'non_field_errors') {
            setCreateGeneralError(Array.isArray(data[key]) ? data[key][0] : data[key])
          } else {
            nextErrors[key] = Array.isArray(data[key]) ? data[key][0] : data[key]
          }
        })
        setCreateErrors(nextErrors)
      } else {
        setCreateGeneralError('Failed to create subscription. Please check your inputs.')
      }
    } finally {
      setCreateSubmitting(false)
    }
  }

  // Open detail view
  const handleOpenDetail = async (sub) => {
    setSelectedSub(sub)
    setOpenDetail(true)
    setTransitionError('')
    setDetailLoading(true)

    try {
      const res = await client.get(`/subscriptions/${sub.id}/`)
      setSelectedSub(res.data)
    } catch {
      // Fallback to provided sub
    } finally {
      setDetailLoading(false)
    }
  }

  // Perform status transition (one single valid button)
  const handleTransition = async (targetStatus) => {
    if (!selectedSub) return
    setTransitionLoading(true)
    setTransitionError('')

    try {
      const res = await client.post(`/subscriptions/${selectedSub.id}/transition/`, {
        to: targetStatus,
      })
      setSelectedSub(res.data)
      setSnackbar({
        open: true,
        message: `Status moved to ${targetStatus.toUpperCase()} successfully.`,
        severity: 'success',
      })
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      const serverErr =
        err.response?.data?.detail ||
        (err.response?.data?.to && err.response.data.to[0]) ||
        'Transition failed. Invalid status change.'
      setTransitionError(serverErr)
    } finally {
      setTransitionLoading(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'confirmed':
        return 'info'
      case 'quotation':
        return 'warning'
      case 'closed':
        return 'default'
      case 'draft':
      default:
        return 'secondary'
    }
  }

  const currentStepIndex = selectedSub ? STATUS_STEPS.indexOf(selectedSub.status) : 0
  const nextTransition = selectedSub ? NEXT_STATUS_MAP[selectedSub.status] : null

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
            Subscriptions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage recurring contracts, statuses, lines and renewal lifecycles
          </Typography>
        </Box>

        {!isCustomer && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ fontWeight: 600 }}
          >
            New Subscription
          </Button>
        )}
      </Box>

      {/* Filter and Search Bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }} elevation={1}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by number, customer, plan..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(0)
                setLoading(true)
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="status-filter-label">Status Filter</InputLabel>
              <Select
                labelId="status-filter-label"
                value={statusFilter}
                label="Status Filter"
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(0)
                  setLoading(true)
                }}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="quotation">Quotation</MenuItem>
                <MenuItem value="confirmed">Confirmed</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
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
              Loading subscriptions...
            </Typography>
          </Box>
        ) : subscriptions.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No subscriptions found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Try adjusting your search criteria or create a new subscription.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Number</strong></TableCell>
                <TableCell><strong>Customer</strong></TableCell>
                <TableCell><strong>Plan</strong></TableCell>
                <TableCell><strong>Start Date</strong></TableCell>
                <TableCell><strong>Expiry Date</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {subscriptions.map((sub) => (
                <TableRow key={sub.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {sub.number}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {sub.customer?.name || 'N/A'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {sub.customer?.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {sub.plan?.name || '-'}
                    {sub.plan?.billing_period ? ` (${sub.plan.billing_period})` : ''}
                  </TableCell>
                  <TableCell>{sub.start_date}</TableCell>
                  <TableCell>{sub.expiry_date}</TableCell>
                  <TableCell>
                    <Chip
                      label={sub.status ? sub.status.toUpperCase() : 'UNKNOWN'}
                      color={getStatusColor(sub.status)}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => handleOpenDetail(sub)}
                    >
                      View
                    </Button>
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

      {/* CREATE SUBSCRIPTION DIALOG */}
      <Dialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>
            Create Subscription
          </Typography>
          <IconButton size="small" onClick={() => setOpenCreate(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {createGeneralError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {createGeneralError}
            </Alert>
          )}

          <Grid container spacing={2}>
            {/* Customer Picker */}
            {!isCustomer && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small" error={Boolean(createErrors.customer)}>
                  <InputLabel id="cust-picker-label">Customer *</InputLabel>
                  <Select
                    labelId="cust-picker-label"
                    value={formData.customer}
                    label="Customer *"
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                  >
                    {customers.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </MenuItem>
                    ))}
                  </Select>
                  {createErrors.customer && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                      {createErrors.customer}
                    </Typography>
                  )}
                </FormControl>
              </Grid>
            )}

            {/* Plan Picker */}
            <Grid item xs={12} sm={isCustomer ? 12 : 6}>
              <FormControl fullWidth size="small" error={Boolean(createErrors.plan)}>
                <InputLabel id="plan-picker-label">Plan *</InputLabel>
                <Select
                  labelId="plan-picker-label"
                  value={formData.plan}
                  label="Plan *"
                  onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                >
                  {plans.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} ({p.billing_period} - ₹{p.price})
                    </MenuItem>
                  ))}
                </Select>
                {createErrors.plan && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {createErrors.plan}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            {/* Template Picker */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="tpl-picker-label">Start From Quotation Template</InputLabel>
                <Select
                  labelId="tpl-picker-label"
                  value={formData.template}
                  label="Start From Quotation Template"
                  onChange={(e) => handleTemplateChange(e.target.value)}
                >
                  <MenuItem value="">None (Custom)</MenuItem>
                  {templates.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Payment Term Days */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Payment Terms (Days)"
                type="number"
                value={formData.payment_term_days}
                onChange={(e) => setFormData({ ...formData, payment_term_days: e.target.value })}
                error={Boolean(createErrors.payment_term_days)}
                helperText={createErrors.payment_term_days}
              />
            </Grid>

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
                error={Boolean(createErrors.start_date)}
                helperText={createErrors.start_date}
              />
            </Grid>

            {/* Expiry Date */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Expiry Date *"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                error={Boolean(createErrors.expiry_date)}
                helperText={createErrors.expiry_date}
              />
            </Grid>
          </Grid>

          {/* Product Lines Section */}
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Product Lines
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={handleAddLine}>
                Add Line
              </Button>
            </Box>

            {formData.lines.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', my: 1 }}>
                No product lines added yet. Click &quot;Add Line&quot; or choose a Quotation Template above.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell><strong>Product *</strong></TableCell>
                      <TableCell width={100}><strong>Qty *</strong></TableCell>
                      <TableCell width={130}><strong>Unit Price</strong></TableCell>
                      <TableCell width={160}><strong>Tax</strong></TableCell>
                      <TableCell width={60}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {formData.lines.map((line, idx) => (
                      <TableRow key={line.keyId || idx}>
                        <TableCell>
                          <FormControl fullWidth size="small" error={Boolean(createErrors[`line_${idx}_product`])}>
                            <Select
                              value={line.product}
                              onChange={(e) => handleLineChange(idx, 'product', e.target.value)}
                            >
                              {products.map((p) => (
                                <MenuItem key={p.id} value={p.id}>
                                  {p.name} (₹{p.sales_price})
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            type="number"
                            value={line.quantity}
                            onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                            error={Boolean(createErrors[`line_${idx}_quantity`])}
                            inputProps={{ min: 1 }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            type="number"
                            value={line.unit_price}
                            onChange={(e) => handleLineChange(idx, 'unit_price', e.target.value)}
                            error={Boolean(createErrors[`line_${idx}_unit_price`])}
                            placeholder="Auto"
                            inputProps={{ min: 0, step: '0.01' }}
                          />
                        </TableCell>
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <Select
                              value={line.tax || ''}
                              onChange={(e) => handleLineChange(idx, 'tax', e.target.value)}
                            >
                              <MenuItem value="">None</MenuItem>
                              {taxes.map((t) => (
                                <MenuItem key={t.id} value={t.id}>
                                  {t.name} ({t.rate_percent}%)
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveLine(idx)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenCreate(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateSubmit}
            disabled={createSubmitting}
            sx={{ fontWeight: 600 }}
          >
            {createSubmitting ? 'Creating...' : 'Create Subscription'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DETAIL VIEW MODAL WITH STATUS STEPPER AND ONE FORWARD TRANSITION BUTTON */}
      <Dialog
        open={openDetail}
        onClose={() => setOpenDetail(false)}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" fontWeight={700}>
              Subscription: {selectedSub?.number}
            </Typography>
            {selectedSub && (
              <Chip
                label={selectedSub.status.toUpperCase()}
                color={getStatusColor(selectedSub.status)}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            )}
          </Box>
          <IconButton size="small" onClick={() => setOpenDetail(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <CircularProgress size={32} />
            </Box>
          ) : selectedSub ? (
            <>
              {/* Stepper */}
              <Box sx={{ width: '100%', mb: 3 }}>
                <Stepper activeStep={currentStepIndex} alternativeLabel>
                  {STATUS_STEPS.map((label) => (
                    <Step key={label}>
                      <StepLabel>{label.charAt(0).toUpperCase() + label.slice(1)}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Box>

              {/* Single Next Status Button & Error Area */}
              {transitionError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {transitionError}
                </Alert>
              )}

              {!isCustomer && nextTransition && (
                <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Next allowable workflow status: <strong>{nextTransition.target.toUpperCase()}</strong>
                  </Typography>
                  <Button
                    variant="contained"
                    color={nextTransition.color}
                    disabled={transitionLoading}
                    onClick={() => handleTransition(nextTransition.target)}
                    sx={{ fontWeight: 600 }}
                  >
                    {transitionLoading ? 'Processing...' : nextTransition.label}
                  </Button>
                </Box>
              )}

              {/* Overview Details */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">
                        Customer
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {selectedSub.customer?.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedSub.customer?.email}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">
                        Plan Details
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {selectedSub.plan?.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Period: {selectedSub.plan?.billing_period}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Start Date</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedSub.start_date}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Expiry Date</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedSub.expiry_date}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Next Invoice Date</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedSub.next_invoice_date || '-'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Payment Terms</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedSub.payment_term_days} days</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Lines Table */}
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                Lines & Pricing Breakdown
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell><strong>Product</strong></TableCell>
                      <TableCell align="right"><strong>Quantity</strong></TableCell>
                      <TableCell align="right"><strong>Unit Price</strong></TableCell>
                      <TableCell align="right"><strong>Line Amount</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedSub.lines && selectedSub.lines.length > 0 ? (
                      selectedSub.lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            {products.find((p) => p.id === l.product)?.name || `Product #${l.product}`}
                          </TableCell>
                          <TableCell align="right">{l.quantity}</TableCell>
                          <TableCell align="right">₹{l.unit_price}</TableCell>
                          <TableCell align="right"><strong>₹{l.amount}</strong></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No product lines recorded.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Totals */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Stack spacing={0.5} sx={{ minWidth: 200, textAlign: 'right' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Subtotal:</Typography>
                    <Typography variant="body2">₹{selectedSub.subtotal || '0.00'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Tax Total:</Typography>
                    <Typography variant="body2">₹{selectedSub.tax_total || '0.00'}</Typography>
                  </Box>
                  <Divider sx={{ my: 0.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle1" fontWeight={700}>Total:</Typography>
                    <Typography variant="subtitle1" fontWeight={700} color="primary.main">
                      ₹{selectedSub.total || '0.00'}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </>
          ) : null}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenDetail(false)}>Close</Button>
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
