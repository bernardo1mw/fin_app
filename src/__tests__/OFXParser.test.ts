import { describe, it, expect } from 'vitest'
import { parseOFXBuffer } from '@/features/import/OFXParser'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadOFX(filename: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../', filename))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('OFXParser', () => {
  it('parses the real OFX file and extracts 6 transactions', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    expect(result.transactions).toHaveLength(6)
  })

  it('extracts account info', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    expect(result.account.bankId).toBe('077')
    expect(result.account.acctId).toBe('97271802')
    expect(result.account.currency).toBe('BRL')
  })

  it('captures ledger balance', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    expect(result.account.ledgerBalance).toBeCloseTo(31063.11, 2)
  })

  it('normalizes NAME whitespace', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    const taruma = result.transactions.find(t => t.payee.toLowerCase().includes('taruma'))
    expect(taruma).toBeDefined()
    expect(taruma!.payee).toBe('Taruma Curitiba Bra')
  })

  it('extracts CNPJ prefix for Uber transactions', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    const uberTxs = result.transactions.filter(t => t.cnpjPrefix === '14796606')
    expect(uberTxs).toHaveLength(2)
  })

  it('returns null cnpjPrefix for debit card transactions', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    const taruma = result.transactions.find(t => t.payee.toLowerCase().includes('taruma'))
    expect(taruma!.cnpjPrefix).toBeNull()
  })

  it('sets correct transactionSubtype', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    const pixOut = result.transactions.filter(t => t.transactionSubtype === 'pix_out')
    expect(pixOut.length).toBeGreaterThanOrEqual(4)
    const debitCard = result.transactions.filter(t => t.transactionSubtype === 'debit_card')
    expect(debitCard).toHaveLength(1)
  })

  it('parses transaction amounts correctly', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    const income = result.transactions.find(t => t.amount > 0)
    expect(income).toBeDefined()
    expect(income!.amount).toBeCloseTo(30000, 0)
  })

  it('uses FITID as unique identifier', () => {
    const buffer = loadOFX('Extrato-04-06-2026-a-07-06-2026-OFX.ofx')
    const result = parseOFXBuffer(buffer)
    const fitIds = result.transactions.map(t => t.fitId)
    const unique = new Set(fitIds)
    expect(unique.size).toBe(fitIds.length)
  })
})
