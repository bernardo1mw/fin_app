import { db } from './db'

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
