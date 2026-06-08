import { db } from '@/db/db'
import { startOfMonth, subMonths, endOfMonth } from 'date-fns'
import type { Transaction, Category } from '@/db/schema'

export interface Suggestion {
  id: string
  type: 'overspend' | 'savings' | 'recurring' | 'uncategorized'
  title: string
  description: string
  severity: 'info' | 'warning' | 'success'
}

export async function generateSuggestions(): Promise<Suggestion[]> {
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const thisMonthEnd = endOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd = endOfMonth(subMonths(now, 1))

  const [thisMonthTxs, lastMonthTxs, categories] = await Promise.all([
    db.transactions.where('date').between(thisMonthStart, thisMonthEnd).toArray(),
    db.transactions.where('date').between(lastMonthStart, lastMonthEnd).toArray(),
    db.categories.toArray(),
  ])

  const catMap = Object.fromEntries(categories.map(c => [c.id!, c])) as Record<number, Category>
  const suggestions: Suggestion[] = []

  // Uncategorized
  const uncategorized = thisMonthTxs.filter(t => t.categoryId === null && t.amount < 0).length
  if (uncategorized > 0) {
    suggestions.push({
      id: 'uncategorized',
      type: 'uncategorized',
      title: `${uncategorized} transação(ões) sem categoria`,
      description: 'Categorize suas transações para obter sugestões mais precisas.',
      severity: 'warning',
    })
  }

  // Overspend by category vs last month
  const spendByCategory = (txs: Transaction[]) => {
    const map: Record<string, number> = {}
    for (const tx of txs) {
      if (tx.amount >= 0 || !tx.categoryId) continue
      map[tx.categoryId] = (map[tx.categoryId] ?? 0) + Math.abs(tx.amount)
    }
    return map
  }

  const thisSpend = spendByCategory(thisMonthTxs)
  const lastSpend = spendByCategory(lastMonthTxs)

  for (const [catIdStr, amount] of Object.entries(thisSpend)) {
    const catId = parseInt(catIdStr)
    const last = lastSpend[catId] ?? 0
    if (last > 0 && amount > last * 1.3) {
      const cat = catMap[catId]
      if (!cat) continue
      const diff = ((amount - last) / last * 100).toFixed(0)
      suggestions.push({
        id: `overspend-${catId}`,
        type: 'overspend',
        title: `Gasto com ${cat.name} aumentou ${diff}%`,
        description: `Você gastou ${formatCurrency(amount)} este mês contra ${formatCurrency(last)} no mês anterior.`,
        severity: 'warning',
      })
    }
  }

  // Savings check
  const income = thisMonthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = thisMonthTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  if (income > 0) {
    const savingsPct = ((income - expenses) / income) * 100
    if (savingsPct < 10) {
      suggestions.push({
        id: 'low-savings',
        type: 'savings',
        title: 'Taxa de poupança baixa este mês',
        description: `Você poupou apenas ${savingsPct.toFixed(1)}% da sua renda. Tente reduzir despesas variáveis.`,
        severity: savingsPct < 0 ? 'warning' : 'info',
      })
    } else if (savingsPct >= 20) {
      suggestions.push({
        id: 'good-savings',
        type: 'savings',
        title: `Ótima poupança: ${savingsPct.toFixed(1)}% da renda!`,
        description: 'Considere investir o excedente em renda fixa ou fundo de emergência.',
        severity: 'success',
      })
    }
  }

  // Recurring Pix detection
  const pixOut = thisMonthTxs.filter(t => t.transactionSubtype === 'pix_out')
  const payeeCount: Record<string, number> = {}
  for (const tx of pixOut) {
    payeeCount[tx.payee] = (payeeCount[tx.payee] ?? 0) + 1
  }
  for (const [payee, count] of Object.entries(payeeCount)) {
    if (count >= 2) {
      suggestions.push({
        id: `recurring-${payee}`,
        type: 'recurring',
        title: `Pagamentos recorrentes para ${payee}`,
        description: `${count} Pix enviados para o mesmo destinatário este mês. Verifique se são esperados.`,
        severity: 'info',
      })
    }
  }

  return suggestions
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
