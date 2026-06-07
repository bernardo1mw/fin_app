import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { TransactionList } from '@/features/transactions/TransactionList'
import { ImportPage } from '@/features/import/ImportPage'
import { CategoryManager } from '@/features/categories/CategoryManager'
import { SuggestionsPanel } from '@/features/suggestions/SuggestionsPanel'
import { SettingsPage } from '@/features/settings/SettingsPage'

export default function App() {
  return (
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
  )
}
