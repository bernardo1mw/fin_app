import { useState } from 'react'
import { db } from '@/db/db'
import { parseOFXBuffer } from './OFXParser'
import { applyRules } from '@/features/categories/useCategorization'
import type { TransactionSubtype } from '@/db/schema'

export interface ImportedRow {
  fitId: string
  date: Date
  amount: number
  payee: string
  transactionSubtype: TransactionSubtype
  currency: string
  categoryId: number | null
}

export interface ImportResult {
  imported: number
  duplicates: number
  categorized: number
  errors: string[]
  importedRows: ImportedRow[]
  duplicateRows: ImportedRow[]
}

export function useImport() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function importFile(file: File): Promise<ImportResult> {
    setLoading(true)
    setResult(null)
    const res: ImportResult = {
      imported: 0, duplicates: 0, categorized: 0,
      errors: [], importedRows: [], duplicateRows: [],
    }

    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseOFXBuffer(buffer)

      let account = await db.accounts.filter(
        a => a.bankId === parsed.account.bankId && a.acctId === parsed.account.acctId
      ).first()

      let accountId: number
      if (account) {
        accountId = account.id!
        await db.accounts.update(accountId, {
          ledgerBalance: parsed.account.ledgerBalance,
          ledgerBalanceAsOf: parsed.account.ledgerBalanceAsOf,
        })
      } else {
        accountId = await db.accounts.add(parsed.account) as number
      }

      const existingFitIds = new Set(
        (await db.transactions.where('accountId').equals(accountId).toArray())
          .map(t => t.fitId)
      )

      await db.transaction('rw', [db.transactions, db.categoryRules], async () => {
        for (const tx of parsed.transactions) {
          const row: ImportedRow = {
            fitId: tx.fitId,
            date: tx.date,
            amount: tx.amount,
            payee: tx.payee,
            transactionSubtype: tx.transactionSubtype,
            currency: tx.currency,
            categoryId: null,
          }

          if (existingFitIds.has(tx.fitId)) {
            res.duplicates++
            res.duplicateRows.push(row)
            continue
          }

          const categoryId = await applyRules(tx)
          row.categoryId = categoryId
          if (categoryId !== null) res.categorized++

          await db.transactions.add({ ...tx, accountId, categoryId })
          existingFitIds.add(tx.fitId)
          res.imported++
          res.importedRows.push(row)
        }
      })
    } catch (e) {
      res.errors.push(e instanceof Error ? e.message : String(e))
    }

    setLoading(false)
    setResult(res)
    return res
  }

  return { importFile, loading, result }
}
