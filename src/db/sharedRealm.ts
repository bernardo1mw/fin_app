import { db, triggerSync } from './db'

const key = (userId: string) => `sharedRealm_${userId}`

export function getSharedRealmId(userId: string): string | null {
  return localStorage.getItem(key(userId))
}

export function setSharedRealmId(userId: string, realmId: string): void {
  localStorage.setItem(key(userId), realmId)
}

/**
 * Returns the shared realm ID for the user. Checks localStorage first,
 * then falls back to the synced `realms` table (needed when the user
 * accepted an invite on a different device where localStorage is empty).
 * Also caches the result back to localStorage.
 */
export async function resolveActiveRealmId(userId: string): Promise<string | undefined> {
  if (!userId) return undefined

  const cached = getSharedRealmId(userId)
  if (cached) return cached

  try {
    const allRealms: Array<{ realmId?: string }> = await db.table('realms').toArray()
    const shared = allRealms.find(r => r.realmId && r.realmId !== userId)
    if (shared?.realmId) {
      setSharedRealmId(userId, shared.realmId)
      return shared.realmId
    }
  } catch {
    // realms table unavailable (cloud not enabled)
  }
  return undefined
}

/**
 * Canonical category selection — same logic used in every dedup across the app.
 * Prefer shared-realm categories; break ties by smallest ID (deterministic across devices).
 */
function pickCanonical<T extends { id?: string; realmId?: string }>(group: T[]): T {
  return group.reduce((best, c) => {
    const cShared = !!c.realmId
    const bestShared = !!best.realmId
    if (cShared && !bestShared) return c
    if (!cShared && bestShared) return best
    return (c.id ?? '') < (best.id ?? '') ? c : best
  })
}

/**
 * Merges duplicate-named categories so every device resolves to the same ID.
 * For each name collision: picks a canonical record, reassigns transactions and
 * rules that reference non-canonical IDs, and ensures the canonical is in the
 * shared realm. Also clears any orphaned categoryIds on transactions.
 * Safe to run multiple times (idempotent).
 */
export async function consolidateCategories(sharedRealmId: string): Promise<void> {
  const all = await db.categories.toArray()

  // Group by normalised name
  const byName = new Map<string, typeof all>()
  for (const c of all) {
    const key = c.name.trim().toLowerCase()
    const group = byName.get(key) ?? []
    group.push(c)
    byName.set(key, group)
  }

  let changed = false

  for (const [, group] of byName) {
    const canonical = pickCanonical(group)

    // Move canonical into the shared realm if it isn't already
    if (canonical.realmId !== sharedRealmId) {
      await db.categories.update(canonical.id!, { realmId: sharedRealmId })
      changed = true
    }

    for (const dup of group) {
      if (dup.id === canonical.id) continue

      const txIds = await db.transactions.where('categoryId').equals(dup.id!).primaryKeys() as string[]
      if (txIds.length > 0) {
        await Promise.all(txIds.map(id => db.transactions.update(id, { categoryId: canonical.id })))
        changed = true
      }

      const ruleIds = await db.categoryRules.where('categoryId').equals(dup.id!).primaryKeys() as string[]
      if (ruleIds.length > 0) {
        await Promise.all(ruleIds.map(id => db.categoryRules.update(id, { categoryId: canonical.id })))
        changed = true
      }
    }
  }

  // Fix orphaned categoryIds (category was deleted on another device)
  const validIds = new Set(all.map(c => c.id!).filter(Boolean))
  const orphaned = await db.transactions
    .filter(t => !!t.categoryId && !validIds.has(t.categoryId!))
    .primaryKeys() as string[]
  if (orphaned.length > 0) {
    await Promise.all(orphaned.map(id => db.transactions.update(id, { categoryId: null })))
    changed = true
  }

  if (changed) triggerSync()
}
