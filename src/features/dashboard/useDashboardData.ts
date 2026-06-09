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

    const map: Record<string, { name: string; value: number; color: string }> = {}
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
    const allTxs = await db.transactions.orderBy('date').toArray()
    if (!allTxs.length) return []

    const monthMap: Record<string, number> = {}
    for (const tx of allTxs) {
      const key = format(tx.date, 'yyyy-MM')
      monthMap[key] = (monthMap[key] ?? 0) + tx.amount
    }

    const months = Object.keys(monthMap).sort()
    let running = 0
    return months.map(key => {
      running += monthMap[key]
      const date = new Date(key + '-01')
      return { date, balance: running, label: format(date, 'MMM/yy', { locale: ptBR }) }
    })
  })

  const summary = useLiveQuery(async () => {
    const now = new Date()
    const start = startOfMonth(now)
    const end = endOfMonth(now)
    const txs = await db.transactions.where('date').between(start, end).toArray()
    const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    const uncategorized = txs.filter(t => t.categoryId === null && t.amount < 0).length
    return { income, expenses, balance: income - expenses, uncategorized }
  })

  return { spendingByCategory, monthlyCashFlow, netWorthPoints, summary }
}
