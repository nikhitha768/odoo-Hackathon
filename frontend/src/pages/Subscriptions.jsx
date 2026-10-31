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
} from '@mui/material'
import client from '../api/client'

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/subscriptions/')
      .then((res) => setSubscriptions(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

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
        return 'default'
    }
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Subscriptions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          All client subscriptions, lifecycle status and renewal schedules
        </Typography>
      </Box>

      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Number</strong></TableCell>
                <TableCell><strong>Customer</strong></TableCell>
                <TableCell><strong>Plan</strong></TableCell>
                <TableCell><strong>Period</strong></TableCell>
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
                      {sub.customer?.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {sub.customer?.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {sub.plan?.name} ({sub.plan?.billing_period})
                  </TableCell>
                  <TableCell>
                    {sub.start_date} to {sub.expiry_date}
                  </TableCell>
                  <TableCell>{sub.next_invoice_date}</TableCell>
                  <TableCell>
                    <Chip
                      label={sub.status.toUpperCase()}
                      color={getStatusColor(sub.status)}
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

