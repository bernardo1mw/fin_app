import { useState } from 'react'
import { db } from '@/db/db'
import { getSharedRealmId } from '@/db/sharedRealm'
import { parseOFXBuffer } from './OFXParser'
import { applyRules } from '@/features/categories/useCategorization'
import type { Transaction } from '@/db/schema'

// Full transaction data minus DB-assigned fields — used for preview and import
export type PreviewRow = Omit<Transaction, 'id' | 'accountId' | 'realmId'>

export interface ParsedPreview {
  accountId: string
  realmId: string | undefined
  newRows: PreviewRow[]
  duplicateRows: PreviewRow[]
  parseError?: string
}

export interface ImportResult {
  imported: number
  categorized: number
  errors: string[]
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
      const realmId = getSharedRealmId(db.cloud.currentUser.value?.userId ?? '') || undefined

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
          duplicateRows.push({ ...tx, categoryId: null })
        } else {
          const categoryId = await applyRules(tx)
          newRows.push({ ...tx, categoryId })
        }
      }

      const p: ParsedPreview = { accountId, realmId, newRows, duplicateRows }
      setPreview(p)
      return p
    } catch (e) {
      const parseError = e instanceof Error ? e.message : String(e)
      const p: ParsedPreview = { accountId: '', realmId: undefined, newRows: [], duplicateRows: [], parseError }
      setPreview(p)
      return p
    } finally {
      setLoading(false)
    }
  }

  async function confirmImport(p: ParsedPreview, selectedFitIds: Set<string>): Promise<ImportResult> {
    setLoading(true)
    const res: ImportResult = { imported: 0, categorized: 0, errors: [] }
    try {
      const rows = p.newRows.filter(r => selectedFitIds.has(r.fitId))
      await db.transactions.bulkAdd(
        rows.map(row => ({
          ...row,
          id: crypto.randomUUID(),
          accountId: p.accountId,
          realmId: p.realmId,
        }))
      )
      res.imported = rows.length
      res.categorized = rows.filter(r => r.categoryId !== null).length
      setPreview(null)
      setResult(res)
    } catch (e) {
      res.errors.push(e instanceof Error ? e.message : String(e))
      setResult(res)
    } finally {
      setLoading(false)
    }
    return res
  }

  return { parseFile, confirmImport, loading, preview, result }
}
