import { db } from '@/db/db'
import { startOfMonth, subMonths, endOfMonth, format, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Transaction, Category } from '@/db/schema'
import { getApprovedMatchedTxIds } from '@/features/matches/useMatches'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIHealthSummary {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  headline: string
  strength: string
  concern: string
  narrative?: string
}

export interface AIBudgetForecastItem {
  category: string
  lastMonth: number
  predicted: number
  direction: 'up' | 'down' | 'stable'
}

export interface AIBudgetForecast {
  period: string
  totalPredicted: number
  items: AIBudgetForecastItem[]
}

export interface AISuggestion {
  category: string
  trend: 'up' | 'down' | 'stable' | 'new'
  impact: 'high' | 'medium' | 'low'
  insight: string
  recommendation: string
  savingsTip: string
}

export interface AICategorization {
  txId: string
  categoryId: string
  categoryName: string
  reason: string
  payee: string
  amount: number
  confidence: 'high' | 'low'
}

export type AIProvider = 'anthropic' | 'ollama' | 'openrouter' | 'gemini'

export interface AIProviderConfig {
  provider: AIProvider
  anthropicKey?: string
  ollamaUrl?: string
  ollamaModel?: string
  openrouterKey?: string
  openrouterModel?: string
  geminiKey?: string
  geminiModel?: string
}

export const AI_CONFIG_KEY = 'ai_provider_config'

export function loadAIConfig(): AIProviderConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY)
    if (raw) return JSON.parse(raw) as AIProviderConfig
  } catch {}
  const legacyKey = localStorage.getItem('anthropic_api_key')
  if (legacyKey) return { provider: 'anthropic', anthropicKey: legacyKey }
  return { provider: 'anthropic' }
}

export function isAIConfigured(config: AIProviderConfig): boolean {
  if (config.provider === 'anthropic') return !!config.anthropicKey
  if (config.provider === 'ollama') return true
  if (config.provider === 'openrouter') return !!config.openrouterKey
  if (config.provider === 'gemini') return !!config.geminiKey
  return false
}

// ---------------------------------------------------------------------------
// Module-level stores
// ---------------------------------------------------------------------------

type AIAnalysisStore = {
  health: AIHealthSummary | null
  suggestions: AISuggestion[]
  forecast: AIBudgetForecast | null
  loading: boolean
  error: string | null
  cacheTimestamp: number | null
}

type AICatStore = {
  categorizations: AICategorization[]
  loading: boolean
  error: string | null
  totalUncategorized: number
  batchProgress: { done: number; total: number } | null
}

function makeStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  const set = (patch: Partial<T>) => {
    state = { ...state, ...patch }
    listeners.forEach(l => l())
  }
  const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }
  const snapshot = () => state
  return { set, subscribe, snapshot }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const ANALYSIS_CACHE_KEY = 'ai_analysis_cache'
const DISMISSED_CAT_KEY = 'ai_dismissed_categorizations'
const PENDING_CAT_KEY = 'ai_pending_categorizations'

interface AnalysisCache {
  health: AIHealthSummary
  suggestions: AISuggestion[]
  forecast?: AIBudgetForecast | null
  timestamp: number
}

function loadAnalysisCache(): AnalysisCache | null {
  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_KEY)
    return raw ? (JSON.parse(raw) as AnalysisCache) : null
  } catch { return null }
}

function saveAnalysisCache(health: AIHealthSummary | null, suggestions: AISuggestion[], forecast: AIBudgetForecast | null) {
  if (!health) return
  localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify({ health, suggestions, forecast, timestamp: Date.now() } satisfies AnalysisCache))
}

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_CAT_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch { return new Set() }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_CAT_KEY, JSON.stringify([...ids]))
}

function loadPendingCats(): AICategorization[] {
  try {
    const raw = localStorage.getItem(PENDING_CAT_KEY)
    return raw ? (JSON.parse(raw) as AICategorization[]) : []
  } catch { return [] }
}

function savePendingCats(items: AICategorization[]) {
  if (items.length === 0) {
    localStorage.removeItem(PENDING_CAT_KEY)
  } else {
    localStorage.setItem(PENDING_CAT_KEY, JSON.stringify(items))
  }
}

// ---------------------------------------------------------------------------
// Store initialization (seeded from cache)
// ---------------------------------------------------------------------------

const _cached = loadAnalysisCache()

const analysisStore = makeStore<AIAnalysisStore>({
  health: _cached?.health ?? null,
  suggestions: _cached?.suggestions ?? [],
  forecast: _cached?.forecast ?? null,
  loading: false,
  error: null,
  cacheTimestamp: _cached?.timestamp ?? null,
})
const _pendingCats = loadPendingCats()
const catStore = makeStore<AICatStore>({ categorizations: _pendingCats, loading: false, error: null, totalUncategorized: 0, batchProgress: null })

