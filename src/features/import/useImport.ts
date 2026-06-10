import { useState } from 'react'
import { db, triggerSync } from '@/db/db'
import { resolveActiveRealmId } from '@/db/sharedRealm'
import { parseOFXBuffer } from './OFXParser'
import { applyRules } from '@/features/categories/useCategorization'
import type { Transaction } from '@/db/schema'

export type PreviewRow = Omit<Transaction, 'id' | 'accountId' | 'realmId'>

export interface ParsedPreview {
  filename: string
  accountId: string
  realmId: string | undefined
  newRows: PreviewRow[]
  duplicateRows: PreviewRow[]
  parseError?: string
}

export interface ImportResult {
  imported: number
  skipped: number
  categorized: number
  importBatchId: string
  errors: string[]
}

export function isValidRow(row: PreviewRow): boolean {
  if (!row.payee.trim()) return false
  if (isNaN(row.amount) || row.amount === 0) return false
  if (!(row.date instanceof Date) || isNaN(row.date.getTime())) return false
  return true
}

export function useImport() {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function parseFile(file: File): Promise<ParsedPreview | null> {
    setLoading(true)
    setPreview(null)
    setResult(null)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseOFXBuffer(buffer)
      const realmId = await resolveActiveRealmId(db.cloud.currentUser.value?.userId ?? '')

      let account = await db.accounts.filter(
        a => a.bankId === parsed.account.bankId && a.acctId === parsed.account.acctId
      ).first()

      let accountId: string
      if (account) {
        accountId = account.id!
        await db.accounts.update(accountId, {
          ledgerBalance: parsed.account.ledgerBalance,
          ledgerBalanceAsOf: parsed.account.ledgerBalanceAsOf,
        })
      } else {
        accountId = await db.accounts.add({ ...parsed.account, id: crypto.randomUUID(), realmId }) as string
      }

      const existingFitIds = new Set(
        (await db.transactions.where('accountId').equals(accountId).toArray()).map(t => t.fitId)
      )

      const newRows: PreviewRow[] = []
      const duplicateRows: PreviewRow[] = []

      for (const tx of parsed.transactions) {
        if (existingFitIds.has(tx.fitId)) {
          duplicateRows.push({ ...tx, categoryId: null, importId: null })
        } else {
          const categoryId = await applyRules(tx)
          newRows.push({ ...tx, categoryId, importId: null })
        }
      }

      const p: ParsedPreview = { filename: file.name, accountId, realmId, newRows, duplicateRows }
      setPreview(p)
      return p
    } catch (e) {
      const parseError = e instanceof Error ? e.message : String(e)
      const p: ParsedPreview = { filename: '', accountId: '', realmId: undefined, newRows: [], duplicateRows: [], parseError }
      setPreview(p)
      return p
    } finally {
      setLoading(false)
    }
  }

  async function confirmImport(p: ParsedPreview, selectedFitIds: Set<string>): Promise<ImportResult> {
    setLoading(true)
    const importBatchId = crypto.randomUUID()
    const res: ImportResult = { imported: 0, skipped: 0, categorized: 0, importBatchId, errors: [] }
    try {
      const selected = p.newRows.filter(r => selectedFitIds.has(r.fitId))
      const valid = selected.filter(isValidRow)
      res.skipped = selected.length - valid.length

      await db.importBatches.add({
        id: importBatchId,
        realmId: p.realmId,
        filename: p.filename,
        importedAt: new Date(),
        transactionCount: valid.length,
      })

      await db.transactions.bulkAdd(
        valid.map(row => ({
          ...row,
          id: crypto.randomUUID(),
          accountId: p.accountId,
          realmId: p.realmId,
          importId: importBatchId,
        }))
      )
      res.imported = valid.length
      res.categorized = valid.filter(r => r.categoryId !== null).length
      setPreview(null)
      setResult(res)
      triggerSync()
    } catch (e) {
      res.errors.push(e instanceof Error ? e.message : String(e))
      setResult(res)
    } finally {
      setLoading(false)
    }
    return res
  }

  async function undoImport(importBatchId: string): Promise<void> {
    const ids = await db.transactions
      .where('importId').equals(importBatchId)
      .primaryKeys() as string[]
    await db.transactions.bulkDelete(ids)
    await db.importBatches.delete(importBatchId)
    triggerSync()
  }

  return { parseFile, confirmImport, undoImport, loading, preview, result }
}
