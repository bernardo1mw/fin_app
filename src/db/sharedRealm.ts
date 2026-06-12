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

  try {
    const allRealms: Array<{ realmId?: string }> = await db.table('realms').toArray()
    // Sort so all devices always pick the same realm when multiples exist
    const ownRealms = allRealms
      .filter(r => r.realmId && r.realmId !== userId && r.realmId !== 'rlm-public')
      .sort((a, b) => (a.realmId! < b.realmId! ? -1 : 1))
    const shared = ownRealms[0]
    if (shared?.realmId) {
      setSharedRealmId(userId, shared.realmId)
      return shared.realmId
    }
    // No shared realm found — clear stale cache so we don't write objects into a deleted realm
    localStorage.removeItem(key(userId))
  } catch {
    // realms table unavailable (cloud not enabled) — fall back to cache
    const cached = getSharedRealmId(userId)
    if (cached && cached !== 'rlm-public') return cached
  }
  return undefined
}

/**
 * Returns the best available realmId for the current user.
 * Prefers the shared realm; falls back to the user's private realm (userId)
 * so objects are never created with realmId=undefined (which Dexie Cloud
 * routes to rlm-public, where regular users lack write permission).
 */
export async function requireRealmId(): Promise<string | undefined> {
  const userId = db.cloud.currentUser.value?.userId
  if (!userId) return undefined
  return (await resolveActiveRealmId(userId)) ?? userId
}

/**
 * Given a categoryId chosen by the user, returns the canonical ID for that
 * category name — i.e. the one all devices will agree on (shared realm
 * preferred, then smallest ID). Moves a private category to the shared realm
 * if there are no shared duplicates. Ensures the canonical is in the shared
 * realm before returning.
 *
 * Use this at categorization time so transactions always store the canonical
 * ID without relying on background consolidation.
 */
function pickCanonical<T extends { id?: string; realmId?: string }>(a: T, b: T, sharedRealmId: string): T {
  const aShared = a.realmId === sharedRealmId
  const bShared = b.realmId === sharedRealmId
  if (aShared && !bShared) return a
  if (!aShared && bShared) return b
  // Prefer stable seeded IDs (cat- prefix) over UUIDs so seeded categories are never deleted
  const aSeeded = (a.id ?? '').startsWith('cat-')
  const bSeeded = (b.id ?? '').startsWith('cat-')
  if (aSeeded && !bSeeded) return a
  if (!aSeeded && bSeeded) return b
  return (a.id ?? '') < (b.id ?? '') ? a : b
}

export async function resolveCanonicalCategoryId(categoryId: string): Promise<string> {
  const userId = db.cloud.currentUser.value?.userId ?? ''
  if (!userId) return categoryId

  const sharedRealmId = await resolveActiveRealmId(userId)
  if (!sharedRealmId) return categoryId

  const cat = await db.categories.get(categoryId)
  if (!cat) return categoryId

  const dups = await db.categories
    .filter(c => c.name.trim().toLowerCase() === cat.name.trim().toLowerCase())
    .toArray()

  const canonical = dups.reduce((best, c) => pickCanonical(c, best, sharedRealmId), dups[0])

  // Ensure the canonical is in the shared realm
  if (canonical.realmId !== sharedRealmId && (canonical.realmId == null || canonical.realmId === userId)) {
    await db.categories.update(canonical.id!, { realmId: sharedRealmId })
  }

  return canonical.id!
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
    c.realmId !== sharedRealmId &&
    (c.realmId == null || c.realmId === userId || c.realmId === 'rlm-public')
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
    const canonical = group.reduce((best, c) => pickCanonical(c, best, resolvedRealmId))

    for (const dup of group) {
      if (dup.id === canonical.id) continue
      // Never delete seeded categories — their fixed IDs are the stable anchor
      if ((dup.id ?? '').startsWith('cat-')) continue

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

      // Delete the duplicate so it no longer appears in dropdowns
      await db.categories.delete(dup.id!)
      changed = true
    }
  }

  if (changed) triggerSync()
}