export const subscribeAIStore = analysisStore.subscribe
export const getAIStoreSnapshot = analysisStore.snapshot
export const subscribeCatStore = catStore.subscribe
export const getCatStoreSnapshot = catStore.snapshot

// ---------------------------------------------------------------------------
// Cancel controllers
// ---------------------------------------------------------------------------

let analysisController: AbortController | null = null
let catController: AbortController | null = null

export function cancelAISuggestions() {
  analysisController?.abort()
  analysisController = null
  analysisStore.set({ loading: false })
}

export function cancelAICategorizations() {
  catController?.abort()
  catController = null
  catStore.set({ loading: false })
}

// ---------------------------------------------------------------------------
// Data building — financial analysis (6 complete months)
// ---------------------------------------------------------------------------

type MonthData = {
  month: string
  income: number
  totalExpenses: number
  savingsRate: number
  savingsAmount: number
  expensesByCategory: Record<string, number>
  uncategorized: { count: number; totalAmount: number }
  payeeAmounts: Record<string, number>
}

export type CategoryTrend = {
  lastMonth: number
  prevMonth: number
  momChangePct: number
  avgBase: number      // 2-month baseline (months[2..3]), no overlap with prevMonth
  vsBasePct: number
  trend: 'accelerating' | 'stable' | 'declining' | 'new'
}

type SavingsAnalysis =
  | { reliable: false; warning: string; goalPct: number }
  | { reliable: true; goalPct: number; lastMonthPct: number; avg3mPct: number; gapVsGoal: number; consecutiveMonthsBelowGoal: number; trend: 'improving' | 'worsening' | 'stable' }

async function buildFinancialSummary() {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 6 - i))
  const [categories, profile, excluded] = await Promise.all([
    db.categories.toArray(),
    db.userProfile.get(1),
    getApprovedMatchedTxIds(),
  ])
  const catMap = Object.fromEntries(categories.map(c => [c.id!, c.name]))

  let lastMonthTxs: Transaction[] = []

  const monthlyData: MonthData[] = await Promise.all(months.map(async (month, idx) => {
    const start = startOfMonth(month)
    const end = endOfMonth(month)
    const all = await db.transactions.where('date').between(start, end).toArray()
    const txs = all.filter(t => !excluded.has(t.id!))
    if (idx === 5) lastMonthTxs = txs

    const byCategory: Record<string, number> = {}
    const payeeAmounts: Record<string, number> = {}
    let uncategorizedExpenses = 0
    let uncategorizedCount = 0

    for (const tx of txs) {
      if (tx.amount >= 0) continue
      const abs = Math.abs(tx.amount)
      payeeAmounts[tx.payee] = (payeeAmounts[tx.payee] ?? 0) + abs
      if (!tx.categoryId) {
        uncategorizedExpenses += abs
        uncategorizedCount++
      } else {
        const catName = catMap[tx.categoryId] ?? 'Outros'
        byCategory[catName] = (byCategory[catName] ?? 0) + abs
      }
    }

    const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const totalExpenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    const savingsRate = income > 0 ? Math.round(((income - totalExpenses) / income) * 100) : 0

    return {
      month: format(month, 'MMM/yyyy', { locale: ptBR }),
      income: Math.round(income),
      totalExpenses: Math.round(totalExpenses),
      savingsRate,
      savingsAmount: Math.round(income - totalExpenses),
      expensesByCategory: Object.fromEntries(
        Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])
      ),
      uncategorized: { count: uncategorizedCount, totalAmount: Math.round(uncategorizedExpenses) },
      payeeAmounts,
    }
  }))

  const monthsWithData = monthlyData.filter(m => m.totalExpenses > 0 || m.income > 0).length
  const categoryTrends = computeCategoryTrends(monthlyData)
  const savingsAnalysis = computeSavingsAnalysis(monthlyData, profile?.savingsGoalPct ?? 20)
  const topExpenses = computeTopExpenses(lastMonthTxs, catMap)
  const recurringPayees = computeRecurringPayees(monthlyData)

  const totalExpensesAllMonths = monthlyData.reduce((s, m) => s + m.totalExpenses, 0)
  const totalUncategorizedAmt = monthlyData.reduce((s, m) => s + m.uncategorized.totalAmount, 0)
  const uncategorizedRatioPct = totalExpensesAllMonths > 0
    ? Math.round((totalUncategorizedAmt / totalExpensesAllMonths) * 100)
    : 0

  return {
    period: `${monthlyData[0].month} a ${monthlyData[5].month} (meses completos)`,
    monthsWithData,
    categoryTrends,
    savingsAnalysis,
    uncategorizedRatioPct,
    topExpenses,
    recurringPayees,
    profile: profile
      ? { savingsGoalPct: profile.savingsGoalPct, riskProfile: profile.riskProfile, monthlyIncome: profile.monthlyIncome }
      : null,
  }
}

