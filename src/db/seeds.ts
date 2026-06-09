import { db } from './db'
import { getSharedRealmId } from './sharedRealm'
import type { Category, CategoryRule } from './schema'

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Alimentação', type: 'expense', color: '#ef4444', icon: 'utensils' },
  { name: 'Transporte', type: 'expense', color: '#3b82f6', icon: 'car' },
  { name: 'Moradia', type: 'expense', color: '#8b5cf6', icon: 'home' },
  { name: 'Saúde', type: 'expense', color: '#ec4899', icon: 'heart-pulse' },
  { name: 'Educação', type: 'expense', color: '#06b6d4', icon: 'graduation-cap' },
  { name: 'Lazer', type: 'expense', color: '#eab308', icon: 'gamepad-2' },
  { name: 'Serviços/Assinaturas', type: 'expense', color: '#f97316', icon: 'receipt' },
  { name: 'Viagem', type: 'expense', color: '#0d9488', icon: 'plane' },
  { name: 'Outros', type: 'expense', color: '#6b7280', icon: 'circle-dot' },
  { name: 'Renda', type: 'income', color: '#22c55e', icon: 'trending-up' },
  { name: 'Poupança/Investimentos', type: 'transfer', color: '#84cc16', icon: 'piggy-bank' },
]

async function insertDefaultCategories(realmId?: string) {
  const withIds: Category[] = DEFAULT_CATEGORIES.map(c => ({ ...c, id: crypto.randomUUID(), realmId }))
  await db.categories.bulkAdd(withIds)
  const transporteId = withIds[1].id!
  const seedRules: CategoryRule[] = [
    { id: crypto.randomUUID(), cnpjPrefix: '14796606', namePattern: null, matchField: 'cnpj', categoryId: transporteId, priority: 10, realmId },
    { id: crypto.randomUUID(), cnpjPrefix: '30306294', namePattern: null, matchField: 'cnpj', categoryId: transporteId, priority: 10, realmId },
    { id: crypto.randomUUID(), cnpjPrefix: null, namePattern: 'bus servicos', matchField: 'name', categoryId: withIds[7].id!, priority: 5, realmId },
  ]
  await db.categoryRules.bulkAdd(seedRules)
}

export async function seedDatabase() {
  const categoryCount = await db.categories.count()
  if (categoryCount > 0) return
  await insertDefaultCategories()
  await db.userProfile.put({ id: 1, monthlyIncome: 0, savingsGoalPct: 20, riskProfile: 'moderado' })
}

export async function reseedCategories() {
  const realmId = getSharedRealmId(db.cloud.currentUser.value?.userId ?? '') || undefined

  await db.transaction('rw', [db.categories, db.categoryRules, db.transactions], async () => {
    // bulkDelete generates per-record delete mutations that Dexie Cloud syncs correctly.
    // clear() only removes local records and doesn't reliably delete shared-realm records on the server.
    const catIds = (await db.categories.toCollection().primaryKeys()) as string[]
    const ruleIds = (await db.categoryRules.toCollection().primaryKeys()) as string[]
    await db.categories.bulkDelete(catIds)
    await db.categoryRules.bulkDelete(ruleIds)
    await db.transactions.toCollection().modify({ categoryId: null })
    await insertDefaultCategories(realmId)
  })
}
