import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ArrowDownUp, Upload, Tag, Lightbulb,
  Settings, ChevronLeft, ChevronRight,
} from 'lucide-react'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'

const DRAWER_WIDTH = 240

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transações', icon: ArrowDownUp },
  { to: '/import', label: 'Importar', icon: Upload },
  { to: '/categories', label: 'Categorias', icon: Tag },
  { to: '/suggestions', label: 'Sugestões', icon: Lightbulb },
  { to: '/settings', label: 'Configurações', icon: Settings },
]

interface Props {
  open: boolean
  onToggle: () => void
}

function NavItems({ showLabels, onItemClick }: { showLabels: boolean; onItemClick?: () => void }) {
  return (
    <List dense sx={{ px: 0.5, py: 0.5 }}>
      {navItems.map(({ to, label, icon: Icon }) => (
        <ListItem key={to} disablePadding sx={{ mb: 0.25 }}>
          <NavLink to={to} end={to === '/'} style={{ width: '100%', textDecoration: 'none', color: 'inherit' }} onClick={onItemClick}>
            {({ isActive }) => (
              <ListItemButton
                selected={isActive}
                sx={{
                  borderRadius: 1.5,
                  minHeight: 40,
                  px: 1.5,
                  justifyContent: showLabels ? 'flex-start' : 'center',
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '&:hover': { bgcolor: 'primary.dark' },
                    '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: showLabels ? 36 : 0, color: isActive ? 'inherit' : 'text.secondary', justifyContent: 'center' }}>
                  <Icon size={18} />
                </ListItemIcon>
                {showLabels && (
                  <ListItemText
                    primary={label}
                    slotProps={{ primary: { style: { fontSize: 14, fontWeight: isActive ? 600 : 400 } } }}
                  />
                )}
              </ListItemButton>
            )}
          </NavLink>
        </ListItem>
      ))}
    </List>
  )
}

export function Sidebar({ open, onToggle }: Props) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: DRAWER_WIDTH }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
          Finanças Pessoais
        </Typography>
        <IconButton size="small" onClick={onToggle} edge="end">
          <ChevronLeft size={18} />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto', mt: 0.5 }}>
        <NavItems showLabels onItemClick={isMobile ? onToggle : undefined} />
      </Box>
    </Box>
  )

  return (
    <>
      {/* Collapsed strip — desktop only */}
      {!isMobile && !open && (
        <Box
          sx={{
            width: 56,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pt: 1,
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            height: '100%',
          }}
        >
          <IconButton size="small" onClick={onToggle}>
            <ChevronRight size={18} />
          </IconButton>
          <Box sx={{ mt: 1 }}>
            <NavItems showLabels={false} />
          </Box>
        </Box>
      )}

      {/* Hamburger — mobile only, when closed */}
      {isMobile && !open && (
        <Box sx={{ position: 'fixed', top: 12, left: 12, zIndex: 1300 }}>
          <IconButton
            size="small"
            onClick={onToggle}
            sx={{ bgcolor: 'background.paper', boxShadow: 1, border: '1px solid', borderColor: 'divider' }}
          >
            <ChevronRight size={18} />
          </IconButton>
        </Box>
      )}

      {/* Persistent drawer — desktop */}
      {!isMobile && (
        <Drawer
          variant="persistent"
          open={open}
          sx={{
            width: open ? DRAWER_WIDTH : 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: theme => theme.transitions.create('width'),
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              position: 'relative',
              height: '100%',
              border: 'none',
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Temporary drawer — mobile */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={open}
          onClose={onToggle}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
        >
          {drawerContent}
        </Drawer>
      )}
    </>
  )
}