function computeCategoryTrends(months: MonthData[]): Record<string, CategoryTrend> {
  const last = months[5].expensesByCategory
  const prev = months[4].expensesByCategory
  // Use months[2..3] as baseline — excludes prevMonth to avoid overlap in the comparison
  const baseline = [months[2], months[3]].map(m => m.expensesByCategory)

  const allCats = new Set([...Object.keys(last), ...Object.keys(prev)])
  const result: Record<string, CategoryTrend> = {}

  for (const cat of allCats) {
    const lastVal = last[cat] ?? 0
    const prevVal = prev[cat] ?? 0
    const baselineVals = baseline.map(b => b[cat] ?? 0).filter(v => v > 0)
    const avgBase = baselineVals.length > 0
      ? Math.round(baselineVals.reduce((s, v) => s + v, 0) / baselineVals.length)
      : 0

    const momChangePct = prevVal > 0 ? Math.round(((lastVal - prevVal) / prevVal) * 100) : 0
    const vsBasePct = avgBase > 0 ? Math.round(((lastVal - avgBase) / avgBase) * 100) : 0

    let trend: CategoryTrend['trend']
    if (prevVal === 0 && lastVal > 0) trend = 'new'
    else if (momChangePct > 10) trend = 'accelerating'
    else if (momChangePct < -10) trend = 'declining'
    else trend = 'stable'

    result[cat] = { lastMonth: lastVal, prevMonth: prevVal, momChangePct, avgBase, vsBasePct, trend }
  }

  return result
}

function computeSavingsAnalysis(months: MonthData[], goalPct: number): SavingsAnalysis {
  const monthsWithIncome = months.filter(m => m.income > 0)
  if (monthsWithIncome.length === 0) {
    return {
      reliable: false,
      warning: 'Nenhuma receita encontrada — importe extratos com transações de crédito para habilitar esta análise',
      goalPct,
    }
  }

  const rates = months.map(m => m.savingsRate)
  const last = rates[5]
  const recent3 = [rates[3], rates[4], rates[5]].filter((_, i) => months[i + 3].income > 0)
  const avg3m = recent3.length > 0 ? Math.round(recent3.reduce((s, r) => s + r, 0) / recent3.length) : last

  let consecutiveMonthsBelowGoal = 0
  for (let i = rates.length - 1; i >= 0; i--) {
    if (months[i].income === 0) break
    if (rates[i] < goalPct) consecutiveMonthsBelowGoal++
    else break
  }

  const recentTrend = months[4].income > 0 ? rates[5] - rates[4] : 0
  const trend: 'improving' | 'worsening' | 'stable' =
    recentTrend > 3 ? 'improving' : recentTrend < -3 ? 'worsening' : 'stable'

  return {
    reliable: true,
    goalPct,
    lastMonthPct: last,
    avg3mPct: avg3m,
    gapVsGoal: avg3m - goalPct,
    consecutiveMonthsBelowGoal,
    trend,
  }
}

function computeTopExpenses(txs: Transaction[], catMap: Record<string, string>) {
  return txs
    .filter(t => t.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5)
    .map(t => ({
      date: format(t.date, 'yyyy-MM-dd'),
      payee: t.payee,
      amount: Math.round(Math.abs(t.amount)),
      category: t.categoryId ? (catMap[t.categoryId] ?? 'Outros') : 'Sem categoria',
    }))
}

function computeRecurringPayees(months: MonthData[]) {
  const payeeMonths: Record<string, { count: number; amounts: number[] }> = {}

  for (const month of months) {
    for (const [payee, amount] of Object.entries(month.payeeAmounts)) {
      if (!payeeMonths[payee]) payeeMonths[payee] = { count: 0, amounts: [] }
      payeeMonths[payee].count++
      payeeMonths[payee].amounts.push(amount)
    }
  }

  return Object.entries(payeeMonths)
    .filter(([, v]) => v.count >= 3)
    .map(([payee, v]) => ({
      payee,
      months: v.count,
      avgAmount: Math.round(v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length),
    }))
    .sort((a, b) => b.avgAmount - a.avgAmount)
    .slice(0, 10)
}

// ---------------------------------------------------------------------------
// Budget forecast — deterministic projection from category trends
// ---------------------------------------------------------------------------

