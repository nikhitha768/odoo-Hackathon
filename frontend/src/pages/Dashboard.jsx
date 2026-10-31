import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
} from '@mui/material'
import SubscriptionsIcon from '@mui/icons-material/Subscriptions'
import ReceiptIcon from '@mui/icons-material/Receipt'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import client from '../api/client'
import { useAuth } from '../auth'

export default function Dashboard() {
  const { user } = useAuth()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function fetchSummary() {
      try {
        const res = await client.get('/reports/summary/')
        if (mounted) setSummary(res.data)
      } catch (err) {
        if (mounted) setError(err.response?.data?.detail || 'Failed to load report summary')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchSummary()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Welcome back, {user?.name}! Here is an overview of subscription metrics.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : summary ? (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'primary.light',
                    color: 'primary.contrastText',
                    display: 'flex',
                  }}
                >
                  <SubscriptionsIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    ACTIVE SUBSCRIPTIONS
                  </Typography>
                  <Typography variant="h4" fontWeight={700}>
                    {summary.active_subscriptions}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'info.light',
                    color: 'info.contrastText',
                    display: 'flex',
                  }}
                >
                  <ReceiptIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    TOTAL INVOICED
                  </Typography>
                  <Typography variant="h4" fontWeight={700}>
                    ₹{summary.total_invoiced}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'success.light',
                    color: 'success.contrastText',
                    display: 'flex',
                  }}
                >
                  <AccountBalanceWalletIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    REVENUE RECEIVED
                  </Typography>
                  <Typography variant="h4" fontWeight={700}>
                    ₹{summary.revenue_received}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'warning.light',
                    color: 'warning.contrastText',
                    display: 'flex',
                  }}
                >
                  <PendingActionsIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    OUTSTANDING BALANCE
                  </Typography>
                  <Typography variant="h4" fontWeight={700}>
                    ₹{summary.outstanding}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'error.light',
                    color: 'error.contrastText',
                    display: 'flex',
                  }}
                >
                  <WarningAmberIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    OVERDUE ({summary.overdue_count} INVOICES)
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="error.main">
                    ₹{summary.overdue_amount}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : null}
    </Box>
  )
}

