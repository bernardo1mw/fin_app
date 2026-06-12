import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// selectedMonth = null means "all time"
export function useDashboardData(selectedMonth: Date | null) {
  const dep = selectedMonth?.getTime() ?? null

  const spendingByCategory = useLiveQuery(async () => {
    const txs = selectedMonth
      ? await db.transactions.where('date').between(startOfMonth(selectedMonth), endOfMonth(selectedMonth)).toArray()
      : await db.transactions.toArray()
    const categories = await db.categories.toArray()
    const catMap = Object.fromEntries(categories.map(c => [c.id!, c]))

    const map: Record<string, { name: string; value: number; color: string }> = {}
    for (const tx of txs) {
      if (tx.amount >= 0) continue
      const key = tx.categoryId ?? '__none__'
      if (!map[key]) {
        if (tx.categoryId) {
          const cat = catMap[tx.categoryId]
          if (!cat) continue
          map[key] = { name: cat.name, value: 0, color: cat.color }
        } else {
          map[key] = { name: 'Sem categoria', value: 0, color: '#9e9e9e' }
        }
      }
      map[key].value += Math.abs(tx.amount)
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [dep])

  const monthlyCashFlow = useLiveQuery(async () => {
    let months: Date[]

    if (selectedMonth) {
      months = Array.from({ length: 12 }, (_, i) => subMonths(selectedMonth, 11 - i))
    } else {
      const allTxs = await db.transactions.orderBy('date').toArray()
      if (!allTxs.length) return []
      const keys = new Set(allTxs.map(t => format(t.date instanceof Date ? t.date : new Date(t.date as string), 'yyyy-MM')))
      months = Array.from(keys).sort().map(k => new Date(k + '-01'))
    }

    return Promise.all(months.map(async (month) => {
      const start = startOfMonth(month)
      const end = endOfMonth(month)
      const txs = await db.transactions.where('date').between(start, end).toArray()
      const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      return { month: format(month, 'MMM/yy', { locale: ptBR }), income, expenses }
    }))
  }, [dep])

  const netWorthPoints = useLiveQuery(async () => {
    const allTxs = await db.transactions.orderBy('date').toArray()
    if (!allTxs.length) return []

    const monthMap: Record<string, number> = {}
    for (const tx of allTxs) {
      const key = format(tx.date instanceof Date ? tx.date : new Date(tx.date as string), 'yyyy-MM')
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
    const txs = selectedMonth
      ? await db.transactions.where('date').between(startOfMonth(selectedMonth), endOfMonth(selectedMonth)).toArray()
      : await db.transactions.toArray()
    const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    const uncategorized = await db.transactions.filter(t => t.categoryId === null).count()
    return { income, expenses, balance: income - expenses, uncategorized }
  }, [dep])

  return { spendingByCategory, monthlyCashFlow, netWorthPoints, summary }
}
