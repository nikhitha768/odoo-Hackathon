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

export default function Staff() {
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/staff/')
      .then((res) => setStaffList(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Staff Members
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage internal staff accounts and access permissions
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
                <TableCell><strong>Email</strong></TableCell>
                <TableCell><strong>Role</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {staffList.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>{s.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {s.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>
                    <Chip label="Staff" color="primary" size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={s.is_active ? 'Active' : 'Inactive'}
                      color={s.is_active ? 'success' : 'default'}
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

