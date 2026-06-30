import { useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import MuiSelect from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { db, cloudEnabled } from '@/db/db'

export function useRealmMembers(): string[] {
  const currentUser = useSyncExternalStore(
    cb => {
      if (!cloudEnabled) return () => {}
      const sub = db.cloud.currentUser.subscribe(cb)
      return () => sub.unsubscribe()
    },
    () => cloudEnabled ? db.cloud.currentUser.value : null,
  )

  const members = useLiveQuery(async () => {
    if (!cloudEnabled) return []
    try {
      const all: Array<{ email?: string }> = await db.table('members').toArray()
      return all.filter(m => m.email).map(m => m.email as string)
    } catch { return [] }
  }, []) ?? []

  const emails = new Set<string>(members)
  if (currentUser?.email) emails.add(currentUser.email)

  return [...emails].sort()
}

export function ownerDisplay(email: string | null | undefined): string {
  if (!email) return '—'
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

// Inline-editing select: auto-opens on mount, calls onChange on pick, onClose on dismiss.
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
      <TextField
        autoFocus
        size="small"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); onClose() }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange(draft); onClose() }
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Responsável"
        sx={{ width: 130 }}
        slotProps={{ input: { sx: { fontSize: 12, py: 0.5 } } }}
      />
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
