import { useState } from 'react'
import { useObservable } from 'dexie-react-hooks'
import { of } from 'rxjs'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { db, cloudEnabled } from '@/db/db'

export function PendingInvitesDialog() {
  const invites: any[] = (useObservable(cloudEnabled ? db.cloud.invites : of([])) as any[]) ?? []
  const [busy, setBusy] = useState<string | null>(null)

  const current = invites[0] ?? null

  async function handleAccept() {
    if (!current) return
    setBusy('accept')
    try {
      await current.accept()
      await db.cloud.sync({ purpose: 'pull', wait: true }).catch(() => {})
    } finally {
      setBusy(null)
    }
  }

  async function handleReject() {
    if (!current) return
    setBusy('reject')
    try {
      await current.reject()
    } finally {
      setBusy(null)
    }
  }

  const realmLabel = (current as any)?.realm?.name || (current as any)?.realmId || 'outro usuário'

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
