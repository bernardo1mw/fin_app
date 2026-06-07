import { db } from '@/db/db'
import { startOfMonth, subMonths, endOfMonth, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export interface AISuggestion {
  insight: string
  recommendation: string
  savingsTip: string
}

async function buildAnonymizedSummary() {
  const now = new Date()
  const months = Array.from({ length: 3 }, (_, i) => subMonths(now, 2 - i))
  const categories = await db.categories.toArray()
  const catMap = Object.fromEntries(categories.map(c => [c.id!, c.name]))

  const summary = await Promise.all(months.map(async (month) => {
    const start = startOfMonth(month)
    const end = endOfMonth(month)
    const txs = await db.transactions.where('date').between(start, end).toArray()

    const byCategory: Record<string, number> = {}
    for (const tx of txs) {
      if (!tx.categoryId || tx.amount >= 0) continue
      const catName = catMap[tx.categoryId] ?? 'Outros'
      byCategory[catName] = (byCategory[catName] ?? 0) + Math.abs(tx.amount)
    }

    const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    return {
      month: format(month, 'MMMM/yyyy', { locale: ptBR }),
      income: Math.round(income),
      expenses: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, Math.round(v)])
      ),
    }
  }))

  const profile = await db.userProfile.get(1)
  return { summary, profile: profile ? { savingsGoalPct: profile.savingsGoalPct, riskProfile: profile.riskProfile } : null }
}

export async function getAISuggestions(apiKey: string): Promise<AISuggestion[]> {
  const data = await buildAnonymizedSummary()

  const prompt = `Você é um consultor financeiro pessoal. Analise os dados financeiros abaixo e forneça 3 sugestões práticas em português.

Dados (anônimos, sem nomes ou identificadores pessoais):
${JSON.stringify(data, null, 2)}

Responda SOMENTE com JSON válido no formato:
[{"insight": "...", "recommendation": "...", "savingsTip": "..."}]

Cada item deve ter:
- insight: observação sobre o padrão financeiro
- recommendation: ação concreta para melhorar
- savingsTip: dica específica de poupança ou investimento`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error ${response.status}: ${err}`)
  }

  const result = await response.json()
  const text = result.content?.[0]?.text ?? '[]'

  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Resposta inválida da API')

  const parsed = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed)) throw new Error('Resposta da API não é uma lista')
  return parsed.filter(
    (item): item is AISuggestion =>
      typeof item === 'object' && item !== null &&
      typeof item.insight === 'string' &&
      typeof item.recommendation === 'string' &&
      typeof item.savingsTip === 'string'
  )
}
