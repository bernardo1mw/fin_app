import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import type { SelectChangeEvent } from '@mui/material/Select'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import type { Transaction, Category } from '@/db/schema'

interface Props {
  open: boolean
  transaction: Transaction | null
  categories: Category[]
  onClose: () => void
  onSave: (id: string, changes: Partial<Pick<Transaction, 'date' | 'amount' | 'payee' | 'memo' | 'categoryId'>>) => Promise<void>
}

export function EditTransactionDialog({ open, transaction, categories, onClose, onSave }: Props) {
  const [date, setDate] = useState('')
  const [payee, setPayee] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [direction, setDirection] = useState<'expense' | 'income'>('expense')
  const [categoryId, setCategoryId] = useState<string>('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (!transaction) return
    setDate(format(transaction.date, 'yyyy-MM-dd'))
    setPayee(transaction.payee)
    setAmountStr(String(Math.abs(transaction.amount)).replace('.', ','))
    setDirection(transaction.amount >= 0 ? 'income' : 'expense')
    setCategoryId(transaction.categoryId ?? '')
    setMemo(transaction.memo)
  }, [transaction])

  async function handleSave() {
    if (!transaction?.id) return
    const rawAmount = parseFloat(amountStr.replace(',', '.'))
    if (!payee.trim() || isNaN(rawAmount) || rawAmount <= 0) return
    await onSave(transaction.id, {
      date: new Date(date + 'T12:00:00'),
      payee: payee.trim(),
      amount: direction === 'expense' ? -rawAmount : rawAmount,
      memo: memo.trim(),
      categoryId: categoryId || null,
    })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Editar transação</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <ToggleButtonGroup
          exclusive
          value={direction}
          onChange={(_, v: string | null) => { if (v) setDirection(v as 'expense' | 'income') }}
          size="small"
          fullWidth
        >
          <ToggleButton value="expense" sx={{ flex: 1, fontSize: 13 }}>Despesa</ToggleButton>
          <ToggleButton value="income" sx={{ flex: 1, fontSize: 13 }}>Receita</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          label="Data"
          type="date"
          size="small"
          fullWidth
          value={date}
          onChange={e => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Descrição"
          size="small"
          fullWidth
          value={payee}
          onChange={e => setPayee(e.target.value)}
          autoFocus
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 16 }}>
            {direction === 'expense' ? '−' : '+'}
          </Typography>
          <TextField
            label="Valor (R$)"
            size="small"
            fullWidth
            value={amountStr}
            onChange={e => setAmountStr(e.target.value)}
            placeholder="0,00"
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
        </Box>
        <FormControl size="small" fullWidth>
          <InputLabel>Categoria</InputLabel>
          <Select
            label="Categoria"
            value={categoryId}
            onChange={(e: SelectChangeEvent<string>) => setCategoryId(e.target.value)}
          >
            <MenuItem value=""><em>Sem categoria</em></MenuItem>
            {categories.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(c => (
              <MenuItem key={c.id} value={String(c.id)}>
                <Chip label={c.name} size="small" sx={{ bgcolor: c.color + '33', height: 20, fontSize: 12 }} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Memo"
          size="small"
          fullWidth
          value={memo}
          onChange={e => setMemo(e.target.value)}
          multiline
          rows={2}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave}>Salvar</Button>
      </DialogActions>
    </Dialog>
  )
}
