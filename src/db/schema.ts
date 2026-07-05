export type TransactionSubtype = 'pix_out' | 'pix_in' | 'debit_card' | 'other'
export type CategoryType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id?: string
  realmId?: string
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
  importId?: string | null
  owner?: string | null
  aiSeen?: boolean
}

export interface ImportBatch {
  id: string
  realmId?: string
  filename: string
  importedAt: Date
  transactionCount: number
  owner?: string | null
  importType?: 'checking' | 'credit'
  linkedCheckingTxId?: string | null
}

export interface Category {
  id?: string
  realmId?: string
  name: string
  type: CategoryType
  color: string
  icon: string
}

export interface CategoryRule {
  id?: string
  realmId?: string
  cnpjPrefix: string | null
  namePattern: string | null
  matchField: 'cnpj' | 'name' | 'memo'
  categoryId: string
  priority: number
}

export interface Account {
  id?: string
  realmId?: string
  bankId: string
  bankName: string
  branchId: string
  acctId: string
  currency: string
  acctType: string
  ledgerBalance: number | null
  ledgerBalanceAsOf: Date | null
}

export interface TransactionMatch {
  id: string
  realmId?: string
  txId1: string
  txId2: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Date
}

export interface UserProfile {
  id: 1
  monthlyIncome: number
  savingsGoalPct: number
  riskProfile: 'conservador' | 'moderado' | 'arrojado'
}

export interface AppSetting {
  key: string
  realmId?: string
  value: string   // JSON-serialized value
  updatedAt: number
}
