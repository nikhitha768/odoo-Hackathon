import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Stack,
} from '@mui/material'
import SubscriptionsIcon from '@mui/icons-material/Subscriptions'
import ReceiptIcon from '@mui/icons-material/Receipt'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import client from '../api/client'
import { useAuth } from '../auth'

export default function Dashboard() {
  const { user } = useAuth()

  // Date filters
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [appliedFilters, setAppliedFilters] = useState({ from: '', to: '' })

  // Summary Metrics
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')

  // Overdue Invoices
  const [overdueInvoices, setOverdueInvoices] = useState([])
  const [overdueCount, setOverdueCount] = useState(0)
  const [overduePage, setOverduePage] = useState(0)
  const [overdueLoading, setOverdueLoading] = useState(true)
  const [overdueError, setOverdueError] = useState('')

  // Monthly Revenue Chart Data
  const [monthlyRevenue, setMonthlyRevenue] = useState([])
  const [monthlyLoading, setMonthlyLoading] = useState(true)

  // 1. Fetch Summary
  useEffect(() => {
    let ignore = false

    const fetchSummary = async () => {
      try {
        const params = {}
        if (appliedFilters.from) params.from = appliedFilters.from
        if (appliedFilters.to) params.to = appliedFilters.to

        const res = await client.get('/reports/summary/', { params })
        if (!ignore) {
          setSummary(res.data)
        }
      } catch (err) {
        if (!ignore) {
          setSummaryError(err.response?.data?.detail || 'Failed to load report summary statistics.')
        }
      } finally {
        if (!ignore) {
          setSummaryLoading(false)
        }
      }
    }

    fetchSummary()
    return () => {
      ignore = true
    }
  }, [appliedFilters])

  // 2. Fetch Overdue Invoices
  useEffect(() => {
    let ignore = false

    const fetchOverdue = async () => {
      try {
        const params = {
          page: overduePage + 1,
        }
        if (appliedFilters.from) params.from = appliedFilters.from
        if (appliedFilters.to) params.to = appliedFilters.to

        const res = await client.get('/reports/overdue-invoices/', { params })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setOverdueInvoices(data)
            setOverdueCount(data.length)
          } else {
            setOverdueInvoices(data.results || [])
            setOverdueCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setOverdueError(err.response?.data?.detail || 'Failed to load overdue invoices.')
        }
      } finally {
        if (!ignore) {
          setOverdueLoading(false)
        }
      }
    }

    fetchOverdue()
    return () => {
      ignore = true
    }
  }, [overduePage, appliedFilters])

  // 3. Fetch Revenue by Month for Chart
  useEffect(() => {
    let ignore = false

    const fetchMonthly = async () => {
      try {
        const params = {}
        if (appliedFilters.from) params.from = appliedFilters.from
        if (appliedFilters.to) params.to = appliedFilters.to

        const res = await client.get('/reports/revenue-by-month/', { params })
        if (!ignore) {
          setMonthlyRevenue(Array.isArray(res.data) ? res.data : [])
        }
      } catch {
        if (!ignore) {
          setMonthlyRevenue([])
        }
      } finally {
        if (!ignore) {
          setMonthlyLoading(false)
        }
      }
    }

    fetchMonthly()
    return () => {
      ignore = true
    }
  }, [appliedFilters])

  const handleApplyFilters = () => {
    setSummaryLoading(true)
    setOverdueLoading(true)
    setMonthlyLoading(true)
    setOverduePage(0)
    setAppliedFilters({ from: fromDate, to: toDate })
  }

  const handleResetFilters = () => {
    setFromDate('')
    setToDate('')
    setSummaryLoading(true)
    setOverdueLoading(true)
    setMonthlyLoading(true)
    setOverduePage(0)
    setAppliedFilters({ from: '', to: '' })
  }

  // Calculate highest revenue amount for SVG chart scaling
  const maxBarValue = Math.max(
    1,
    ...monthlyRevenue.map((m) => Math.max(parseFloat(m.invoiced || 0), parseFloat(m.received || 0))),
  )

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Welcome Title */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Dashboard & Reports
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Welcome back, <strong>{user?.name}</strong>! Executive financial overview, revenue trajectories, and receivables
        </Typography>
      </Box>

      {/* Date Range Filter Bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }} elevation={1}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4} md={3}>
            <TextField
              fullWidth
              size="small"
              label="From Date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
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
              onChange={(e) => setToDate(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                size="small"
                startIcon={<FilterAltIcon />}
                onClick={handleApplyFilters}
                sx={{ fontWeight: 600 }}
              >
                Apply
              </Button>
              {(appliedFilters.from || appliedFilters.to) && (
                <Button size="small" onClick={handleResetFilters}>
                  Clear
                </Button>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {summaryError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {summaryError}
        </Alert>
      )}

      {/* Summary KPI Cards Grid */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {/* Active Subscriptions */}
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card elevation={1} sx={{ borderRadius: 2, height: '100%', borderLeft: '4px solid #1976d2' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  ACTIVE SUBS
                </Typography>
                <SubscriptionsIcon color="primary" fontSize="small" />
              </Box>
              {summaryLoading ? (
                <CircularProgress size={20} sx={{ mt: 1 }} />
              ) : (
                <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>
                  {summary?.active_subscriptions || 0}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Total Invoiced */}
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card elevation={1} sx={{ borderRadius: 2, height: '100%', borderLeft: '4px solid #9c27b0' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  TOTAL INVOICED
                </Typography>
                <ReceiptIcon color="secondary" fontSize="small" />
              </Box>
              {summaryLoading ? (
                <CircularProgress size={20} sx={{ mt: 1 }} />
              ) : (
                <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>
                  ₹{summary?.total_invoiced || '0.00'}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Revenue Received */}
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card elevation={1} sx={{ borderRadius: 2, height: '100%', borderLeft: '4px solid #2e7d32' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  REVENUE RECEIVED
                </Typography>
                <AccountBalanceWalletIcon color="success" fontSize="small" />
              </Box>
              {summaryLoading ? (
                <CircularProgress size={20} sx={{ mt: 1 }} />
              ) : (
                <Typography variant="h5" fontWeight={700} color="success.main" sx={{ mt: 0.5 }}>
                  ₹{summary?.revenue_received || '0.00'}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Outstanding Receivables */}
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card elevation={1} sx={{ borderRadius: 2, height: '100%', borderLeft: '4px solid #ed6c02' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  OUTSTANDING
                </Typography>
                <PendingActionsIcon color="warning" fontSize="small" />
              </Box>
              {summaryLoading ? (
                <CircularProgress size={20} sx={{ mt: 1 }} />
              ) : (
                <Typography variant="h5" fontWeight={700} color="warning.main" sx={{ mt: 0.5 }}>
                  ₹{summary?.outstanding || '0.00'}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Overdue Count */}
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card elevation={1} sx={{ borderRadius: 2, height: '100%', borderLeft: '4px solid #d32f2f' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  OVERDUE INVOICES
                </Typography>
                <WarningAmberIcon color="error" fontSize="small" />
              </Box>
              {summaryLoading ? (
                <CircularProgress size={20} sx={{ mt: 1 }} />
              ) : (
                <Typography variant="h5" fontWeight={700} color="error.main" sx={{ mt: 0.5 }}>
                  {summary?.overdue_count || 0}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Overdue Amount */}
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <Card elevation={1} sx={{ borderRadius: 2, height: '100%', borderLeft: '4px solid #c2185b' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  OVERDUE AMOUNT
                </Typography>
                <ErrorOutlinedIcon color="error" fontSize="small" />
              </Box>
              {summaryLoading ? (
                <CircularProgress size={20} sx={{ mt: 1 }} />
              ) : (
                <Typography variant="h5" fontWeight={700} color="error.main" sx={{ mt: 0.5 }}>
                  ₹{summary?.overdue_amount || '0.00'}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Monthly Revenue Chart */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 2 }} elevation={1}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Revenue by Month
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Monthly comparison of invoiced billing statements versus actual received payments
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ width: 14, height: 14, bgcolor: '#1976d2', borderRadius: '3px' }} />
              <Typography variant="caption" fontWeight={600}>Invoiced</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ width: 14, height: 14, bgcolor: '#2e7d32', borderRadius: '3px' }} />
              <Typography variant="caption" fontWeight={600}>Received</Typography>
            </Box>
          </Stack>
        </Box>

        {monthlyLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : monthlyRevenue.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No revenue transactions found for this date range.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto', pt: 2, pb: 1 }}>
            <Box sx={{ display: 'flex', gap: 3, minWidth: monthlyRevenue.length * 90, height: 220, alignItems: 'flex-end', px: 2 }}>
              {monthlyRevenue.map((item) => {
                const invVal = parseFloat(item.invoiced || 0)
                const recVal = parseFloat(item.received || 0)
                const invHeight = Math.max(8, Math.round((invVal / maxBarValue) * 160))
                const recHeight = Math.max(8, Math.round((recVal / maxBarValue) * 160))

                return (
                  <Box key={item.month} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'flex-end', height: 170 }}>
                      {/* Invoiced Bar */}
                      <Box
                        sx={{
                          width: 24,
                          height: `${invHeight}px`,
                          bgcolor: '#1976d2',
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s ease',
                        }}
                        title={`Invoiced: ₹${item.invoiced}`}
                      />
                      {/* Received Bar */}
                      <Box
                        sx={{
                          width: 24,
                          height: `${recHeight}px`,
                          bgcolor: '#2e7d32',
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s ease',
                        }}
                        title={`Received: ₹${item.received}`}
                      />
                    </Box>
                    <Typography variant="caption" fontWeight={600} sx={{ mt: 1 }}>
                      {item.month}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Overdue Invoices Table */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Overdue Invoices Action List
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Confirmed invoices past their payment due date with remaining receivable balances
        </Typography>
      </Box>

      {overdueError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {overdueError}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 2 }} elevation={1}>
        {overdueLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Checking overdue records...
            </Typography>
          </Box>
        ) : overdueInvoices.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="success.main" fontWeight={600}>
              ✓ No overdue invoices found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              All client payments are currently settled within their terms.
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Invoice #</strong></TableCell>
                <TableCell><strong>Customer</strong></TableCell>
                <TableCell><strong>Due Date</strong></TableCell>
                <TableCell align="right"><strong>Total Amount</strong></TableCell>
                <TableCell align="right"><strong>Amount Paid</strong></TableCell>
                <TableCell align="right"><strong>Outstanding</strong></TableCell>
                <TableCell align="center"><strong>Days Overdue</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {overdueInvoices.map((inv) => {
                const outstanding = (parseFloat(inv.total || 0) - parseFloat(inv.amount_paid || 0)).toFixed(2)
                return (
                  <TableRow key={inv.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {inv.number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{inv.customer?.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{inv.customer?.email}</Typography>
                    </TableCell>
                    <TableCell>{inv.due_date}</TableCell>
                    <TableCell align="right">₹{inv.total}</TableCell>
                    <TableCell align="right">₹{inv.amount_paid}</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700} color="error.main">
                        ₹{outstanding}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={`${inv.days_overdue || 0} days`}
                        color="error"
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        <TablePagination
          component="div"
          count={overdueCount}
          page={overduePage}
          onPageChange={(_, newPage) => {
            setOverduePage(newPage)
            setOverdueLoading(true)
          }}
          rowsPerPage={10}
          rowsPerPageOptions={[10]}
        />
      </TableContainer>
    </Box>
  )
}
