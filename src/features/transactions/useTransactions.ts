import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { upsertRuleForTransaction } from '@/features/categories/useCategorization'
import type { Transaction } from '@/db/schema'

export function useTransactions(filter?: { categoryId?: number; accountId?: number }) {
  const transactions = useLiveQuery(async () => {
    const all = await db.transactions.orderBy('date').reverse().toArray()
    if (!filter) return all
    return all.filter(t =>
      (filter.categoryId === undefined || t.categoryId === filter.categoryId) &&
      (filter.accountId === undefined || t.accountId === filter.accountId)
    )
  }, [filter?.categoryId, filter?.accountId])

  const categories = useLiveQuery(() => db.categories.toArray())
  const accounts = useLiveQuery(() => db.accounts.toArray())

  async function countSamePayee(tx: Transaction): Promise<number> {
    return db.transactions
      .filter(t => t.payee === tx.payee && t.id !== tx.id)
      .count()
  }

  async function setCategory(tx: Transaction, categoryId: number) {
    await db.transactions.update(tx.id!, { categoryId })
    await upsertRuleForTransaction({ cnpjPrefix: tx.cnpjPrefix, payee: tx.payee }, categoryId)
  }

  async function setCategoryAllByPayee(tx: Transaction, categoryId: number) {
    const ids = await db.transactions
      .filter(t => t.payee === tx.payee)
      .primaryKeys()
    await db.transactions.where(':id').anyOf(ids as number[]).modify({ categoryId })
    await upsertRuleForTransaction({ cnpjPrefix: tx.cnpjPrefix, payee: tx.payee }, categoryId)
  }

  return { transactions, categories, accounts, setCategory, setCategoryAllByPayee, countSamePayee }
}
