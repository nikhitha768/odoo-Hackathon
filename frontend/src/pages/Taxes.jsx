import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  FormControlLabel,
  Switch,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import client from '../api/client'

export default function Taxes() {
  // List view state
  const [taxes, setTaxes] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Create / Edit modal state
  const [openModal, setOpenModal] = useState(false)
  const [editingTax, setEditingTax] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [generalError, setGeneralError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    rate_percent: '18.00',
    is_active: true,
  })

  // Delete modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taxToDelete, setTaxToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch taxes
  useEffect(() => {
    let ignore = false

    const fetchTaxes = async () => {
      try {
        const res = await client.get('/taxes/', { params: { page: page + 1 } })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setTaxes(data)
            setTotalCount(data.length)
          } else {
            setTaxes(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch tax rates.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchTaxes()
    return () => {
      ignore = true
    }
  }, [page, refreshTrigger])

  // Open Create
  const handleOpenCreate = () => {
    setEditingTax(null)
    setFormData({
      name: '',
      rate_percent: '18.00',
      is_active: true,
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Open Edit
  const handleOpenEdit = (tax) => {
    setEditingTax(tax)
    setFormData({
      name: tax.name || '',
      rate_percent: tax.rate_percent || '0.00',
      is_active: tax.is_active !== undefined ? tax.is_active : true,
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Validate
  const validateForm = () => {
    const errors = {}
    if (!formData.name.trim()) {
      errors.name = 'Tax name is required.'
    }
    const rate = parseFloat(formData.rate_percent)
    if (isNaN(rate) || rate < 0 || rate > 100) {
      errors.rate_percent = 'Tax rate must be between 0% and 100%.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Submit
  const handleSubmitTax = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError('')

    const payload = {
      name: formData.name.trim(),
      rate_percent: parseFloat(formData.rate_percent).toFixed(2),
      is_active: formData.is_active,
    }

    try {
      if (editingTax) {
        await client.put(`/taxes/${editingTax.id}/`, payload)
        setSnackbar({ open: true, message: 'Tax updated successfully.', severity: 'success' })
      } else {
        await client.post('/taxes/', payload)
        setSnackbar({ open: true, message: 'Tax created successfully.', severity: 'success' })
      }
      setOpenModal(false)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        const nextErrors = {}
        Object.keys(data).forEach((key) => {
          if (key === 'detail' || key === 'non_field_errors') {
            setGeneralError(Array.isArray(data[key]) ? data[key][0] : data[key])
          } else {
            nextErrors[key] = Array.isArray(data[key]) ? data[key][0] : data[key]
          }
        })
        setFormErrors(nextErrors)
      } else {
        setGeneralError('Failed to save tax rate.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Delete
  const handleDeleteClick = (tax) => {
    setTaxToDelete(tax)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!taxToDelete) return
    setDeleting(true)
    try {
      await client.delete(`/taxes/${taxToDelete.id}/`)
      setSnackbar({ open: true, message: 'Tax rate deleted.', severity: 'info' })
      setDeleteDialogOpen(false)
      setTaxToDelete(null)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to delete tax. It may be linked to products or lines.',
        severity: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Tax Rates
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure system taxes applied to subscription line items and product catalog
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ fontWeight: 600 }}
        >
          New Tax Rate
        </Button>
      </Box>

      {listError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {listError}
        </Alert>
      )}

      {/* Table Container */}
      <TableContainer component={Paper} sx={{ borderRadius: 2 }} elevation={1}>
        {loading ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Loading tax rates...
            </Typography>
          </Box>
        ) : taxes.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No tax rates configured
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Create standard tax rates (e.g. GST 5%, GST 18%) for billing.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Tax Name</strong></TableCell>
                <TableCell align="right"><strong>Rate Percent</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {taxes.map((tax) => (
                <TableRow key={tax.id} hover>
                  <TableCell>#{tax.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {tax.name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <strong>{tax.rate_percent}%</strong>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={tax.is_active ? 'ACTIVE' : 'INACTIVE'}
                      size="small"
                      color={tax.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="primary" onClick={() => handleOpenEdit(tax)} title="Edit Tax">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteClick(tax)} title="Delete Tax">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, newPage) => {
            setPage(newPage)
            setLoading(true)
          }}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[10]}
        />
      </TableContainer>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>
            {editingTax ? `Edit Tax #${editingTax.id}` : 'New Tax Rate'}
          </Typography>
          <IconButton size="small" onClick={() => setOpenModal(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {generalError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {generalError}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Tax Name *"
                placeholder="e.g. GST 18%"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Rate Percent (0 - 100) *"
                type="number"
                value={formData.rate_percent}
                onChange={(e) => setFormData({ ...formData, rate_percent: e.target.value })}
                error={Boolean(formErrors.rate_percent)}
                helperText={formErrors.rate_percent}
                inputProps={{ min: 0, max: 100, step: '0.01' }}
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    color="primary"
                  />
                }
                label="Active Tax Rule"
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitTax}
            disabled={submitting}
            sx={{ fontWeight: 600 }}
          >
            {submitting ? 'Saving...' : editingTax ? 'Save Changes' : 'Create Tax'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete tax rate <strong>{taxToDelete?.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleting}
            sx={{ fontWeight: 600 }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Global Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
