import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Box from '@mui/material/Box'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const [open, setOpen] = useState(false)

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar open={open} onToggle={() => setOpen(o => !o)} />
      <Box component="main" sx={{ flexGrow: 1, overflow: 'auto', p: { xs: 2, sm: 3 }, pt: { xs: 7, sm: 3 } }}>
        <Outlet />
      </Box>
    </Box>
  )
}
