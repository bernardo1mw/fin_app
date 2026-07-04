import { describe, it, expect } from 'vitest'
import { computeBudgetForecast, computeFullPeriodStats } from '@/features/suggestions/ClaudeAdvisor'
import type { CategoryTrend } from '@/features/suggestions/ClaudeAdvisor'
import type { Transaction } from '@/db/schema'

function makeTrend(overrides: Partial<CategoryTrend>): CategoryTrend {
  return {
    lastMonth: 500,
    prevMonth: 500,
    momChangePct: 0,
    avgBase: 500,
    vsBasePct: 0,
    trend: 'stable',
    ...overrides,
  }
}

describe('computeBudgetForecast', () => {
  it('projects stable category as 2-month average', () => {
    const forecast = computeBudgetForecast({ Alimentação: makeTrend({ lastMonth: 600, prevMonth: 400 }) })
    expect(forecast.items[0].predicted).toBe(500)
    expect(forecast.items[0].direction).toBe('stable')
  })

  it('projects accelerating category with MoM growth rate', () => {
    const forecast = computeBudgetForecast({
      Transporte: makeTrend({ lastMonth: 600, prevMonth: 500, momChangePct: 20, trend: 'accelerating' }),
    })
    expect(forecast.items[0].predicted).toBe(720)
    expect(forecast.items[0].direction).toBe('up')
  })

  it('caps accelerating growth at 50%', () => {
    const forecast = computeBudgetForecast({
      Lazer: makeTrend({ lastMonth: 1000, prevMonth: 500, momChangePct: 100, trend: 'accelerating' }),
    })
    expect(forecast.items[0].predicted).toBe(1500)
  })

  it('projects declining category with lower amount', () => {
    const forecast = computeBudgetForecast({
      Saúde: makeTrend({ lastMonth: 400, prevMonth: 500, momChangePct: -20, trend: 'declining' }),
    })
    expect(forecast.items[0].predicted).toBe(320)
    expect(forecast.items[0].direction).toBe('down')
  })

  it('caps decline at 50% so prediction never goes negative', () => {
    const forecast = computeBudgetForecast({
      Misc: makeTrend({ lastMonth: 100, prevMonth: 500, momChangePct: -80, trend: 'declining' }),
    })
    expect(forecast.items[0].predicted).toBeGreaterThanOrEqual(0)
    expect(forecast.items[0].predicted).toBe(50) // capped at -50%: 100 * 0.5
  })

  it('skips categories with zero last-month spending', () => {
    const forecast = computeBudgetForecast({
      Inactive: makeTrend({ lastMonth: 0, prevMonth: 500, trend: 'declining' }),
    })
    expect(forecast.items).toHaveLength(0)
  })

  it('uses lastMonth as prediction for new categories with no prior data', () => {
    const forecast = computeBudgetForecast({
      New: makeTrend({ lastMonth: 400, prevMonth: 0, trend: 'new' }),
    })
    expect(forecast.items[0].predicted).toBe(400)
    expect(forecast.items[0].direction).toBe('stable')
  })

  it('sorts items by predicted amount descending', () => {
    const forecast = computeBudgetForecast({
      Small: makeTrend({ lastMonth: 100, prevMonth: 100 }),
      Large: makeTrend({ lastMonth: 800, prevMonth: 800 }),
    })
    expect(forecast.items[0].category).toBe('Large')
    expect(forecast.items[1].category).toBe('Small')
  })

  it('sums items into totalPredicted', () => {
    const forecast = computeBudgetForecast({
      A: makeTrend({ lastMonth: 300, prevMonth: 300 }),
      B: makeTrend({ lastMonth: 200, prevMonth: 200 }),
    })
    expect(forecast.totalPredicted).toBe(500)
  })
})

function makeTx(overrides: Partial<Transaction> & { date: Date; amount: number }): Transaction {
  return {
    id: 'tx1',
    payee: 'Payee',
    memo: '',
    amount: overrides.amount,
    date: overrides.date,
    categoryId: undefined,
    transactionSubtype: 'other',
    aiSeen: false,
    ...overrides,
  } as unknown as Transaction
}

describe('computeFullPeriodStats', () => {
  it('returns zeros for empty input', () => {
    const stats = computeFullPeriodStats([], {})
    expect(stats.totalMonths).toBe(0)
    expect(stats.categoryAvgMonthly).toEqual({})
    expect(stats.overallAvgSavingsRate).toBe(0)
  })

  it('counts distinct months correctly', () => {
    const txs = [
      makeTx({ id: 't1', date: new Date('2025-01-15'), amount: -100, categoryId: '1' }),
      makeTx({ id: 't2', date: new Date('2025-02-10'), amount: -200, categoryId: '1' }),
      makeTx({ id: 't3', date: new Date('2025-02-20'), amount: -50, categoryId: '1' }),
    ]
    const stats = computeFullPeriodStats(txs, { '1': 'Alimentação' })
    expect(stats.totalMonths).toBe(2)
  })

  it('computes per-category monthly average across months where category appeared', () => {
    const txs = [
      makeTx({ id: 't1', date: new Date('2025-01-15'), amount: -300, categoryId: '1' }),
      makeTx({ id: 't2', date: new Date('2025-02-10'), amount: -500, categoryId: '1' }),
    ]
    // avg = (300 + 500) / 2 = 400
    const stats = computeFullPeriodStats(txs, { '1': 'Alimentação' })
    expect(stats.categoryAvgMonthly['Alimentação']).toBe(400)
  })

  it('computes overall average savings rate from months with income', () => {
    const txs = [
      makeTx({ id: 'i1', date: new Date('2025-01-05'), amount: 2000 }),  // income
      makeTx({ id: 'e1', date: new Date('2025-01-15'), amount: -1000 }), // expense, no category
      makeTx({ id: 'i2', date: new Date('2025-02-05'), amount: 2000 }),
      makeTx({ id: 'e2', date: new Date('2025-02-15'), amount: -500 }),
    ]
    // Jan: (2000-1000)/2000 = 50%; Feb: (2000-500)/2000 = 75%; avg = 63
    const stats = computeFullPeriodStats(txs, {})
    expect(stats.overallAvgSavingsRate).toBe(63)
  })
})
