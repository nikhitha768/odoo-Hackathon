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

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/products/')
      .then((res) => setProducts(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Products Catalog
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage services, goods and addons
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
                <TableCell><strong>Sales Price</strong></TableCell>
                <TableCell><strong>Cost Price</strong></TableCell>
                <TableCell><strong>Variants</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{p.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.notes}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={p.type} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>₹{p.sales_price}</TableCell>
                  <TableCell>₹{p.cost_price}</TableCell>
                  <TableCell>
                    {p.variants?.map((v) => (
                      <Chip
                        key={v.id}
                        label={`${v.attribute}: ${v.value} (+₹${v.extra_price})`}
                        size="small"
                        sx={{ mr: 0.5 }}
                      />
                    )) || 'None'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={p.is_active ? 'Active' : 'Inactive'}
                      color={p.is_active ? 'success' : 'default'}
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

