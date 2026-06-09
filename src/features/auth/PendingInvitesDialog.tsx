import { useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { db, cloudEnabled } from '@/db/db'

function useCurrentUserEmail(): string | undefined {
  return useSyncExternalStore(
    (cb) => {
      if (!cloudEnabled) return () => {}
      const sub = db.cloud.currentUser.subscribe(cb)
      return () => sub.unsubscribe()
    },
    () => cloudEnabled ? (db.cloud.currentUser.value?.email ?? undefined) : undefined,
  )
}

export function PendingInvitesDialog() {
  const email = useCurrentUserEmail()
  const [busy, setBusy] = useState<string | null>(null)

  // Full scan — compound index [email+realmId] prevents simple where({email})
  const invites = useLiveQuery(async () => {
    if (!email) return []
    const all = await db.table('members').toArray()
    return all.filter((m: any) =>
      m.email?.toLowerCase() === email.toLowerCase() && !m.accepted && !m.rejected
    )
  }, [email]) ?? []

  const current = invites[0] ?? null

  async function handleAccept() {
    if (!current) return
    setBusy('accept')
    try {
      await db.table('members').update(current.id, { accepted: new Date() })
      await db.cloud.sync().catch(() => {})
      await db.cloud.sync({ purpose: 'pull', wait: true }).catch(() => {})
    } finally {
      setBusy(null)
    }
  }

  async function handleReject() {
    if (!current) return
    setBusy('reject')
    try {
      await db.table('members').update(current.id, { rejected: new Date() })
    } finally {
      setBusy(null)
    }
  }

  const realmLabel = current?.realm?.name || current?.realmId || 'outro usuário'

  return (
    <Dialog open={!!current} maxWidth="xs" fullWidth>
      {current && (
        <>
          <DialogTitle>Convite pendente</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              Você foi convidado para acessar os dados financeiros de{' '}
              <strong>{realmLabel}</strong>.
            </Typography>
            {invites.length > 1 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {invites.length} convites pendentes no total.
              </Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button
              color="inherit"
              disabled={!!busy}
              onClick={handleReject}
              startIcon={busy === 'reject' ? <CircularProgress size={14} /> : undefined}
            >
              Recusar
            </Button>
            <Button
              variant="contained"
              disabled={!!busy}
              onClick={handleAccept}
              startIcon={busy === 'accept' ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              Aceitar
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}
