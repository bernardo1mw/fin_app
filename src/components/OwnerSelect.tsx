import { useRef, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
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

  const members = useLiveQuery(async () => {
    if (!cloudEnabled) return []
    try {
      const all: Array<{ email?: string }> = await db.table('members').toArray()
      return all.filter(m => !!m.email && m.email.includes('@')).map(m => m.email as string)
    } catch {
      return []
    }
  }, [])

  const emails = new Set<string>(Array.isArray(members) ? members : [])
  if (currentUser?.email && currentUser.email.includes('@')) emails.add(currentUser.email)

  return [...emails].sort()
}

// Distinct owner values that exist in transactions (for filter dropdowns)
export function useDistinctOwners(): string[] {
  const owners = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    const set = new Set<string>()
    all.forEach(t => { if (t.owner && t.owner !== 'unauthorized') set.add(t.owner) })
    return [...set]
  }, [])
  return Array.isArray(owners)
    ? owners.sort((a, b) => ownerDisplay(a).localeCompare(ownerDisplay(b), 'pt-BR'))
    : []
}

export function ownerDisplay(email: string | null | undefined): string {
  if (!email) return '—'
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

interface OwnerSelectProps {
  value: string
  onChange: (v: string) => void
  onClose: () => void
}

// Inline-editing widget: always a dropdown (freeSolo Autocomplete).
// Saves on selection, Enter, or blur. Cancels on Escape.
export function OwnerSelect({ value, onChange, onClose }: OwnerSelectProps) {
  const members = useRealmMembers()
  const savedRef = useRef(false)
  const cancelledRef = useRef(false)

  // Show the display name in the input box (part before @), not the raw email
  const [inputValue, setInputValue] = useState(() => {
    if (!value) return ''
    const at = value.indexOf('@')
    return at > 0 ? value.slice(0, at) : value
  })

  function save(raw: string) {
    if (savedRef.current || cancelledRef.current) return
    savedRef.current = true
    const trimmed = raw.trim()
    // Prefer full email if typed display name matches a member
    const match = members.find(m => m === trimmed || ownerDisplay(m) === trimmed)
    onChange(match ?? trimmed)
    onClose()
  }

  return (
    <Autocomplete
      freeSolo
      size="small"
      options={members}
      getOptionLabel={ownerDisplay}
      inputValue={inputValue}
      onInputChange={(_, v) => setInputValue(v)}
      onChange={(_, newValue) => {
        if (newValue === null) { save(''); return }
        save(typeof newValue === 'string' ? newValue : (newValue as string))
      }}
      onBlur={() => save(inputValue)}
      openOnFocus
      renderInput={params => (
        <TextField
          {...params}
          autoFocus
          size="small"
          placeholder="Responsável"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              cancelledRef.current = true
              e.stopPropagation()
              onClose()
            }
          }}
        />
      )}
      sx={{ width: 150 }}
    />
  )
}
