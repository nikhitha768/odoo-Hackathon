import { useState, useEffect, useRef } from 'react'
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Snackbar,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import client from '../api/client'
import { useAuth } from '../auth'

export default function Templates() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.is_superuser
  const lineCounterRef = useRef(1)

  // List view state
  const [templates, setTemplates] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // External options
  const [plans, setPlans] = useState([])
  const [products, setProducts] = useState([])

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Create / Edit modal state
  const [openModal, setOpenModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [generalError, setGeneralError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    plan: '',
    validity_days: 30,
    lines: [],
  })

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch templates
  useEffect(() => {
    let ignore = false

    const fetchTemplates = async () => {
      try {
        const res = await client.get('/quotation-templates/', { params: { page: page + 1 } })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setTemplates(data)
            setTotalCount(data.length)
          } else {
            setTemplates(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch quotation templates.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchTemplates()
    return () => {
      ignore = true
    }
  }, [page, refreshTrigger])

  // Load plans and products
  useEffect(() => {
    client.get('/plans/').then((res) => {
      const d = res.data
      setPlans(Array.isArray(d) ? d : d.results || [])
    }).catch(() => {})

    client.get('/products/').then((res) => {
      const d = res.data
      setProducts(Array.isArray(d) ? d : d.results || [])
    }).catch(() => {})
  }, [])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingTemplate(null)
    setFormData({
      name: '',
      plan: plans.length > 0 ? plans[0].id : '',
      validity_days: 30,
      lines: [],
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (tpl) => {
    setEditingTemplate(tpl)
    setFormData({
      name: tpl.name || '',
      plan: tpl.plan || '',
      validity_days: tpl.validity_days || 30,
      lines: Array.isArray(tpl.lines)
        ? tpl.lines.map((l) => ({
            id: l.id,
            keyId: ++lineCounterRef.current,
            product: l.product || '',
            variant: l.variant || '',
            quantity: l.quantity || 1,
            unit_price: l.unit_price || '',
          }))
        : [],
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Line item manipulation
  const handleAddLine = () => {
    setFormData((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          keyId: ++lineCounterRef.current,
          product: '',
          variant: '',
          quantity: 1,
          unit_price: '',
        },
      ],
    }))
  }

  const handleRemoveLine = (index) => {
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, idx) => idx !== index),
    }))
  }

  const handleLineChange = (index, field, val) => {
    setFormData((prev) => {
      const next = [...prev.lines]
      const updated = { ...next[index], [field]: val }

      if (field === 'product') {
        const prod = products.find((p) => p.id === val)
        if (prod) {
          updated.unit_price = prod.sales_price || '0.00'
          updated.variant = ''
        }
      }

      next[index] = updated
      return { ...prev, lines: next }
    })
  }

  // Validate Form
  const validateForm = () => {
    const errors = {}
    if (!formData.name.trim()) {
      errors.name = 'Template name is required.'
    }
    if (!formData.plan) {
      errors.plan = 'Plan is required.'
    }
    const days = parseInt(formData.validity_days, 10)
    if (isNaN(days) || days < 1) {
      errors.validity_days = 'Validity days must be at least 1.'
    }

    formData.lines.forEach((l, idx) => {
      if (!l.product) {
        errors[`line_${idx}_product`] = 'Product required.'
      }
      if (Number(l.quantity) < 1) {
        errors[`line_${idx}_quantity`] = 'Qty >= 1.'
      }
      const unit = parseFloat(l.unit_price)
      if (isNaN(unit) || unit < 0) {
        errors[`line_${idx}_unit_price`] = 'Price >= 0.'
      }
    })

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Submit Template
  const handleSubmitTemplate = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError('')

    const payload = {
      name: formData.name.trim(),
      plan: Number(formData.plan),
      validity_days: parseInt(formData.validity_days, 10),
      lines: formData.lines.map((l) => ({
        id: l.id,
        product: Number(l.product),
        variant: l.variant ? Number(l.variant) : null,
        quantity: parseInt(l.quantity, 10) || 1,
        unit_price: parseFloat(l.unit_price || 0).toFixed(2),
      })),
    }

    try {
      if (editingTemplate) {
        await client.put(`/quotation-templates/${editingTemplate.id}/`, payload)
        setSnackbar({ open: true, message: 'Template updated successfully.', severity: 'success' })
      } else {
        await client.post('/quotation-templates/', payload)
        setSnackbar({ open: true, message: 'Template created successfully.', severity: 'success' })
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
        setGeneralError('Failed to save quotation template.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Delete Template
  const handleDeleteClick = (tpl) => {
    setTemplateToDelete(tpl)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!templateToDelete) return
    setDeleting(true)
    try {
      await client.delete(`/quotation-templates/${templateToDelete.id}/`)
      setSnackbar({ open: true, message: 'Template deleted successfully.', severity: 'info' })
      setDeleteDialogOpen(false)
      setTemplateToDelete(null)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to delete template.',
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
            Quotation Templates
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Standardized subscription packages with preconfigured product lines
          </Typography>
        </Box>

        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ fontWeight: 600 }}
          >
            New Template
          </Button>
        )}
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
              Loading templates...
            </Typography>
          </Box>
        ) : templates.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No quotation templates found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Create standard quotation templates to fast-track new subscription onboarding.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Template Name</strong></TableCell>
                <TableCell><strong>Assigned Plan</strong></TableCell>
                <TableCell><strong>Validity</strong></TableCell>
                <TableCell align="center"><strong>Configured Lines</strong></TableCell>
                {isAdmin && <TableCell align="right"><strong>Actions</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((tpl) => {
                const planObj = plans.find((p) => p.id === tpl.plan)
                const lineCount = Array.isArray(tpl.lines) ? tpl.lines.length : 0

                return (
                  <TableRow key={tpl.id} hover>
                    <TableCell>#{tpl.id}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {tpl.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {planObj ? `${planObj.name} (${planObj.billing_period})` : `Plan #${tpl.plan}`}
                    </TableCell>
                    <TableCell>{tpl.validity_days} days</TableCell>
                    <TableCell align="center">
                      <Tooltip
                        title={
                          lineCount > 0
                            ? tpl.lines
                                .map((l) => {
                                  const prod = products.find((p) => p.id === l.product)
                                  return `${prod?.name || 'Item'} x ${l.quantity} (â‚¹${l.unit_price})`
                                })
                                .join(', ')
                            : 'No lines'
                        }
                      >
                        <Typography variant="body2" color={lineCount > 0 ? 'primary.main' : 'text.secondary'}>
                          {lineCount} item{lineCount === 1 ? '' : 's'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleOpenEdit(tpl)}
                          title="Edit Template"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteClick(tpl)}
                          title="Delete Template"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
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

      {/* CREATE / EDIT TEMPLATE MODAL */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>
            {editingTemplate ? `Edit Template #${editingTemplate.id}` : 'New Quotation Template'}
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
            {/* Name */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Template Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
              />
            </Grid>

            {/* Plan */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" error={Boolean(formErrors.plan)}>
                <InputLabel id="tpl-plan-select">Plan *</InputLabel>
                <Select
                  labelId="tpl-plan-select"
                  value={formData.plan}
                  label="Plan *"
                  onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                >
                  {plans.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} ({p.billing_period} - â‚¹{p.price})
                    </MenuItem>
                  ))}
                </Select>
                {formErrors.plan && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {formErrors.plan}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            {/* Validity Days */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Validity Days *"
                type="number"
                value={formData.validity_days}
                onChange={(e) => setFormData({ ...formData, validity_days: e.target.value })}
                error={Boolean(formErrors.validity_days)}
                helperText={formErrors.validity_days}
                inputProps={{ min: 1 }}
              />
            </Grid>
          </Grid>

          {/* Lines Section */}
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Preconfigured Product Lines
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={handleAddLine}>
                Add Line
              </Button>
            </Box>

            {formData.lines.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
                No line items added yet. Click &quot;Add Line&quot; to bundle products into this quotation template.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell><strong>Product *</strong></TableCell>
                      <TableCell width={160}><strong>Variant</strong></TableCell>
                      <TableCell width={100}><strong>Qty *</strong></TableCell>
                      <TableCell width={130}><strong>Unit Price (â‚¹)</strong></TableCell>
                      <TableCell width={50}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {formData.lines.map((l, idx) => {
                      const selectedProd = products.find((p) => p.id === l.product)
                      const availableVariants = selectedProd?.variants || []

                      return (
                        <TableRow key={l.keyId || idx}>
                          <TableCell>
                            <FormControl fullWidth size="small" error={Boolean(formErrors[`line_${idx}_product`])}>
                              <Select
                                value={l.product}
                                onChange={(e) => handleLineChange(idx, 'product', e.target.value)}
                              >
                                {products.map((p) => (
                                  <MenuItem key={p.id} value={p.id}>
                                    {p.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>

                          <TableCell>
                            <FormControl fullWidth size="small">
                              <Select
                                value={l.variant || ''}
                                onChange={(e) => handleLineChange(idx, 'variant', e.target.value)}
                                disabled={availableVariants.length === 0}
                              >
                                <MenuItem value="">Default</MenuItem>
                                {availableVariants.map((v) => (
                                  <MenuItem key={v.id} value={v.id}>
                                    {v.attribute}: {v.value}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>

                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              value={l.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                              error={Boolean(formErrors[`line_${idx}_quantity`])}
                              inputProps={{ min: 1 }}
                            />
                          </TableCell>

                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              value={l.unit_price}
                              onChange={(e) => handleLineChange(idx, 'unit_price', e.target.value)}
                              error={Boolean(formErrors[`line_${idx}_unit_price`])}
                              inputProps={{ min: 0, step: '0.01' }}
                            />
                          </TableCell>

                          <TableCell align="center">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveLine(idx)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitTemplate}
            disabled={submitting}
            sx={{ fontWeight: 600 }}
          >
            {submitting ? 'Saving...' : editingTemplate ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete quotation template <strong>{templateToDelete?.name}</strong>?
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