export function computeBudgetForecast(categoryTrends: Record<string, CategoryTrend>): AIBudgetForecast {
  const period = format(addMonths(new Date(), 1), 'MMM/yyyy', { locale: ptBR })
  const items: AIBudgetForecastItem[] = []

  for (const [category, trend] of Object.entries(categoryTrends)) {
    if (trend.lastMonth === 0) continue

    let predicted: number
    let direction: AIBudgetForecastItem['direction']

    if (trend.trend === 'accelerating') {
      const growthRate = Math.min(trend.momChangePct / 100, 0.5)
      predicted = Math.round(trend.lastMonth * (1 + growthRate))
      direction = 'up'
    } else if (trend.trend === 'declining') {
      const declineRate = Math.max(trend.momChangePct / 100, -0.5)
      predicted = Math.max(0, Math.round(trend.lastMonth * (1 + declineRate)))
      direction = 'down'
    } else {
      predicted = trend.prevMonth > 0
        ? Math.round((trend.lastMonth + trend.prevMonth) / 2)
        : trend.lastMonth
      direction = 'stable'
    }

    items.push({ category, lastMonth: trend.lastMonth, predicted, direction })
  }

  items.sort((a, b) => b.predicted - a.predicted)
  const totalPredicted = items.reduce((s, i) => s + i.predicted, 0)
  return { period, totalPredicted, items }
}

// ---------------------------------------------------------------------------
// Health score — deterministic, computed in TypeScript
// ---------------------------------------------------------------------------

function computeHealthScore(
  savingsAnalysis: SavingsAnalysis,
  categoryTrends: Record<string, CategoryTrend>,
  uncategorizedRatioPct: number,
  monthsWithData: number,
): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  // Uncategorized ratio: 0% → 100pts, 50%+ → 0pts
  const uncatScore = Math.max(0, 100 - uncategorizedRatioPct * 2)

  // Category acceleration: each accelerating category hurts score
  const catValues = Object.values(categoryTrends)
  const acceleratingCount = catValues.filter(c => c.trend === 'accelerating').length
  const accelScore = catValues.length > 0
    ? Math.max(0, 100 - (acceleratingCount / catValues.length) * 300)
    : 100

  let score: number
  if (savingsAnalysis.reliable) {
    const rawSavings = Math.max(0, Math.min(100,
      (savingsAnalysis.avg3mPct / Math.max(1, savingsAnalysis.goalPct)) * 100
    ))
    const savingsScore = Math.max(0, rawSavings - savingsAnalysis.consecutiveMonthsBelowGoal * 5)
    score = savingsScore * 0.4 + accelScore * 0.3 + uncatScore * 0.3
  } else {
    // No income data: renormalize to remaining weights
    score = accelScore * 0.5 + uncatScore * 0.5
  }

  if (monthsWithData < 3) score = Math.min(score, 60)

  const rounded = Math.round(score)
  const grade: 'A' | 'B' | 'C' | 'D' | 'F' =
    rounded >= 80 ? 'A' :
    rounded >= 65 ? 'B' :
    rounded >= 50 ? 'C' :
    rounded >= 35 ? 'D' : 'F'

  return { score: rounded, grade }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um consultor financeiro pessoal especializado em finanças brasileiras. Analise dados financeiros com rigor e forneça diagnósticos precisos, sempre referenciando números reais dos dados. Responda apenas em JSON válido.`

function buildAnalysisPrompt(data: object, health: { score: number; grade: string }): string {
  return `Analise os dados financeiros abaixo e retorne o diagnóstico.

DADOS PRÉ-COMPUTADOS (não recalcule — use os valores exatamente como estão):
${JSON.stringify(data)}

SCORE E GRAU JÁ CALCULADOS — inclua-os exatamente na resposta:
score: ${health.score}, grade: "${health.grade}"

INSTRUÇÕES:
1. "headline": uma frase resumindo a saúde financeira atual.
2. "strength": o que está indo bem, citando um número específico dos dados.
3. "concern": a maior preocupação, citando um número específico dos dados.
4. "narrative": um parágrafo de 2-3 frases descrevendo a situação financeira de forma clara e direta, como um consultor falaria ao cliente, citando números reais dos dados em português.
5. "suggestions": entre 3 e 5 sugestões ordenadas por impacto (high primeiro). Cada "insight" DEVE citar números reais dos dados (ex: "Transporte cresceu 23% de R$450 para R$553"). Se savingsAnalysis.reliable=false, não inclua sugestões sobre taxa de poupança. Considere o perfil de risco ao dar dicas de investimento.
6. O campo "trend" de cada sugestão deve refletir o campo "trend" do categoryTrends para aquela categoria (ou "stable" para insights gerais).

