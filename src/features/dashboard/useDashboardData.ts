import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { startOfMonth, endOfMonth, subMonths, format, startOfDay, endOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getApprovedMatchedTxIds } from '@/features/matches/useMatches'

export type DashboardFilter =
  | { type: 'month'; date: Date }
  | { type: 'range'; from: Date; to: Date }
  | { type: 'all' }

function matchesOwner(owner: string | null | undefined, filter: string | '__none__' | undefined): boolean {
  if (!filter) return true
  if (filter === '__none__') return !owner
  return owner === filter
}

function filterBounds(f: DashboardFilter): { from: Date; to: Date } | null {
  if (f.type === 'all') return null
  if (f.type === 'month') return { from: startOfMonth(f.date), to: endOfMonth(f.date) }
  return { from: startOfDay(f.from), to: endOfDay(f.to) }
}

function filterDep(f: DashboardFilter): string {
  if (f.type === 'all') return 'all'
  if (f.type === 'month') return `m:${f.date.getTime()}`
  return `r:${f.from.getTime()}-${f.to.getTime()}`
}

export function useDashboardData(filter: DashboardFilter, ownerFilter?: string | '__none__') {
  const dep = filterDep(filter)

  const spendingByCategory = useLiveQuery(async () => {
    const excluded = await getApprovedMatchedTxIds()
    const bounds = filterBounds(filter)
    const allTxs = bounds
      ? await db.transactions.where('date').between(bounds.from, bounds.to).toArray()
      : await db.transactions.toArray()
    const txs = allTxs.filter(t => !excluded.has(t.id!) && matchesOwner(t.owner, ownerFilter))
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
  }, [dep, ownerFilter])

  const monthlyCashFlow = useLiveQuery(async () => {
    const excluded = await getApprovedMatchedTxIds()
    let months: Date[]

    if (filter.type === 'month') {
      months = Array.from({ length: 12 }, (_, i) => subMonths(filter.date, 11 - i))
    } else if (filter.type === 'range') {
      const keys = new Set<string>()
      const cur = new Date(startOfMonth(filter.from))
      while (cur <= filter.to) {
        keys.add(format(cur, 'yyyy-MM'))
        cur.setMonth(cur.getMonth() + 1)
      }
      months = Array.from(keys).sort().map(k => new Date(k + '-01'))
    } else {
      const allTxs = await db.transactions.orderBy('date').toArray()
      if (!allTxs.length) return []
      const keys = new Set(allTxs.map(t => format(t.date instanceof Date ? t.date : new Date(t.date as string), 'yyyy-MM')))
      months = Array.from(keys).sort().map(k => new Date(k + '-01'))
    }

    return Promise.all(months.map(async (month) => {
      const start = startOfMonth(month)
      const end = endOfMonth(month)
      const all = await db.transactions.where('date').between(start, end).toArray()
      const txs = all.filter(t => !excluded.has(t.id!) && matchesOwner(t.owner, ownerFilter))
      const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      return { month: format(month, 'MMM/yy', { locale: ptBR }), income, expenses }
    }))
  }, [dep, ownerFilter])

  const netWorthPoints = useLiveQuery(async () => {
    const excluded = await getApprovedMatchedTxIds()
    const allTxs = (await db.transactions.orderBy('date').toArray()).filter(t => !excluded.has(t.id!) && matchesOwner(t.owner, ownerFilter))
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
    const excluded = await getApprovedMatchedTxIds()
    const bounds = filterBounds(filter)
    const allTxs = bounds
      ? await db.transactions.where('date').between(bounds.from, bounds.to).toArray()
      : await db.transactions.toArray()
    const txs = allTxs.filter(t => !excluded.has(t.id!) && matchesOwner(t.owner, ownerFilter))
    const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    const uncategorized = txs.filter(t => t.categoryId === null).length
    return { income, expenses, balance: income - expenses, uncategorized }
  }, [dep, ownerFilter])

  // All-time per-category monthly average — always unfiltered so the baseline is historically stable
  const categoryMonthlyAvg = useLiveQuery(async () => {
    const excluded = await getApprovedMatchedTxIds()
    const allTxs = (await db.transactions.toArray()).filter(t => !excluded.has(t.id!) && matchesOwner(t.owner, ownerFilter))
    const categories = await db.categories.toArray()
    const catMap = Object.fromEntries(categories.map(c => [c.id!, c]))

    const expenseCatIds = new Set(categories.filter(c => c.type === 'expense').map(c => c.id!))

    const monthly: Record<string, Record<string, number>> = {}
    for (const tx of allTxs) {
      if (tx.amount >= 0 || !tx.categoryId) continue
      const catId = tx.categoryId
      if (!expenseCatIds.has(catId)) continue
      const mKey = format(tx.date instanceof Date ? tx.date : new Date(tx.date as string), 'yyyy-MM')
      if (!monthly[mKey]) monthly[mKey] = {}
      monthly[mKey][catId] = (monthly[mKey][catId] ?? 0) + Math.abs(tx.amount)
    }

    const catTotals: Record<string, { sum: number; count: number; name: string; color: string }> = {}
    for (const byCat of Object.values(monthly)) {
      for (const [catId, amt] of Object.entries(byCat)) {
        if (!catTotals[catId]) {
          const cat = catMap[catId]
          catTotals[catId] = { sum: 0, count: 0, name: cat.name, color: cat.color }
        }
        catTotals[catId].sum += amt
        catTotals[catId].count++
      }
    }

    return Object.entries(catTotals)
      .map(([, { name, color, sum, count }]) => ({
        name,
        color,
        avgMonthly: Math.round(sum / count),
      }))
      .sort((a, b) => b.avgMonthly - a.avgMonthly)
  }, [ownerFilter])

  return { spendingByCategory, monthlyCashFlow, netWorthPoints, summary, categoryMonthlyAvg }
}
