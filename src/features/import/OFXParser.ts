import type { Transaction, Account } from '@/db/schema'

export interface ParsedOFX {
  account: Omit<Account, 'id' | 'ledgerBalance' | 'ledgerBalanceAsOf'> & {
    ledgerBalance: number | null
    ledgerBalanceAsOf: Date | null
  }
  transactions: Omit<Transaction, 'id' | 'accountId' | 'categoryId'>[]
}

function parseOFXDate(raw: string): Date {
  // YYYYMMDD or YYYYMMDDHHmmss
  const s = raw.trim().replace(/\[.*\]/, '')
  const y = +s.slice(0, 4)
  const mo = +s.slice(4, 6) - 1
  const d = +s.slice(6, 8)
  return new Date(y, mo, d)
}

function extractTag(content: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\r\n]*)`, 'i')
  const m = content.match(re)
  return m ? m[1].trim() : null
}

function extractAllBlocks(content: string, tag: string): string[] {
  const blocks: string[] = []
  const openTag = `<${tag}>`
  const closeTag = `</${tag}>`
  let start = content.indexOf(openTag)
  while (start !== -1) {
    const end = content.indexOf(closeTag, start)
    if (end === -1) break
    blocks.push(content.slice(start + openTag.length, end))
    start = content.indexOf(openTag, end + closeTag.length)
  }
  return blocks
}

function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

function parseSubtype(memo: string): Transaction['transactionSubtype'] {
  const lower = memo.toLowerCase()
  if (lower.startsWith('pix enviado')) return 'pix_out'
  if (lower.startsWith('pix recebido')) return 'pix_in'
  if (lower.startsWith('compra no debito') || lower.startsWith('compra no débito')) return 'debit_card'
  return 'other'
}

function extractCnpjPrefix(memo: string): string | null {
  const m = memo.match(/Cp\s*:(\d{8})-/i)
  return m ? m[1] : null
}

export function parseOFXBuffer(buffer: ArrayBuffer): ParsedOFX {
  // Some banks (e.g. Nubank) declare CHARSET:1252 but export UTF-8.
  // Try UTF-8 first; fall back to Windows-1252 only if invalid sequences appear.
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8

  const bankMsgBlock = extractAllBlocks(text, 'BANKMSGSRSV1')[0] ?? text
  const stmtBlock = extractAllBlocks(bankMsgBlock, 'STMTRS')[0] ?? bankMsgBlock

  const currency = extractTag(stmtBlock, 'CURDEF') ?? 'BRL'

  // Account info
  const acctBlock = extractAllBlocks(stmtBlock, 'BANKACCTFROM')[0] ?? ''
  const bankId = extractTag(acctBlock, 'BANKID') ?? ''
  const branchId = extractTag(acctBlock, 'BRANCHID') ?? ''
  const acctId = extractTag(acctBlock, 'ACCTID') ?? ''
  const acctType = extractTag(acctBlock, 'ACCTTYPE') ?? 'CHECKING'

  // Bank name from SIGNONMSGSRSV1
  const signonBlock = extractAllBlocks(text, 'SIGNONMSGSRSV1')[0] ?? ''
  const fiBlock = extractAllBlocks(signonBlock, 'FI')[0] ?? ''
  const bankName = extractTag(fiBlock, 'ORG') ?? `Bank ${bankId}`

  // Ledger balance
  const balBlock = extractAllBlocks(stmtBlock, 'LEDGERBAL')[0] ?? ''
  const balAmtStr = extractTag(balBlock, 'BALAMT')
  const balDateStr = extractTag(balBlock, 'DTASOF')
  const ledgerBalance = balAmtStr ? parseFloat(balAmtStr) : null
  const ledgerBalanceAsOf = balDateStr ? parseOFXDate(balDateStr) : null

  // Transactions
  const tranListBlock = extractAllBlocks(stmtBlock, 'BANKTRANLIST')[0] ?? stmtBlock
  const trnBlocks = extractAllBlocks(tranListBlock, 'STMTTRN')

  const transactions = trnBlocks.map((block) => {
    const trnType = extractTag(block, 'TRNTYPE') ?? 'OTHER'
    const dtPosted = extractTag(block, 'DTPOSTED') ?? ''
    const trnAmt = extractTag(block, 'TRNAMT') ?? '0'
    const fitId = extractTag(block, 'FITID') ?? ''
    const memo = extractTag(block, 'MEMO') ?? ''
    const name = extractTag(block, 'NAME') ?? ''

    return {
      fitId,
      date: parseOFXDate(dtPosted),
      amount: parseFloat(trnAmt),
      payee: normalizeName(name) || normalizeName(memo),
      memo,
      transactionSubtype: parseSubtype(memo),
      cnpjPrefix: extractCnpjPrefix(memo),
      trnType,
      currency,
    } satisfies Omit<Transaction, 'id' | 'accountId' | 'categoryId'>
  })

  return {
    account: { bankId, bankName, branchId, acctId, currency, acctType, ledgerBalance, ledgerBalanceAsOf },
    transactions,
  }
}
