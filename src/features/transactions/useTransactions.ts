import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { upsertRuleForTransaction } from '@/features/categories/useCategorization'
import type { Transaction } from '@/db/schema'

export interface TransactionFilter {
  categoryId?: string
  accountId?: string
  dateFrom?: Date
  dateTo?: Date
  payeeSearch?: string
  amountMin?: number
  amountMax?: number
}

export function useTransactions(filter?: TransactionFilter) {
  const transactions = useLiveQuery(async () => {
    const all = await db.transactions.orderBy('date').reverse().toArray()
    if (!filter) return all
    return all.filter(t => {
      if (filter.categoryId !== undefined && t.categoryId !== filter.categoryId) return false
      if (filter.accountId !== undefined && t.accountId !== filter.accountId) return false
      if (filter.dateFrom && t.date < filter.dateFrom) return false
      if (filter.dateTo && t.date > filter.dateTo) return false
      if (filter.payeeSearch && !t.payee.toLowerCase().includes(filter.payeeSearch.toLowerCase())) return false
      if (filter.amountMin !== undefined && Math.abs(t.amount) < filter.amountMin) return false
      if (filter.amountMax !== undefined && Math.abs(t.amount) > filter.amountMax) return false
      return true
    })
  }, [
    filter?.categoryId, filter?.accountId,
    filter?.dateFrom?.getTime(), filter?.dateTo?.getTime(),
    filter?.payeeSearch, filter?.amountMin, filter?.amountMax,
  ])

  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray()
    const byName = new Map<string, typeof all[number]>()
    for (const c of all) {
      const existing = byName.get(c.name)
      if (!existing || (c.id?.startsWith('cat-') && !existing.id?.startsWith('cat-'))) {
        byName.set(c.name, c)
      }
    }
    return Array.from(byName.values())
  })
  const accounts = useLiveQuery(() => db.accounts.toArray())

  async function countSamePayee(tx: Transaction): Promise<number> {
    return db.transactions.filter(t => t.payee === tx.payee && t.id !== tx.id).count()
  }

  async function setCategory(tx: Transaction, categoryId: string) {
    await db.transactions.update(tx.id!, { categoryId })
    await upsertRuleForTransaction({ cnpjPrefix: tx.cnpjPrefix, payee: tx.payee }, categoryId)
  }

  async function setCategoryAllByPayee(tx: Transaction, categoryId: string) {
    const ids = await db.transactions.filter(t => t.payee === tx.payee).primaryKeys()
    await db.transactions.where(':id').anyOf(ids as string[]).modify({ categoryId })
    await upsertRuleForTransaction({ cnpjPrefix: tx.cnpjPrefix, payee: tx.payee }, categoryId)
  }

  async function setCategoryBulk(ids: string[], categoryId: string) {
    await db.transactions.where(':id').anyOf(ids).modify({ categoryId })
  }

  async function deleteTransaction(id: string) {
    await db.transactions.delete(id)
  }

  async function deleteTransactionsBulk(ids: string[]) {
    await db.transactions.bulkDelete(ids)
  }

  return { transactions, categories, accounts, setCategory, setCategoryAllByPayee, setCategoryBulk, countSamePayee, deleteTransaction, deleteTransactionsBulk }
}
