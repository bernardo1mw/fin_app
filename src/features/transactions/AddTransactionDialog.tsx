import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { SelectChangeEvent } from '@mui/material/Select'
import { db } from '@/db/db'
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
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

interface Props {
  open: boolean
  onClose: () => void
}

export function AddTransactionDialog({ open, onClose }: Props) {
  const categories = useLiveQuery(() => db.categories.toArray())
  const accounts = useLiveQuery(() => db.accounts.toArray())

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payee, setPayee] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [direction, setDirection] = useState<'expense' | 'income'>('expense')
  const [categoryId, setCategoryId] = useState<string>('')
  const [memo, setMemo] = useState('')
  const [accountId, setAccountId] = useState<string>('')

  function reset() {
    setDate(new Date().toISOString().slice(0, 10))
    setPayee('')
    setAmountStr('')
    setDirection('expense')
    setCategoryId('')
    setMemo('')
    setAccountId('')
  }

  async function handleSave() {
    const rawAmount = parseFloat(amountStr.replace(',', '.'))
    if (!payee.trim() || isNaN(rawAmount) || rawAmount <= 0) return

    const amount = direction === 'expense' ? -rawAmount : rawAmount
    const txDate = new Date(date + 'T12:00:00')
    const chosenAccountId = accountId || accounts?.[0]?.id || ''

    await db.transactions.add({
      id: crypto.randomUUID(),
      fitId: 'manual-' + crypto.randomUUID(),
      accountId: chosenAccountId,
      date: txDate,
      amount,
      payee: payee.trim(),
      memo: memo.trim(),
      transactionSubtype: direction === 'income' ? 'pix_in' : 'other',
      cnpjPrefix: null,
      categoryId: categoryId || null,
      trnType: 'OTHER',
      currency: 'BRL',
    })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Nova transação</DialogTitle>
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
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Descrição (payee)"
          size="small"
          fullWidth
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          placeholder="Ex: Supermercado Extra"
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
            onChange={(e) => setAmountStr(e.target.value)}
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
            {(categories ?? []).map(c => (
              <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {(accounts?.length ?? 0) > 1 && (
          <FormControl size="small" fullWidth>
            <InputLabel>Conta</InputLabel>
            <Select
              label="Conta"
              value={accountId}
              onChange={(e: SelectChangeEvent<string>) => setAccountId(e.target.value)}
            >
              <MenuItem value=""><em>Primeira conta</em></MenuItem>
              {accounts!.map(a => (
                <MenuItem key={a.id} value={String(a.id)}>{a.bankName || a.acctId}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <TextField
          label="Memo (opcional)"
          size="small"
          fullWidth
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          multiline
          rows={2}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose() }}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave}>Salvar</Button>
      </DialogActions>
    </Dialog>
  )
}
