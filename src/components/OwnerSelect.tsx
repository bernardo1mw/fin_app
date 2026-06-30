import { useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from 'lucide-react'
import MuiSelect from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import { db, cloudEnabled } from '@/db/db'

export function useRealmMembers(): string[] {
  const currentUser = useSyncExternalStore(
    cb => {
      if (!cloudEnabled) return () => {}
      try {
        const sub = db.cloud.currentUser.subscribe(cb)
        return () => { try { sub.unsubscribe() } catch {} }
      } catch {
        return () => {}
      }
    },
    () => {
      if (!cloudEnabled) return null
      try { return db.cloud.currentUser.value } catch { return null }
    },
  )

  // useLiveQuery returns undefined while loading; catch ensures no error propagates
  const members = useLiveQuery(async () => {
    if (!cloudEnabled) return []
    try {
      const all: Array<{ email?: string }> = await db.table('members').toArray()
      return all.filter(m => !!m.email).map(m => m.email as string)
    } catch {
      return []
    }
  }, [])

  const emails = new Set<string>(Array.isArray(members) ? members : [])
  if (currentUser?.email) emails.add(currentUser.email)

  return [...emails].sort()
}

export function ownerDisplay(email: string | null | undefined): string {
  if (!email) return '—'
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

// Inline-editing widget: auto-opens Select on mount; for the fallback TextField
// shows an explicit save (✓) button since blur-to-save is not obvious.
interface OwnerSelectProps {
  value: string
  onChange: (v: string) => void
  onClose: () => void
}

export function OwnerSelect({ value, onChange, onClose }: OwnerSelectProps) {
  const members = useRealmMembers()
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState(value)

  if (members.length === 0) {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <TextField
          autoFocus
          size="small"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onChange(draft); onClose() }
            if (e.key === 'Escape') onClose()
          }}
          placeholder="Responsável"
          sx={{ width: 110 }}
          slotProps={{ input: { sx: { fontSize: 12, py: 0.5 } } }}
        />
        <IconButton
          size="small"
          onMouseDown={e => {
            e.preventDefault() // prevent TextField blur firing first
            onChange(draft)
            onClose()
          }}
          sx={{ p: 0.5 }}
        >
          <Check size={14} />
        </IconButton>
      </Box>
    )
  }

  return (
    <MuiSelect
      size="small"
      value={value}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => { setOpen(false); onClose() }}
      onChange={e => onChange(e.target.value as string)}
      displayEmpty
      sx={{ fontSize: 12, minWidth: 130 }}
    >
      <MenuItem value="" sx={{ fontSize: 12 }}><em>Sem responsável</em></MenuItem>
      {members.map(email => (
        <MenuItem key={email} value={email} sx={{ fontSize: 12 }}>
          {ownerDisplay(email)}
        </MenuItem>
      ))}
    </MuiSelect>
  )
}
