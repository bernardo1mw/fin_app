import { useLiveQuery } from 'dexie-react-hooks'
import { db, triggerSync } from '@/db/db'
import { upsertRuleForTransaction } from '@/features/categories/useCategorization'
import { resolveCanonicalCategoryId } from '@/db/sharedRealm'
import { getApprovedMatchedTxIds } from '@/features/matches/useMatches'
import type { Transaction } from '@/db/schema'

export interface TransactionFilter {
  categoryId?: string
  accountId?: string
  dateFrom?: Date
  dateTo?: Date
  payeeSearch?: string
  amountMin?: number
  amountMax?: number
  type?: 'income' | 'expense'
  owner?: string | '__none__'
}

export function useTransactions(filter?: TransactionFilter, hideMatched = false) {
  const transactions = useLiveQuery(async () => {
    const all = await db.transactions.orderBy('date').reverse().toArray()
    const excluded = hideMatched ? await getApprovedMatchedTxIds() : new Set<string>()

    return all.filter(t => {
      if (excluded.has(t.id!)) return false
      if (!filter) return true
      if (filter.categoryId !== undefined) {
        if (filter.categoryId === '__none__' ? t.categoryId !== null : t.categoryId !== filter.categoryId) return false
      }
      if (filter.accountId !== undefined && t.accountId !== filter.accountId) return false
      const txDate = t.date instanceof Date ? t.date : new Date(t.date as string)
      if (filter.dateFrom && txDate < filter.dateFrom) return false
      if (filter.dateTo && txDate > filter.dateTo) return false
      if (filter.payeeSearch && !t.payee.toLowerCase().includes(filter.payeeSearch.toLowerCase())) return false
      if (filter.amountMin !== undefined && Math.abs(t.amount) < filter.amountMin) return false
      if (filter.amountMax !== undefined && Math.abs(t.amount) > filter.amountMax) return false
      if (filter.type === 'income' && t.amount <= 0) return false
      if (filter.type === 'expense' && t.amount >= 0) return false
      if (filter.owner === '__none__' && t.owner) return false
      if (filter.owner && filter.owner !== '__none__' && t.owner !== filter.owner) return false
      return true
    })
  }, [
    hideMatched,
    filter?.categoryId, filter?.accountId,
    filter?.dateFrom?.getTime(), filter?.dateTo?.getTime(),
    filter?.payeeSearch, filter?.amountMin, filter?.amountMax, filter?.type, filter?.owner,
  ])

  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  })
  const accounts = useLiveQuery(() => db.accounts.toArray())

  async function countSamePayee(tx: Transaction): Promise<number> {
    return db.transactions.where('payee').equals(tx.payee).filter(t => t.id !== tx.id).count()
  }

  async function setCategory(tx: Transaction, categoryId: string) {
    const canonical = await resolveCanonicalCategoryId(categoryId)
    await db.transactions.update(tx.id!, { categoryId: canonical })
    await upsertRuleForTransaction({ cnpjPrefix: tx.cnpjPrefix, payee: tx.payee }, canonical)
    triggerSync()
  }

  async function setCategoryAllByPayee(tx: Transaction, categoryId: string) {
    const canonical = await resolveCanonicalCategoryId(categoryId)
    const ids = await db.transactions.where('payee').equals(tx.payee).primaryKeys() as string[]
    await Promise.all(ids.map(id => db.transactions.update(id, { categoryId: canonical })))
    await upsertRuleForTransaction({ cnpjPrefix: tx.cnpjPrefix, payee: tx.payee }, canonical)
    triggerSync()
  }

  async function setCategoryBulk(ids: string[], categoryId: string) {
    const canonical = await resolveCanonicalCategoryId(categoryId)
    await Promise.all(ids.map(id => db.transactions.update(id, { categoryId: canonical })))
    triggerSync()
  }

  async function deleteTransaction(id: string) {
    await db.transactions.delete(id)
    triggerSync()
  }

  async function deleteTransactionsBulk(ids: string[]) {
    await db.transactions.bulkDelete(ids)
    triggerSync()
  }

  async function setOwner(txId: string, owner: string | null) {
    await db.transactions.update(txId, { owner })
    triggerSync()
  }

  return { transactions, categories, accounts, setCategory, setCategoryAllByPayee, setCategoryBulk, countSamePayee, deleteTransaction, deleteTransactionsBulk, setOwner }
}
