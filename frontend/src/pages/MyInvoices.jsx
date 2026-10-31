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

export default function MyInvoices() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/invoices/')
      .then((res) => setInvoices(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'success'
      case 'confirmed':
        return 'primary'
      default:
        return 'default'
    }
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          My Invoices
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review statements, invoice breakdown and settlement status
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Signed in as <strong>{user?.name}</strong> ({user?.email}). You only see your own invoices.
      </Alert>

      {loading ? (
        <CircularProgress />
      ) : invoices.length === 0 ? (
        <Typography color="text.secondary">No invoices found for your account.</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>Invoice #</strong></TableCell>
                <TableCell><strong>Issue Date</strong></TableCell>
                <TableCell><strong>Due Date</strong></TableCell>
                <TableCell><strong>Total Amount</strong></TableCell>
                <TableCell><strong>Amount Paid</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
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
                  <TableCell><strong>₹{inv.total}</strong></TableCell>
                  <TableCell>₹{inv.amount_paid}</TableCell>
                  <TableCell>
                    <Chip
                      label={inv.status.toUpperCase()}
                      color={getStatusColor(inv.status)}
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

