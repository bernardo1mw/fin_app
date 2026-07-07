import { useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Upload, Eye, EyeOff, Save, Cloud, CloudOff, LogIn, LogOut, UserPlus, RefreshCw, Trash2 } from 'lucide-react'
import type { SelectChangeEvent } from '@mui/material/Select'
import { db, cloudEnabled, triggerSync } from '@/db/db'
import { saveAIConfig, type AIProvider, type AIProviderConfig } from '@/features/suggestions/ClaudeAdvisor'
import { setSharedRealmId, resolveActiveRealmId } from '@/db/sharedRealm'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import type { UserProfile, Transaction, Category, CategoryRule, Account } from '@/db/schema'

interface CloudMember {
  id?: string
  realmId: string
  userId?: string
  email?: string
  name?: string
  invite?: boolean
  accepted?: boolean
  rejected?: boolean
  permissions?: Record<string, unknown>
}

interface CloudRealm {
  realmId?: string
  owner?: string
  name?: string
}

function useSyncState() {
  return useSyncExternalStore(
    (cb) => {
      if (!cloudEnabled) return () => {}
      const sub = db.cloud.syncState.subscribe(cb)
      return () => sub.unsubscribe()
    },
    () => cloudEnabled ? db.cloud.syncState.value : null,
  )
}

function useCloudUser() {
  return useSyncExternalStore(
    (cb) => {
      if (!cloudEnabled) return () => {}
      const sub = db.cloud.currentUser.subscribe(cb)
      return () => sub.unsubscribe()
    },
    () => cloudEnabled ? db.cloud.currentUser.value : null,
  )
}

function SyncStatusChip() {
  const state = useSyncState()
  const user = useCloudUser()
  if (!user?.isLoggedIn) return null
  if (!state || state.status === 'not-started') {
    return <Chip icon={<CircularProgress size={12} />} label="Conectando..." size="small" color="info" />
  }
  const { phase, status } = state
  if (phase === 'error' || status === 'error') return <Chip icon={<CloudOff size={14} />} label="Erro de sync" size="small" color="error" />
  if (phase === 'offline' || status === 'offline' || status === 'disconnected') return <Chip icon={<CloudOff size={14} />} label="Offline" size="small" />
  if (phase === 'pushing' || phase === 'pulling' || phase === 'initial' || phase === 'not-in-sync' || status === 'connecting') {
    return <Chip icon={<CircularProgress size={12} />} label="Sincronizando..." size="small" color="info" />
  }
  return <Chip icon={<Cloud size={14} />} label="Sincronizado" size="small" color="success" variant="outlined" />
}

