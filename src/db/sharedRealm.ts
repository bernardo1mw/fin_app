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
 * Ensures a specific category is visible to all shared-realm members.
 * Only moves categories that belong to the current user's private realm.
 * Never touches rlm-public or other users' categories (permission issues).
 */
export async function ensureCategoryInSharedRealm(categoryId: string): Promise<void> {
  const userId = db.cloud.currentUser.value?.userId
  if (!userId) return

  const sharedRealmId = await resolveActiveRealmId(userId)
  if (!sharedRealmId) return

  const cat = await db.categories.get(categoryId)
  if (!cat) return

  // Already in shared realm — nothing to do
  if (cat.realmId === sharedRealmId) return

  // In rlm-public or another user's realm — no permission to move
  if (cat.realmId && cat.realmId !== userId) return

  await db.categories.update(categoryId, { realmId: sharedRealmId })
}

/**
 * Moves all categories that live in the current user's private realm into the
 * shared realm so the other user can see them. Only touches categories with
 * realmId = undefined/null (Dexie assigns those to the user's private realm)
 * or realmId === userId. Never touches rlm-public or other users' realms.
 */
export async function migratePrivateCategories(sharedRealmId: string): Promise<void> {
  const userId = db.cloud.currentUser.value?.userId ?? ''
  if (!userId) return

  const all = await db.categories.toArray()
  const toMigrate = all.filter(c =>
    c.realmId !== sharedRealmId &&          // not already in shared realm
    (c.realmId == null || c.realmId === userId) // only user's own private realm
  )
  if (toMigrate.length === 0) return

  await Promise.all(toMigrate.map(c => db.categories.update(c.id!, { realmId: sharedRealmId })))
  triggerSync()
}

/**
 * Merges duplicate-named categories so every device resolves to the same ID.
 * Only processes groups with more than one category (actual duplicates).
 * Does NOT change realmId on categories — only updates transaction and rule
 * references to point at the canonical record.
 *
 * Canonical selection: shared-realm categories preferred; ties broken by
 * smallest ID so all devices always pick the same winner.
 *
 * Safe to run multiple times (idempotent).
 */
export async function consolidateCategories(sharedRealmId?: string): Promise<void> {
  const userId = db.cloud.currentUser.value?.userId ?? ''
  const resolvedRealmId = sharedRealmId ?? await resolveActiveRealmId(userId)
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
    if (group.length <= 1) continue  // no duplicates — nothing to do

    // Canonical: prefer categories already in the shared realm, then smallest ID
    const canonical = group.reduce((best, c) => {
      const cShared = c.realmId === resolvedRealmId
      const bestShared = best.realmId === resolvedRealmId
      if (cShared && !bestShared) return c
      if (!cShared && bestShared) return best
      return (c.id ?? '') < (best.id ?? '') ? c : best
    })

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
