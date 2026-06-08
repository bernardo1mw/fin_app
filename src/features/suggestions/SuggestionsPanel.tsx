import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, Lightbulb, CheckCircle, Info, Sparkles } from 'lucide-react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import { generateSuggestions, type Suggestion } from './SuggestionsEngine'
import { getAISuggestions, type AISuggestion } from './ClaudeAdvisor'

export function SuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([])
  const [loadingRules, setLoadingRules] = useState(true)
  const [loadingAI, setLoadingAI] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const apiKey = localStorage.getItem('anthropic_api_key')

  useEffect(() => {
    generateSuggestions().then(s => { setSuggestions(s); setLoadingRules(false) })
  }, [])

  async function handleGetAISuggestions() {
    if (!apiKey) return
    setLoadingAI(true)
    setAiError(null)
    try {
      setAiSuggestions(await getAISuggestions(apiKey))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoadingAI(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 680 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Sugestões</Typography>

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

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="overline" color="text.secondary">Sugestões com IA</Typography>
          {apiKey ? (
            <Button
              size="small"
              variant="outlined"
              onClick={handleGetAISuggestions}
              disabled={loadingAI}
              startIcon={loadingAI ? <RefreshCw size={12} /> : <Sparkles size={12} />}
            >
              {loadingAI ? 'Consultando...' : 'Obter sugestões IA'}
            </Button>
          ) : (
            <Chip label="Configure a chave API em Configurações" size="small" variant="outlined" />
          )}
        </Box>

        {aiError && <Alert severity="error">{aiError}</Alert>}

        {aiSuggestions.map((s, i) => (
          <Card key={i}>
            <CardContent sx={{ pb: '16px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Lightbulb size={16} color="#eab308" />
                <Typography variant="subtitle2">{s.insight}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                <strong>Recomendação:</strong> {s.recommendation}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                <strong>Dica de poupança:</strong> {s.savingsTip}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
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