Responda SOMENTE com JSON válido, sem markdown:
{
  "health": {
    "score": ${health.score},
    "grade": "${health.grade}",
    "headline": "<uma frase>",
    "strength": "<o que está bem, com número>",
    "concern": "<maior problema, com número>",
    "narrative": "<parágrafo de 2-3 frases com números reais>"
  },
  "suggestions": [
    {
      "category": "<nome da categoria ou 'Geral'>",
      "trend": "<up|down|stable|new>",
      "impact": "<high|medium|low>",
      "insight": "<observação com número específico>",
      "recommendation": "<ação concreta>",
      "savingsTip": "<dica de economia>"
    }
  ]
}`
}

function buildCategorizationPrompt(
  txs: Pick<Transaction, 'id' | 'payee' | 'memo' | 'amount' | 'transactionSubtype' | 'date'>[],
  categories: Category[],
): string {
  const catList = categories
    .filter(c => c.type === 'expense')
    .map(c => ({ id: c.id, name: c.name }))

  const txList = txs.map(tx => ({
    txId: tx.id,
    payee: tx.payee,
    memo: tx.memo.slice(0, 100),
    amount: Math.round(Math.abs(tx.amount)),
    type: tx.transactionSubtype,
    date: format(tx.date, 'yyyy-MM-dd'),
  }))

  return `Classifique cada transação na categoria mais adequada.

CATEGORIAS:
${JSON.stringify(catList)}

TRANSAÇÕES:
${JSON.stringify(txList)}

REGRAS:
- Use SOMENTE os IDs da lista de categorias acima
- Cada item da resposta deve usar o txId EXATO da transação correspondente — nunca reutilize ou troque txIds entre transações
- "reason" deve derivar diretamente do nome do payee da MESMA transação (máx 8 palavras em português)
- "confidence" = "high" SOMENTE quando o nome do payee/memo, por si só, identifica inequivocamente a categoria. Exemplos high: "Assai Atacadista" → Alimentação, "Netflix" → Entretenimento, "Uber" → Transporte, "Shell" → Combustível, "Farmácia" → Saúde, "Drogasil" → Saúde, "iFood" → Alimentação
- Use "low" para: PIX com nome próprio (ex: "PIX João Silva", "PIX Recebido"), FATURA/PAGAMENTO DE CARTÃO, TED/DOC genérico, siglas bancárias (ex: "TED 00001234", "TRANSF PIX"), qualquer caso ambíguo. O campo "date" pode ajudar a inferir padrões recorrentes (ex: aluguel no início do mês, mensalidade no mesmo dia todo mês).
- Itens "low" são descartados — prefira não sugerir a sugerir errado.

