import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material'
import client from '../api/client'
import { useAuth } from '../auth'

export default function MySubscriptions() {
  const { user } = useAuth()
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/subscriptions/')
      .then((res) => setSubscriptions(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          My Subscriptions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View your active plans, validity and scheduled renewals
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Signed in as <strong>{user?.name}</strong> ({user?.email}). You only see your own subscription data.
      </Alert>

      {loading ? (
        <CircularProgress />
      ) : subscriptions.length === 0 ? (
        <Typography color="text.secondary">No subscriptions found for your account.</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Subscription #</strong></TableCell>
                <TableCell><strong>Plan</strong></TableCell>
                <TableCell><strong>Start Date</strong></TableCell>
                <TableCell><strong>Expiry Date</strong></TableCell>
                <TableCell><strong>Next Invoice</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
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
                      {sub.plan?.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Billing: {sub.plan?.billing_period}
                    </Typography>
                  </TableCell>
                  <TableCell>{sub.start_date}</TableCell>
                  <TableCell>{sub.expiry_date}</TableCell>
                  <TableCell>{sub.next_invoice_date}</TableCell>
                  <TableCell>
                    <Chip
                      label={sub.status.toUpperCase()}
                      color={sub.status === 'active' ? 'success' : 'default'}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

