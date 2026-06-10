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
import Toolbar from '@mui/material/Toolbar'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Collapse from '@mui/material/Collapse'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import TablePagination from '@mui/material/TablePagination'
import { Filter, Plus, Trash2, X } from 'lucide-react'
import { CategoryPicker } from './CategoryPicker'
import { useTransactions } from './useTransactions'
import type { TransactionFilter } from './useTransactions'
import { AddTransactionDialog } from './AddTransactionDialog'
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

  function updateFilters(updater: (f: TransactionFilter) => TransactionFilter) {
    setFilters(updater)
    setPage(0)
  }

  const { transactions, categories, accounts, setCategory, setCategoryAllByPayee, setCategoryBulk, countSamePayee, deleteTransaction, deleteTransactionsBulk } =
    useTransactions(filters)

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
      next.has(id) ? next.delete(id) : next.add(id)
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Sticky top: title + filters + bulk toolbar */}
      <Box sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'background.default',
        // Pull the box flush with the scroll container top by negating the parent's padding.
        // AppShell main: p={xs:2,sm:3}, pt={xs:7,sm:3}
        mt: { xs: -7, sm: -3 },
        mx: { xs: -2, sm: -3 },
        px: { xs: 2, sm: 3 },
        pt: { xs: 7, sm: 3 },
        pb: 1,
      }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>Transações</Typography>
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
      </Box>

      {/* Filter bar */}
      <Collapse in={showFilters}>
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
                {(categories ?? []).map(c => (
                  <MenuItem key={c.id} value={c.id!} sx={{ gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                    {c.name}
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

      {/* Bulk edit toolbar */}
      <Collapse in={selectedCount > 0}>
        <Paper variant="outlined" sx={{ bgcolor: 'primary.50' }}>
          <Toolbar variant="dense" sx={{ gap: 2, flexWrap: 'wrap', minHeight: 48 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {selectedCount} selecionada{selectedCount !== 1 ? 's' : ''}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Categoria</InputLabel>
              <Select
                label="Categoria"
                value={bulkCategoryId}
                onChange={(e: SelectChangeEvent<string>) => setBulkCategoryId(e.target.value)}
              >
                <MenuItem value=""><em>Selecionar</em></MenuItem>
                {(categories ?? []).map(c => (
                  <MenuItem key={c.id} value={String(c.id)} sx={{ gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                    {c.name}
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
          </Toolbar>
        </Paper>
      </Collapse>
      </Box>{/* end sticky top */}

      {transactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nenhuma transação encontrada.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ bgcolor: 'action.hover' }}>
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'action.hover' }}>Data</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'action.hover' }}>Descrição</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'action.hover' }}>Valor</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontWeight: 500, bgcolor: 'action.hover' }}>Categoria</TableCell>
                <TableCell sx={{ width: 40, bgcolor: 'action.hover' }} />
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
                    </TableCell>
                    <TableCell sx={{ maxWidth: { xs: 140, sm: 280 } }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{tx.payee}</Typography>
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
                    <TableCell padding="none" onClick={e => e.stopPropagation()} sx={{ width: 40 }}>
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
          />
        </TableContainer>
      )}

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
