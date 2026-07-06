import * as pdfjsLib from 'pdfjs-dist'
import type { ParsedOFX } from './OFXParser'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

const MONTHS: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
}

function parsePortugueseDate(dateStr: string): Date {
  const m = dateStr.match(/(\d{2}) de (\w+)\.?\s+(\d{4})/)
  if (!m) throw new Error(`Cannot parse date: ${dateStr}`)
  const month = MONTHS[m[2].toLowerCase().slice(0, 3)]
  if (month === undefined) throw new Error(`Unknown month: ${m[2]}`)
  return new Date(parseInt(m[3]), month, parseInt(m[1]))
}

function parseBRL(str: string): number {
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

function toYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function extractText(buffer: ArrayBuffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map(item => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
    pages.push(text)
  }
  return pages.join('\n')
}

export function parseInterCCText(fullText: string): ParsedOFX {
  // Due date: "Data de Vencimento  07/04/2026"
  const dueDateMatch = fullText.match(/Data de Vencimento\s+(\d{2})\/(\d{2})\/(\d{4})/)
  const ledgerBalanceAsOf = dueDateMatch
    ? new Date(parseInt(dueDateMatch[3]), parseInt(dueDateMatch[2]) - 1, parseInt(dueDateMatch[1]))
    : null

  // Primary account from first "XXXX****XXXX" occurrence
  const acctMatch = fullText.match(/(\d{4})\*{4}(\d{4})/)
  const acctId = acctMatch ? `${acctMatch[1]}${acctMatch[2]}` : 'UNKNOWN'

  // Split on Portuguese date pattern to get transaction segments
  const DATE_RE = /(\d{2} de [a-záéíóúâêôãõç]+\.?\s+\d{4})/gi
  const segments = fullText.split(DATE_RE)
  // segments = [preamble, date1, content1, date2, content2, ...]

  const transactions: ParsedOFX['transactions'] = []
  const dayCounters: Record<string, number> = {}

  for (let i = 1; i < segments.length; i += 2) {
    const dateStr = segments[i]
    const content = segments[i + 1] ?? ''

    // Find the last "  -   [+] R$ AMOUNT" (BRL amount separator)
    const AMOUNT_RE = /\s+-\s+(\+\s*)?R\$\s*([\d.]+,\d+)/g
    let lastMatch: RegExpExecArray | null = null
    let m: RegExpExecArray | null
    while ((m = AMOUNT_RE.exec(content)) !== null) lastMatch = m
    if (!lastMatch) continue

    const isCredit = !!lastMatch[1]
    const amount = parseBRL(lastMatch[2]) * (isCredit ? 1 : -1)

    // Everything before the amount separator is the merchant + optional metadata
    const merchantSection = content.slice(0, lastMatch.index).trim()

    // Strip foreign currency exchange rate info
    const clean = merchantSection.replace(/\s*Valor e símbolo da moeda.*$/si, '').trim()

    // Extract installment suffix
    const installmentMatch = clean.match(/\(Parcela (\d+) de (\d+)\)/)
    const installmentSuffix = installmentMatch
      ? ` (Parcela ${installmentMatch[1]} de ${installmentMatch[2]})`
      : ''

    const merchant = clean.replace(/\s*\(Parcela \d+ de \d+\).*$/, '').trim()

    // Skip headers and section totals
    if (
      !merchant ||
      /^(Total\s|CARTÃO\s|Data\s+Moviment|Beneficiário)/.test(merchant) ||
      merchant.includes('Movimentação')
    ) continue

    let date: Date
    try {
      date = parsePortugueseDate(dateStr)
    } catch {
      continue
    }

    const dayKey = toYYYYMMDD(date)
    dayCounters[dayKey] = (dayCounters[dayKey] ?? 0) + 1
    const fitId = `${dayKey}${String(dayCounters[dayKey]).padStart(4, '0')}`

    transactions.push({
      fitId,
      date,
      amount,
      payee: merchant,
      memo: `${merchant}${installmentSuffix}`,
      transactionSubtype: 'other',
      cnpjPrefix: null,
      trnType: isCredit ? 'CREDIT' : 'DEBIT',
      currency: 'BRL',
    })
  }

  return {
    importType: 'credit',
    account: {
      bankId: '077',
      bankName: 'Banco Inter',
      branchId: '',
      acctId,
      currency: 'BRL',
      acctType: 'CREDIT',
      ledgerBalance: null,
      ledgerBalanceAsOf,
    },
    transactions,
  }
}

export async function parseInterCCPDF(buffer: ArrayBuffer): Promise<ParsedOFX> {
  const fullText = await extractText(buffer)
  return parseInterCCText(fullText)
}