Responda SOMENTE com JSON válido, sem markdown:
{"categorizations": [{"txId": "...", "categoryId": "...", "categoryName": "...", "reason": "...", "confidence": "high|low"}]}`
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------

function fixJSON(s: string): string {
  // Remove trailing commas before ] or } — common AI output mistake
  return s.replace(/,(\s*[}\]])/g, '$1')
}

function extractJSON(text: string): unknown {
  const tryParse = (s: string): unknown => {
    try { return JSON.parse(s) } catch { return JSON.parse(fixJSON(s)) }
  }
  try {
    return tryParse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/) ?? text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('Resposta inválida da IA')
    return tryParse(match[0])
  }
}

function parseAnalysis(
  text: string,
  precomputed: { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' },
): { health: AIHealthSummary | null; suggestions: AISuggestion[] } {
  const parsed = extractJSON(text) as Record<string, unknown>

  // Always use pre-computed score/grade — only take text fields from AI
  let health: AIHealthSummary | null = null
  const rawHealth = (parsed?.health ?? {}) as Record<string, unknown>
  if (
    typeof rawHealth.headline === 'string' && rawHealth.headline.length > 0 &&
    typeof rawHealth.strength === 'string' && rawHealth.strength.length > 0 &&
    typeof rawHealth.concern === 'string' && rawHealth.concern.length > 0
  ) {
    health = {
      score: precomputed.score,
      grade: precomputed.grade,
      headline: rawHealth.headline,
      strength: rawHealth.strength,
      concern: rawHealth.concern,
      ...(typeof rawHealth.narrative === 'string' && rawHealth.narrative.length > 0
        ? { narrative: rawHealth.narrative }
        : {}),
    }
  }

  const rawArr = Array.isArray(parsed)
    ? parsed
    : (parsed && 'suggestions' in parsed && Array.isArray(parsed.suggestions))
      ? parsed.suggestions as unknown[]
      : []

  const suggestions = rawArr.filter(
    (item): item is AISuggestion =>
      typeof item === 'object' && item !== null &&
      typeof (item as AISuggestion).insight === 'string' &&
      typeof (item as AISuggestion).recommendation === 'string' &&
      typeof (item as AISuggestion).savingsTip === 'string'
  )

  return { health, suggestions }
}

function parseCategorizations(text: string, validCategoryIds: Set<string>): AICategorization[] {
  const parsed = extractJSON(text)
  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && 'categorizations' in parsed && Array.isArray((parsed as Record<string, unknown>).categorizations))
      ? (parsed as Record<string, unknown>).categorizations as unknown[]
      : null
  if (!Array.isArray(arr)) {
    throw new Error('O modelo não retornou JSON válido. Tente um modelo maior (ex: llama3.1:8b) ou use Anthropic/OpenRouter.')
  }
  type RawCat = { txId: string; categoryId: string; categoryName: string; reason?: string; confidence?: string }
  const valid = (arr as unknown[]).filter(
    (item): item is RawCat =>
      typeof item === 'object' && item !== null &&
      typeof (item as RawCat).txId === 'string' &&
      (item as RawCat).categoryId != null &&
      typeof (item as RawCat).categoryName === 'string' &&
      ((item as RawCat).confidence === 'high' || (item as RawCat).confidence === 'low') &&
      validCategoryIds.has(String((item as RawCat).categoryId))
  )
  return valid.map(c => ({
    ...c,
    categoryId: String(c.categoryId),
    confidence: c.confidence as 'high' | 'low',
    reason: c.reason ?? '',
  })) as unknown as AICategorization[]
}

// ---------------------------------------------------------------------------
// Error parsing — extract human-readable message from API error bodies
// ---------------------------------------------------------------------------

function parseApiError(e: unknown, provider?: AIProvider): string {
  if (!(e instanceof Error)) return 'Erro desconhecido'
  if (e.message === 'Failed to fetch' || e.message.includes('NetworkError') || e.message.includes('network')) {
    const name = provider === 'gemini' ? 'Gemini' : provider === 'anthropic' ? 'Anthropic' : provider === 'openrouter' ? 'OpenRouter' : provider === 'ollama' ? 'Ollama' : 'API'
    return `Não foi possível conectar à ${name}. Verifique sua conexão, a chave de API e se o provedor permite requisições diretas do navegador (CORS).`
  }
  try {
    const json = JSON.parse(e.message.replace(/^API error \d+: /, ''))
    const msg = (json?.error?.message as string) ?? (json?.message as string)
    if (msg) return msg
  } catch {}
  return e.message
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

function makeTimerSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(new Error(`Tempo limite de ${timeoutMs / 1000}s atingido`)), timeoutMs)
  return controller.signal
}

function buildRequestSignal(timeoutMs: number | null, external?: AbortSignal): AbortSignal | undefined {
  const timer = timeoutMs !== null ? makeTimerSignal(timeoutMs) : undefined
  if (timer && external) return AbortSignal.any([timer, external])
  return timer ?? external
}

async function callAnthropic(apiKey: string, userPrompt: string, externalSignal?: AbortSignal, maxTokens = 4096): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: buildRequestSignal(90_000, externalSignal),
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`)
  const result = await response.json()
  return result.content?.[0]?.text ?? '{}'
}

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  timeoutMs: number | null = 90_000,
  forceJsonFormat = true,
  externalSignal?: AbortSignal,
  maxTokens = 4096,
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    signal: buildRequestSignal(timeoutMs, externalSignal),
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(forceJsonFormat ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`)
  const result = await response.json()
  return result.choices?.[0]?.message?.content ?? '{}'
}

async function callGemini(apiKey: string, model: string, userPrompt: string, externalSignal?: AbortSignal, maxTokens = 8192): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      signal: buildRequestSignal(90_000, externalSignal),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  )
  if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`)
  const result = await response.json()
  return result.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
}

