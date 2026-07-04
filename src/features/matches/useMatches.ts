import { useLiveQuery } from 'dexie-react-hooks'
import { db, triggerSync } from '@/db/db'
import { requireRealmId } from '@/db/sharedRealm'
import type { Transaction, TransactionMatch } from '@/db/schema'

export interface MatchWithTxs extends TransactionMatch {
  tx1: Transaction
  tx2: Transaction
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d as string)
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
const EPSILON = 0.005

export async function detectMatches(): Promise<number> {
  const realmId = await requireRealmId()
  const allTxs = await db.transactions.toArray()
  const existing = await db.transactionMatches.toArray()

  const activeTxIds = new Set<string>()
  const knownPairs = new Set<string>()

  for (const m of existing) {
    knownPairs.add([m.txId1, m.txId2].sort().join('|'))
    if (m.status !== 'rejected') {
      activeTxIds.add(m.txId1)
      activeTxIds.add(m.txId2)
    }
  }

  const available = allTxs.filter(t => !activeTxIds.has(t.id!))
  const positives = available.filter(t => t.amount > 0)
  const negatives = available.filter(t => t.amount < 0)

  const newMatches: TransactionMatch[] = []
  const usedInRun = new Set<string>()

  for (const pos of positives) {
    if (usedInRun.has(pos.id!)) continue
    const posDate = toDate(pos.date)
    let bestNeg: Transaction | null = null
    let bestDiff = Infinity

    for (const neg of negatives) {
      if (usedInRun.has(neg.id!)) continue
      if (Math.abs(pos.amount + neg.amount) > EPSILON) continue
      const diff = Math.abs(posDate.getTime() - toDate(neg.date).getTime())
      if (diff > TWO_WEEKS_MS) continue
      const key = [pos.id!, neg.id!].sort().join('|')
      if (knownPairs.has(key)) continue
      if (diff < bestDiff) { bestDiff = diff; bestNeg = neg }
    }

    if (bestNeg) {
      const key = [pos.id!, bestNeg.id!].sort().join('|')
      knownPairs.add(key)
      usedInRun.add(pos.id!)
      usedInRun.add(bestNeg.id!)
      newMatches.push({
        id: crypto.randomUUID(),
        realmId,
        txId1: pos.id!,
        txId2: bestNeg.id!,
        status: 'pending',
        createdAt: new Date(),
      })
    }
  }

  if (newMatches.length > 0) {
    await db.transactionMatches.bulkAdd(newMatches)
    triggerSync()
  }

  return newMatches.length
}

export function useMatches() {
  const matchesWithTxs = useLiveQuery(async () => {
    const matches = (await db.transactionMatches.toArray())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const txIds = matches.flatMap(m => [m.txId1, m.txId2])
    const txs = await db.transactions.bulkGet(txIds)
    const txMap = new Map(txs.filter(Boolean).map(t => [t!.id!, t!]))

    return matches
      .map(m => ({ ...m, tx1: txMap.get(m.txId1), tx2: txMap.get(m.txId2) }))
      .filter((m): m is MatchWithTxs => !!m.tx1 && !!m.tx2)
  })

  async function approve(id: string) {
    await db.transactionMatches.update(id, { status: 'approved' })
    triggerSync()
  }

  async function reject(id: string) {
    await db.transactionMatches.update(id, { status: 'rejected' })
    triggerSync()
  }

  async function undo(id: string) {
    await db.transactionMatches.update(id, { status: 'pending' })
    triggerSync()
  }

  async function bulkApprove(ids: string[]) {
    await db.transactionMatches.bulkUpdate(ids.map(id => ({ key: id, changes: { status: 'approved' as const } })))
    triggerSync()
  }

  async function bulkReject(ids: string[]) {
    await db.transactionMatches.bulkUpdate(ids.map(id => ({ key: id, changes: { status: 'rejected' as const } })))
    triggerSync()
  }

  async function bulkUndo(ids: string[]) {
    await db.transactionMatches.bulkUpdate(ids.map(id => ({ key: id, changes: { status: 'pending' as const } })))
    triggerSync()
  }

  const pending = matchesWithTxs?.filter(m => m.status === 'pending') ?? []
  const approved = matchesWithTxs?.filter(m => m.status === 'approved') ?? []

  return { pending, approved, approve, reject, undo, bulkApprove, bulkReject, bulkUndo, loading: matchesWithTxs === undefined }
}

export async function getApprovedMatchedTxIds(): Promise<Set<string>> {
  const approved = await db.transactionMatches.where('status').equals('approved').toArray()
  const ids = new Set<string>()
  for (const m of approved) { ids.add(m.txId1); ids.add(m.txId2) }
  const ccBatches = await db.importBatches.filter(b => !!b.linkedCheckingTxId).toArray()
  for (const b of ccBatches) { if (b.linkedCheckingTxId) ids.add(b.linkedCheckingTxId) }
  return ids
}

export async function createManualMatch(txId1: string, txId2: string): Promise<void> {
  const realmId = await requireRealmId()
  const active = await db.transactionMatches
    .filter(m => m.status !== 'rejected' &&
      (m.txId1 === txId1 || m.txId1 === txId2 || m.txId2 === txId1 || m.txId2 === txId2))
    .first()
  if (active) throw new Error('Uma das transações já faz parte de outro match.')
  await db.transactionMatches.add({
    id: crypto.randomUUID(),
    realmId,
    txId1,
    txId2,
    status: 'approved',
    createdAt: new Date(),
  })
  triggerSync()
}