export function SettingsPage() {
  const profile = useLiveQuery(() => db.userProfile.get(1))
  const savedAiConfig = useLiveQuery(async () => {
    const row = await db.appSettings.get('ai_provider_config')
    if (row) return JSON.parse(row.value) as AIProviderConfig
    try {
      const raw = localStorage.getItem('ai_provider_config')
      if (raw) return JSON.parse(raw) as AIProviderConfig
    } catch {}
    return undefined
  })
  const [draftAiConfig, setDraftAiConfig] = useState<AIProviderConfig | null>(null)
  const aiConfig: AIProviderConfig = draftAiConfig ?? savedAiConfig ?? { provider: 'anthropic' as AIProvider }
  const [showKey, setShowKey] = useState(false)
  type ProfileDraft = { income: string; savingsPct: string; riskProfile: UserProfile['riskProfile'] }
  const [draft, setDraft] = useState<Partial<ProfileDraft>>({})
  const income = draft.income ?? (profile && profile.monthlyIncome > 0 ? String(profile.monthlyIncome) : '')
  const savingsPct = draft.savingsPct ?? String(profile?.savingsGoalPct ?? 20)
  const riskProfile = draft.riskProfile ?? profile?.riskProfile ?? 'moderado'
  const setIncome = (v: string) => setDraft(d => ({ ...d, income: v }))
  const setSavingsPct = (v: string) => setDraft(d => ({ ...d, savingsPct: v }))
  const setRiskProfile = (v: UserProfile['riskProfile']) => setDraft(d => ({ ...d, riskProfile: v }))

  const [savedMsg, setSavedMsg] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState('')
  const [showDiag, setShowDiag] = useState(false)
  const [clearing, setClearing] = useState(false)

  const cloudUser = useCloudUser()
  const isLoggedIn = cloudUser?.isLoggedIn ?? false

  const sharedRealmId = useLiveQuery(async () => {
    if (!cloudUser?.userId) return null
    return await resolveActiveRealmId(cloudUser.userId) ?? null
  }, [cloudUser?.userId])

  function flash(msg: string) {
    setSavedMsg(msg)
    setTimeout(() => setSavedMsg(''), 2500)
  }

  async function handleSaveAIConfig() {
    await saveAIConfig(aiConfig)
    setDraftAiConfig(null)
    flash('Configuração de IA salva!')
  }

  function updateAIConfig(patch: Partial<AIProviderConfig>) {
    setDraftAiConfig(c => ({ ...(c ?? savedAiConfig ?? { provider: 'anthropic' as AIProvider }), ...patch }))
  }

  async function saveProfile() {
    await db.userProfile.put({
      id: 1,
      monthlyIncome: parseFloat(income) || 0,
      savingsGoalPct: parseFloat(savingsPct) || 20,
      riskProfile,
    })
    setDraft({})
    flash('Perfil salvo!')
  }

  async function clearAllData() {
    if (!confirm('Isso vai apagar TODAS as transações, contas e importações permanentemente. Exporte um backup antes de continuar. Deseja continuar?')) return
    setClearing(true)
    try {
      await Promise.all([
        db.transactions.clear(),
        db.accounts.clear(),
        db.importBatches.clear(),
        db.transactionMatches.clear(),
      ])
      triggerSync()
      flash('Todos os dados foram apagados.')
    } finally {
      setClearing(false)
    }
  }

  async function exportData() {
    const [transactions, categories, categoryRules, accounts, userProfile] = await Promise.all([
      db.transactions.toArray(), db.categories.toArray(),
      db.categoryRules.toArray(), db.accounts.toArray(), db.userProfile.toArray(),
    ])
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), transactions, categories, categoryRules, accounts, userProfile }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financas-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importData(file: File) {
    let parsed: unknown
    try { parsed = JSON.parse(await file.text()) } catch {
      flash('Arquivo inválido — não é um JSON válido.')
      return
    }
    if (!parsed || typeof parsed !== 'object' || !('exportedAt' in parsed)) {
      flash('Arquivo inválido — formato não reconhecido.')
      return
    }
    const data = parsed as { transactions?: unknown[]; categories?: unknown[]; categoryRules?: unknown[]; accounts?: unknown[]; userProfile?: unknown[] }
    const txCount = data.transactions?.length ?? 0
    const catCount = data.categories?.length ?? 0
    if (!confirm(`Importar ${txCount} transações e ${catCount} categorias?\nRegistros existentes com o mesmo ID serão substituídos.`)) return
    const transactions = (data.transactions ?? []).map((t: unknown) => {
      const tx = t as Record<string, unknown>
      return { ...tx, date: new Date(tx.date as string) }
    })
    const accounts = (data.accounts ?? []).map((a: unknown) => {
      const acc = a as Record<string, unknown>
      return { ...acc, ledgerBalanceAsOf: acc.ledgerBalanceAsOf ? new Date(acc.ledgerBalanceAsOf as string) : null }
    })
    await db.transaction('rw', [db.transactions, db.categories, db.categoryRules, db.accounts, db.userProfile], async () => {
      if (transactions.length) await db.transactions.bulkPut(transactions as Transaction[])
      if (data.categories?.length) await db.categories.bulkPut(data.categories as Category[])
      if (data.categoryRules?.length) await db.categoryRules.bulkPut(data.categoryRules as CategoryRule[])
      if (accounts.length) await db.accounts.bulkPut(accounts as Account[])
      if (data.userProfile?.length) await db.userProfile.bulkPut(data.userProfile as UserProfile[])
    })
    triggerSync()
    flash(`Importação concluída: ${txCount} transações, ${catCount} categorias.`)
  }

  async function handleLogin() {
    await db.cloud.login()
  }

  async function handleLogout() {
    await db.cloud.logout()
  }

  async function handleForceSync() {
    setSyncing(true)
    setSyncError('')
    try {
      await db.cloud.sync() // push any pending local mutations first
      await db.cloud.sync({ purpose: 'pull', wait: true }) // pull new data (discovers invite realms)
      await db.cloud.sync({ purpose: 'pull', wait: true }) // second pull downloads from new realms
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  async function migrateDataToSharedRealm(sharedRealmId: string) {
    // delete+add is required because modify() only updates the data blob field,
    // it does NOT move the object to a different realm on the Dexie Cloud server.
    await db.transaction('rw', [db.transactions, db.categories, db.categoryRules, db.accounts], async () => {
      const [txs, cats, rules, accs] = await Promise.all([
        db.transactions.filter((t: Transaction) => t.realmId !== sharedRealmId).toArray(),
        db.categories.filter((c: Category) => c.realmId !== sharedRealmId).toArray(),
        db.categoryRules.filter((r: CategoryRule) => r.realmId !== sharedRealmId).toArray(),
        db.accounts.filter((a: Account) => a.realmId !== sharedRealmId).toArray(),
      ])
      if (txs.length) {
        await db.transactions.bulkDelete(txs.map(t => t.id!))
        await db.transactions.bulkAdd(txs.map(t => ({ ...t, realmId: sharedRealmId })))
      }
      if (cats.length) {
        await db.categories.bulkDelete(cats.map(c => c.id!))
        await db.categories.bulkAdd(cats.map(c => ({ ...c, realmId: sharedRealmId })))
      }
      if (rules.length) {
        await db.categoryRules.bulkDelete(rules.map(r => r.id!))
        await db.categoryRules.bulkAdd(rules.map(r => ({ ...r, realmId: sharedRealmId })))
      }
      if (accs.length) {
        await db.accounts.bulkDelete(accs.map(a => a.id!))
        await db.accounts.bulkAdd(accs.map(a => ({ ...a, realmId: sharedRealmId })))
      }
    })
  }

  async function handleMigrateExisting() {
    if (!cloudUser?.userId || !sharedRealmId) return
    setMigrating(true)
    setMigrateMsg('')
    try {
      await migrateDataToSharedRealm(sharedRealmId)
      await db.cloud.sync()
      await db.cloud.sync({ purpose: 'pull', wait: true })
      setMigrateMsg('Dados migrados e sincronizados!')
    } catch (e: unknown) {
      setMigrateMsg(`Erro: ${e instanceof Error ? e.message : 'tente novamente'}`)
    } finally {
      setMigrating(false)
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !cloudUser?.userId) return
    setInviting(true)
    setInviteMsg('')
    try {
      const email = inviteEmail.trim().toLowerCase()

      // Use existing realm if one is already synced — avoid creating duplicates
      let sharedRealmId = await resolveActiveRealmId(cloudUser.userId)
      if (!sharedRealmId) {
        sharedRealmId = await db.table('realms').add({
          name: cloudUser.email || cloudUser.userId,
        }) as string
        setSharedRealmId(cloudUser.userId, sharedRealmId)
      }

      // Always migrate data not yet in the shared realm (delete+add moves it on server)
      await migrateDataToSharedRealm(sharedRealmId)

      const all: CloudMember[] = await db.table('members').toArray()
      const existingMember = all.find(
        (m) => m.email === email && m.realmId === sharedRealmId
      )
      if (!existingMember) {
        await db.table('members').add({
          realmId: sharedRealmId,
          email,
          name: email,
          invite: true,
          permissions: { add: '*', update: { '*': ['*'] }, manage: '*' },
        })
      }

      await db.cloud.sync()
      await db.cloud.sync({ purpose: 'pull', wait: true })
      setInviteMsg(existingMember ? `${email} já é membro — dados re-migrados e sincronizados.` : `Convite enviado para ${email}.`)
      setInviteEmail('')
    } catch (e: unknown) {
      setInviteMsg(`Erro: ${e instanceof Error ? e.message : 'tente novamente'}`)
    } finally {
      setInviting(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Configurações</Typography>

      {savedMsg && <Alert severity="success" sx={{ py: 0.5 }}>{savedMsg}</Alert>}

      {/* Cloud Sync */}
      {cloudEnabled ? (
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Sincronização na nuvem</Typography>
              <SyncStatusChip />
            </Box>

            {!isLoggedIn ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Faça login para sincronizar os dados entre dispositivos e compartilhar com outra pessoa. Usa email + código de verificação — sem senha.
                </Typography>
                <Button variant="contained" startIcon={<LogIn size={14} />} onClick={handleLogin} sx={{ alignSelf: 'flex-start' }}>
                  Entrar com email
                </Button>
              </>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" color="text.secondary">Logado como</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, flexGrow: 1 }}>{cloudUser?.email}</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={syncing ? <CircularProgress size={12} /> : <RefreshCw size={13} />}
                    onClick={handleForceSync}
                    disabled={syncing}
                    sx={{ fontSize: 12 }}
                  >
                    {syncing ? 'Sincronizando...' : 'Sincronizar'}
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<LogIn size={13} />} onClick={handleLogin} sx={{ fontSize: 12 }}>
                    Alterar Email
                  </Button>
                  <Button size="small" color="inherit" startIcon={<LogOut size={13} />} onClick={handleLogout} sx={{ fontSize: 12 }}>
                    Sair
                  </Button>
                </Box>

                <Divider />

                {sharedRealmId && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Re-migrar dados para realm compartilhado</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Se os dados ainda não aparecem para a outra pessoa, clique aqui para forçar a migração.
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={migrating ? <CircularProgress size={14} /> : <RefreshCw size={13} />}
                      onClick={handleMigrateExisting}
                      disabled={migrating}
                      sx={{ alignSelf: 'flex-start', fontSize: 12 }}
                    >
                      {migrating ? 'Migrando...' : 'Migrar dados agora'}
                    </Button>
                    {migrateMsg && (
                      <Alert severity={migrateMsg.startsWith('Erro') ? 'error' : 'success'} sx={{ py: 0.5 }}>
                        {migrateMsg}
                      </Alert>
                    )}
                  </Box>
                )}

                <Divider />

                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Convidar outra pessoa</Typography>
                <Typography variant="body2" color="text.secondary">
                  A pessoa receberá acesso de leitura e escrita a todos os seus dados financeiros.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Email"
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
                  />
                  <Button
                    variant="outlined"
                    startIcon={inviting ? <CircularProgress size={14} /> : <UserPlus size={14} />}
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Convidar
                  </Button>
                </Box>
                {inviteMsg && (
                  <Alert severity={inviteMsg.startsWith('Erro') ? 'error' : 'success'} sx={{ py: 0.5 }}>
                    {inviteMsg}
                  </Alert>
                )}

                {syncError && (
                  <Alert severity="error" sx={{ py: 0.5 }}>Erro no sync: {syncError}</Alert>
                )}

                <Divider />
                <DiagnosticsPanel userId={cloudUser?.userId} onShowToggle={() => setShowDiag(v => !v)} show={showDiag} />
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Alert severity="info" icon={<CloudOff size={16} />}>
          Sincronização desativada. Configure <code>VITE_DEXIE_CLOUD_URL</code> no <code>.env.local</code> para ativar.
        </Alert>
      )}

      {/* AI Configuration */}
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Configuração de IA</Typography>
          <Typography variant="body2" color="text.secondary">
            Escolha o provedor para sugestões com IA. Os dados são enviados apenas ao provedor selecionado — sem servidores intermediários.
          </Typography>

          <FormControl size="small" fullWidth>
            <InputLabel>Provedor de IA</InputLabel>
            <Select
              label="Provedor de IA"
              value={aiConfig.provider}
              onChange={(e: SelectChangeEvent) => updateAIConfig({ provider: e.target.value as AIProvider })}
            >
              <MenuItem value="anthropic">Anthropic (Claude) — pago</MenuItem>
              <MenuItem value="gemini">Google Gemini — pago</MenuItem>
              <MenuItem value="ollama">Ollama — gratuito, local</MenuItem>
              <MenuItem value="openrouter">OpenRouter — gratuito (requer conta)</MenuItem>
            </Select>
          </FormControl>

          {aiConfig.provider === 'anthropic' && (
            <>
              <Typography variant="body2" color="text.secondary">
                Insira sua chave de API da Anthropic. Armazenada apenas no seu navegador.
              </Typography>
              <TextField
                size="small"
                fullWidth
                type={showKey ? 'text' : 'password'}
                value={aiConfig.anthropicKey ?? ''}
                onChange={(e) => updateAIConfig({ anthropicKey: e.target.value })}
                placeholder="sk-ant-..."
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowKey(v => !v)} edge="end">
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </>
          )}

          {aiConfig.provider === 'gemini' && (
            <>
              <Typography variant="body2" color="text.secondary">
                Insira sua chave de API do Google Gemini. Armazenada apenas no seu navegador.
              </Typography>
              <TextField
                size="small"
                fullWidth
                type={showKey ? 'text' : 'password'}
                label="Chave API Gemini"
                value={aiConfig.geminiKey ?? ''}
                onChange={(e) => updateAIConfig({ geminiKey: e.target.value })}
                placeholder="AIza..."
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowKey(v => !v)} edge="end">
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                size="small"
                fullWidth
                label="Modelo (opcional)"
                value={aiConfig.geminiModel ?? ''}
                onChange={(e) => updateAIConfig({ geminiModel: e.target.value })}
                placeholder="gemini-2.5-flash"
              />
            </>
          )}

          {aiConfig.provider === 'ollama' && (
            <>
              <Alert severity="info" sx={{ py: 0.5 }}>
                Requer <strong>Ollama</strong> instalado e rodando localmente. Instale em <strong>ollama.com</strong>, depois execute: <code>ollama pull llama3.2</code>
              </Alert>
              <TextField
                size="small"
                fullWidth
                label="Modelo"
                value={aiConfig.ollamaModel ?? 'llama3.2'}
                onChange={(e) => updateAIConfig({ ollamaModel: e.target.value })}
                placeholder="llama3.2"
              />
              <TextField
                size="small"
                fullWidth
                label="URL do servidor (opcional)"
                value={aiConfig.ollamaUrl ?? ''}
                onChange={(e) => updateAIConfig({ ollamaUrl: e.target.value })}
                placeholder="http://localhost:11434"
              />
            </>
          )}

          {aiConfig.provider === 'openrouter' && (
            <>
              <Typography variant="body2" color="text.secondary">
                Crie uma conta gratuita em <strong>openrouter.ai</strong> para obter sua chave de API. Modelos gratuitos disponíveis.
              </Typography>
              <TextField
                size="small"
                fullWidth
                type={showKey ? 'text' : 'password'}
                label="Chave API OpenRouter"
                value={aiConfig.openrouterKey ?? ''}
                onChange={(e) => updateAIConfig({ openrouterKey: e.target.value })}
                placeholder="sk-or-..."
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowKey(v => !v)} edge="end">
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                size="small"
                fullWidth
                label="Modelo (opcional)"
                value={aiConfig.openrouterModel ?? ''}
                onChange={(e) => updateAIConfig({ openrouterModel: e.target.value })}
                placeholder="meta-llama/llama-3.1-8b-instruct:free"
              />
            </>
          )}

          <Button variant="contained" startIcon={<Save size={14} />} onClick={handleSaveAIConfig} sx={{ alignSelf: 'flex-start' }}>
            Salvar configuração
          </Button>
        </CardContent>
      </Card>

      {/* Financial profile */}
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Perfil financeiro</Typography>
          <TextField
            size="small"
            fullWidth
            label="Renda mensal (R$)"
            type="number"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            placeholder="Ex: 5000"
          />
          <TextField
            size="small"
            fullWidth
            label="Meta de poupança (%)"
            type="number"
            value={savingsPct}
            onChange={(e) => setSavingsPct(e.target.value)}
            slotProps={{ htmlInput: { min: 0, max: 100 } }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Perfil de investidor</InputLabel>
            <Select
              label="Perfil de investidor"
              value={riskProfile}
              onChange={(e: SelectChangeEvent) => setRiskProfile(e.target.value as UserProfile['riskProfile'])}
            >
              <MenuItem value="conservador">Conservador</MenuItem>
              <MenuItem value="moderado">Moderado</MenuItem>
              <MenuItem value="arrojado">Arrojado</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" startIcon={<Save size={14} />} onClick={saveProfile} sx={{ alignSelf: 'flex-start' }}>
            Salvar perfil
          </Button>
        </CardContent>
      </Card>

      {/* Backup */}
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Backup de dados</Typography>
          <Typography variant="body2" color="text.secondary">
            Os dados são armazenados localmente no seu navegador. Exporte regularmente para evitar perda de dados.
          </Typography>
          <Divider />
          <Button variant="outlined" startIcon={<Download size={14} />} onClick={exportData} sx={{ alignSelf: 'flex-start' }}>
            Exportar dados (JSON)
          </Button>
          <>
            <input type="file" accept=".json" style={{ display: 'none' }} id="import-json-input"
              onChange={e => { const f = e.target.files?.[0]; if (f) { importData(f); e.target.value = '' } }} />
            <Button variant="outlined" startIcon={<Upload size={14} />}
              onClick={() => document.getElementById('import-json-input')?.click()}
              sx={{ alignSelf: 'flex-start' }}>
              Importar dados (JSON)
            </Button>
          </>
          <Divider />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'error.main' }}>Apagar dados</Typography>
          <Typography variant="body2" color="text.secondary">
            Remove todas as transações, contas e importações. Categorias e regras são mantidas. Esta ação não pode ser desfeita.
          </Typography>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<Trash2 size={14} />}
            onClick={clearAllData}
            disabled={clearing}
            sx={{ alignSelf: 'flex-start' }}
          >
            {clearing ? 'Apagando...' : 'Limpar todos os dados'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}

