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
  CircularProgress,
} from '@mui/material'
import client from '../api/client'

export default function Templates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/quotation-templates/')
      .then((res) => setTemplates(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Quotation Templates
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Standardized bundles with preconfigured lines
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
                <TableCell><strong>Template Name</strong></TableCell>
                <TableCell><strong>Plan ID</strong></TableCell>
                <TableCell><strong>Validity Days</strong></TableCell>
                <TableCell><strong>Preconfigured Lines</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((tpl) => (
                <TableRow key={tpl.id} hover>
                  <TableCell>{tpl.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {tpl.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{tpl.plan}</TableCell>
                  <TableCell>{tpl.validity_days} days</TableCell>
                  <TableCell>{tpl.lines?.length || 0} product lines</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

