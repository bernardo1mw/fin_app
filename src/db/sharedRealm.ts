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
 * Merges duplicate-named categories so every device resolves to the same ID,
 * and ensures all categories are in the shared realm so they sync.
 *
 * Rules:
 * - Prefer shared-realm categories as canonical; break ties by smallest ID
 *   (deterministic — all devices pick the same winner).
 * - Reassign transactions and rules that reference non-canonical IDs.
 * - Move the canonical category into the shared realm if it isn't already.
 *
 * NOTE: Does NOT clear "orphaned" categoryIds. Orphan detection is unsafe
 * during sync because the peer device may not yet have received the category
 * that a transaction references — clearing those IDs would propagate null
 * back to the originating device.
 *
 * Safe to run multiple times (idempotent).
 */
export async function consolidateCategories(sharedRealmId?: string): Promise<void> {
  const resolvedRealmId = sharedRealmId
    ?? await resolveActiveRealmId(db.cloud.currentUser.value?.userId ?? '')
  if (!resolvedRealmId) return

  const all = await db.categories.toArray()

  const byName = new Map<string, typeof all>()
  for (const c of all) {
    const name = c.name.trim().toLowerCase()
    const group = byName.get(name) ?? []
    group.push(c)
    byName.set(name, group)
  }

  let changed = false

  for (const [, group] of byName) {
    // Canonical: prefer shared realm, then smallest ID (deterministic across devices)
    const canonical = group.reduce((best, c) => {
      const cShared = !!c.realmId
      const bestShared = !!best.realmId
      if (cShared && !bestShared) return c
      if (!cShared && bestShared) return best
      return (c.id ?? '') < (best.id ?? '') ? c : best
    })

    // Ensure canonical is in the shared realm so the other user can see it
    if (canonical.realmId !== resolvedRealmId) {
      await db.categories.update(canonical.id!, { realmId: resolvedRealmId })
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

  if (changed) triggerSync()
}
