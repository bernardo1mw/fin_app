import Dexie, { type EntityTable } from 'dexie'
import dexieCloud from 'dexie-cloud-addon'
import type { Transaction, Category, CategoryRule, Account, UserProfile, ImportBatch, TransactionMatch } from './schema'

const CLOUD_URL = import.meta.env.VITE_DEXIE_CLOUD_URL as string | undefined

class FinanceDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  categoryRules!: EntityTable<CategoryRule, 'id'>
  accounts!: EntityTable<Account, 'id'>
  userProfile!: EntityTable<UserProfile, 'id'>
  importBatches!: EntityTable<ImportBatch, 'id'>
  transactionMatches!: EntityTable<TransactionMatch, 'id'>

  constructor() {
    super('FinanceDB2', { addons: CLOUD_URL ? [dexieCloud] : [] })
    this.version(2).stores({
      transactions: 'id, [accountId+fitId], date, amount, payee, categoryId, accountId, cnpjPrefix, transactionSubtype, realmId',
      categories: 'id, name, type, realmId',
      categoryRules: 'id, cnpjPrefix, namePattern, categoryId, priority, realmId',
      accounts: 'id, bankId, acctId, realmId',
      userProfile: 'id',
    })
    this.version(3).stores({
      transactions: 'id, [accountId+fitId], date, amount, payee, categoryId, accountId, cnpjPrefix, transactionSubtype, realmId, importId',
      categories: 'id, name, type, realmId',
      categoryRules: 'id, cnpjPrefix, namePattern, categoryId, priority, realmId',
      accounts: 'id, bankId, acctId, realmId',
      userProfile: 'id',
      importBatches: 'id, importedAt, realmId',
    })
    this.version(4).stores({
      transactions: 'id, [accountId+fitId], date, amount, payee, categoryId, accountId, cnpjPrefix, transactionSubtype, realmId, importId',
      categories: 'id, name, type, realmId',
      categoryRules: 'id, cnpjPrefix, namePattern, categoryId, priority, realmId',
      accounts: 'id, bankId, acctId, realmId',
      userProfile: 'id',
      importBatches: 'id, importedAt, realmId',
      transactionMatches: 'id, txId1, txId2, status, realmId',
    })
    if (CLOUD_URL) {
      this.cloud.configure({
        databaseUrl: CLOUD_URL,
        requireAuth: false,
        customLoginGui: true,
        unsyncedTables: ['userProfile'],
      })
    }
  }
}

export const db = new FinanceDB()
export const cloudEnabled = !!CLOUD_URL

export function triggerSync(): void {
  if (!cloudEnabled) return
  db.cloud.sync().catch(() => {})
}
