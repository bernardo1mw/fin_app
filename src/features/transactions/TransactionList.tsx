import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CategoryPicker } from './CategoryPicker'
import { useTransactions } from './useTransactions'
import type { Transaction } from '@/db/schema'
import { cn } from '@/lib/utils'

interface PendingChange {
  tx: Transaction
  categoryId: number
  samePayeeCount: number
}

export function TransactionList() {
  const { transactions, categories, setCategory, setCategoryAllByPayee, countSamePayee } = useTransactions()
  const [pending, setPending] = useState<PendingChange | null>(null)

  async function handleCategoryChange(tx: Transaction, categoryId: number) {
    const count = await countSamePayee(tx)
    if (count > 0) {
      setPending({ tx, categoryId, samePayeeCount: count })
    } else {
      await setCategory(tx, categoryId)
    }
  }

  async function applyOne() {
    if (!pending) return
    await setCategory(pending.tx, pending.categoryId)
    setPending(null)
  }

  async function applyAll() {
    if (!pending) return
    await setCategoryAllByPayee(pending.tx, pending.categoryId)
    setPending(null)
  }

  if (!transactions || !categories) {
    return <p className="text-muted-foreground text-sm">Carregando...</p>
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Transações</h2>
        <p className="text-muted-foreground text-sm">Nenhuma transação. Importe um arquivo OFX para começar.</p>
      </div>
    )
  }

  const isIncome = pending ? pending.tx.amount > 0 : false
  const partyLabel = isIncome ? 'remetente' : 'destinatário'
  const categoryName = pending
    ? (categories.find(c => c.id === pending.categoryId)?.name ?? '')
    : ''

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Transações</h2>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Data</th>
              <th className="text-left px-4 py-2 font-medium">Descrição</th>
              <th className="text-right px-4 py-2 font-medium">Valor</th>
              <th className="text-left px-4 py-2 font-medium">Categoria</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(transactions as Transaction[]).map(tx => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                categories={categories}
                onCategoryChange={(catId: number) => handleCategoryChange(tx, catId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={pending !== null} onOpenChange={open => { if (!open) setPending(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar categoria</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Existem <strong>{pending?.samePayeeCount}</strong> outra(s) transação(ões) do mesmo{' '}
            {partyLabel} <strong>&quot;{pending?.tx.payee}&quot;</strong>.
            Deseja aplicar a categoria <strong>&quot;{categoryName}&quot;</strong> a todas elas também?
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={applyOne}>
              Apenas esta transação
            </Button>
            <Button onClick={applyAll}>
              Todas as {(pending?.samePayeeCount ?? 0) + 1} transações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TransactionRow({
  tx,
  categories,
  onCategoryChange,
}: {
  tx: Transaction
  categories: ReturnType<typeof useTransactions>['categories']
  onCategoryChange: (id: number) => void
}) {
  const isIncome = tx.amount > 0
  const categoryColor = tx.categoryId
    ? (categories ?? []).find(c => c.id === tx.categoryId)?.color
    : undefined

  return (
    <tr className="hover:bg-muted/30 transition-colors" style={{ borderLeft: `3px solid ${categoryColor ?? 'transparent'}` }}>
      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
        {format(tx.date, 'dd/MM/yyyy', { locale: ptBR })}
      </td>
      <td className="px-4 py-2">
        <div className="font-medium truncate max-w-xs">{tx.payee}</div>
        {tx.transactionSubtype !== 'other' && (
          <Badge variant="secondary" className="text-xs mt-0.5">
            {subtypeLabel(tx.transactionSubtype)}
          </Badge>
        )}
      </td>
      <td className={cn('px-4 py-2 text-right font-mono whitespace-nowrap', isIncome ? 'text-green-600' : '')}>
        {isIncome ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
      </td>
      <td className="px-4 py-2">
        <CategoryPicker
          value={tx.categoryId}
          categories={categories ?? []}
          onChange={onCategoryChange}
        />
      </td>
    </tr>
  )
}

function subtypeLabel(s: Transaction['transactionSubtype']): string {
  const map: Record<typeof s, string> = {
    pix_out: 'Pix enviado', pix_in: 'Pix recebido', debit_card: 'Débito', other: '',
  }
  return map[s]
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount)
}
