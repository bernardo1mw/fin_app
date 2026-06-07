import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, Lightbulb, CheckCircle, Info, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
      const results = await getAISuggestions(apiKey)
      setAiSuggestions(results)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoadingAI(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold">Sugestões</h2>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Análise automática</h3>
        {loadingRules ? (
          <p className="text-sm text-muted-foreground animate-pulse">Analisando transações...</p>
        ) : suggestions.length === 0 ? (
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <CheckCircle className="size-4 text-green-500 shrink-0" />
              <p className="text-sm">Nenhuma observação neste momento. Continue assim!</p>
            </CardContent>
          </Card>
        ) : (
          suggestions.map(s => <SuggestionCard key={s.id} suggestion={s} />)
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Sugestões com IA</h3>
          {apiKey ? (
            <Button size="sm" variant="outline" onClick={handleGetAISuggestions} disabled={loadingAI}>
              {loadingAI
                ? <><RefreshCw className="size-3 mr-1 animate-spin" /> Consultando...</>
                : <><Sparkles className="size-3 mr-1" /> Obter sugestões IA</>
              }
            </Button>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Configure a chave API em Configurações
            </Badge>
          )}
        </div>

        {aiError && (
          <Card className="border-destructive">
            <CardContent className="pt-4 text-sm text-destructive">{aiError}</CardContent>
          </Card>
        )}

        {aiSuggestions.map((s, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="size-4 text-yellow-500" />
                {s.insight}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1 text-muted-foreground">
              <p><strong>Recomendação:</strong> {s.recommendation}</p>
              <p><strong>Dica de poupança:</strong> {s.savingsTip}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const icons = {
    warning: AlertTriangle,
    info: Info,
    success: CheckCircle,
  }
  const colors = {
    warning: 'text-yellow-500',
    info: 'text-blue-500',
    success: 'text-green-500',
  }
  const Icon = icons[suggestion.severity]

  return (
    <Card>
      <CardContent className="pt-4 flex gap-3">
        <Icon className={`size-4 shrink-0 mt-0.5 ${colors[suggestion.severity]}`} />
        <div>
          <p className="text-sm font-medium">{suggestion.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{suggestion.description}</p>
        </div>
      </CardContent>
    </Card>
  )
}