function DiagnosticsPanel({ userId, onShowToggle, show }: { userId?: string; onShowToggle: () => void; show: boolean }) {
  const txCount = useLiveQuery(() => db.transactions.count(), [], 0)
  const txWithRealm = useLiveQuery(
    () => db.transactions.toArray().then(txs => txs.filter(t => !!t.realmId).length),
    [], 0
  )
  const members = useLiveQuery<CloudMember[], CloudMember[]>(() => db.table('members').toArray().catch(() => []), [], [])
  const memberMutations = useLiveQuery<number, number>(() => db.table('$members_mutations').count().catch(() => -1), [], -1)
  const txMutations = useLiveQuery<number, number>(() => db.table('$transactions_mutations').count().catch(() => -1), [], -1)
  const realms = useLiveQuery<CloudRealm[], CloudRealm[]>(() => db.table('realms').toArray().catch(() => []), [], [])
  const syncState = cloudEnabled ? db.cloud.syncState.value : null
  const [deletingRealm, setDeletingRealm] = useState<string | null>(null)

  async function handleDeleteRealm(realmIdToDelete: string) {
    if (!userId) return
    // Canonical = the first own realm that is NOT the one being deleted
    const ownRealms = (realms ?? []).filter(r => r.realmId && r.realmId !== 'rlm-public' && r.realmId !== userId)
    const canonical = ownRealms.find(r => r.realmId !== realmIdToDelete)?.realmId
    if (!canonical) { alert('Nenhum realm alternativo encontrado — não é possível excluir.'); return }
    if (!confirm(`Excluir realm ${realmIdToDelete}?\nDados serão migrados para ${canonical}.`)) return

    setDeletingRealm(realmIdToDelete)
    try {
      await db.transaction('rw', [db.transactions, db.categories, db.categoryRules, db.accounts], async () => {
        const [txs, cats, rules, accs] = await Promise.all([
          db.transactions.filter(t => t.realmId === realmIdToDelete).toArray(),
          db.categories.filter(c => c.realmId === realmIdToDelete).toArray(),
          db.categoryRules.filter(r => r.realmId === realmIdToDelete).toArray(),
          db.accounts.filter(a => a.realmId === realmIdToDelete).toArray(),
        ])
        if (txs.length) {
          await db.transactions.bulkDelete(txs.map(t => t.id!))
          await db.transactions.bulkAdd(txs.map(t => ({ ...t, realmId: canonical })))
        }
        if (cats.length) {
          await db.categories.bulkDelete(cats.map(c => c.id!))
          await db.categories.bulkAdd(cats.map(c => ({ ...c, realmId: canonical })))
        }
        if (rules.length) {
          await db.categoryRules.bulkDelete(rules.map(r => r.id!))
          await db.categoryRules.bulkAdd(rules.map(r => ({ ...r, realmId: canonical })))
        }
        if (accs.length) {
          await db.accounts.bulkDelete(accs.map(a => a.id!))
          await db.accounts.bulkAdd(accs.map(a => ({ ...a, realmId: canonical })))
        }
      })
      // Remove members of the deleted realm
      const realmMembers: CloudMember[] = await db.table('members').where('realmId').equals(realmIdToDelete).toArray().catch(() => [])
      if (realmMembers.length) await db.table('members').bulkDelete(realmMembers.map((m: CloudMember) => m.id!))
      // Delete the realm itself
      await db.table('realms').delete(realmIdToDelete)
      // Clear from localStorage if stored
      if (userId) {
        const stored = localStorage.getItem(`sharedRealm_${userId}`)
        if (stored === realmIdToDelete) {
          localStorage.setItem(`sharedRealm_${userId}`, canonical)
        }
      }
      await db.cloud.sync()
      await db.cloud.sync({ purpose: 'pull', wait: true })
    } catch (e) {
      alert('Erro ao excluir realm: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDeletingRealm(null)
    }
  }

  // Realms owned by this user (excluding rlm-public and private realm)
  const ownRealms = (realms ?? []).filter(r => r.realmId && r.realmId !== 'rlm-public' && r.realmId !== userId)

  return (
    <Box>
      <Button size="small" color="inherit" sx={{ fontSize: 11, opacity: 0.5 }} onClick={onShowToggle}>
        {show ? 'Ocultar diagnóstico' : 'Diagnóstico'}
      </Button>
      {show && (
        <Box sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <div>userId: {userId ?? '—'}</div>
          <div>syncState: {syncState ? `${syncState.status} / ${syncState.phase}` : '—'}{syncState?.error ? ` ERR:${syncState.error}` : ''}</div>
          <div>transações: {txCount} ({txWithRealm} com realmId) | pending mutations: {txMutations}</div>
          <div>members ({members.length}) | pending mutations: {memberMutations}:</div>
          {members.map((m, i) => (
            <div key={i}>  [{i}] userId={m.userId ?? '—'} email={m.email} accepted={m.accepted ? '✓' : '✗'}</div>
          ))}
          <div>realms ({realms.length}):</div>
          {realms.map((r, i) => (
            <Box key={i} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <span>  [{i}] realmId={r.realmId} owner={r.owner}</span>
              {r.realmId && ownRealms.length > 1 && ownRealms.some(o => o.realmId === r.realmId) && (
                <Button
                  size="small"
                  color="error"
                  sx={{ fontSize: 10, minWidth: 0, px: 0.5, py: 0, lineHeight: 1.2 }}
                  disabled={deletingRealm === r.realmId}
                  onClick={() => handleDeleteRealm(r.realmId!)}
                >
                  {deletingRealm === r.realmId ? '...' : 'excluir'}
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
