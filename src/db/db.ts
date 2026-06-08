import Dexie, { type EntityTable } from 'dexie'
import dexieCloud from 'dexie-cloud-addon'
import type { Transaction, Category, CategoryRule, Account, UserProfile } from './schema'

const CLOUD_URL = import.meta.env.VITE_DEXIE_CLOUD_URL as string | undefined

class FinanceDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  categoryRules!: EntityTable<CategoryRule, 'id'>
  accounts!: EntityTable<Account, 'id'>
  userProfile!: EntityTable<UserProfile, 'id'>

  constructor() {
    super('FinanceDB', { addons: CLOUD_URL ? [dexieCloud] : [] })
    this.version(1).stores({
      transactions: '++id, [accountId+fitId], date, amount, payee, categoryId, accountId, cnpjPrefix, transactionSubtype',
      categories: '++id, name, type',
      categoryRules: '++id, cnpjPrefix, namePattern, categoryId, priority',
      accounts: '++id, bankId, acctId',
      userProfile: 'id',
    })
    if (CLOUD_URL) {
      this.cloud.configure({
        databaseUrl: CLOUD_URL,
        requireAuth: false,
        customLoginGui: true,
      })
    }
  }
}

export const db = new FinanceDB()
export const cloudEnabled = !!CLOUD_URL
