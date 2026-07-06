import { describe, it, expect, vi } from 'vitest'

// pdfjs-dist uses browser globals not available in the test environment;
// mock it so the module-level workerSrc assignment doesn't crash.
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' } }))

import { parseInterCCText } from '../features/import/InterCCPDFParser'

// Synthetic text mirroring the Banco Inter CC PDF format
const SAMPLE_TEXT = `
Fatura do Cartão de Crédito  5555****6020  Data de Vencimento  07/04/2026  Valor total  R$ 100,00
Despesas da fatura
CARTÃO   5555****6020
Data   Movimentação   Beneficiário   Valor
01 de mar. 2026   NETFLIX.COM   -   R$ 20,90
01 de mar. 2026   DM*Spotify   -   R$ 11,95
04 de mar. 2026   PAGAMENTO ON LINE   -   + R$ 50,00
15 de fev. 2026   SOME STORE   (Parcela 02 de 06)   -   R$ 44,83
22 de mar. 2026   CURSOR AI   Valor e símbolo da moeda de origem:   20,00   USD   Valor em dólar americano: $   20,00   Cotação do dólar americano: R$   5,50   -   R$ 110,00
Total CARTÃO   5555****6020   R$   137,85
LIMITE DE CRÉDITO   R$   5.000,00
`.trim()

describe('parseInterCCText', () => {
  it('extracts account ID from masked card number', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    expect(result.account.acctId).toBe('55556020')
  })

  it('extracts due date as ledgerBalanceAsOf', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    expect(result.account.ledgerBalanceAsOf).toEqual(new Date(2026, 3, 7))
  })

  it('sets correct bank metadata', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    expect(result.account.bankId).toBe('077')
    expect(result.account.bankName).toBe('Banco Inter')
    expect(result.account.acctType).toBe('CREDIT')
    expect(result.importType).toBe('credit')
  })

  it('parses debit transactions with correct negative amount', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    const netflix = result.transactions.find(t => t.payee === 'NETFLIX.COM')
    expect(netflix).toBeDefined()
    expect(netflix!.amount).toBe(-20.90)
    expect(netflix!.trnType).toBe('DEBIT')
  })

  it('parses credit transaction with positive amount', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    const payment = result.transactions.find(t => t.payee === 'PAGAMENTO ON LINE')
    expect(payment).toBeDefined()
    expect(payment!.amount).toBe(50.00)
    expect(payment!.trnType).toBe('CREDIT')
  })

  it('parses installment transaction and includes suffix in memo', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    const tx = result.transactions.find(t => t.payee === 'SOME STORE')
    expect(tx).toBeDefined()
    expect(tx!.amount).toBe(-44.83)
    expect(tx!.memo).toBe('SOME STORE (Parcela 02 de 06)')
  })

  it('parses foreign currency transaction using BRL amount', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    const tx = result.transactions.find(t => t.payee === 'CURSOR AI')
    expect(tx).toBeDefined()
    expect(tx!.amount).toBe(-110.00)
  })

  it('assigns unique FITID with day counter for same-day transactions', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    const same = result.transactions.filter(t => t.fitId.startsWith('20260301'))
    expect(same).toHaveLength(2)
    expect(same[0].fitId).toBe('202603010001')
    expect(same[1].fitId).toBe('202603010002')
  })

  it('skips section headers and totals', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    const hasJunk = result.transactions.some(t =>
      t.payee.startsWith('Total') || t.payee.includes('CARTÃO') || t.payee.includes('LIMITE')
    )
    expect(hasJunk).toBe(false)
  })

  it('returns correct transaction count', () => {
    const result = parseInterCCText(SAMPLE_TEXT)
    expect(result.transactions).toHaveLength(5)
  })
})
