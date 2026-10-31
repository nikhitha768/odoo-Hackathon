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

export default function Taxes() {
  const [taxes, setTaxes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/taxes/')
      .then((res) => setTaxes(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Tax Rates
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure system taxes applied to subscription line items
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
                <TableCell><strong>Tax Name</strong></TableCell>
                <TableCell><strong>Rate Percent</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {taxes.map((tax) => (
                <TableRow key={tax.id} hover>
                  <TableCell>{tax.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {tax.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{tax.rate_percent}%</TableCell>
                  <TableCell>
                    <Chip
                      label={tax.is_active ? 'Active' : 'Inactive'}
                      color={tax.is_active ? 'success' : 'default'}
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

