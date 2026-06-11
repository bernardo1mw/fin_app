import { db, triggerSync } from './db'
import { requireRealmId } from './sharedRealm'
import type { Category, CategoryRule } from './schema'

// Template definitions — no fixed IDs so we never collide with the server's global objects_pkey.
// Fresh UUIDs are generated at seed time; rules reference categories by _key (resolved at build time).
type CategoryTemplate = Omit<Category, 'id' | 'realmId'> & { _key: string }
type RuleTemplate = Omit<CategoryRule, 'id' | 'realmId' | 'categoryId'> & { _categoryKey: string }

const CATEGORY_TEMPLATES: CategoryTemplate[] = [
  { _key: 'food',       name: 'Alimentação',           type: 'expense',  color: '#ef4444', icon: 'utensils' },
  { _key: 'transport',  name: 'Transporte',             type: 'expense',  color: '#3b82f6', icon: 'car' },
  { _key: 'housing',    name: 'Moradia',                type: 'expense',  color: '#8b5cf6', icon: 'home' },
  { _key: 'health',     name: 'Saúde',                  type: 'expense',  color: '#ec4899', icon: 'heart-pulse' },
  { _key: 'education',  name: 'Educação',               type: 'expense',  color: '#06b6d4', icon: 'graduation-cap' },
  { _key: 'leisure',    name: 'Lazer',                  type: 'expense',  color: '#eab308', icon: 'gamepad-2' },
  { _key: 'services',   name: 'Serviços/Assinaturas',   type: 'expense',  color: '#f97316', icon: 'receipt' },
  { _key: 'travel',     name: 'Viagem',                 type: 'expense',  color: '#0d9488', icon: 'plane' },
  { _key: 'other',      name: 'Outros',                 type: 'expense',  color: '#6b7280', icon: 'circle-dot' },
  { _key: 'income',     name: 'Renda',                  type: 'income',   color: '#22c55e', icon: 'trending-up' },
  { _key: 'savings',    name: 'Poupança/Investimentos', type: 'transfer', color: '#84cc16', icon: 'piggy-bank' },
]

const RULE_TEMPLATES: RuleTemplate[] = [
  { cnpjPrefix: '14796606', namePattern: null,           matchField: 'cnpj', _categoryKey: 'transport', priority: 10 },
  { cnpjPrefix: '30306294', namePattern: null,           matchField: 'cnpj', _categoryKey: 'transport', priority: 10 },
  { cnpjPrefix: null,       namePattern: 'bus servicos', matchField: 'name', _categoryKey: 'travel',    priority: 5 },
]

function buildSeedData(realmId: string | undefined): { categories: Category[]; rules: CategoryRule[] } {
  const idMap = new Map(CATEGORY_TEMPLATES.map(t => [t._key, crypto.randomUUID()]))

  const categories: Category[] = CATEGORY_TEMPLATES.map(({ _key, ...rest }) => ({
    ...rest,
    id: idMap.get(_key),
    realmId,
  }))

  const rules: CategoryRule[] = RULE_TEMPLATES.map(({ _categoryKey, ...rest }) => ({
    ...rest,
    id: crypto.randomUUID(),
    categoryId: idMap.get(_categoryKey)!,
    realmId,
  }))

  return { categories, rules }
}

export async function seedDatabase() {
  const categoryCount = await db.categories.count()
  if (categoryCount > 0) return
  const { categories, rules } = buildSeedData(undefined)
  await db.categories.bulkAdd(categories)
  await db.categoryRules.bulkAdd(rules)
  await db.userProfile.put({ id: 1, monthlyIncome: 0, savingsGoalPct: 20, riskProfile: 'moderado' })
}

export async function reseedCategories() {
  const realmId = await requireRealmId()

  await db.transaction('rw', [db.categories, db.categoryRules, db.transactions], async () => {
    const allCatIds = (await db.categories.toCollection().primaryKeys()) as string[]
    if (allCatIds.length) await db.categories.bulkDelete(allCatIds)

    const allRuleIds = (await db.categoryRules.toCollection().primaryKeys()) as string[]
    if (allRuleIds.length) await db.categoryRules.bulkDelete(allRuleIds)

    await db.transactions.toCollection().modify({ categoryId: null })

    const { categories, rules } = buildSeedData(realmId)
    await db.categories.bulkAdd(categories)
    await db.categoryRules.bulkAdd(rules)
  })

  triggerSync()
}
