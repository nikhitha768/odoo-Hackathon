import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Chip,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import CardMembershipOutlinedIcon from '@mui/icons-material/CardMembershipOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined'
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined'
import SubscriptionsOutlinedIcon from '@mui/icons-material/SubscriptionsOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined'
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import AutoAwesomeMosaicIcon from '@mui/icons-material/AutoAwesomeMosaic'

import { useAuth } from '../auth'

const DRAWER_WIDTH = 260

// Role-based navigation configs
const MENU_ITEMS = {
  admin: [
    { label: 'Dashboard', path: '/dashboard', icon: <DashboardOutlinedIcon /> },
    { label: 'Products', path: '/products', icon: <Inventory2OutlinedIcon /> },
    { label: 'Plans', path: '/plans', icon: <CardMembershipOutlinedIcon /> },
    { label: 'Templates', path: '/templates', icon: <DescriptionOutlinedIcon /> },
    { label: 'Taxes', path: '/taxes', icon: <PercentOutlinedIcon /> },
    { label: 'Discounts', path: '/discounts', icon: <LocalOfferOutlinedIcon /> },
    { label: 'Subscriptions', path: '/subscriptions', icon: <SubscriptionsOutlinedIcon /> },
    { label: 'Invoices', path: '/invoices', icon: <ReceiptLongOutlinedIcon /> },
    { label: 'Payments', path: '/payments', icon: <PaymentsOutlinedIcon /> },
    { label: 'Staff', path: '/staff', icon: <PeopleAltOutlinedIcon /> },
  ],
  staff: [
    { label: 'Dashboard', path: '/dashboard', icon: <DashboardOutlinedIcon /> },
    { label: 'Products', path: '/products', icon: <Inventory2OutlinedIcon /> },
    { label: 'Plans', path: '/plans', icon: <CardMembershipOutlinedIcon /> },
    { label: 'Templates', path: '/templates', icon: <DescriptionOutlinedIcon /> },
    { label: 'Subscriptions', path: '/subscriptions', icon: <SubscriptionsOutlinedIcon /> },
    { label: 'Invoices', path: '/invoices', icon: <ReceiptLongOutlinedIcon /> },
    { label: 'Payments', path: '/payments', icon: <PaymentsOutlinedIcon /> },
  ],
  customer: [
    { label: 'My Subscriptions', path: '/my-subscriptions', icon: <SubscriptionsOutlinedIcon /> },
    { label: 'My Invoices', path: '/my-invoices', icon: <ReceiptLongOutlinedIcon /> },
  ],
}

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState(null)

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleProfileMenuOpen = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleProfileMenuClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = async () => {
    handleProfileMenuClose()
    await logout()
    navigate('/login', { replace: true })
  }

  const role = user?.role || 'customer'
  const navItems = MENU_ITEMS[role] || MENU_ITEMS.customer

  const roleColor = {
    admin: 'error',
    staff: 'primary',
    customer: 'success',
  }[role] || 'default'

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Drawer Branding Header */}
      <Toolbar sx={{ px: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <AutoAwesomeMosaicIcon color="primary" sx={{ fontSize: 28 }} />
        <Box>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
            SubManager
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Subscription System
          </Typography>
        </Box>
      </Toolbar>

      <Divider />

      {/* Navigation List based on user role */}
      <Box sx={{ flexGrow: 1, px: 1.5, py: 2 }}>
        <List disablePadding>
          {navItems.map((item) => {
            const isSelected =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(`${item.path}/`))

            return (
              <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={isSelected}
                  onClick={() => {
                    navigate(item.path)
                    setMobileOpen(false)
                  }}
                  sx={{
                    borderRadius: 2,
                    py: 1,
                    px: 2,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                      },
                      '& .MuiListItemIcon-root': {
                        color: 'inherit',
                      },
                    },
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 40,
                      color: isSelected ? 'inherit' : 'text.secondary',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: 14,
                      fontWeight: isSelected ? 600 : 500,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>
      </Box>

      <Divider />

      {/* Bottom User Card in Drawer */}
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'grey.100',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 14 }}>
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {user?.name || 'User'}
              </Typography>
              <Chip
                label={role.toUpperCase()}
                color={roleColor}
                size="small"
                sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
              />
            </Box>
          </Box>
          <Tooltip title="Sign Out">
            <IconButton size="small" onClick={handleLogout} color="default">
              <LogoutOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <CssBaseline />

      {/* Top AppBar */}
      <AppBar
        position="fixed"
        elevation={1}
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" fontWeight={600} noWrap component="div">
              Subscription Management System
            </Typography>
          </Box>

          {/* User profile section in AppBar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip
              label={role.toUpperCase()}
              color={roleColor}
              size="small"
              sx={{ fontWeight: 600 }}
            />
            <Tooltip title="Account menu">
              <IconButton onClick={handleProfileMenuOpen} size="small">
                <Avatar
                  sx={{
                    width: 36,
                    height: 36,
                    bgcolor: 'primary.main',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {user?.name ? user.name[0].toUpperCase() : 'U'}
                </Avatar>
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleProfileMenuClose}
              onClick={handleProfileMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{
                elevation: 3,
                sx: { minWidth: 200, mt: 1 },
              }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  {user?.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
              </Box>
              <Divider />
              <MenuItem onClick={handleLogout} sx={{ color: 'error.main', py: 1 }}>
                <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
                  <LogoutOutlinedIcon fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Navigation Drawers: Temporary for Mobile, Permanent for Desktop */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
        aria-label="navigation mailbox"
      >
        {/* Mobile Temporary Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Desktop Permanent Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 4 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  )
}

