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

export default function Discounts() {
  const [discounts, setDiscounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/discounts/')
      .then((res) => setDiscounts(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Discounts
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage promotional rules and automated invoice discounts
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
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell><strong>Value</strong></TableCell>
                <TableCell><strong>Applies To</strong></TableCell>
                <TableCell><strong>Min Purchase</strong></TableCell>
                <TableCell><strong>Validity Period</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {discounts.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>{d.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {d.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={d.type} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    {d.type === 'percent' ? `${d.value}%` : `₹${d.value}`}
                  </TableCell>
                  <TableCell>{d.applies_to}</TableCell>
                  <TableCell>{d.min_purchase ? `₹${d.min_purchase}` : 'None'}</TableCell>
                  <TableCell>{d.start_date} to {d.end_date}</TableCell>
                  <TableCell>
                    <Chip
                      label={d.is_active ? 'Active' : 'Inactive'}
                      color={d.is_active ? 'success' : 'default'}
                      size="small"
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

