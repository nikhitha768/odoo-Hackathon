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
import client from '../api/client'
import { useAuth } from '../auth'

export default function MySubscriptions() {
  const { user } = useAuth()

  const [subscriptions, setSubscriptions] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  // Detail dialog
  const [openDetail, setOpenDetail] = useState(false)
  const [selectedSub, setSelectedSub] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let ignore = false

    const fetchMySubscriptions = async () => {
      try {
        const res = await client.get('/subscriptions/', { params: { page: page + 1 } })
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
          setListError(err.response?.data?.detail || 'Failed to fetch your subscriptions.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchMySubscriptions()
    return () => {
      ignore = true
    }
  }, [page])

  const handleOpenDetail = async (sub) => {
    setSelectedSub(sub)
    setOpenDetail(true)
    setDetailLoading(true)
    try {
      const res = await client.get(`/subscriptions/${sub.id}/`)
      setSelectedSub(res.data)
    } catch {
      // Fallback to row item
    } finally {
      setDetailLoading(false)
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
      default:
        return 'secondary'
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          My Subscriptions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View your recurring plans, validity terms and renewal schedules
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Logged in as <strong>{user?.name}</strong> ({user?.email}). You only see subscriptions associated with your account.
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
              Loading your subscriptions...
            </Typography>
          </Box>
        ) : subscriptions.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No subscriptions found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              You do not have any active or past subscription contracts registered yet.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Subscription #</strong></TableCell>
                <TableCell><strong>Plan</strong></TableCell>
                <TableCell><strong>Start Date</strong></TableCell>
                <TableCell><strong>Expiry Date</strong></TableCell>
                <TableCell><strong>Next Invoice</strong></TableCell>
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
                    {sub.plan?.name || '-'} ({sub.plan?.billing_period})
                  </TableCell>
                  <TableCell>{sub.start_date}</TableCell>
                  <TableCell>{sub.expiry_date}</TableCell>
                  <TableCell>{sub.next_invoice_date || '-'}</TableCell>
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

      {/* DETAIL DIALOG */}
      <Dialog open={openDetail} onClose={() => setOpenDetail(false)} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption" color="text.secondary">
                        Plan
                      </Typography>
                      <Typography variant="body1" fontWeight={700}>
                        {selectedSub.plan?.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Billing Period: {selectedSub.plan?.billing_period}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Start Date</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedSub.start_date}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Expiry Date</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedSub.expiry_date}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Next Invoice Date</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedSub.next_invoice_date || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Payment Term Days</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedSub.payment_term_days} days</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                Included Lines
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell><strong>Item</strong></TableCell>
                      <TableCell align="right"><strong>Qty</strong></TableCell>
                      <TableCell align="right"><strong>Unit Price</strong></TableCell>
                      <TableCell align="right"><strong>Amount</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedSub.lines && selectedSub.lines.length > 0 ? (
                      selectedSub.lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>Product #{l.product}</TableCell>
                          <TableCell align="right">{l.quantity}</TableCell>
                          <TableCell align="right">₹{l.unit_price}</TableCell>
                          <TableCell align="right"><strong>₹{l.amount}</strong></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No product lines found.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Stack spacing={0.5} sx={{ minWidth: 180 }}>
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
    </Box>
  )
}
