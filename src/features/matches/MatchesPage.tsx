import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, X, Undo2, ScanSearch } from 'lucide-react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import CircularProgress from '@mui/material/CircularProgress'
import { useMatches, detectMatches } from './useMatches'
import type { MatchWithTxs } from './useMatches'
import type { Transaction } from '@/db/schema'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function daysBetween(a: Transaction, b: Transaction): number {
  const da = a.date instanceof Date ? a.date : new Date(a.date as string)
  const db_ = b.date instanceof Date ? b.date : new Date(b.date as string)
  return Math.round(Math.abs(da.getTime() - db_.getTime()) / (1000 * 60 * 60 * 24))
}

function TxRow({ tx }: { tx: Transaction }) {
  const d = tx.date instanceof Date ? tx.date : new Date(tx.date as string)
  const isIncome = tx.amount > 0
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', minWidth: 72 }}>
        {format(d, 'dd/MM/yyyy', { locale: ptBR })}
      </Typography>
      <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 500 }} noWrap>{tx.payee}</Typography>
      <Typography
        variant="body2"
        sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: isIncome ? 'success.main' : 'error.main', fontWeight: 600 }}
      >
        {isIncome ? '+' : ''}{fmt(tx.amount)}
      </Typography>
    </Box>
  )
}

function MatchCard({ match, selected, onToggle, onApprove, onReject, onUndo }: {
  match: MatchWithTxs
  selected?: boolean
  onToggle?: () => void
  onApprove?: () => void
  onReject?: () => void
  onUndo?: () => void
}) {
  const days = daysBetween(match.tx1, match.tx2)

  return (
    <Card sx={{ p: 2, display: 'flex', gap: 1, alignItems: 'flex-start', bgcolor: selected ? 'action.selected' : undefined }}>
      {onToggle && (
        <Checkbox size="small" checked={!!selected} onChange={onToggle} sx={{ alignSelf: 'flex-start', mt: 0.25 }} />
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <TxRow tx={match.tx1} />
        <Divider sx={{ my: 0.5 }} />
        <TxRow tx={match.tx2} />
        <Chip
          label={days === 0 ? 'mesmo dia' : `${days} dia${days !== 1 ? 's' : ''} de diferença`}
          size="small"
          sx={{ mt: 0.75, fontSize: 11, height: 20 }}
          variant="outlined"
        />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, flexShrink: 0 }}>
        {onApprove && (
          <Button size="small" variant="contained" color="success" startIcon={<Check size={13} />} onClick={onApprove} sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            Aprovar
          </Button>
        )}
        {onReject && (
          <Button size="small" variant="outlined" color="error" startIcon={<X size={13} />} onClick={onReject} sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            Rejeitar
          </Button>
        )}
        {onUndo && (
          <Button size="small" variant="outlined" startIcon={<Undo2 size={13} />} onClick={onUndo} sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            Desfazer
          </Button>
        )}
      </Box>
    </Card>
  )
}

