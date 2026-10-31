import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Alert,
  CircularProgress,
  Button,
  Divider,
  Stack,
  Card,
  CardContent,
} from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CloseIcon from '@mui/icons-material/Close'
import PrintIcon from '@mui/icons-material/Print'
import client from '../api/client'
import { useAuth } from '../auth'

export default function MyInvoices() {
  const { user } = useAuth()

  const [invoices, setInvoices] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  // Detail dialog
  const [openDetail, setOpenDetail] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let ignore = false

    const fetchMyInvoices = async () => {
      try {
        const res = await client.get('/invoices/', { params: { page: page + 1 } })
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
          setListError(err.response?.data?.detail || 'Failed to fetch your invoices.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchMyInvoices()
    return () => {
      ignore = true
    }
  }, [page])

  const handleOpenDetail = async (inv) => {
    setSelectedInvoice(inv)
    setOpenDetail(true)
    setDetailLoading(true)
    try {
      const res = await client.get(`/invoices/${inv.id}/`)
      setSelectedInvoice(res.data)
    } catch {
      // Fallback
    } finally {
      setDetailLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
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

  const balanceDue = selectedInvoice
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
          #my-invoice-print, #my-invoice-print * {
            visibility: visible;
          }
          #my-invoice-print {
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

      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          My Invoices
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review statements, invoice breakdown, settlement status and payment history
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Logged in as <strong>{user?.name}</strong> ({user?.email}). Showing all billing records issued to your account.
      </Alert>

      {listError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {listError}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 2 }} elevation={1}>
        {loading ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Loading your invoices...
            </Typography>
          </Box>
        ) : invoices.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No invoices found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              You do not have any invoices issued at this time.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Invoice #</strong></TableCell>
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

      {/* INVOICE DETAIL & PRINT DIALOG */}
      <Dialog open={openDetail} onClose={() => setOpenDetail(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle className="no-print" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
            <Box id="my-invoice-print">
              <Box className="no-print" sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={handlePrint}>
                  Print Invoice
                </Button>
              </Box>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">
                        Customer
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
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                Invoice Items
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
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
                            No lines on this invoice.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
                <Stack spacing={0.5} sx={{ minWidth: 220 }}>
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
                    <Typography variant="subtitle1" fontWeight={700}>₹{selectedInvoice.total}</Typography>
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
                      ₹{balanceDue}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              {/* Payments List */}
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                Payment History
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell><strong>Payment Ref</strong></TableCell>
                      <TableCell><strong>Method</strong></TableCell>
                      <TableCell><strong>Date</strong></TableCell>
                      <TableCell align="right"><strong>Amount Paid</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedInvoice.payments && selectedInvoice.payments.length > 0 ? (
                      selectedInvoice.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>#{p.id}</TableCell>
                          <TableCell>
                            <Chip label={p.method.toUpperCase()} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>{p.payment_date}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={700} color="success.main">
                              ₹{p.amount}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No payment transactions recorded for this invoice yet.
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
    </Box>
  )
}
