import { useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Upload, CheckCircle, AlertCircle, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { db } from '@/db/db'
import { useImport, type ImportedRow } from './useImport'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

export function ImportPage() {
  const { importFile, loading, result } = useImport()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [tab, setTab] = useState<'imported' | 'duplicates'>('imported')
  const [page, setPage] = useState(0)

  const categories = useLiveQuery(() => db.categories.toArray())
  const catMap = Object.fromEntries((categories ?? []).map(c => [c.id!, c.name]))

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    const ofxFiles = Array.from(files).filter(f =>
      f.name.toLowerCase().endsWith('.ofx') || f.name.toLowerCase().endsWith('.qfx')
    )
    setPage(0)
    setTab('imported')
    for (const file of ofxFiles) await importFile(file)
  }, [importFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const rows = result
    ? (tab === 'imported' ? result.importedRows : result.duplicateRows)
    : []
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function switchTab(next: 'imported' | 'duplicates') {
    setTab(next)
    setPage(0)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Importar OFX</h2>

      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mx-auto size-10 text-muted-foreground mb-3" />
            <p className="font-medium">Arraste o arquivo OFX ou clique para selecionar</p>
            <p className="text-sm text-muted-foreground mt-1">Suporta arquivos .ofx e .qfx</p>
            <input
              ref={inputRef}
              type="file"
              accept=".ofx,.qfx"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse">Processando arquivo...</p>
      )}

      {result && !loading && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 flex-wrap">
            {result.errors.length === 0
              ? <CheckCircle className="size-4 text-green-500 shrink-0" />
              : <AlertCircle className="size-4 text-destructive shrink-0" />
            }
            <StatBadge label="Importadas" value={result.imported} variant="default" />
            <StatBadge label="Duplicatas ignoradas" value={result.duplicates} variant="secondary" />
            <StatBadge label="Categorizadas automaticamente" value={result.categorized} variant="outline" />
            {result.errors.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                <FileText className="size-4 shrink-0" />
                <span>{e}</span>
              </div>
            ))}
          </div>

          {/* Tab switcher */}
          {(result.importedRows.length > 0 || result.duplicateRows.length > 0) && (
            <div className="space-y-3">
              <div className="flex gap-1 border-b">
                <TabButton
                  active={tab === 'imported'}
                  onClick={() => switchTab('imported')}
                  label="Importadas"
                  count={result.importedRows.length}
                />
                <TabButton
                  active={tab === 'duplicates'}
                  onClick={() => switchTab('duplicates')}
                  label="Duplicatas"
                  count={result.duplicateRows.length}
                />
              </div>

              {pageRows.length > 0 && (
                <>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Data</th>
                          <th className="text-left px-3 py-2 font-medium">Descrição</th>
                          <th className="text-right px-3 py-2 font-medium">Valor</th>
                          {tab === 'imported' && (
                            <th className="text-left px-3 py-2 font-medium">Categoria</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pageRows.map(row => (
                          <ResultRow
                            key={row.fitId}
                            row={row}
                            showCategory={tab === 'imported'}
                            catMap={catMap}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} de {rows.length}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline" size="icon"
                          className="size-7"
                          disabled={page === 0}
                          onClick={() => setPage(p => p - 1)}
                        >
                          <ChevronLeft className="size-3.5" />
                        </Button>
                        <Button
                          variant="outline" size="icon"
                          className="size-7"
                          disabled={page >= totalPages - 1}
                          onClick={() => setPage(p => p + 1)}
                        >
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResultRow({ row, showCategory, catMap }: {
  row: ImportedRow
  showCategory: boolean
  catMap: Record<number, string>
}) {
  const isIncome = row.amount > 0
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
        {format(row.date, 'dd/MM/yyyy', { locale: ptBR })}
      </td>
      <td className="px-3 py-2 max-w-xs">
        <span className="truncate block">{row.payee}</span>
      </td>
      <td className={cn('px-3 py-2 text-right font-mono whitespace-nowrap', isIncome ? 'text-green-600' : '')}>
        {isIncome ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: row.currency }).format(row.amount)}
      </td>
      {showCategory && (
        <td className="px-3 py-2">
          {row.categoryId
            ? <Badge variant="outline" className="text-xs">{catMap[row.categoryId] ?? '—'}</Badge>
            : <span className="text-xs text-muted-foreground">Sem categoria</span>
          }
        </td>
      )}
    </tr>
  )
}

function TabButton({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {label} <span className="ml-1 text-xs">({count})</span>
    </button>
  )
}

function StatBadge({ label, value, variant }: {
  label: string; value: number; variant: 'default' | 'secondary' | 'outline'
}) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant}>{value}</Badge>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
