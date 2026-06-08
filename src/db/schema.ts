export type TransactionSubtype = 'pix_out' | 'pix_in' | 'debit_card' | 'other'
export type CategoryType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id?: string
  fitId: string
  accountId: string
  date: Date
  amount: number
  payee: string
  memo: string
  transactionSubtype: TransactionSubtype
  cnpjPrefix: string | null
  categoryId: string | null
  trnType: string
  currency: string
}

export interface Category {
  id?: string
  name: string
  type: CategoryType
  color: string
  icon: string
}

export interface CategoryRule {
  id?: string
  cnpjPrefix: string | null
  namePattern: string | null
  matchField: 'cnpj' | 'name' | 'memo'
  categoryId: string
  priority: number
}

export interface Account {
  id?: string
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
