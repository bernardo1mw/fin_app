import { useState, useEffect, useSyncExternalStore } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { db, cloudEnabled } from '@/db/db'
import type { DXCInputField } from 'dexie-cloud-addon'

function useUserInteraction() {
  return useSyncExternalStore(
    (cb) => {
      if (!cloudEnabled) return () => {}
      const sub = db.cloud.userInteraction.subscribe(cb)
      return () => sub.unsubscribe()
    },
    () => cloudEnabled ? db.cloud.userInteraction.value : undefined,
  )
}

function interpolate(message: string, params: Record<string, string>): string {
  return message.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`)
}

export function CloudLoginDialog() {
  const interaction = useUserInteraction()
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (interaction) {
      const defaults: Record<string, string> = {}
      Object.keys(interaction.fields).forEach(k => { defaults[k] = '' })
      setValues(defaults)
      setSubmitting(false)
    }
  }, [interaction?.type])

  if (!interaction) return null

  async function handleSubmit() {
    if (!interaction) return
    setSubmitting(true)
    try {
      await interaction.onSubmit(values as Parameters<typeof interaction.onSubmit>[0])
      // Kick off sync after login completes
      if (cloudEnabled) db.cloud.sync().catch(() => {})
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel() {
    interaction?.onCancel()
  }

  const alertSeverityMap = { error: 'error', warning: 'warning', info: 'info' } as const
  const isOtp = interaction.type === 'otp'

  return (
    <Dialog
      open
      maxWidth="xs"
      fullWidth
      onClose={(_e, reason) => { if (reason !== 'backdropClick') handleCancel() }}
      disableRestoreFocus
    >
      <DialogTitle>{interaction.title}</DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        {interaction.alerts.map((alert, i) => (
          <Alert key={i} severity={alertSeverityMap[alert.type]}>
            {interpolate(alert.message, alert.messageParams)}
          </Alert>
        ))}

        {isOtp && interaction.alerts.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Verifique seu email e cole o código abaixo.
          </Typography>
        )}

        {Object.entries(interaction.fields).map(([name, field]) => {
          const f = field as DXCInputField
          return (
            <TextField
              key={name}
              label={f.label ?? name}
              placeholder={f.placeholder}
              type={f.type === 'otp' ? 'text' : f.type}
              size="small"
              fullWidth
              autoFocus
              value={values[name] ?? ''}
              onChange={e => setValues(v => ({ ...v, [name]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              slotProps={{
                htmlInput: {
                  autoComplete: name === 'otp' ? 'one-time-code' : undefined,
                  inputMode: name === 'otp' ? 'numeric' : undefined,
                },
              }}
            />
          )
        })}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {interaction.cancelLabel && (
          <Button onClick={handleCancel} color="inherit" disabled={submitting}>
            {interaction.cancelLabel}
          </Button>
        )}
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {interaction.submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
