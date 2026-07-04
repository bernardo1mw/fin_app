import { describe, it, expect } from 'vitest'
import { computeBudgetForecast } from '@/features/suggestions/ClaudeAdvisor'
import type { CategoryTrend } from '@/features/suggestions/ClaudeAdvisor'

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
