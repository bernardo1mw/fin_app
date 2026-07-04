import { useEffect, useSyncExternalStore, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, X as XIcon, Lightbulb, CheckCircle, Info, Sparkles, Tag, Check, CheckCheck, TrendingUp, TrendingDown, Minus, ShieldCheck, ShieldAlert } from 'lucide-react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import { generateSuggestions, type Suggestion } from './SuggestionsEngine'
import {
  loadAIConfig,
  isAIConfigured,
  requestAISuggestions,
  requestAICategorizations,
  cancelAISuggestions,
  cancelAICategorizations,
  applyAICategorization,
  dismissAICategorization,
  bulkApplyAICategorizations,
  bulkDismissAICategorizations,
  subscribeAIStore,
  getAIStoreSnapshot,
  subscribeCatStore,
  getCatStoreSnapshot,
  type AISuggestion,
  type AICategorization,
  type AIHealthSummary,
  type AIBudgetForecast,
} from './ClaudeAdvisor'

export function SuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingRules, setLoadingRules] = useState(true)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [isForceRun, setIsForceRun] = useState(false)

  const { health, suggestions: aiSuggestions, forecast, loading: loadingAI, error: aiError, cacheTimestamp } = useSyncExternalStore(
    subscribeAIStore,
    getAIStoreSnapshot,
  )
  const { categorizations, loading: loadingCat, error: catError, batchProgress } = useSyncExternalStore(
    subscribeCatStore,
    getCatStoreSnapshot,
  )

  const aiConfig = loadAIConfig()
  const configured = isAIConfigured(aiConfig)

  // Count uncategorized transactions the AI has never seen — reactive via Dexie
  const neverSeenByAI = useLiveQuery(
    () => db.transactions.filter(t => !t.categoryId && t.amount < 0 && !t.aiSeen).count()
  ) ?? 0

  // Total uncategorized (for enabling "Reanalisar todas")
  const totalUncategorized = useLiveQuery(
    () => db.transactions.filter(t => !t.categoryId && t.amount < 0).count()
  ) ?? 0

  useEffect(() => {
    generateSuggestions().then(s => { setSuggestions(s); setLoadingRules(false) })
  }, [])

  async function bulkApply(items: typeof categorizations) {
    setBulkError(null)
    const failed = await bulkApplyAICategorizations([...items])
    if (failed > 0) setBulkError(`${failed} categorização(ões) falharam — aplique manualmente as que restarem.`)
  }

  async function bulkDismiss(items: typeof categorizations) {
    await bulkDismissAICategorizations(items.map(i => i.txId))
  }

  const highConf = categorizations.filter(c => c.confidence === 'high')
  const lowConf = categorizations.filter(c => c.confidence === 'low')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 680, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Sugestões</Typography>

      {/* Rule-based suggestions */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="overline" color="text.secondary">Análise automática</Typography>
        {loadingRules ? (
          <Typography variant="body2" color="text.secondary">Analisando transações...</Typography>
        ) : suggestions.length === 0 ? (
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2, '&:last-child': { pb: 2 } }}>
              <CheckCircle size={16} color="#22c55e" />
              <Typography variant="body2">Nenhuma observação neste momento. Continue assim!</Typography>
            </CardContent>
          </Card>
        ) : (
          suggestions.map(s => <SuggestionCard key={s.id} suggestion={s} />)
        )}
      </Box>

      {/* AI financial analysis */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="overline" color="text.secondary">Análise financeira com IA</Typography>
            {cacheTimestamp && !loadingAI && (
              <Typography variant="caption" color="text.secondary">
                · {formatDistanceToNow(cacheTimestamp, { addSuffix: true, locale: ptBR })}
              </Typography>
            )}
          </Box>
          {configured ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {loadingAI && (
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={cancelAISuggestions}
                  startIcon={<XIcon size={12} />}
                >
                  Cancelar
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                onClick={() => requestAISuggestions(aiConfig)}
                disabled={loadingAI}
                startIcon={loadingAI ? <CircularProgress size={12} /> : <Sparkles size={12} />}
              >
                {loadingAI ? 'Analisando...' : cacheTimestamp ? 'Atualizar' : 'Analisar'}
              </Button>
            </Box>
          ) : (
            <Chip label="Configure um provedor de IA em Configurações" size="small" variant="outlined" />
          )}
        </Box>

        {aiError && <Alert severity="error">{aiError}</Alert>}
        {health && <HealthScoreCard health={health} />}
        {aiSuggestions.map((s, i) => <AIInsightCard key={i} suggestion={s} />)}
        {forecast && forecast.items.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="overline" color="text.secondary">Previsão para o próximo mês</Typography>
            <ForecastCard forecast={forecast} />
          </Box>
        )}
      </Box>

      <Divider />

      {/* AI categorization */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="overline" color="text.secondary">Sugestões de categorização</Typography>
            {!loadingCat && neverSeenByAI > 0 && (
              <Chip label={`${neverSeenByAI} nova${neverSeenByAI !== 1 ? 's' : ''}`} size="small" color="primary" variant="outlined" />
            )}
            {!loadingCat && neverSeenByAI === 0 && configured && (
              <Typography variant="caption" color="text.secondary">· todas analisadas</Typography>
            )}
          </Box>
          {configured ? (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {loadingCat && (
                <Button size="small" variant="outlined" color="inherit" onClick={cancelAICategorizations} startIcon={<XIcon size={12} />}>
                  Cancelar
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                disabled={loadingCat || neverSeenByAI === 0}
                onClick={() => { setIsForceRun(false); requestAICategorizations(aiConfig) }}
                startIcon={(loadingCat && !isForceRun) ? <CircularProgress size={12} /> : <Tag size={12} />}
              >
                {loadingCat && !isForceRun
                  ? batchProgress ? `Lote ${batchProgress.done}/${batchProgress.total}...` : 'Carregando...'
                  : neverSeenByAI > 0 ? `Sugerir novas (${neverSeenByAI})` : 'Sugerir categorias'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                disabled={loadingCat || totalUncategorized === 0}
                onClick={() => { setIsForceRun(true); requestAICategorizations(aiConfig, { forceAll: true }) }}
                startIcon={(loadingCat && isForceRun) ? <CircularProgress size={12} /> : <Tag size={12} />}
              >
                {loadingCat && isForceRun
                  ? batchProgress ? `Lote ${batchProgress.done}/${batchProgress.total}...` : 'Carregando...'
                  : 'Reanalisar todas'}
              </Button>
            </Box>
          ) : (
            <Chip label="Configure um provedor de IA em Configurações" size="small" variant="outlined" />
          )}
        </Box>

        {categorizations.length > 0 && !loadingCat && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
              {highConf.length} alta · {lowConf.length} baixa confiança
            </Typography>
            <Button size="small" variant="outlined" color="success" onClick={() => bulkApply(categorizations)} startIcon={<CheckCheck size={12} />}>
              Aceitar todas
            </Button>
            {highConf.length > 0 && (
              <Button size="small" variant="outlined" color="success" onClick={() => bulkApply(highConf)} startIcon={<Check size={12} />}>
                Aceitar alta ({highConf.length})
              </Button>
            )}
            {lowConf.length > 0 && (
              <Button size="small" variant="outlined" color="error" onClick={() => bulkDismiss(lowConf)} startIcon={<XIcon size={12} />}>
                Rejeitar baixa ({lowConf.length})
              </Button>
            )}
            <Button size="small" variant="outlined" color="error" onClick={() => bulkDismiss(categorizations)} startIcon={<XIcon size={12} />}>
              Rejeitar todas
            </Button>
          </Box>
        )}

        {catError && <Alert severity="error">{catError}</Alert>}
        {bulkError && <Alert severity="warning" onClose={() => setBulkError(null)}>{bulkError}</Alert>}

        {loadingCat && batchProgress && batchProgress.done > 0 && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Lote {batchProgress.done}/{batchProgress.total} processado — {categorizations.length} sugestão(ões) encontrada(s) até agora.
          </Alert>
        )}

        {!loadingCat && categorizations.length === 0 && configured && (
          <Typography variant="body2" color="text.secondary">
            Clique em "Sugerir categorias" para a IA classificar transações sem categoria.
          </Typography>
        )}

        {categorizations.map(c => (
          <CategorizationCard key={c.txId} item={c} />
        ))}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const gradeColor: Record<string, string> = {
  A: '#2e7d32',
  B: '#00796b',
  C: '#ed6c02',
  D: '#d84315',
  F: '#b71c1c',
}

function HealthScoreCard({ health }: { health: AIHealthSummary }) {
  const color = gradeColor[health.grade] ?? '#616161'
  return (
    <Card sx={{ border: `2px solid ${color}22`, mb: 0.5 }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ textAlign: 'center', minWidth: 56 }}>
            <Typography variant="h3" sx={{ fontWeight: 800, color, lineHeight: 1 }}>{health.grade}</Typography>
            <Typography variant="caption" color="text.secondary">{health.score}/100</Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>{health.headline}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.25 }}>
              <ShieldCheck size={13} color="#2e7d32" style={{ marginTop: 2, flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary">{health.strength}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
              <ShieldAlert size={13} color="#ed6c02" style={{ marginTop: 2, flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary">{health.concern}</Typography>
            </Box>
            {health.narrative && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}>
                {health.narrative}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

const trendIcon = {
  up: <TrendingUp size={13} color="#ed6c02" />,
  down: <TrendingDown size={13} color="#2e7d32" />,
  stable: <Minus size={13} color="#0288d1" />,
  new: <Sparkles size={13} color="#9c27b0" />,
}

const impactColor: Record<string, string> = {
  high: '#d32f2f',
  medium: '#ed6c02',
  low: '#0288d1',
}

function AIInsightCard({ suggestion: s }: { suggestion: AISuggestion }) {
  return (
    <Card>
      <CardContent sx={{ pb: '16px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Lightbulb size={15} color="#eab308" />
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{s.category}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {trendIcon[s.trend] ?? trendIcon.stable}
          </Box>
          {s.impact && (
            <Chip
              label={s.impact}
              size="small"
              sx={{ height: 18, fontSize: 10, bgcolor: impactColor[s.impact] + '22', color: impactColor[s.impact] }}
            />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>{s.insight}</Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Recomendação:</strong> {s.recommendation}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          <strong>Dica:</strong> {s.savingsTip}
        </Typography>
      </CardContent>
    </Card>
  )
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function CategorizationCard({ item }: { item: AICategorization }) {
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  async function handleAccept() {
    setApplying(true)
    setApplyError(null)
    try {
      await applyAICategorization(item)
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Erro ao aplicar')
      setApplying(false)
    }
  }

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Tag size={15} color="#9c27b0" style={{ marginTop: 3, flexShrink: 0 }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{item.payee}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {fmt.format(item.amount)}
              </Typography>
              <Chip
                label={item.confidence === 'high' ? 'alta' : 'baixa'}
                size="small"
                sx={{
                  height: 16, fontSize: 10, flexShrink: 0,
                  bgcolor: item.confidence === 'high' ? '#22c55e22' : '#f9731622',
                  color: item.confidence === 'high' ? '#15803d' : '#c2410c',
                }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Sugestão: <strong>{item.categoryName}</strong> — {item.reason}
            </Typography>
            {applyError && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.25 }}>
                {applyError}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            <Button
              size="small"
              variant="contained"
              color="success"
              onClick={handleAccept}
              disabled={applying}
              sx={{ minWidth: 0, px: 1, py: 0.25 }}
            >
              {applying ? <CircularProgress size={12} /> : <Check size={13} />}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={() => dismissAICategorization(item.txId)}
              sx={{ minWidth: 0, px: 1, py: 0.25 }}
            >
              <XIcon size={13} />
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

function ForecastCard({ forecast }: { forecast: AIBudgetForecast }) {
  return (
    <Card>
      <CardContent sx={{ pb: '16px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{forecast.period}</Typography>
          <Typography variant="caption" color="text.secondary">
            Total estimado: {fmt.format(forecast.totalPredicted)}
          </Typography>
        </Box>
        {forecast.items.slice(0, 7).map(item => (
          <Box key={item.category} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
            {item.direction === 'up'
              ? <TrendingUp size={13} color="#ed6c02" />
              : item.direction === 'down'
                ? <TrendingDown size={13} color="#2e7d32" />
                : <Minus size={13} color="#757575" />}
            <Typography variant="body2" sx={{ flexGrow: 1 }}>{item.category}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {fmt.format(item.lastMonth)} → {fmt.format(item.predicted)}
            </Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  )
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const cfg = {
    warning: { Icon: AlertTriangle, color: '#ed6c02' },
    info: { Icon: Info, color: '#0288d1' },
    success: { Icon: CheckCircle, color: '#2e7d32' },
  }[suggestion.severity]

  return (
    <Card>
      <CardContent sx={{ display: 'flex', gap: 1.5, py: 2, '&:last-child': { pb: 2 } }}>
        <cfg.Icon size={16} color={cfg.color} style={{ marginTop: 2, flexShrink: 0 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{suggestion.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{suggestion.description}</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}