async function callProvider(config: AIProviderConfig, prompt: string, externalSignal?: AbortSignal, maxTokens = 4096): Promise<string> {
  if (config.provider === 'anthropic') {
    if (!config.anthropicKey) throw new Error('Chave API Anthropic não configurada')
    return callAnthropic(config.anthropicKey, prompt, externalSignal, maxTokens)
  }
  if (config.provider === 'ollama') {
    const baseUrl = config.ollamaUrl?.replace(/\/$/, '') || 'http://localhost:11434'
    return callOpenAICompatible(baseUrl, '', config.ollamaModel || 'llama3.2', prompt, null, false, externalSignal, maxTokens)
  }
  if (config.provider === 'openrouter') {
    if (!config.openrouterKey) throw new Error('Chave API OpenRouter não configurada')
    const model = config.openrouterModel || 'meta-llama/llama-3.1-8b-instruct:free'
    return callOpenAICompatible('https://openrouter.ai/api', config.openrouterKey, model, prompt, 90_000, true, externalSignal, maxTokens)
  }
  if (config.provider === 'gemini') {
    if (!config.geminiKey) throw new Error('Chave API Gemini não configurada')
    const model = config.geminiModel || 'gemini-2.5-flash'
    return callGemini(config.geminiKey, model, prompt, externalSignal, maxTokens)
  }
  throw new Error('Provedor de IA desconhecido')
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

export async function requestAISuggestions(config: AIProviderConfig): Promise<void> {
  if (analysisStore.snapshot().loading) return
  analysisController = new AbortController()
  analysisStore.set({ loading: true, error: null })
  try {
    const summary = await buildFinancialSummary()
    // Health score always uses full data — provider-specific trimming is only for the prompt payload
    const preHealth = computeHealthScore(
      summary.savingsAnalysis,
      summary.categoryTrends,
      summary.uncategorizedRatioPct,
      summary.monthsWithData,
    )

    // For Ollama: trim to top 6 categories + 3 recurring payees to stay within the 4096-token context window
    const isOllama = config.provider === 'ollama'
    const promptData = isOllama ? {
      ...summary,
      categoryTrends: Object.fromEntries(
        Object.entries(summary.categoryTrends)
          .sort((a, b) => b[1].lastMonth - a[1].lastMonth)
          .slice(0, 6)
      ),
      recurringPayees: summary.recurringPayees.slice(0, 3),
      topExpenses: undefined,
    } : summary

    // Ollama context is 4096 total; cap output to leave headroom for the prompt
    const maxTokens = isOllama ? 1500 : 4096
    const text = await callProvider(config, buildAnalysisPrompt(promptData, preHealth), analysisController.signal, maxTokens)
    const { health, suggestions } = parseAnalysis(text, preHealth)
    if (!health && suggestions.length === 0) {
      throw new Error('O modelo não retornou análise válida. Tente um modelo maior ou use Anthropic/OpenRouter.')
    }
    const forecast = computeBudgetForecast(summary.categoryTrends)
    saveAnalysisCache(health, suggestions, forecast)
    analysisStore.set({ health, suggestions, forecast, loading: false, cacheTimestamp: Date.now() })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      analysisStore.set({ loading: false })
    } else {
      analysisStore.set({ loading: false, error: parseApiError(e, config.provider) })
    }
  } finally {
    analysisController = null
  }
}

export async function requestAICategorizations(config: AIProviderConfig, options: { forceAll?: boolean } = {}): Promise<void> {
  const { forceAll = false } = options
  if (catStore.snapshot().loading) return
  catController = new AbortController()
  const signal = catController.signal

  // Pre-seed UI with existing pending so the user sees prior results while new batches run
  const existing = loadPendingCats()
  catStore.set({ loading: true, error: null, categorizations: existing, batchProgress: null })

  try {
    const dismissed = loadDismissed()

    // One-time migration: dismissed transactions from before the aiSeen DB field was introduced
    // don't have aiSeen=true yet — backfill so counts and filters stay consistent.
    if (dismissed.size > 0) {
      await db.transactions.where('id').anyOf([...dismissed]).modify({ aiSeen: true })
    }

    const [allTxs, categories] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
    ])
    const txMap = Object.fromEntries(allTxs.map(tx => [tx.id!, tx]))
    // Normalize to strings — category IDs may be numbers at runtime despite the TS type
    const validCategoryIds = new Set(categories.filter(c => c.type === 'expense').map(c => String(c.id!)))

    // forceAll: re-send everything except dismissed; normal: only novas (aiSeen=false)
    const uncategorized = allTxs
      .filter(tx => !tx.categoryId && tx.amount < 0 && !dismissed.has(tx.id!) && (forceAll || !tx.aiSeen))
      .sort((a, b) => {
        const rank = (tx: typeof a) =>
          tx.transactionSubtype === 'debit_card' ? 0 :
          tx.transactionSubtype === 'other'       ? 1 : 2
        return rank(a) - rank(b) || b.date.getTime() - a.date.getTime()
      })

    catStore.set({ totalUncategorized: uncategorized.length })

    if (uncategorized.length === 0) {
      catStore.set({ loading: false, batchProgress: null })
      return
    }

    const batchSize = config.provider === 'ollama' ? 8 : 100
    const maxTokens = config.provider === 'ollama' ? batchSize * 70 + 200 : 8000

    const batches: typeof uncategorized[] = []
    for (let i = 0; i < uncategorized.length; i += batchSize) batches.push(uncategorized.slice(i, i + batchSize))

    catStore.set({ batchProgress: { done: 0, total: batches.length } })

    // Use a Map for deduplication: new result for same txId replaces old
    const accMap = new Map(existing.map(c => [c.txId, c]))
    let successfulBatches = 0
    let lastBatchError: string | null = null

    for (let i = 0; i < batches.length; i++) {
      if (signal.aborted) break
      try {
        const text = await callProvider(config, buildCategorizationPrompt(batches[i], categories), signal, maxTokens)
        const parsed = parseCategorizations(text, validCategoryIds)
        successfulBatches++
        for (const c of parsed) {
          if (!txMap[c.txId]) continue
          accMap.set(c.txId, { ...c, payee: txMap[c.txId].payee, amount: Math.round(Math.abs(txMap[c.txId].amount)) })
        }
      } catch (batchErr) {
        if (batchErr instanceof Error && batchErr.name === 'AbortError') throw batchErr
        lastBatchError = parseApiError(batchErr, config.provider)
      }
      // Mark all txns in this batch as seen in the DB (regardless of suggestions returned)
      await db.transactions.where('id').anyOf(batches[i].map(tx => tx.id!)).modify({ aiSeen: true })
      const accumulated = [...accMap.values()].sort((a, b) =>
        a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1
      )
      savePendingCats(accumulated)
      catStore.set({ categorizations: accumulated, batchProgress: { done: i + 1, total: batches.length } })
    }

    const accumulated = [...accMap.values()].sort((a, b) =>
      a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1
    )

    let error: string | null = null
    if (accumulated.length === 0 && uncategorized.length > 0) {
      if (successfulBatches === 0 && lastBatchError) {
        // Every batch failed — surface the real API error
        error = lastBatchError
      } else {
        error = `A IA não retornou sugestões válidas para as ${uncategorized.length} transações analisadas. Verifique se há categorias do tipo "despesa" cadastradas.`
      }
    }
    catStore.set({ loading: false, batchProgress: null, error })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      catStore.set({ loading: false, batchProgress: null })
    } else {
      catStore.set({ loading: false, batchProgress: null, error: parseApiError(e, config.provider) })
    }
  } finally {
    catController = null
  }
}

