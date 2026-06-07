import { db } from './db'
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

async function insertDefaultCategories() {
  const categoryIds = await db.categories.bulkAdd(DEFAULT_CATEGORIES, { allKeys: true }) as number[]
  const transporteId = categoryIds[1]
  const seedRules: Omit<CategoryRule, 'id'>[] = [
    { cnpjPrefix: '14796606', namePattern: null, matchField: 'cnpj', categoryId: transporteId, priority: 10 },
    { cnpjPrefix: '30306294', namePattern: null, matchField: 'cnpj', categoryId: transporteId, priority: 10 },
    { cnpjPrefix: null, namePattern: 'bus servicos', matchField: 'name', categoryId: categoryIds[7], priority: 5 },
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
  await db.transaction('rw', [db.categories, db.categoryRules, db.transactions], async () => {
    await db.categoryRules.clear()
    await db.transactions.toCollection().modify({ categoryId: null })
    await db.categories.clear()
    await insertDefaultCategories()
  })
}
