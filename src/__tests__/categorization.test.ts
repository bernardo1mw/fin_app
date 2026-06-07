import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db/db'
import { applyRules, upsertRuleForTransaction } from '@/features/categories/useCategorization'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.categories.add({ name: 'Transporte', type: 'expense', color: '#3b82f6', icon: 'car' })
  await db.categories.add({ name: 'Alimentação', type: 'expense', color: '#f97316', icon: 'utensils' })
})

describe('applyRules', () => {
  it('matches by CNPJ prefix (priority 1)', async () => {
    const cat = await db.categories.where('name').equals('Transporte').first()
    await db.categoryRules.add({ cnpjPrefix: '14796606', namePattern: null, matchField: 'cnpj', categoryId: cat!.id!, priority: 10 })

    const result = await applyRules({ cnpjPrefix: '14796606', payee: 'Uber Do Brasil', memo: 'Pix enviado: ...' })
    expect(result).toBe(cat!.id)
  })

  it('falls back to name match when no CNPJ rule matches', async () => {
    const cat = await db.categories.where('name').equals('Alimentação').first()
    await db.categoryRules.add({ cnpjPrefix: null, namePattern: 'taruma', matchField: 'name', categoryId: cat!.id!, priority: 5 })

    const result = await applyRules({ cnpjPrefix: null, payee: 'Taruma Curitiba Bra', memo: 'Compra no debito' })
    expect(result).toBe(cat!.id)
  })

  it('returns null when no rules match', async () => {
    const result = await applyRules({ cnpjPrefix: '99999999', payee: 'Empresa Desconhecida', memo: '' })
    expect(result).toBeNull()
  })

  it('CNPJ rule takes priority over name rule for same transaction', async () => {
    const transport = await db.categories.where('name').equals('Transporte').first()
    const food = await db.categories.where('name').equals('Alimentação').first()
    await db.categoryRules.add({ cnpjPrefix: '14796606', namePattern: null, matchField: 'cnpj', categoryId: transport!.id!, priority: 10 })
    await db.categoryRules.add({ cnpjPrefix: null, namePattern: 'uber', matchField: 'name', categoryId: food!.id!, priority: 5 })

    const result = await applyRules({ cnpjPrefix: '14796606', payee: 'Uber Do Brasil', memo: 'Pix enviado' })
    expect(result).toBe(transport!.id)
  })
})

describe('upsertRuleForTransaction', () => {
  it('creates a CNPJ rule when cnpjPrefix is present', async () => {
    const cat = await db.categories.where('name').equals('Transporte').first()
    await upsertRuleForTransaction({ cnpjPrefix: '12345678', payee: 'Some Company' }, cat!.id!)

    const rule = await db.categoryRules.where('cnpjPrefix').equals('12345678').first()
    expect(rule).toBeDefined()
    expect(rule!.categoryId).toBe(cat!.id)
    expect(rule!.matchField).toBe('cnpj')
  })

  it('updates existing CNPJ rule without creating duplicate', async () => {
    const transport = await db.categories.where('name').equals('Transporte').first()
    const food = await db.categories.where('name').equals('Alimentação').first()

    await upsertRuleForTransaction({ cnpjPrefix: '12345678', payee: 'Some Company' }, transport!.id!)
    await upsertRuleForTransaction({ cnpjPrefix: '12345678', payee: 'Some Company' }, food!.id!)

    const rules = await db.categoryRules.where('cnpjPrefix').equals('12345678').toArray()
    expect(rules).toHaveLength(1)
    expect(rules[0].categoryId).toBe(food!.id)
  })

  it('creates a name rule when cnpjPrefix is null', async () => {
    const cat = await db.categories.where('name').equals('Alimentação').first()
    await upsertRuleForTransaction({ cnpjPrefix: null, payee: 'Taruma Curitiba Bra' }, cat!.id!)

    const rule = await db.categoryRules.filter(r => r.namePattern !== null).first()
    expect(rule).toBeDefined()
    expect(rule!.matchField).toBe('name')
    expect(rule!.categoryId).toBe(cat!.id)
  })
})
