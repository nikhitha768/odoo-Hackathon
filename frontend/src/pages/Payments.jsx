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
  Card,
  CardContent,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import PaymentIcon from '@mui/icons-material/Payment'
import client from '../api/client'
import { useAuth } from '../auth'

const PAYMENT_METHODS = [
  { value: 'all', label: 'All Methods' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
]

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function Payments() {
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'

  // List view state
  const [payments, setPayments] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [methodFilter, setMethodFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Record Payment Dialog State
  const [openRecordDialog, setOpenRecordDialog] = useState(false)
  const [confirmedInvoices, setConfirmedInvoices] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [generalError, setGeneralError] = useState('')

  // Form Fields
  const [formData, setFormData] = useState(() => ({
    invoice: '',
    method: 'bank_transfer',
    amount: '',
    payment_date: getTodayStr(),
    note: '',
  }))

  // Selected invoice helper
  const selectedInvoice = confirmedInvoices.find((inv) => String(inv.id) === String(formData.invoice))
  const outstandingBalance = selectedInvoice
    ? Math.max(0, parseFloat(selectedInvoice.total || 0) - parseFloat(selectedInvoice.amount_paid || 0)).toFixed(2)
    : '0.00'

  // Fetch Payments List
  useEffect(() => {
    let ignore = false

    const fetchPayments = async () => {
      try {
        const params = {
          page: page + 1,
        }
        if (methodFilter !== 'all') {
          params.method = methodFilter
        }
        if (fromDate) {
          params.from = fromDate
        }
        if (toDate) {
          params.to = toDate
        }

        const res = await client.get('/payments/', { params })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setPayments(data)
            setTotalCount(data.length)
          } else {
            setPayments(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch payment records.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchPayments()
    return () => {
      ignore = true
    }
  }, [page, methodFilter, fromDate, toDate, refreshTrigger])

  // Fetch confirmed invoices for the record dialog
  const loadConfirmedInvoices = async () => {
    setLoadingInvoices(true)
    try {
      const res = await client.get('/invoices/', { params: { status: 'confirmed' } })
      const data = res.data
      const list = Array.isArray(data) ? data : data.results || []
      const payable = list.filter((inv) => {
        const bal = parseFloat(inv.total || 0) - parseFloat(inv.amount_paid || 0)
        return bal > 0.009
      })
      setConfirmedInvoices(payable)
    } catch (e) {
      console.error('Failed to load confirmed invoices', e)
    } finally {
      setLoadingInvoices(false)
    }
  }

  const handleOpenRecordDialog = () => {
    loadConfirmedInvoices()
    setFormData({
      invoice: '',
      method: 'bank_transfer',
      amount: '',
      payment_date: getTodayStr(),
      note: '',
    })
    setFormErrors({})
    setGeneralError('')
    setOpenRecordDialog(true)
  }

  // Handle invoice selection change
  const handleInvoiceChange = (invId) => {
    setFormData((prev) => {
      const matched = confirmedInvoices.find((i) => String(i.id) === String(invId))
      const autoAmount = matched
        ? (parseFloat(matched.total || 0) - parseFloat(matched.amount_paid || 0)).toFixed(2)
        : ''
      return {
        ...prev,
        invoice: invId,
        amount: autoAmount,
      }
    })
    if (formErrors.invoice) setFormErrors((prev) => ({ ...prev, invoice: '' }))
    if (formErrors.amount) setFormErrors((prev) => ({ ...prev, amount: '' }))
  }

  // Validation
  const validateForm = () => {
    const errors = {}

    if (!formData.invoice) {
      errors.invoice = 'Please select a confirmed invoice.'
    }

    const amt = parseFloat(formData.amount)
    if (isNaN(amt) || amt <= 0) {
      errors.amount = 'Amount must be a positive number greater than 0.'
    } else if (selectedInvoice) {
      const maxAllowed = parseFloat(outstandingBalance)
      if (amt > maxAllowed + 0.001) {
        errors.amount = `Amount exceeds outstanding balance (Maximum: ₹${outstandingBalance}).`
      }
    }

    if (!formData.method) {
      errors.method = 'Payment method is required.'
    }

    if (!formData.payment_date) {
      errors.payment_date = 'Payment date is required.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Submit Payment
  const handleSubmitPayment = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError('')

    const payload = {
      invoice: Number(formData.invoice),
      method: formData.method,
      amount: String(parseFloat(formData.amount).toFixed(2)),
      payment_date: formData.payment_date,
      note: formData.note.trim(),
    }

    try {
      await client.post('/payments/', payload)
      setSnackbar({
        open: true,
        message: 'Payment recorded successfully.',
        severity: 'success',
      })
      setOpenRecordDialog(false)
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
        setGeneralError('Failed to record payment. Please check invoice status and balance.')
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
            Payments
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage transactions, reconcile settlements and view payment audit logs
          </Typography>
        </Box>

        {!isCustomer && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenRecordDialog}
            sx={{ fontWeight: 600 }}
          >
            Record Payment
          </Button>
        )}
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }} elevation={1}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="payment-method-filter-label">Payment Method</InputLabel>
              <Select
                labelId="payment-method-filter-label"
                value={methodFilter}
                label="Payment Method"
                onChange={(e) => {
                  setMethodFilter(e.target.value)
                  setPage(0)
                  setLoading(true)
                }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <MenuItem key={m.value} value={m.value}>
                    {m.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={4} md={3}>
            <TextField
              fullWidth
              size="small"
              label="From Date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                setPage(0)
                setLoading(true)
              }}
            />
          </Grid>

          <Grid item xs={12} sm={4} md={3}>
            <TextField
              fullWidth
              size="small"
              label="To Date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value)
                setPage(0)
                setLoading(true)
              }}
            />
          </Grid>

          {(fromDate || toDate || methodFilter !== 'all') && (
            <Grid item xs={12} sm={12} md={3}>
              <Button
                size="small"
                onClick={() => {
                  setMethodFilter('all')
                  setFromDate('')
                  setToDate('')
                  setPage(0)
                  setLoading(true)
                }}
              >
                Reset Filters
              </Button>
            </Grid>
          )}
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
              Loading payment entries...
            </Typography>
          </Box>
        ) : payments.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No payments found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Try adjusting your date filters or record a new payment.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Payment ID</strong></TableCell>
                <TableCell><strong>Invoice Ref</strong></TableCell>
                <TableCell><strong>Method</strong></TableCell>
                <TableCell align="right"><strong>Amount</strong></TableCell>
                <TableCell><strong>Payment Date</strong></TableCell>
                <TableCell><strong>Note</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      #{p.id}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      Invoice #{p.invoice}
                    </Typography>
                    {p.invoice_status && (
                      <Chip
                        label={p.invoice_status.toUpperCase()}
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={(p.method || '').replace('_', ' ').toUpperCase()}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} color="success.main">
                      ₹{p.amount}
                    </Typography>
                  </TableCell>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell>{p.note || '-'}</TableCell>
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

      {/* RECORD PAYMENT DIALOG */}
      <Dialog
        open={openRecordDialog}
        onClose={() => setOpenRecordDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PaymentIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              Record Payment
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setOpenRecordDialog(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {generalError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {generalError}
            </Alert>
          )}

          <Grid container spacing={2}>
            {/* Invoice Select (Confirmed invoices only) */}
            <Grid item xs={12}>
              <FormControl fullWidth size="small" error={Boolean(formErrors.invoice)}>
                <InputLabel id="inv-select-label">Confirmed Invoice *</InputLabel>
                <Select
                  labelId="inv-select-label"
                  value={formData.invoice}
                  label="Confirmed Invoice *"
                  disabled={loadingInvoices}
                  onChange={(e) => handleInvoiceChange(e.target.value)}
                >
                  {confirmedInvoices.map((inv) => {
                    const bal = (parseFloat(inv.total) - parseFloat(inv.amount_paid)).toFixed(2)
                    return (
                      <MenuItem key={inv.id} value={inv.id}>
                        {inv.number} - {inv.customer?.name} (Outstanding: ₹{bal})
                      </MenuItem>
                    )
                  })}
                </Select>
                {formErrors.invoice && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {formErrors.invoice}
                  </Typography>
                )}
                {confirmedInvoices.length === 0 && !loadingInvoices && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                    No confirmed invoices with outstanding balances found.
                  </Typography>
                )}
              </FormControl>
            </Grid>

            {/* Invoice Balance Summary Banner */}
            {selectedInvoice && (
              <Grid item xs={12}>
                <Card variant="outlined" sx={{ bgcolor: 'grey.50' }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Grid container spacing={1}>
                      <Grid item xs={4}>
                        <Typography variant="caption" color="text.secondary">Total Invoice</Typography>
                        <Typography variant="body2" fontWeight={600}>₹{selectedInvoice.total}</Typography>
                      </Grid>
                      <Grid item xs={4}>
                        <Typography variant="caption" color="text.secondary">Already Paid</Typography>
                        <Typography variant="body2" fontWeight={600} color="success.main">₹{selectedInvoice.amount_paid}</Typography>
                      </Grid>
                      <Grid item xs={4}>
                        <Typography variant="caption" color="text.secondary">Outstanding Due</Typography>
                        <Typography variant="body2" fontWeight={700} color="error.main">₹{outstandingBalance}</Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Payment Method */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" error={Boolean(formErrors.method)}>
                <InputLabel id="method-select-label">Payment Method *</InputLabel>
                <Select
                  labelId="method-select-label"
                  value={formData.method}
                  label="Payment Method *"
                  onChange={(e) => {
                    setFormData({ ...formData, method: e.target.value })
                    if (formErrors.method) setFormErrors({ ...formErrors, method: '' })
                  }}
                >
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  <MenuItem value="upi">UPI</MenuItem>
                  <MenuItem value="card">Card</MenuItem>
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="cheque">Cheque</MenuItem>
                </Select>
                {formErrors.method && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {formErrors.method}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            {/* Amount */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Amount (₹) *"
                type="number"
                value={formData.amount}
                onChange={(e) => {
                  setFormData({ ...formData, amount: e.target.value })
                  if (formErrors.amount) setFormErrors({ ...formErrors, amount: '' })
                  if (generalError) setGeneralError('')
                }}
                error={Boolean(formErrors.amount)}
                helperText={formErrors.amount || `Up to ₹${outstandingBalance}`}
                inputProps={{ min: 0.01, step: '0.01' }}
              />
            </Grid>

            {/* Payment Date */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Payment Date *"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={formData.payment_date}
                onChange={(e) => {
                  setFormData({ ...formData, payment_date: e.target.value })
                  if (formErrors.payment_date) setFormErrors({ ...formErrors, payment_date: '' })
                }}
                error={Boolean(formErrors.payment_date)}
                helperText={formErrors.payment_date}
              />
            </Grid>

            {/* Note */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Note / Reference (Optional)"
                multiline
                rows={2}
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="e.g. UPI Ref # 123456 or Bank Transfer NEFT #..."
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenRecordDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitPayment}
            disabled={submitting || !formData.invoice || confirmedInvoices.length === 0}
            sx={{ fontWeight: 600 }}
          >
            {submitting ? 'Recording...' : 'Save Payment'}
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
