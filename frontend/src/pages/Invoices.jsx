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
  InputAdornment,
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
  Divider,
  Stack,
  Card,
  CardContent,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CloseIcon from '@mui/icons-material/Close'
import PrintIcon from '@mui/icons-material/Print'
import SendIcon from '@mui/icons-material/Send'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import client from '../api/client'
import { useAuth } from '../auth'

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function Invoices() {
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'

  // List view state
  const [invoices, setInvoices] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [statusFilter, setStatusFilter] = useState('all')
  const [customerFilter, setCustomerFilter] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Customer options for filtering
  const [customers, setCustomers] = useState([])

  // Detail Modal State
  const [openDetail, setOpenDetail] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  // Generate Invoices Modal State
  const [openGenerate, setOpenGenerate] = useState(false)
  const [generateDate, setGenerateDate] = useState(getTodayStr)
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState(null)

  // Fetch Invoices
  useEffect(() => {
    let ignore = false

    const fetchInvoices = async () => {
      try {
        const params = {
          page: page + 1,
        }
        if (statusFilter !== 'all') {
          params.status = statusFilter
        }
        if (customerFilter !== 'all') {
          params.customer = customerFilter
        }
        if (overdueOnly) {
          params.overdue = 'true'
        }
        if (searchTerm.trim()) {
          params.search = searchTerm.trim()
        }

        const res = await client.get('/invoices/', { params })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setInvoices(data)
            setTotalCount(data.length)
          } else {
            setInvoices(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch invoices.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchInvoices()
    return () => {
      ignore = true
    }
  }, [page, statusFilter, customerFilter, overdueOnly, searchTerm, refreshTrigger])

  // Load customer filter options for staff
  useEffect(() => {
    if (!isCustomer) {
      client
        .get('/customers/')
        .then((res) => {
          const d = res.data
          setCustomers(Array.isArray(d) ? d : d.results || [])
        })
        .catch(() => {})
    }
  }, [isCustomer])

  // Open Detail
  const handleOpenDetail = async (invoice) => {
    setSelectedInvoice(invoice)
    setOpenDetail(true)
    setActionError('')
    setDetailLoading(true)

    try {
      const res = await client.get(`/invoices/${invoice.id}/`)
      setSelectedInvoice(res.data)
    } catch {
      // Fall back to the row item
    } finally {
      setDetailLoading(false)
    }
  }

  // Confirm Invoice Action
  const handleConfirmInvoice = async () => {
    if (!selectedInvoice) return
    setActionLoading(true)
    setActionError('')

    try {
      const res = await client.post(`/invoices/${selectedInvoice.id}/confirm/`)
      setSelectedInvoice(res.data)
      setSnackbar({
        open: true,
        message: `Invoice ${selectedInvoice.number} confirmed successfully.`,
        severity: 'success',
      })
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to confirm invoice.')
    } finally {
      setActionLoading(false)
    }
  }

  // Cancel Invoice Action
  const handleCancelInvoice = async () => {
    if (!selectedInvoice) return
    setActionLoading(true)
    setActionError('')

    try {
      const res = await client.post(`/invoices/${selectedInvoice.id}/cancel/`)
      setSelectedInvoice(res.data)
      setSnackbar({
        open: true,
        message: `Invoice ${selectedInvoice.number} cancelled.`,
        severity: 'info',
      })
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to cancel invoice.')
    } finally {
      setActionLoading(false)
    }
  }

  // Send Invoice Action
  const handleSendInvoice = async () => {
    if (!selectedInvoice) return
    setActionLoading(true)
    setActionError('')

    try {
      const res = await client.post(`/invoices/${selectedInvoice.id}/send/`)
      setSelectedInvoice(res.data)
      setSnackbar({
        open: true,
        message: `Invoice ${selectedInvoice.number} sent to customer.`,
        severity: 'success',
      })
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to send invoice.')
    } finally {
      setActionLoading(false)
    }
  }

  // Print Invoice
  const handlePrintInvoice = () => {
    window.print()
  }

  // Generate Invoices Action
  const handleGenerateInvoices = async () => {
    setGenerating(true)
    setGenerateResult(null)

    try {
      const res = await client.post('/invoices/generate/', {
        as_of_date: generateDate,
      })
      setGenerateResult(res.data)
      setSnackbar({
        open: true,
        message: `Invoices generated: ${res.data.created} created, ${res.data.skipped} skipped.`,
        severity: 'success',
      })
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Invoice generation run failed.',
        severity: 'error',
      })
    } finally {
      setGenerating(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'success'
      case 'confirmed':
        return 'primary'
      case 'draft':
        return 'warning'
      case 'cancelled':
        return 'error'
      default:
        return 'default'
    }
  }

  const outstandingBalance = selectedInvoice
    ? (parseFloat(selectedInvoice.total || 0) - parseFloat(selectedInvoice.amount_paid || 0)).toFixed(2)
    : '0.00'

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #invoice-print-area, #invoice-print-area * {
            visibility: visible;
          }
          #invoice-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 24px;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

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
            Invoices
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track billing statements, generation cycles, payments and receivables
          </Typography>
        </Box>

        {!isCustomer && (
          <Button
            variant="contained"
            color="secondary"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => {
              setGenerateResult(null)
              setOpenGenerate(true)
            }}
            sx={{ fontWeight: 600 }}
          >
            Generate Invoices
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }} elevation={1}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by invoice #, customer..."
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

          <Grid item xs={12} sm={6} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="status-select-label">Status</InputLabel>
              <Select
                labelId="status-select-label"
                value={statusFilter}
                label="Status"
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(0)
                  setLoading(true)
                }}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="confirmed">Confirmed</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {!isCustomer && (
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel id="cust-select-label">Customer</InputLabel>
                <Select
                  labelId="cust-select-label"
                  value={customerFilter}
                  label="Customer"
                  onChange={(e) => {
                    setCustomerFilter(e.target.value)
                    setPage(0)
                    setLoading(true)
                  }}
                >
                  <MenuItem value="all">All Customers</MenuItem>
                  {customers.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          <Grid item xs={12} sm={6} md={2.5}>
            <FormControlLabel
              control={
                <Switch
                  checked={overdueOnly}
                  onChange={(e) => {
                    setOverdueOnly(e.target.checked)
                    setPage(0)
                    setLoading(true)
                  }}
                  color="error"
                />
              }
              label={
                <Typography variant="body2" fontWeight={600} color={overdueOnly ? 'error.main' : 'text.primary'}>
                  Overdue Only
                </Typography>
              }
            />
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
              Loading invoices...
            </Typography>
          </Box>
        ) : invoices.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No invoices found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Try adjusting your filter options or trigger invoice generation.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Invoice #</strong></TableCell>
                <TableCell><strong>Customer</strong></TableCell>
                <TableCell><strong>Issue Date</strong></TableCell>
                <TableCell><strong>Due Date</strong></TableCell>
                <TableCell align="right"><strong>Total Amount</strong></TableCell>
                <TableCell align="right"><strong>Paid</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {inv.number}
                    </Typography>
                    {inv.is_overdue && (
                      <Chip label="OVERDUE" color="error" size="small" sx={{ height: 18, fontSize: '0.65rem', mt: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {inv.customer?.name || 'N/A'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {inv.customer?.email}
                    </Typography>
                  </TableCell>
                  <TableCell>{inv.issue_date}</TableCell>
                  <TableCell>{inv.due_date}</TableCell>
                  <TableCell align="right"><strong>₹{inv.total}</strong></TableCell>
                  <TableCell align="right">₹{inv.amount_paid}</TableCell>
                  <TableCell>
                    <Chip
                      label={inv.status ? inv.status.toUpperCase() : 'UNKNOWN'}
                      color={getStatusColor(inv.status)}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => handleOpenDetail(inv)}
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

      {/* GENERATE INVOICES DIALOG */}
      <Dialog open={openGenerate} onClose={() => setOpenGenerate(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>
            Run Invoice Generation Cycle
          </Typography>
          <IconButton size="small" onClick={() => setOpenGenerate(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Generates draft invoices for active subscriptions whose next invoice date is on or before the selected date.
          </Typography>

          <TextField
            fullWidth
            size="small"
            label="As Of Date"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={generateDate}
            onChange={(e) => setGenerateDate(e.target.value)}
            sx={{ mb: 3 }}
          />

          {generateResult && (
            <Alert
              severity={generateResult.created > 0 ? 'success' : 'info'}
              sx={{ mb: 2 }}
            >
              <Typography variant="body2" fontWeight={600}>
                Generation Results:
              </Typography>
              <Typography variant="body2">
                • Invoices Created: {generateResult.created}
              </Typography>
              <Typography variant="body2">
                • Subscriptions Skipped: {generateResult.skipped}
              </Typography>
              {Array.isArray(generateResult.reasons) && generateResult.reasons.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Skipped details: {generateResult.reasons.map((r) => `${r.number}: ${r.reason}`).join(', ')}
                  </Typography>
                </Box>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenGenerate(false)}>Close</Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleGenerateInvoices}
            disabled={generating}
            sx={{ fontWeight: 600 }}
          >
            {generating ? 'Processing...' : 'Run Generation'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DETAIL MODAL WITH LINES, TOTALS, PAYMENTS, AND CONFIRM/CANCEL/SEND/PRINT BUTTONS */}
      <Dialog
        open={openDetail}
        onClose={() => setOpenDetail(false)}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle className="no-print" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" fontWeight={700}>
              Invoice {selectedInvoice?.number}
            </Typography>
            {selectedInvoice && (
              <Chip
                label={selectedInvoice.status.toUpperCase()}
                color={getStatusColor(selectedInvoice.status)}
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
          ) : selectedInvoice ? (
            <Box id="invoice-print-area">
              {/* Action Error */}
              {actionError && (
                <Alert severity="error" className="no-print" sx={{ mb: 2 }}>
                  {actionError}
                </Alert>
              )}

              {/* Action Toolbar */}
              <Box
                className="no-print"
                sx={{
                  bgcolor: 'grey.50',
                  p: 2,
                  borderRadius: 2,
                  mb: 3,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 1.5,
                }}
              >
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {/* Confirm: only when draft */}
                  {!isCustomer && (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<CheckCircleIcon />}
                      disabled={actionLoading || selectedInvoice.status !== 'draft'}
                      onClick={handleConfirmInvoice}
                    >
                      Confirm
                    </Button>
                  )}

                  {/* Cancel: only when draft or confirmed */}
                  {!isCustomer && (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<CancelIcon />}
                      disabled={
                        actionLoading ||
                        (selectedInvoice.status !== 'draft' && selectedInvoice.status !== 'confirmed')
                      }
                      onClick={handleCancelInvoice}
                    >
                      Cancel
                    </Button>
                  )}

                  {/* Send: enabled only when invoice is not cancelled */}
                  {!isCustomer && (
                    <Button
                      variant="outlined"
                      color="info"
                      size="small"
                      startIcon={<SendIcon />}
                      disabled={actionLoading || selectedInvoice.status === 'cancelled'}
                      onClick={handleSendInvoice}
                    >
                      {selectedInvoice.sent_at ? 'Resend' : 'Send'}
                    </Button>
                  )}
                </Stack>

                {/* Print: enabled for all statuses */}
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PrintIcon />}
                  onClick={handlePrintInvoice}
                >
                  Print
                </Button>
              </Box>

              {/* Header and metadata */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">
                        Billed To
                      </Typography>
                      <Typography variant="body1" fontWeight={700}>
                        {selectedInvoice.customer?.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedInvoice.customer?.email}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">
                        Billing Dates
                      </Typography>
                      <Typography variant="body2">
                        <strong>Issue Date:</strong> {selectedInvoice.issue_date}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Due Date:</strong> {selectedInvoice.due_date}
                      </Typography>
                      {selectedInvoice.sent_at && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          Sent at: {new Date(selectedInvoice.sent_at).toLocaleString()}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Lines Table */}
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                Invoice Items
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell><strong>Description</strong></TableCell>
                      <TableCell align="right"><strong>Qty</strong></TableCell>
                      <TableCell align="right"><strong>Unit Price</strong></TableCell>
                      <TableCell align="right"><strong>Discount</strong></TableCell>
                      <TableCell align="right"><strong>Tax</strong></TableCell>
                      <TableCell align="right"><strong>Amount</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedInvoice.lines && selectedInvoice.lines.length > 0 ? (
                      selectedInvoice.lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>{l.description || `Item #${l.id}`}</TableCell>
                          <TableCell align="right">{l.quantity}</TableCell>
                          <TableCell align="right">₹{l.unit_price}</TableCell>
                          <TableCell align="right">₹{l.discount_amount || '0.00'}</TableCell>
                          <TableCell align="right">
                            ₹{l.tax_amount || '0.00'} ({l.tax_rate_percent}%)
                          </TableCell>
                          <TableCell align="right"><strong>₹{l.amount}</strong></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No lines present on this invoice.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Financial Totals Breakdown */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
                <Stack spacing={0.6} sx={{ minWidth: 240 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Subtotal:</Typography>
                    <Typography variant="body2">₹{selectedInvoice.subtotal}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Discount Total:</Typography>
                    <Typography variant="body2" color="error.main">-₹{selectedInvoice.discount_total || '0.00'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Tax Total:</Typography>
                    <Typography variant="body2">₹{selectedInvoice.tax_total}</Typography>
                  </Box>
                  <Divider sx={{ my: 0.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle1" fontWeight={700}>Total:</Typography>
                    <Typography variant="subtitle1" fontWeight={700}>
                      ₹{selectedInvoice.total}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Amount Paid:</Typography>
                    <Typography variant="body2" color="success.main">₹{selectedInvoice.amount_paid}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle2" fontWeight={700} color="error.main">
                      Balance Due:
                    </Typography>
                    <Typography variant="subtitle2" fontWeight={700} color="error.main">
                      ₹{outstandingBalance}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              {/* Payments List */}
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                Recorded Payments
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell><strong>ID</strong></TableCell>
                      <TableCell><strong>Method</strong></TableCell>
                      <TableCell><strong>Date</strong></TableCell>
                      <TableCell align="right"><strong>Amount</strong></TableCell>
                      <TableCell><strong>Note</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedInvoice.payments && selectedInvoice.payments.length > 0 ? (
                      selectedInvoice.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.id}</TableCell>
                          <TableCell>
                            <Chip label={p.method.toUpperCase()} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>{p.payment_date}</TableCell>
                          <TableCell align="right"><strong>₹{p.amount}</strong></TableCell>
                          <TableCell>{p.note || '-'}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No payments recorded yet for this invoice.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : null}
        </DialogContent>

        <DialogActions className="no-print" sx={{ p: 2 }}>
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
