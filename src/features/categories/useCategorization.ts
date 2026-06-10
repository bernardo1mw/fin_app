import { db } from '@/db/db'
import { getSharedRealmId } from '@/db/sharedRealm'
import type { Transaction, CategoryRule } from '@/db/schema'

type PartialTransaction = Pick<Transaction, 'cnpjPrefix' | 'payee' | 'memo'>

export async function applyRules(tx: PartialTransaction): Promise<string | null> {
  const rules = await db.categoryRules.orderBy('priority').reverse().toArray()

  for (const rule of rules) {
    if (rule.matchField === 'cnpj' && rule.cnpjPrefix && tx.cnpjPrefix) {
      if (tx.cnpjPrefix === rule.cnpjPrefix) return rule.categoryId
    } else if (rule.matchField === 'name' && rule.namePattern) {
      if (tx.payee.toLowerCase().includes(rule.namePattern.toLowerCase())) return rule.categoryId
    } else if (rule.matchField === 'memo' && rule.namePattern) {
      if (tx.memo.toLowerCase().includes(rule.namePattern.toLowerCase())) return rule.categoryId
    }
  }
  return null
}

export async function upsertRuleForTransaction(tx: Pick<Transaction, 'cnpjPrefix' | 'payee'>, categoryId: string) {
  const realmId = getSharedRealmId(db.cloud.currentUser.value?.userId ?? '') || undefined

  if (tx.cnpjPrefix) {
    const existing = await db.categoryRules.where('cnpjPrefix').equals(tx.cnpjPrefix).first()
    if (existing) {
      await db.categoryRules.update(existing.id!, { categoryId })
    } else {
      const rule: Omit<CategoryRule, 'id'> = {
        cnpjPrefix: tx.cnpjPrefix,
        namePattern: null,
        matchField: 'cnpj',
        categoryId,
        priority: 10,
        realmId,
      }
      await db.categoryRules.add(rule)
    }
  } else {
    const normalizedName = tx.payee.toLowerCase()
    const existing = await db.categoryRules
      .filter(r => r.namePattern !== null && r.namePattern.toLowerCase() === normalizedName)
      .first()
    if (existing) {
      await db.categoryRules.update(existing.id!, { categoryId })
    } else {
      const rule: Omit<CategoryRule, 'id'> = {
        cnpjPrefix: null,
        namePattern: normalizedName,
        matchField: 'name',
        categoryId,
        priority: 5,
        realmId,
      }
      await db.categoryRules.add(rule)
    }
  }
}
