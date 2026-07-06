import { useState } from 'react'
import { db, triggerSync } from '@/db/db'
import { requireRealmId, resolveCanonicalCategoryId } from '@/db/sharedRealm'
import { parseOFXBuffer } from './OFXParser'
import { parseInterCCPDF } from './InterCCPDFParser'
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
  importType: 'checking' | 'credit'
  statementBalance: number | null
  statementBalanceAsOf: Date | null
  paymentCandidates: Array<Transaction & { id: string }>
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
      const parsed = file.name.toLowerCase().endsWith('.pdf')
        ? await parseInterCCPDF(buffer)
        : parseOFXBuffer(buffer)
      const realmId = await requireRealmId()

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
          const rawCategoryId = await applyRules(tx)
          const categoryId = rawCategoryId ? await resolveCanonicalCategoryId(rawCategoryId) : null
          newRows.push({ ...tx, categoryId, importId: null })
        }
      }

      let paymentCandidates: Array<Transaction & { id: string }> = []
      if (parsed.importType === 'credit' && parsed.account.ledgerBalance !== null && parsed.account.ledgerBalanceAsOf) {
        const asOf = parsed.account.ledgerBalanceAsOf
        const windowStart = new Date(asOf.getTime() - 14 * 24 * 60 * 60 * 1000)
        const windowEnd = new Date(asOf.getTime() + 45 * 24 * 60 * 60 * 1000)
        const checkingAccts = await db.accounts.filter(a => a.acctType !== 'CREDIT').toArray()
        const checkingIds = checkingAccts.map(a => a.id!).filter(Boolean)
        if (checkingIds.length > 0) {
          const balance = parsed.account.ledgerBalance
          paymentCandidates = (await db.transactions
            .where('accountId').anyOf(checkingIds)
            .filter(tx => tx.date >= windowStart && tx.date <= windowEnd && Math.abs((tx.amount ?? 0) - balance) < 0.02)
            .toArray()) as Array<Transaction & { id: string }>
        }
      }

      const p: ParsedPreview = {
        filename: file.name,
        accountId,
        realmId,
        newRows,
        duplicateRows,
        importType: parsed.importType,
        statementBalance: parsed.account.ledgerBalance,
        statementBalanceAsOf: parsed.account.ledgerBalanceAsOf,
        paymentCandidates,
      }
      setPreview(p)
      return p
    } catch (e) {
      const parseError = e instanceof Error ? e.message : String(e)
      const p: ParsedPreview = {
        filename: '',
        accountId: '',
        realmId: undefined,
        newRows: [],
        duplicateRows: [],
        parseError,
        importType: 'checking',
        statementBalance: null,
        statementBalanceAsOf: null,
        paymentCandidates: [],
      }
      setPreview(p)
      return p
    } finally {
      setLoading(false)
    }
  }

  async function confirmImport(p: ParsedPreview, selectedFitIds: Set<string>, owner?: string | null, linkedCheckingTxId?: string | null): Promise<ImportResult> {
    setLoading(true)
    const importBatchId = crypto.randomUUID()
    const res: ImportResult = { imported: 0, skipped: 0, categorized: 0, importBatchId, errors: [] }
    try {
      const selected = p.newRows.filter(r => selectedFitIds.has(r.fitId))
      const valid = selected.filter(isValidRow)
      res.skipped = selected.length - valid.length

      if (valid.length > 0) {
        await db.transactions.bulkAdd(
          valid.map(row => ({
            ...row,
            id: crypto.randomUUID(),
            accountId: p.accountId,
            realmId: p.realmId,
            importId: importBatchId,
            owner: owner?.trim() || null,
          }))
        )
      }

      res.imported = valid.length
      res.categorized = valid.filter(r => r.categoryId !== null).length

      // Batch record is best-effort — don't let it block the import
      try {
        await db.importBatches.add({
          id: importBatchId,
          realmId: p.realmId,
          filename: p.filename,
          importedAt: new Date(),
          transactionCount: valid.length,
          owner: owner?.trim() || null,
          importType: p.importType,
          linkedCheckingTxId: linkedCheckingTxId ?? null,
        })
      } catch {
        // importBatches unavailable (e.g. schema migration pending) — import still succeeded
      }

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

  async function setImportType(type: 'checking' | 'credit'): Promise<void> {
    if (!preview || preview.importType === type) return
    setPreview({ ...preview, importType: type, paymentCandidates: [] })
    if (type !== 'credit' || preview.statementBalance === null || !preview.statementBalanceAsOf) return
    const asOf = preview.statementBalanceAsOf
    const windowStart = new Date(asOf.getTime() - 14 * 24 * 60 * 60 * 1000)
    const windowEnd = new Date(asOf.getTime() + 45 * 24 * 60 * 60 * 1000)
    const checkingAccts = await db.accounts.filter(a => a.acctType !== 'CREDIT').toArray()
    const checkingIds = checkingAccts.map(a => a.id!).filter(Boolean)
    if (!checkingIds.length) return
    const balance = preview.statementBalance
    const candidates = (await db.transactions
      .where('accountId').anyOf(checkingIds)
      .filter(tx => tx.date >= windowStart && tx.date <= windowEnd && Math.abs((tx.amount ?? 0) - balance) < 0.02)
      .toArray()) as Array<Transaction & { id: string }>
    setPreview(p => p && p.importType === 'credit' ? { ...p, paymentCandidates: candidates } : p)
  }

  async function undoImport(importBatchId: string): Promise<void> {
    const ids = await db.transactions
      .where('importId').equals(importBatchId)
      .primaryKeys() as string[]
    await db.transactions.bulkDelete(ids)
    await db.importBatches.delete(importBatchId)
    triggerSync()
  }

  return { parseFile, confirmImport, undoImport, setImportType, loading, preview, result }
}
