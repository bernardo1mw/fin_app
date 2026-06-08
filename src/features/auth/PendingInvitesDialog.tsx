import { useState, useEffect } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import { db, cloudEnabled } from '@/db/db'

interface Invite {
  id: string
  email?: string
  realmId: string
  realm?: { name?: string }
  accept: () => Promise<void>
  reject: () => Promise<void>
}

export function PendingInvitesDialog() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!cloudEnabled) return
    const sub = db.cloud.invites.subscribe((list: Invite[]) => setInvites(list))
    return () => sub.unsubscribe()
  }, [])

  const current = invites[0] ?? null

  async function handle(invite: Invite, action: 'accept' | 'reject') {
    setBusy(action)
    try {
      await invite[action]()
      if (action === 'accept') await db.cloud.sync().catch(() => {})
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
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {invites.length > 1 && `${invites.length} convites pendentes`}
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button
              color="inherit"
              disabled={!!busy}
              onClick={() => handle(current, 'reject')}
              startIcon={busy === 'reject' ? <CircularProgress size={14} /> : undefined}
            >
              Recusar
            </Button>
            <Button
              variant="contained"
              disabled={!!busy}
              onClick={() => handle(current, 'accept')}
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
