import { useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Upload, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Trash2, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { db, triggerSync } from '@/db/db'
import { useImport, isValidRow, type PreviewRow, type ParsedPreview } from './useImport'
import { useRealmMembers, ownerDisplay, OwnerSelect } from '@/components/OwnerSelect'

const PAGE_SIZE = 15

export function ImportPage() {
  const { parseFile, confirmImport, undoImport, loading, preview, result } = useImport()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState(0)
  const [page, setPage] = useState(0)
  const [confirmUndo, setConfirmUndo] = useState<string | null>(null)
  const [owner, setOwner] = useState('')
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null)

  async function saveBatchOwner(batchId: string, newOwner: string) {
    const owner = newOwner.trim() || null
    await db.transactions.where('importId').equals(batchId).modify({ owner })
    await db.importBatches.update(batchId, { owner })
    triggerSync()
    setEditingBatchId(null)
  }

  const categories = useLiveQuery(() => db.categories.toArray())
  const importBatches = useLiveQuery(() => db.importBatches.orderBy('importedAt').reverse().toArray())
  const catMap: Record<string, string> = Object.fromEntries((categories ?? []).map(c => [c.id!, c.name]))

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    const ofxFiles = Array.from(files).filter(f =>
      f.name.toLowerCase().endsWith('.ofx') || f.name.toLowerCase().endsWith('.qfx')
    )
    if (!ofxFiles.length) return
    setTab(0)
    setPage(0)
    const p = await parseFile(ofxFiles[0])
    if (p && !p.parseError) {
      setSelected(new Set(p.newRows.filter(isValidRow).map(r => r.fitId)))
    }
  }, [parseFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  async function handleConfirm() {
    if (!preview) return
    await confirmImport(preview, selected, owner)
    setSelected(new Set())
    setPage(0)
    setTab(0)
  }

  async function handleUndo() {
    if (!confirmUndo) return
    await undoImport(confirmUndo)
    setConfirmUndo(null)
  }

  const rows = preview ? (tab === 0 ? preview.newRows : preview.duplicateRows) : []
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const allPageSelected = pageRows.length > 0 && pageRows.filter(isValidRow).every(r => selected.has(r.fitId))
  const somePageSelected = pageRows.some(r => selected.has(r.fitId))

  function toggleRow(fitId: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(fitId)) next.delete(fitId); else next.add(fitId)
      return next
    })
  }

  function toggleAll() {
    const validOnPage = pageRows.filter(isValidRow)
    if (allPageSelected) {
      setSelected(s => { const next = new Set(s); validOnPage.forEach(r => next.delete(r.fitId)); return next })
    } else {
      setSelected(s => { const next = new Set(s); validOnPage.forEach(r => next.add(r.fitId)); return next })
    }
  }

  function selectAllNew() {
    if (!preview) return
    setSelected(new Set(preview.newRows.filter(isValidRow).map(r => r.fitId)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  const undoBatch = confirmUndo ? (importBatches ?? []).find(b => b.id === confirmUndo) : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Importar OFX</Typography>

      <Card sx={{ maxWidth: 640 }}>
        <CardContent>
          <Box
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            sx={{
              border: '2px dashed',
              borderColor: dragging ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: { xs: 4, sm: 6 },
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
            }}
          >
            <Upload size={40} color="#9e9e9e" style={{ margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500 }}>Arraste o arquivo OFX ou clique para selecionar</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Suporta arquivos .ofx e .qfx</Typography>
            <input ref={inputRef} type="file" accept=".ofx,.qfx" hidden onChange={e => handleFiles(e.target.files)} />
          </Box>
        </CardContent>
      </Card>

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">Processando arquivo...</Typography>
        </Box>
      )}

      {preview && !loading && !result && (
        <ReviewPanel
          preview={preview}
          selected={selected}
          tab={tab}
          page={page}
          rows={rows}
          pageRows={pageRows}
          totalPages={totalPages}
          allPageSelected={allPageSelected}
          somePageSelected={somePageSelected}
          catMap={catMap}
          owner={owner}
          onOwnerChange={setOwner}
          onTabChange={(v) => { setTab(v); setPage(0) }}
          onPageChange={setPage}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
          onSelectAll={selectAllNew}
          onDeselectAll={deselectAll}
          onConfirm={handleConfirm}
        />
      )}

      {result && !loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {result.errors.length === 0
            ? <CheckCircle size={16} color="#22c55e" />
            : <AlertCircle size={16} color="#d32f2f" />
          }
          <StatChip label="Importadas" value={result.imported} color="primary" />
          <StatChip label="Categorizadas auto" value={result.categorized} color="success" />
          {result.skipped > 0 && (
            <StatChip label="Ignoradas (inválidas)" value={result.skipped} color="default" />
          )}
          {result.errors.map((e, i) => (
            <Typography key={i} variant="body2" color="error">{e}</Typography>
          ))}
        </Box>
      )}

      {(importBatches?.length ?? 0) > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Histórico de importações
          </Typography>
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell>Arquivo</TableCell>
                  <TableCell>Data</TableCell>
                  <TableCell align="right">Transações</TableCell>
                  <TableCell>Responsável</TableCell>
                  <TableCell padding="none" sx={{ width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {(importBatches ?? []).map(batch => (
                  <TableRow key={batch.id} hover>
                    <TableCell sx={{ fontSize: 13 }}>{batch.filename}</TableCell>
                    <TableCell sx={{ fontSize: 13, whiteSpace: 'nowrap', color: 'text.secondary' }}>
                      {format(batch.importedAt, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: 13 }}>{batch.transactionCount}</TableCell>
                    <TableCell sx={{ fontSize: 13 }}>
                      {editingBatchId === batch.id ? (
                        <OwnerSelect
                          value={batch.owner ?? ''}
                          onChange={v => saveBatchOwner(batch.id, v)}
                          onClose={() => setEditingBatchId(null)}
                        />
                      ) : (
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', '&:hover .edit-icon': { opacity: 1 } }}
                          onClick={() => setEditingBatchId(batch.id)}
                        >
                          <Typography variant="caption" color={batch.owner ? 'text.primary' : 'text.secondary'}>
                            {ownerDisplay(batch.owner)}
                          </Typography>
                          <Pencil size={11} className="edit-icon" style={{ opacity: 0, transition: 'opacity 0.15s' }} />
                        </Box>
                      )}
                    </TableCell>
                    <TableCell padding="none">
                      <Tooltip title="Desfazer importação">
                        <IconButton size="small" color="error" onClick={() => setConfirmUndo(batch.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      <Dialog open={confirmUndo !== null} onClose={() => setConfirmUndo(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Desfazer importação?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Isso vai excluir permanentemente as <strong>{undoBatch?.transactionCount}</strong> transações
            importadas do arquivo <strong>"{undoBatch?.filename}"</strong>. Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUndo(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleUndo}>Desfazer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

interface ReviewPanelProps {
  preview: ParsedPreview
  selected: Set<string>
  tab: number
  page: number
  rows: PreviewRow[]
  pageRows: PreviewRow[]
  totalPages: number
  allPageSelected: boolean
  somePageSelected: boolean
  catMap: Record<string, string>
  owner: string
  onOwnerChange: (v: string) => void
  onTabChange: (v: number) => void
  onPageChange: (fn: (p: number) => number) => void
  onToggleRow: (fitId: string) => void
  onToggleAll: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onConfirm: () => void
}

function ReviewPanel({
  preview, selected, tab, page, rows, pageRows, totalPages,
  allPageSelected, somePageSelected, catMap,
  owner, onOwnerChange,
  onTabChange, onPageChange, onToggleRow, onToggleAll,
  onSelectAll, onDeselectAll, onConfirm,
}: ReviewPanelProps) {
  const members = useRealmMembers()
  if (preview.parseError) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AlertCircle size={16} color="#d32f2f" />
        <Typography variant="body2" color="error">{preview.parseError}</Typography>
      </Box>
    )
  }

  const invalidCount = preview.newRows.filter(r => !isValidRow(r)).length

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 760 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Revisar transações
          </Typography>
          {invalidCount > 0 && (
            <Typography variant="caption" color="warning.main">
              {invalidCount} linha{invalidCount !== 1 ? 's' : ''} inválida{invalidCount !== 1 ? 's' : ''} serão ignoradas (descrição ou valor em branco)
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {members.length > 0 ? (
            <FormControl size="small" sx={{ width: 180 }}>
              <InputLabel>Responsável</InputLabel>
              <Select
                label="Responsável"
                value={owner}
                onChange={e => onOwnerChange(e.target.value as string)}
                displayEmpty
              >
                <MenuItem value=""><em>Nenhum</em></MenuItem>
                {members.map(email => (
                  <MenuItem key={email} value={email}>{ownerDisplay(email)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField
              size="small"
              label="Responsável (opcional)"
              value={owner}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onOwnerChange(e.target.value)}
              placeholder="Ex: Bernardo"
              sx={{ width: 180 }}
            />
          )}
          <Button
            variant="contained"
            size="small"
            disabled={selected.size === 0}
            onClick={onConfirm}
          >
            Importar {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v: number) => onTabChange(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`Novas (${preview.newRows.length})`} />
        <Tab label={`Duplicatas (${preview.duplicateRows.length})`} />
      </Tabs>

      {tab === 0 && preview.newRows.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button size="small" variant="text" sx={{ fontSize: 12 }} onClick={onSelectAll}>
            Selecionar todas
          </Button>
          <Typography variant="caption" color="text.secondary">·</Typography>
          <Button size="small" variant="text" sx={{ fontSize: 12 }} onClick={onDeselectAll}>
            Desmarcar todas
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {selected.size} de {preview.newRows.length} selecionadas
          </Typography>
        </Box>
      )}

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Nenhuma transação.</Typography>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  {tab === 0 && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={allPageSelected}
                        indeterminate={!allPageSelected && somePageSelected}
                        onChange={onToggleAll}
                      />
                    </TableCell>
                  )}
                  <TableCell>Data</TableCell>
                  <TableCell>Descrição</TableCell>
                  <TableCell align="right">Valor</TableCell>
                  {tab === 0 && <TableCell>Categoria</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map(row => (
                  <PreviewRowItem
                    key={row.fitId}
                    row={row}
                    selectable={tab === 0}
                    checked={selected.has(row.fitId)}
                    catMap={catMap}
                    onToggle={() => onToggleRow(row.fitId)}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} de {rows.length}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Button size="small" variant="outlined" disabled={page === 0} onClick={() => onPageChange(p => p - 1)} sx={{ minWidth: 36, p: 0.5 }}>
                  <ChevronLeft size={16} />
                </Button>
                <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => onPageChange(p => p + 1)} sx={{ minWidth: 36, p: 0.5 }}>
                  <ChevronRight size={16} />
                </Button>
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  )
}

function PreviewRowItem({ row, selectable, checked, catMap, onToggle }: {
  row: PreviewRow
  selectable: boolean
  checked: boolean
  catMap: Record<string, string>
  onToggle: () => void
}) {
  const valid = isValidRow(row)
  const isIncome = row.amount > 0
  const fmtCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: row.currency })
  return (
    <TableRow
      hover
      onClick={selectable && valid ? onToggle : undefined}
      sx={selectable && valid ? { cursor: 'pointer' } : { opacity: valid ? 1 : 0.45 }}
      selected={selectable && checked}
    >
      {selectable && (
        <TableCell padding="checkbox">
          <Checkbox size="small" checked={checked} disabled={!valid} onChange={onToggle} onClick={e => e.stopPropagation()} />
        </TableCell>
      )}
      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontSize: 13 }}>
        {format(row.date, 'dd/MM/yyyy', { locale: ptBR })}
      </TableCell>
      <TableCell sx={{ maxWidth: 240, fontSize: 13 }}>
        {row.payee
          ? <Typography variant="body2" noWrap>{row.payee}</Typography>
          : <Typography variant="body2" color="error" noWrap><em>Sem descrição</em></Typography>
        }
      </TableCell>
      <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', fontSize: 13, color: isIncome ? 'success.main' : 'text.primary' }}>
        {isIncome ? '+' : ''}{fmtCurrency.format(row.amount)}
      </TableCell>
      {selectable && (
        <TableCell sx={{ fontSize: 13 }}>
          {row.categoryId
            ? <Chip label={catMap[row.categoryId] ?? '—'} size="small" variant="outlined" />
            : <Typography variant="caption" color="text.secondary">Sem categoria</Typography>
          }
        </TableCell>
      )}
    </TableRow>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: 'primary' | 'default' | 'success' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Chip label={value} size="small" color={color} />
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
  )
}
