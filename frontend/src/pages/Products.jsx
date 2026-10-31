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
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
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
  Tooltip,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import client from '../api/client'
import { useAuth } from '../auth'

const PRODUCT_TYPES = [
  { value: 'service', label: 'Service' },
  { value: 'goods', label: 'Goods' },
  { value: 'addon', label: 'Add-on' },
]

export default function Products() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.is_superuser
  const variantCounterRef = useRef(1)

  // List view state
  const [products, setProducts] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Available taxes for dropdown
  const [taxes, setTaxes] = useState([])

  // Notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  // Create / Edit modal state
  const [openModal, setOpenModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [generalError, setGeneralError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    type: 'service',
    sales_price: '0.00',
    cost_price: '0.00',
    notes: '',
    default_tax: '',
    is_active: true,
    variants: [],
  })

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch products
  useEffect(() => {
    let ignore = false

    const fetchProducts = async () => {
      try {
        const params = {
          page: page + 1,
        }
        if (searchTerm.trim()) {
          params.search = searchTerm.trim()
        }

        const res = await client.get('/products/', { params })
        if (!ignore) {
          const data = res.data
          if (Array.isArray(data)) {
            setProducts(data)
            setTotalCount(data.length)
          } else {
            setProducts(data.results || [])
            setTotalCount(data.count || 0)
          }
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.response?.data?.detail || 'Failed to fetch products.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchProducts()
    return () => {
      ignore = true
    }
  }, [page, searchTerm, refreshTrigger])

  // Load taxes
  useEffect(() => {
    client
      .get('/taxes/')
      .then((res) => {
        const d = res.data
        setTaxes(Array.isArray(d) ? d : d.results || [])
      })
      .catch(() => {})
  }, [])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingProduct(null)
    setFormData({
      name: '',
      type: 'service',
      sales_price: '0.00',
      cost_price: '0.00',
      notes: '',
      default_tax: '',
      is_active: true,
      variants: [],
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (prod) => {
    setEditingProduct(prod)
    setFormData({
      name: prod.name || '',
      type: prod.type || 'service',
      sales_price: prod.sales_price || '0.00',
      cost_price: prod.cost_price || '0.00',
      notes: prod.notes || '',
      default_tax: prod.default_tax || '',
      is_active: prod.is_active !== undefined ? prod.is_active : true,
      variants: Array.isArray(prod.variants)
        ? prod.variants.map((v) => ({
            id: v.id,
            keyId: ++variantCounterRef.current,
            attribute: v.attribute || '',
            value: v.value || '',
            extra_price: v.extra_price || '0.00',
          }))
        : [],
    })
    setFormErrors({})
    setGeneralError('')
    setOpenModal(true)
  }

  // Variant management
  const handleAddVariant = () => {
    setFormData((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        {
          keyId: ++variantCounterRef.current,
          attribute: '',
          value: '',
          extra_price: '0.00',
        },
      ],
    }))
  }

  const handleRemoveVariant = (index) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, idx) => idx !== index),
    }))
  }

  const handleVariantChange = (index, field, val) => {
    setFormData((prev) => {
      const next = [...prev.variants]
      next[index] = { ...next[index], [field]: val }
      return { ...prev, variants: next }
    })
  }

  // Validate form
  const validateForm = () => {
    const errors = {}
    if (!formData.name.trim()) {
      errors.name = 'Product name is required.'
    }
    const sales = parseFloat(formData.sales_price)
    if (isNaN(sales) || sales < 0) {
      errors.sales_price = 'Sales price must be a non-negative number.'
    }
    const cost = parseFloat(formData.cost_price)
    if (isNaN(cost) || cost < 0) {
      errors.cost_price = 'Cost price must be a non-negative number.'
    }

    formData.variants.forEach((v, idx) => {
      if (!v.attribute.trim()) {
        errors[`variant_${idx}_attribute`] = 'Attribute required.'
      }
      if (!v.value.trim()) {
        errors[`variant_${idx}_value`] = 'Value required.'
      }
      const extra = parseFloat(v.extra_price)
      if (isNaN(extra) || extra < 0) {
        errors[`variant_${idx}_extra_price`] = 'Extra price >= 0.'
      }
    })

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Submit Product
  const handleSubmitProduct = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    setGeneralError('')

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      sales_price: parseFloat(formData.sales_price).toFixed(2),
      cost_price: parseFloat(formData.cost_price).toFixed(2),
      notes: formData.notes.trim(),
      default_tax: formData.default_tax ? Number(formData.default_tax) : null,
      is_active: formData.is_active,
      variants: formData.variants.map((v) => ({
        id: v.id,
        attribute: v.attribute.trim(),
        value: v.value.trim(),
        extra_price: parseFloat(v.extra_price || 0).toFixed(2),
      })),
    }

    try {
      if (editingProduct) {
        await client.put(`/products/${editingProduct.id}/`, payload)
        setSnackbar({ open: true, message: 'Product updated successfully.', severity: 'success' })
      } else {
        await client.post('/products/', payload)
        setSnackbar({ open: true, message: 'Product created successfully.', severity: 'success' })
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
        setGeneralError('Failed to save product.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Delete product
  const handleDeleteClick = (prod) => {
    setProductToDelete(prod)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!productToDelete) return
    setDeleting(true)
    try {
      await client.delete(`/products/${productToDelete.id}/`)
      setSnackbar({ open: true, message: 'Product deleted successfully.', severity: 'info' })
      setDeleteDialogOpen(false)
      setProductToDelete(null)
      setLoading(true)
      setRefreshTrigger((c) => c + 1)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to delete product. It may be referenced by plans or subscriptions.',
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
            Products Catalog
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage standard products, service offerings, addons and product variants
          </Typography>
        </Box>

        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ fontWeight: 600 }}
          >
            New Product
          </Button>
        )}
      </Box>

      {/* Search Bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }} elevation={1}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search products by name or notes..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(0)
                setLoading(true)
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>
      </Paper>

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
              Loading products...
            </Typography>
          </Box>
        ) : products.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No products found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Try adjusting your search query or add a new product.
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead sx={{ bgcolor: 'grey.50' }}>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell align="right"><strong>Sales Price</strong></TableCell>
                <TableCell align="right"><strong>Cost Price</strong></TableCell>
                <TableCell><strong>Default Tax</strong></TableCell>
                <TableCell align="center"><strong>Variants</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                {isAdmin && <TableCell align="right"><strong>Actions</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((prod) => {
                const taxObj = taxes.find((t) => t.id === prod.default_tax)
                const variantCount = Array.isArray(prod.variants) ? prod.variants.length : 0
                return (
                  <TableRow key={prod.id} hover>
                    <TableCell>#{prod.id}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {prod.name}
                      </Typography>
                      {prod.notes && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {prod.notes}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={prod.type ? prod.type.toUpperCase() : 'SERVICE'}
                        size="small"
                        variant="outlined"
                        color={prod.type === 'service' ? 'primary' : prod.type === 'goods' ? 'secondary' : 'info'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <strong>â‚¹{prod.sales_price}</strong>
                    </TableCell>
                    <TableCell align="right">â‚¹{prod.cost_price}</TableCell>
                    <TableCell>
                      {taxObj ? `${taxObj.name} (${taxObj.rate_percent}%)` : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip
                        title={
                          variantCount > 0
                            ? prod.variants.map((v) => `${v.attribute}: ${v.value} (+â‚¹${v.extra_price})`).join(', ')
                            : 'No variants'
                        }
                      >
                        <Chip
                          label={`${variantCount} variant${variantCount === 1 ? '' : 's'}`}
                          size="small"
                          color={variantCount > 0 ? 'default' : 'default'}
                          variant="outlined"
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={prod.is_active ? 'ACTIVE' : 'INACTIVE'}
                        size="small"
                        color={prod.is_active ? 'success' : 'default'}
                      />
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleOpenEdit(prod)}
                          title="Edit Product"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteClick(prod)}
                          title="Delete Product"
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

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>
            {editingProduct ? `Edit Product #${editingProduct.id}` : 'New Product'}
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
            {/* Product Name */}
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                size="small"
                label="Product Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
              />
            </Grid>

            {/* Product Type */}
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel id="prod-type-label">Type *</InputLabel>
                <Select
                  labelId="prod-type-label"
                  value={formData.type}
                  label="Type *"
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  {PRODUCT_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>
                      {t.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Sales Price */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Sales Price (â‚¹) *"
                type="number"
                value={formData.sales_price}
                onChange={(e) => setFormData({ ...formData, sales_price: e.target.value })}
                error={Boolean(formErrors.sales_price)}
                helperText={formErrors.sales_price}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Grid>

            {/* Cost Price */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Cost Price (â‚¹) *"
                type="number"
                value={formData.cost_price}
                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                error={Boolean(formErrors.cost_price)}
                helperText={formErrors.cost_price}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Grid>

            {/* Default Tax */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="tax-select-label">Default Tax</InputLabel>
                <Select
                  labelId="tax-select-label"
                  value={formData.default_tax || ''}
                  label="Default Tax"
                  onChange={(e) => setFormData({ ...formData, default_tax: e.target.value })}
                >
                  <MenuItem value="">None</MenuItem>
                  {taxes.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name} ({t.rate_percent}%)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Active Status */}
            <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    color="primary"
                  />
                }
                label="Active in Catalog"
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Notes / Description"
                multiline
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>

          {/* Dynamic Variants Section */}
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Product Variants (Attributes & Extra Pricing)
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={handleAddVariant}>
                Add Variant
              </Button>
            </Box>

            {formData.variants.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
                No variants added. Standard product will be sold as a single item.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell><strong>Attribute *</strong></TableCell>
                      <TableCell><strong>Value *</strong></TableCell>
                      <TableCell width={160}><strong>Extra Price (â‚¹)</strong></TableCell>
                      <TableCell width={50}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {formData.variants.map((v, idx) => (
                      <TableRow key={v.keyId || idx}>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Brand, Color, Size"
                            value={v.attribute}
                            onChange={(e) => handleVariantChange(idx, 'attribute', e.target.value)}
                            error={Boolean(formErrors[`variant_${idx}_attribute`])}
                            helperText={formErrors[`variant_${idx}_attribute`]}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Odoo, Red, XL"
                            value={v.value}
                            onChange={(e) => handleVariantChange(idx, 'value', e.target.value)}
                            error={Boolean(formErrors[`variant_${idx}_value`])}
                            helperText={formErrors[`variant_${idx}_value`]}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            value={v.extra_price}
                            onChange={(e) => handleVariantChange(idx, 'extra_price', e.target.value)}
                            error={Boolean(formErrors[`variant_${idx}_extra_price`])}
                            inputProps={{ min: 0, step: '0.01' }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveVariant(idx)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
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
            onClick={handleSubmitProduct}
            disabled={submitting}
            sx={{ fontWeight: 600 }}
          >
            {submitting ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete product <strong>{productToDelete?.name}</strong>? This action cannot be undone.
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
