export type TransactionSubtype = 'pix_out' | 'pix_in' | 'debit_card' | 'other'
export type CategoryType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id?: number
  fitId: string
  accountId: number
  date: Date
  amount: number
  payee: string
  memo: string
  transactionSubtype: TransactionSubtype
  cnpjPrefix: string | null
  categoryId: number | null
  trnType: string
  currency: string
}

export interface Category {
  id?: number
  name: string
  type: CategoryType
  color: string
  icon: string
}

export interface CategoryRule {
  id?: number
  cnpjPrefix: string | null
  namePattern: string | null
  matchField: 'cnpj' | 'name' | 'memo'
  categoryId: number
  priority: number
}

export interface Account {
  id?: number
  bankId: string
  bankName: string
  branchId: string
  acctId: string
  currency: string
  acctType: string
  ledgerBalance: number | null
  ledgerBalanceAsOf: Date | null
}

export interface UserProfile {
  id: 1
  monthlyIncome: number
  savingsGoalPct: number
  riskProfile: 'conservador' | 'moderado' | 'arrojado'
}
