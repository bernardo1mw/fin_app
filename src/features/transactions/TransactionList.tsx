import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { SelectChangeEvent } from '@mui/material/Select'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Collapse from '@mui/material/Collapse'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import TablePagination from '@mui/material/TablePagination'
import Alert from '@mui/material/Alert'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import { Filter, Plus, Trash2, X, GitMerge, Pencil } from 'lucide-react'
import { CategoryPicker } from './CategoryPicker'
import { useTransactions } from './useTransactions'
import type { TransactionFilter } from './useTransactions'
import { AddTransactionDialog } from './AddTransactionDialog'
import { EditTransactionDialog } from './EditTransactionDialog'
import { MatchesPage } from '@/features/matches/MatchesPage'
import { createManualMatch } from '@/features/matches/useMatches'
import { OwnerSelect, ownerDisplay, useDistinctOwners } from '@/components/OwnerSelect'
import type { Transaction } from '@/db/schema'

interface PendingChange {
  tx: Transaction
  categoryId: string
  samePayeeCount: number
}

const EMPTY_FILTERS: TransactionFilter = {}

export function TransactionList() {
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<TransactionFilter>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState<string>('')
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [tab, setTab] = useState(0)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [matchLoading, setMatchLoading] = useState(false)
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null)
  const [editTx, setEditTx] = useState<Transaction | null>(null)

  function updateFilters(updater: (f: TransactionFilter) => TransactionFilter) {
    setFilters(updater)
    setPage(0)
  }

  const { transactions, categories, accounts, setCategory, setCategoryAllByPayee, setCategoryBulk, countSamePayee, deleteTransaction, deleteTransactionsBulk, setOwner, updateTransaction } =
    useTransactions(filters, true)
  const distinctOwners = useDistinctOwners()

  async function saveOwner(txId: string, newOwner: string) {
    await setOwner(txId, newOwner.trim() || null)
    setEditingOwnerId(null)
  }

  function handleTabChange(_: React.SyntheticEvent, newTab: number) {
    setTab(newTab)
    setSelected(new Set())
    setMatchError(null)
  }

  async function handleCreateMatch() {
    const [id1, id2] = Array.from(selected)
    setMatchLoading(true)
    setMatchError(null)
    try {
      await createManualMatch(id1, id2)
      setSelected(new Set())
      setTab(1)
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : 'Erro ao criar match')
    } finally {
      setMatchLoading(false)
    }
  }

  const allIds = (transactions ?? []).map(t => t.id!)
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someSelected = allIds.some(id => selected.has(id)) && !allSelected

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allIds))
    }
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleCategoryChange(tx: Transaction, categoryId: string) {
    const count = await countSamePayee(tx)
    if (count > 0) {
      setPending({ tx, categoryId, samePayeeCount: count })
    } else {
      await setCategory(tx, categoryId)
    }
  }

  async function applyOne() {
    if (!pending) return
    const { tx, categoryId } = pending
    setPending(null)
    await setCategory(tx, categoryId)
  }

  async function applyAll() {
    if (!pending) return
    const { tx, categoryId } = pending
    setPending(null)
    await setCategoryAllByPayee(tx, categoryId)
  }

  async function applyBulk() {
    if (!bulkCategoryId) return
    await setCategoryBulk(Array.from(selected), bulkCategoryId)
    setSelected(new Set())
    setBulkCategoryId('')
  }

  async function handleBulkDelete() {
    await deleteTransactionsBulk(Array.from(selected))
    setSelected(new Set())
    setConfirmBulkDelete(false)
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const hasFilters = Object.keys(filters).some(k => filters[k as keyof TransactionFilter] !== undefined)
  const selectedCount = selected.size

  if (!transactions || !categories) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  const isIncome = pending ? pending.tx.amount > 0 : false
  const partyLabel = isIncome ? 'remetente' : 'destinatário'
  const categoryName = pending ? (categories.find(c => c.id === pending.categoryId)?.name ?? '') : ''

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Controls: title + tabs + filters + bulk toolbar — always visible at top, never scrolls */}
      <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, pb: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', pb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>Transações</Typography>
        {tab === 0 && (
          <>
            <Tooltip title="Filtros">
              <IconButton
                onClick={() => setShowFilters(v => !v)}
                color={showFilters ? 'primary' : 'default'}
                size="small"
              >
                <Filter size={18} />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => setShowAdd(true)}
              size="small"
            >
              Nova transação
            </Button>
          </>
        )}
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tab label="Transações" />
        <Tab label="Matches" icon={<GitMerge size={14} />} iconPosition="start" />
      </Tabs>

      {matchError && (
        <Alert severity="error" onClose={() => setMatchError(null)} sx={{ mb: 1 }}>{matchError}</Alert>
      )}

      {/* Filter bar — tab 0 only */}
      <Collapse in={tab === 0 && showFilters}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField
              label="Descrição"
              size="small"
              value={filters.payeeSearch ?? ''}
              onChange={e => updateFilters(f => ({ ...f, payeeSearch: e.target.value || undefined }))}
              sx={{ minWidth: 160 }}
              placeholder="Buscar por descrição"
            />
            <TextField
              label="De"
              type="date"
              size="small"
              value={filters.dateFrom ? format(filters.dateFrom, 'yyyy-MM-dd') : ''}
              onChange={e => updateFilters(f => ({ ...f, dateFrom: e.target.value ? new Date(e.target.value + 'T00:00:00') : undefined }))}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 140 }}
            />
            <TextField
              label="Até"
              type="date"
              size="small"
              value={filters.dateTo ? format(filters.dateTo, 'yyyy-MM-dd') : ''}
              onChange={e => updateFilters(f => ({ ...f, dateTo: e.target.value ? new Date(e.target.value + 'T23:59:59') : undefined }))}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 140 }}
            />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Tipo</InputLabel>
              <Select
                label="Tipo"
                value={filters.type ?? ''}
                onChange={(e: SelectChangeEvent<string>) =>
                  updateFilters(f => ({ ...f, type: (e.target.value as 'income' | 'expense') || undefined }))
                }
              >
                <MenuItem value=""><em>Todos</em></MenuItem>
                <MenuItem value="income">Receita</MenuItem>
                <MenuItem value="expense">Despesa</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Categoria</InputLabel>
              <Select
                label="Categoria"
                value={filters.categoryId ?? ''}
                onChange={(e: SelectChangeEvent<string>) =>
                  updateFilters(f => ({ ...f, categoryId: e.target.value || undefined }))
                }
              >
                <MenuItem value=""><em>Todas</em></MenuItem>
                <MenuItem value="__none__"><em>Sem categoria</em></MenuItem>
                {(categories ?? []).map(c => (
                  <MenuItem key={c.id} value={c.id!}>
                    <Chip label={c.name} size="small" sx={{ bgcolor: c.color + '33', height: 20, fontSize: 12 }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {(accounts?.length ?? 0) > 1 && (
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Conta</InputLabel>
                <Select
                  label="Conta"
                  value={filters.accountId ?? ''}
                  onChange={(e: SelectChangeEvent<string>) =>
                    updateFilters(f => ({ ...f, accountId: e.target.value || undefined }))
                  }
                >
                  <MenuItem value=""><em>Todas</em></MenuItem>
                  {accounts!.map(a => (
                    <MenuItem key={a.id} value={a.id!}>{a.bankName || a.acctId}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {distinctOwners.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Responsável</InputLabel>
                <Select
                  label="Responsável"
                  value={filters.owner ?? ''}
                  onChange={(e: SelectChangeEvent<string>) =>
                    updateFilters(f => ({ ...f, owner: (e.target.value as TransactionFilter['owner']) || undefined }))
                  }
                >
                  <MenuItem value=""><em>Todos</em></MenuItem>
                  <MenuItem value="__none__"><em>Sem responsável</em></MenuItem>
                  {distinctOwners.map(o => (
                    <MenuItem key={o} value={o}>{ownerDisplay(o)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Valor mín"
              size="small"
              type="number"
              value={filters.amountMin ?? ''}
              onChange={e => updateFilters(f => ({ ...f, amountMin: e.target.value ? Number(e.target.value) : undefined }))}
              sx={{ minWidth: 110 }}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
            <TextField
              label="Valor máx"
              size="small"
              type="number"
              value={filters.amountMax ?? ''}
              onChange={e => updateFilters(f => ({ ...f, amountMax: e.target.value ? Number(e.target.value) : undefined }))}
              sx={{ minWidth: 110 }}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
            {hasFilters && (
              <Button size="small" startIcon={<X size={14} />} onClick={clearFilters} color="inherit">
                Limpar
              </Button>
            )}
          </Box>
        </Paper>
      </Collapse>

      {/* Bulk edit toolbar — tab 0 only */}
      <Collapse in={tab === 0 && selectedCount > 0}>
        <Paper variant="outlined" sx={{ bgcolor: 'primary.50', mb: 1 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {selectedCount} selecionada{selectedCount !== 1 ? 's' : ''}
            </Typography>
            {selectedCount === 2 && (
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={matchLoading ? <CircularProgress size={12} /> : <GitMerge size={14} />}
                onClick={handleCreateMatch}
                disabled={matchLoading}
              >
                Criar match
              </Button>
            )}
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Categoria</InputLabel>
              <Select
                label="Categoria"
                value={bulkCategoryId}
                onChange={(e: SelectChangeEvent<string>) => setBulkCategoryId(e.target.value)}
              >
                <MenuItem value=""><em>Selecionar</em></MenuItem>
                {(categories ?? []).map(c => (
                  <MenuItem key={c.id} value={String(c.id)}>
                    <Chip label={c.name} size="small" sx={{ bgcolor: c.color + '33', height: 20, fontSize: 12 }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              size="small"
              disabled={!bulkCategoryId}
              onClick={applyBulk}
            >
              Aplicar
            </Button>
            <Button
              size="small"
              color="error"
              variant="outlined"
              startIcon={<Trash2 size={14} />}
              onClick={() => setConfirmBulkDelete(true)}
            >
              Excluir
            </Button>
            <Button size="small" color="inherit" onClick={() => setSelected(new Set())}>
              Cancelar
            </Button>
          </Box>
        </Paper>
      </Collapse>
      </Box>{/* end controls */}

      {tab === 1 ? (
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <MatchesPage />
        </Box>
      ) : transactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nenhuma transação encontrada.
        </Typography>
      ) : (() => {
        const totalIncome = transactions.reduce((s, t) => t.amount > 0 ? s + t.amount : s, 0)
        const totalExpense = transactions.reduce((s, t) => t.amount < 0 ? s + Math.abs(t.amount) : s, 0)
        const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
        return (
        <>
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}
        >
          <Table size="small" stickyHeader sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 100%)' }}>
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 100%)', whiteSpace: 'nowrap' }}>Data</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 100%)', minWidth: 160 }}>Descrição</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 100%)', whiteSpace: 'nowrap' }}>Valor</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 100%)' }}>Categoria</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 100%)', minWidth: 90 }}>Responsável</TableCell>
                <TableCell sx={{ width: 40, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.06) 100%)' }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map(tx => {
                const isRowIncome = tx.amount > 0
                const catColor = tx.categoryId
                  ? categories.find(c => c.id === tx.categoryId)?.color
                  : undefined
                const fmtCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: tx.currency })
                const isSelected = selected.has(tx.id!)

                return (
                  <TableRow
                    key={tx.id}
                    hover
                    selected={isSelected}
                    onClick={() => toggleRow(tx.id!)}
                    sx={{
                      cursor: 'pointer',
                      '& td:nth-of-type(2)': {
                        borderLeft: `3px solid ${catColor ?? 'transparent'}`,
                      },
                    }}
                  >
                    <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onChange={() => toggleRow(tx.id!)}
                      />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {format(tx.date, 'dd/MM/yyyy', { locale: ptBR })}
                      <Typography component="span" variant="caption" sx={{ color: 'text.disabled', ml: 0.5 }}>
                        - {format(tx.date, 'EEE', { locale: ptBR })}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 160 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{tx.payee}</Typography>
                      {tx.transactionSubtype !== 'other' && (
                        <Chip
                          label={subtypeLabel(tx.transactionSubtype)}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 11, height: 18, mt: 0.25 }}
                        />
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        fontSize: 13,
                        color: isRowIncome ? 'success.main' : 'text.primary',
                      }}
                    >
                      {isRowIncome ? '+' : ''}{fmtCurrency.format(tx.amount)}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <CategoryPicker
                        value={tx.categoryId}
                        categories={categories}
                        onChange={catId => handleCategoryChange(tx, catId)}
                      />
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()} sx={{ minWidth: 90 }}>
                      {editingOwnerId === tx.id ? (
                        <OwnerSelect
                          value={tx.owner ?? ''}
                          onChange={v => saveOwner(tx.id!, v)}
                          onClose={() => setEditingOwnerId(null)}
                        />
                      ) : (
                        <Typography
                          variant="caption"
                          onClick={() => setEditingOwnerId(tx.id!)}
                          sx={{ cursor: 'pointer', color: tx.owner ? 'text.primary' : 'text.disabled', '&:hover': { textDecoration: 'underline' } }}
                        >
                          {ownerDisplay(tx.owner)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell padding="none" onClick={e => e.stopPropagation()} sx={{ width: 72, whiteSpace: 'nowrap' }}>
                      <Tooltip title="Editar">
                        <IconButton
                          size="small"
                          onClick={() => setEditTx(tx)}
                          sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                        >
                          <Pencil size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Excluir">
                        <IconButton
                          size="small"
                          onClick={() => deleteTransaction(tx.id!)}
                          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={transactions.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0) }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="Por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider' }}
        />
        <Box sx={{ display: 'flex', gap: 3, px: 1, py: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {transactions.length} transaç{transactions.length !== 1 ? 'ões' : 'ão'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
            Entradas: {fmtBRL.format(totalIncome)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600 }}>
            Saídas: {fmtBRL.format(totalExpense)}
          </Typography>
          <Typography variant="caption" sx={{ color: totalIncome - totalExpense >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
            Saldo: {fmtBRL.format(totalIncome - totalExpense)}
          </Typography>
        </Box>
        </>
        )
      })()}

      {/* Same-payee category dialog */}
      <Dialog open={pending !== null} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Aplicar categoria</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Existem <strong>{pending?.samePayeeCount}</strong> outra(s) transação(ões) do mesmo{' '}
            {partyLabel} <strong>"{pending?.tx.payee}"</strong>.
            Deseja aplicar a categoria <strong>"{categoryName}"</strong> a todas elas também?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: { xs: 'column', sm: 'row' }, gap: 1, p: 2 }}>
          <Button variant="outlined" onClick={applyOne} fullWidth>
            Apenas esta transação
          </Button>
          <Button variant="contained" onClick={applyAll} fullWidth>
            Todas as {(pending?.samePayeeCount ?? 0) + 1} transações
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmBulkDelete} onClose={() => setConfirmBulkDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Excluir transações</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Excluir <strong>{selectedCount}</strong> transaç{selectedCount !== 1 ? 'ões' : 'ão'} permanentemente?
            Essa ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmBulkDelete(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleBulkDelete}>Excluir</Button>
        </DialogActions>
      </Dialog>

      <AddTransactionDialog open={showAdd} onClose={() => setShowAdd(false)} />
      <EditTransactionDialog
        open={editTx !== null}
        transaction={editTx}
        categories={categories ?? []}
        onClose={() => setEditTx(null)}
        onSave={updateTransaction}
      />
    </Box>
  )
}

function subtypeLabel(s: Transaction['transactionSubtype']): string {
  const map: Record<typeof s, string> = {
    pix_out: 'Pix enviado',
    pix_in: 'Pix recebido',
    debit_card: 'Débito',
    other: '',
  }
  return map[s]
}
