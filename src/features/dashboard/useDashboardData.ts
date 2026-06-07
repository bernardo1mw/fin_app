import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function useDashboardData() {
  const spendingByCategory = useLiveQuery(async () => {
    const now = new Date()
    const start = startOfMonth(now)
    const end = endOfMonth(now)
    const txs = await db.transactions.where('date').between(start, end).toArray()
    const categories = await db.categories.toArray()
    const catMap = Object.fromEntries(categories.map(c => [c.id!, c]))

    const map: Record<number, { name: string; value: number; color: string }> = {}
    for (const tx of txs) {
      if (tx.amount >= 0 || !tx.categoryId) continue
      const cat = catMap[tx.categoryId]
      if (!cat) continue
      if (!map[tx.categoryId]) map[tx.categoryId] = { name: cat.name, value: 0, color: cat.color }
      map[tx.categoryId].value += Math.abs(tx.amount)
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  })

  const monthlyCashFlow = useLiveQuery(async () => {
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => subMonths(now, 11 - i))
    return Promise.all(months.map(async (month) => {
      const start = startOfMonth(month)
      const end = endOfMonth(month)
      const txs = await db.transactions.where('date').between(start, end).toArray()
      const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      return { month: format(month, 'MMM/yy', { locale: ptBR }), income, expenses }
    }))
  })

  const netWorthPoints = useLiveQuery(async () => {
    const accounts = await db.accounts.toArray()
    const points: { date: Date; balance: number; label: string }[] = []
    for (const acc of accounts) {
      if (acc.ledgerBalance !== null && acc.ledgerBalanceAsOf !== null) {
        points.push({
          date: acc.ledgerBalanceAsOf,
          balance: acc.ledgerBalance,
          label: format(acc.ledgerBalanceAsOf, 'dd/MM/yy'),
        })
      }
    }
    return points.sort((a, b) => a.date.getTime() - b.date.getTime())
  })

  const summary = useLiveQuery(async () => {
    const now = new Date()
    const start = startOfMonth(now)
    const end = endOfMonth(now)
    const txs = await db.transactions.where('date').between(start, end).toArray()
    const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    const uncategorized = txs.filter(t => t.categoryId === null).length
    return { income, expenses, balance: income - expenses, uncategorized }
  })

  return { spendingByCategory, monthlyCashFlow, netWorthPoints, summary }
}
