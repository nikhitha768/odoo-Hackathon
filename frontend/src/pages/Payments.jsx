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

export default function Payments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/payments/')
      .then((res) => setPayments(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Payments
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Recorded manual transactions and settlement logs
        </Typography>
      </Box>

      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Invoice Ref</strong></TableCell>
                <TableCell><strong>Method</strong></TableCell>
                <TableCell><strong>Amount</strong></TableCell>
                <TableCell><strong>Payment Date</strong></TableCell>
                <TableCell><strong>Note</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{p.id}</TableCell>
                  <TableCell>Invoice #{p.invoice}</TableCell>
                  <TableCell>
                    <Chip label={p.method.toUpperCase()} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell><strong>₹{p.amount}</strong></TableCell>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell>{p.note || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

