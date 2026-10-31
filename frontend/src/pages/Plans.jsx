import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Divider,
} from '@mui/material'
import client from '../api/client'

export default function Plans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/plans/')
      .then((res) => setPlans(res.data.results || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Subscription Plans
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure recurring billing packages and constraints
        </Typography>
      </Box>

      {loading ? (
        <CircularProgress />
      ) : (
        <Grid container spacing={3}>
          {plans.map((plan) => (
            <Grid item xs={12} sm={6} md={4} key={plan.id}>
              <Card sx={{ borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h6" fontWeight={700}>
                      {plan.name}
                    </Typography>
                    <Chip
                      label={plan.status}
                      color={plan.status === 'active' ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  <Typography variant="h4" fontWeight={700} color="primary.main" sx={{ my: 1 }}>
                    ₹{plan.price}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {' '}/ {plan.billing_period}
                    </Typography>
                  </Typography>

                  <Divider sx={{ my: 1.5 }} />

                  <Stack spacing={0.8} sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Min Quantity:</strong> {plan.min_quantity}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Validity:</strong> {plan.available_from} to {plan.available_to}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                      {plan.allow_pause && <Chip label="Can Pause" size="small" variant="outlined" />}
                      {plan.allow_renew && <Chip label="Can Renew" size="small" variant="outlined" />}
                      {plan.allow_early_close && <Chip label="Can Close Early" size="small" variant="outlined" />}
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  )
}