export async function applyAICategorization(cat: AICategorization): Promise<void> {
  const [tx, category] = await Promise.all([
    db.transactions.get(cat.txId),
    db.categories.get(cat.categoryId),
  ])
  if (!tx) return
  if (!category) throw new Error(`Categoria "${cat.categoryName}" não encontrada. Recarregue a página e tente novamente.`)
  await db.transactions.update(cat.txId, { categoryId: cat.categoryId })
  const { upsertRuleForTransaction } = await import('@/features/categories/useCategorization')
  await upsertRuleForTransaction(tx, cat.categoryId)
  const updated = catStore.snapshot().categorizations.filter(c => c.txId !== cat.txId)
  savePendingCats(updated)
  catStore.set({ categorizations: updated })
}

export async function dismissAICategorization(txId: string): Promise<void> {
  const dismissed = loadDismissed()
  dismissed.add(txId)
  saveDismissed(dismissed)
  await db.transactions.update(txId, { aiSeen: true })
  const updated = catStore.snapshot().categorizations.filter(c => c.txId !== txId)
  savePendingCats(updated)
  catStore.set({ categorizations: updated })
}

export async function bulkApplyAICategorizations(items: AICategorization[]): Promise<number> {
  const catIds = [...new Set(items.map(i => i.categoryId))]
  const cats = await db.categories.bulkGet(catIds)
  const validCatIds = new Set(cats.filter(Boolean).map(c => c!.id!))

  const valid = items.filter(i => validCatIds.has(i.categoryId))
  const failed = items.length - valid.length

  if (valid.length > 0) {
    await db.transactions.bulkUpdate(valid.map(i => ({ key: i.txId, changes: { categoryId: i.categoryId } })))
    const { upsertRuleForTransaction } = await import('@/features/categories/useCategorization')
    const txs = await db.transactions.bulkGet(valid.map(i => i.txId))
    for (let j = 0; j < valid.length; j++) {
      const tx = txs[j]
      if (tx) await upsertRuleForTransaction(tx, valid[j].categoryId)
    }
  }

  const appliedIds = new Set(valid.map(i => i.txId))
  const remaining = catStore.snapshot().categorizations.filter(c => !appliedIds.has(c.txId))
  savePendingCats(remaining)
  catStore.set({ categorizations: remaining })
  return failed
}

export async function bulkDismissAICategorizations(txIds: string[]): Promise<void> {
  const dismissed = loadDismissed()
  for (const id of txIds) dismissed.add(id)
  saveDismissed(dismissed)
  await db.transactions.bulkUpdate(txIds.map(id => ({ key: id, changes: { aiSeen: true } })))
  const dismissedSet = new Set(txIds)
  const remaining = catStore.snapshot().categorizations.filter(c => !dismissedSet.has(c.txId))
  savePendingCats(remaining)
  catStore.set({ categorizations: remaining })
}
