import Dexie, { type EntityTable } from 'dexie'
import type { Transaction, Category, CategoryRule, Account, UserProfile } from './schema'

class FinanceDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  categoryRules!: EntityTable<CategoryRule, 'id'>
  accounts!: EntityTable<Account, 'id'>
  userProfile!: EntityTable<UserProfile, 'id'>

  constructor() {
    super('FinanceDB')
    this.version(1).stores({
      transactions: '++id, [accountId+fitId], date, amount, payee, categoryId, accountId, cnpjPrefix, transactionSubtype',
      categories: '++id, name, type',
      categoryRules: '++id, cnpjPrefix, namePattern, categoryId, priority',
      accounts: '++id, bankId, acctId',
      userProfile: 'id',
    })
  }
}

export const db = new FinanceDB()
