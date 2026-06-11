import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { AppShell } from '@/components/layout/AppShell'
import { CloudLoginDialog } from '@/features/auth/CloudLoginDialog'
import { PendingInvitesDialog } from '@/features/auth/PendingInvitesDialog'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { TransactionList } from '@/features/transactions/TransactionList'
import { ImportPage } from '@/features/import/ImportPage'
import { CategoryManager } from '@/features/categories/CategoryManager'
import { SuggestionsPanel } from '@/features/suggestions/SuggestionsPanel'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { db, cloudEnabled } from '@/db/db'
import { resolveActiveRealmId, consolidateCategories } from '@/db/sharedRealm'

const theme = createTheme({
  typography: {
    fontFamily: '"Geist Variable", "Inter", "Roboto", sans-serif',
    fontSize: 14,
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { defaultProps: { elevation: 0, variant: 'outlined' } },
  },
})

export default function App() {
  useEffect(() => {
    if (!cloudEnabled) return

    async function runConsolidation() {
      const userId = db.cloud.currentUser.value?.userId ?? ''
      const realmId = await resolveActiveRealmId(userId)
      if (realmId) await consolidateCategories(realmId)
    }

    runConsolidation()

    const sub = db.cloud.syncState.subscribe(state => {
      if (state.phase === 'in-sync') runConsolidation()
    })
    return () => sub.unsubscribe()
  }, [])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CloudLoginDialog />
      <PendingInvitesDialog />
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="transactions" element={<TransactionList />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="categories" element={<CategoryManager />} />
            <Route path="suggestions" element={<SuggestionsPanel />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ThemeProvider>
  )
}