export function MatchesPage() {
  const { pending, approved, approve, reject, undo, bulkApprove, bulkReject, bulkUndo, loading } = useMatches()
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<number | null>(null)
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set())
  const [approvedSelected, setApprovedSelected] = useState<Set<string>>(new Set())

  useEffect(() => { runDetection() }, [])

  // Clear selections when lists change
  useEffect(() => { setPendingSelected(s => { const next = new Set(s); for (const id of s) { if (!pending.find(m => m.id === id)) next.delete(id) }; return next }) }, [pending])
  useEffect(() => { setApprovedSelected(s => { const next = new Set(s); for (const id of s) { if (!approved.find(m => m.id === id)) next.delete(id) }; return next }) }, [approved])

  async function runDetection() {
    setDetecting(true)
    setDetected(null)
    try { const n = await detectMatches(); setDetected(n) }
    finally { setDetecting(false) }
  }

  function togglePending(id: string) {
    setPendingSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAllPending() {
    setPendingSelected(s => s.size === pending.length ? new Set() : new Set(pending.map(m => m.id)))
  }
  function toggleApproved(id: string) {
    setApprovedSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAllApproved() {
    setApprovedSelected(s => s.size === approved.length ? new Set() : new Set(approved.map(m => m.id)))
  }

  async function handleBulkApprove() {
    const ids = Array.from(pendingSelected)
    setPendingSelected(new Set())
    await bulkApprove(ids)
  }
  async function handleBulkReject() {
    const ids = Array.from(pendingSelected)
    setPendingSelected(new Set())
    await bulkReject(ids)
  }
  async function handleBulkUndo() {
    const ids = Array.from(approvedSelected)
    setApprovedSelected(new Set())
    await bulkUndo(ids)
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}><CircularProgress size={24} /></Box>
  }

  const allPendingSelected = pending.length > 0 && pendingSelected.size === pending.length
  const somePendingSelected = pendingSelected.size > 0 && !allPendingSelected
  const allApprovedSelected = approved.length > 0 && approvedSelected.size === approved.length
  const someApprovedSelected = approvedSelected.size > 0 && !allApprovedSelected

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>Matches</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={detecting ? <CircularProgress size={13} /> : <ScanSearch size={14} />}
          onClick={runDetection}
          disabled={detecting}
        >
          Detectar
        </Button>
      </Box>

      {detected !== null && (
        <Typography variant="body2" color={detected > 0 ? 'success.main' : 'text.secondary'}>
          {detected > 0
            ? `${detected} novo${detected !== 1 ? 's' : ''} match${detected !== 1 ? 'es' : ''} encontrado${detected !== 1 ? 's' : ''}.`
            : 'Nenhum novo match encontrado.'}
        </Typography>
      )}

      {/* Pending section */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {pending.length > 0 && (
            <Checkbox
              size="small"
              checked={allPendingSelected}
              indeterminate={somePendingSelected}
              onChange={toggleAllPending}
            />
          )}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, flexGrow: 1 }}>
            Aguardando revisão{pending.length > 0 && <Chip label={pending.length} size="small" color="warning" sx={{ ml: 0.5, height: 18, fontSize: 11 }} />}
          </Typography>
        </Box>

        <Collapse in={pendingSelected.size > 0}>
          <Paper variant="outlined" sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {pendingSelected.size} selecionado{pendingSelected.size !== 1 ? 's' : ''}
            </Typography>
            <Button size="small" variant="contained" color="success" startIcon={<Check size={13} />} onClick={handleBulkApprove}>
              Aprovar
            </Button>
            <Button size="small" variant="outlined" color="error" startIcon={<X size={13} />} onClick={handleBulkReject}>
              Rejeitar
            </Button>
            <Button size="small" color="inherit" onClick={() => setPendingSelected(new Set())}>
              Cancelar
            </Button>
          </Paper>
        </Collapse>

        {pending.length === 0
          ? <Typography variant="body2" color="text.secondary">Nenhum match pendente.</Typography>
          : pending.map(m => (
            <MatchCard
              key={m.id}
              match={m}
              selected={pendingSelected.has(m.id)}
              onToggle={() => togglePending(m.id)}
              onApprove={() => approve(m.id)}
              onReject={() => reject(m.id)}
            />
          ))
        }
      </Box>

      {/* Approved section */}
      {approved.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox
              size="small"
              checked={allApprovedSelected}
              indeterminate={someApprovedSelected}
              onChange={toggleAllApproved}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, flexGrow: 1 }}>
              Aprovados <Chip label={approved.length} size="small" color="success" sx={{ ml: 0.5, height: 18, fontSize: 11 }} />
            </Typography>
          </Box>

          <Collapse in={approvedSelected.size > 0}>
            <Paper variant="outlined" sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {approvedSelected.size} selecionado{approvedSelected.size !== 1 ? 's' : ''}
              </Typography>
              <Button size="small" variant="outlined" startIcon={<Undo2 size={13} />} onClick={handleBulkUndo}>
                Desfazer
              </Button>
              <Button size="small" color="inherit" onClick={() => setApprovedSelected(new Set())}>
                Cancelar
              </Button>
            </Paper>
          </Collapse>

          {approved.map(m => (
            <MatchCard
              key={m.id}
              match={m}
              selected={approvedSelected.has(m.id)}
              onToggle={() => toggleApproved(m.id)}
              onUndo={() => undo(m.id)}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
