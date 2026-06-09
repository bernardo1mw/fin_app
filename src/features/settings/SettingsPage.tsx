import { useState, useEffect, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Eye, EyeOff, Save, Cloud, CloudOff, LogIn, LogOut, UserPlus, RefreshCw } from 'lucide-react'
import type { SelectChangeEvent } from '@mui/material/Select'
import { db, cloudEnabled } from '@/db/db'
import { getSharedRealmId, setSharedRealmId } from '@/db/sharedRealm'
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
import type { UserProfile } from '@/db/schema'

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
  const [apiKey, setApiKey] = useState(localStorage.getItem('anthropic_api_key') ?? '')
  const [showKey, setShowKey] = useState(false)
  const [income, setIncome] = useState('')
  const [savingsPct, setSavingsPct] = useState('')
  const [riskProfile, setRiskProfile] = useState<UserProfile['riskProfile']>('moderado')
  const [savedMsg, setSavedMsg] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [showDiag, setShowDiag] = useState(false)

  const cloudUser = useCloudUser()
  const isLoggedIn = cloudUser?.isLoggedIn ?? false

  useEffect(() => {
    if (profile) {
      setIncome(profile.monthlyIncome > 0 ? String(profile.monthlyIncome) : '')
      setSavingsPct(String(profile.savingsGoalPct))
      setRiskProfile(profile.riskProfile)
    }
  }, [profile])

  function flash(msg: string) {
    setSavedMsg(msg)
    setTimeout(() => setSavedMsg(''), 2500)
  }

  function saveApiKey() {
    if (apiKey.trim()) localStorage.setItem('anthropic_api_key', apiKey.trim())
    else localStorage.removeItem('anthropic_api_key')
    flash('Chave salva!')
  }

  async function saveProfile() {
    await db.userProfile.put({
      id: 1,
      monthlyIncome: parseFloat(income) || 0,
      savingsGoalPct: parseFloat(savingsPct) || 20,
      riskProfile,
    })
    flash('Perfil salvo!')
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

  async function handleInvite() {
    if (!inviteEmail.trim() || !cloudUser?.userId) return
    setInviting(true)
    setInviteMsg('')
    try {
      const email = inviteEmail.trim().toLowerCase()

      // Get or create an explicit shared realm (rlm-XXX ID).
      // The private realm (realmId = email) has no realms table record, so Dexie Cloud
      // never adds it to the invitee's realm set after acceptance. An explicit realm
      // created via add() gets an rlm-XXX ID with a server-side realms record.
      let sharedRealmId = getSharedRealmId(cloudUser.userId)
      if (!sharedRealmId) {
        sharedRealmId = await db.table('realms').add({
          name: cloudUser.email || cloudUser.userId,
        }) as string
        setSharedRealmId(cloudUser.userId, sharedRealmId)

        // Migrate all existing data into the shared realm
        await db.transactions.toCollection().modify({ realmId: sharedRealmId })
        await db.categories.toCollection().modify({ realmId: sharedRealmId })
        await db.categoryRules.toCollection().modify({ realmId: sharedRealmId })
        await db.accounts.toCollection().modify({ realmId: sharedRealmId })
      }

      const all = await db.table('members').toArray()
      const pendingInvite = all.find(
        (m: any) => m.email === email && m.realmId === sharedRealmId && !m.accepted && !m.rejected
      )

      if (pendingInvite) {
        await db.table('members').update(pendingInvite.id, { invite: true })
      } else {
        await db.table('members').add({
          realmId: sharedRealmId,
          email,
          name: email,
          invite: true,
          permissions: {
            add: '*',
            update: { '*': ['*'] },
            manage: '*',
          },
        })
      }
      await db.cloud.sync() // push realm + member + migration mutations
      await db.cloud.sync({ purpose: 'pull', wait: true })
      setInviteMsg(`Convite enviado para ${email}.`)
      setInviteEmail('')
    } catch (e: unknown) {
      setInviteMsg(`Erro: ${e instanceof Error ? e.message : 'tente novamente'}`)
    } finally {
      setInviting(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 3 }}>
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

      {/* API Key */}
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Chave API Anthropic</Typography>
          <Typography variant="body2" color="text.secondary">
            Necessária para sugestões com IA. Armazenada apenas no seu navegador e enviada diretamente à API da Anthropic — sem servidores intermediários.
          </Typography>
          <TextField
            size="small"
            fullWidth
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
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
          <Button variant="contained" startIcon={<Save size={14} />} onClick={saveApiKey} sx={{ alignSelf: 'flex-start' }}>
            Salvar chave
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
        </CardContent>
      </Card>
    </Box>
  )
}

function DiagnosticsPanel({ userId, onShowToggle, show }: { userId?: string; onShowToggle: () => void; show: boolean }) {
  const txCount = useLiveQuery(() => db.transactions.count(), [], 0)
  const txWithRealm = useLiveQuery(
    () => db.transactions.toArray().then(txs => txs.filter((t: any) => !!t.realmId).length),
    [], 0
  )
  const members = useLiveQuery(() => db.table('members').toArray().catch(() => []), [], [])
  const memberMutations = useLiveQuery(() => db.table('$members_mutations').count().catch(() => -1), [], -1)
  const txMutations = useLiveQuery(() => db.table('$transactions_mutations').count().catch(() => -1), [], -1)
  const realms = useLiveQuery(() => db.table('realms').toArray().catch(() => []), [], [])
  const syncState = cloudEnabled ? db.cloud.syncState.value : null

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
          <div>members ({(members as any[]).length}) | pending mutations: {memberMutations}:</div>
          {(members as any[]).map((m, i) => (
            <div key={i}>  [{i}] userId={m.userId ?? '—'} email={m.email} accepted={m.accepted ? '✓' : '✗'}</div>
          ))}
          <div>realms ({(realms as any[]).length}):</div>
          {(realms as any[]).map((r, i) => (
            <div key={i}>  [{i}] realmId={r.realmId} owner={r.owner}</div>
          ))}
        </Box>
      )}
    </Box>
  )
}
