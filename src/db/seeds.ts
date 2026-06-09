import { db } from './db'
import { getSharedRealmId } from './sharedRealm'
import type { Category, CategoryRule } from './schema'

// Fixed IDs ensure bulkPut is idempotent — pulling stale records from
// Dexie Cloud after a reseed just overwrites them, never creates duplicates.
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-00', name: 'Alimentação',            type: 'expense',  color: '#ef4444', icon: 'utensils' },
  { id: 'cat-01', name: 'Transporte',              type: 'expense',  color: '#3b82f6', icon: 'car' },
  { id: 'cat-02', name: 'Moradia',                 type: 'expense',  color: '#8b5cf6', icon: 'home' },
  { id: 'cat-03', name: 'Saúde',                   type: 'expense',  color: '#ec4899', icon: 'heart-pulse' },
  { id: 'cat-04', name: 'Educação',                type: 'expense',  color: '#06b6d4', icon: 'graduation-cap' },
  { id: 'cat-05', name: 'Lazer',                   type: 'expense',  color: '#eab308', icon: 'gamepad-2' },
  { id: 'cat-06', name: 'Serviços/Assinaturas',    type: 'expense',  color: '#f97316', icon: 'receipt' },
  { id: 'cat-07', name: 'Viagem',                  type: 'expense',  color: '#0d9488', icon: 'plane' },
  { id: 'cat-08', name: 'Outros',                  type: 'expense',  color: '#6b7280', icon: 'circle-dot' },
  { id: 'cat-09', name: 'Renda',                   type: 'income',   color: '#22c55e', icon: 'trending-up' },
  { id: 'cat-10', name: 'Poupança/Investimentos',  type: 'transfer', color: '#84cc16', icon: 'piggy-bank' },
]

const DEFAULT_CATEGORY_IDS = new Set(DEFAULT_CATEGORIES.map(c => c.id!))

const DEFAULT_RULES: Omit<CategoryRule, 'realmId'>[] = [
  { id: 'rule-00', cnpjPrefix: '14796606', namePattern: null,         matchField: 'cnpj', categoryId: 'cat-01', priority: 10 },
  { id: 'rule-01', cnpjPrefix: '30306294', namePattern: null,         matchField: 'cnpj', categoryId: 'cat-01', priority: 10 },
  { id: 'rule-02', cnpjPrefix: null,       namePattern: 'bus servicos', matchField: 'name', categoryId: 'cat-07', priority: 5 },
]

export async function seedDatabase() {
  const categoryCount = await db.categories.count()
  if (categoryCount > 0) return
  await db.categories.bulkPut(DEFAULT_CATEGORIES)
  await db.categoryRules.bulkPut(DEFAULT_RULES as CategoryRule[])
  await db.userProfile.put({ id: 1, monthlyIncome: 0, savingsGoalPct: 20, riskProfile: 'moderado' })
}

export async function reseedCategories() {
  const realmId = getSharedRealmId(db.cloud.currentUser.value?.userId ?? '') || undefined

  await db.transaction('rw', [db.categories, db.categoryRules, db.transactions], async () => {
    // Delete user-created categories (IDs not in the defaults set)
    const allCatIds = (await db.categories.toCollection().primaryKeys()) as string[]
    const extraCatIds = allCatIds.filter(id => !DEFAULT_CATEGORY_IDS.has(id))
    if (extraCatIds.length) await db.categories.bulkDelete(extraCatIds)

    // Delete all rules (rules are cheap to recreate and may reference deleted categories)
    const allRuleIds = (await db.categoryRules.toCollection().primaryKeys()) as string[]
    if (allRuleIds.length) await db.categoryRules.bulkDelete(allRuleIds)

    await db.transactions.toCollection().modify({ categoryId: null })

    // Upsert defaults — same IDs means no duplicates even if cloud pulls them back
    await db.categories.bulkPut(DEFAULT_CATEGORIES.map(c => ({ ...c, realmId })))
    await db.categoryRules.bulkPut(DEFAULT_RULES.map(r => ({ ...r, realmId })))
  })
}
