import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Eye, EyeOff, Save } from 'lucide-react'
import { db } from '@/db/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { UserProfile } from '@/db/schema'

export function SettingsPage() {
  const profile = useLiveQuery(() => db.userProfile.get(1))
  const [apiKey, setApiKey] = useState(localStorage.getItem('anthropic_api_key') ?? '')
  const [showKey, setShowKey] = useState(false)
  const [income, setIncome] = useState('')
  const [savingsPct, setSavingsPct] = useState('')
  const [riskProfile, setRiskProfile] = useState<UserProfile['riskProfile']>('moderado')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setIncome(profile.monthlyIncome > 0 ? String(profile.monthlyIncome) : '')
      setSavingsPct(String(profile.savingsGoalPct))
      setRiskProfile(profile.riskProfile)
    }
  }, [profile])

  function saveApiKey() {
    if (apiKey.trim()) {
      localStorage.setItem('anthropic_api_key', apiKey.trim())
    } else {
      localStorage.removeItem('anthropic_api_key')
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveProfile() {
    await db.userProfile.put({
      id: 1,
      monthlyIncome: parseFloat(income) || 0,
      savingsGoalPct: parseFloat(savingsPct) || 20,
      riskProfile,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function exportData() {
    const [transactions, categories, categoryRules, accounts, userProfile] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.categoryRules.toArray(),
      db.accounts.toArray(),
      db.userProfile.toArray(),
    ])

    const data = { exportedAt: new Date().toISOString(), transactions, categories, categoryRules, accounts, userProfile }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financas-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    localStorage.setItem('last_export', new Date().toISOString())
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="text-2xl font-semibold">Configurações</h2>

      <Card>
        <CardHeader><CardTitle className="text-base">Chave API Anthropic (opcional)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Necessária para sugestões com IA. Armazenada apenas no seu navegador e enviada diretamente à API da Anthropic — sem servidores intermediários.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button onClick={saveApiKey}><Save className="size-4 mr-1" /> Salvar</Button>
          </div>
          {saved && <p className="text-xs text-green-600">Salvo!</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Perfil financeiro</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Renda mensal (R$)</Label>
            <Input
              type="number"
              value={income}
              onChange={e => setIncome(e.target.value)}
              placeholder="Ex: 5000"
            />
          </div>
          <div className="space-y-1">
            <Label>Meta de poupança (%)</Label>
            <Input
              type="number"
              value={savingsPct}
              onChange={e => setSavingsPct(e.target.value)}
              placeholder="Ex: 20"
              min="0"
              max="100"
            />
          </div>
          <div className="space-y-1">
            <Label>Perfil de investidor</Label>
            <Select value={riskProfile} onValueChange={v => setRiskProfile(v as UserProfile['riskProfile'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conservador">Conservador</SelectItem>
                <SelectItem value="moderado">Moderado</SelectItem>
                <SelectItem value="arrojado">Arrojado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveProfile}><Save className="size-4 mr-1" /> Salvar perfil</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Backup de dados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Os dados são armazenados localmente no seu navegador. Exporte regularmente para evitar perda de dados.
          </p>
          <Button variant="outline" onClick={exportData}>
            <Download className="size-4 mr-2" /> Exportar dados (JSON)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
