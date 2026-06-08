import { useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Upload, CheckCircle, AlertCircle, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import CircularProgress from '@mui/material/CircularProgress'
import { db } from '@/db/db'
import { useImport, type ImportedRow } from './useImport'

const PAGE_SIZE = 10

export function ImportPage() {
  const { importFile, loading, result } = useImport()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [tab, setTab] = useState(0)
  const [page, setPage] = useState(0)

  const categories = useLiveQuery(() => db.categories.toArray())
  const catMap: Record<string, string> = Object.fromEntries((categories ?? []).map(c => [c.id!, c.name]))

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    const ofxFiles = Array.from(files).filter(f =>
      f.name.toLowerCase().endsWith('.ofx') || f.name.toLowerCase().endsWith('.qfx')
    )
    setPage(0)
    setTab(0)
    for (const file of ofxFiles) await importFile(file)
  }, [importFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const rows = result ? (tab === 0 ? result.importedRows : result.duplicateRows) : []
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Importar OFX</Typography>

      <Card sx={{ maxWidth: 600 }}>
        <CardContent>
          <Box
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            sx={{
              border: '2px dashed',
              borderColor: dragging ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: { xs: 4, sm: 6 },
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
            }}
          >
            <Upload size={40} color="#9e9e9e" style={{ margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500 }}>Arraste o arquivo OFX ou clique para selecionar</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Suporta arquivos .ofx e .qfx</Typography>
            <input ref={inputRef} type="file" accept=".ofx,.qfx" multiple hidden onChange={e => handleFiles(e.target.files)} />
          </Box>
        </CardContent>
      </Card>

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">Processando arquivo...</Typography>
        </Box>
      )}

      {result && !loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            {result.errors.length === 0
              ? <CheckCircle size={16} color="#22c55e" />
              : <AlertCircle size={16} color="#d32f2f" />
            }
            <StatChip label="Importadas" value={result.imported} color="primary" />
            <StatChip label="Duplicatas ignoradas" value={result.duplicates} color="default" />
            <StatChip label="Categorizadas auto" value={result.categorized} color="success" />
            {result.errors.map((e, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FileText size={14} color="#d32f2f" />
                <Typography variant="body2" color="error">{e}</Typography>
              </Box>
            ))}
          </Box>

          {(result.importedRows.length > 0 || result.duplicateRows.length > 0) && (
            <Box>
              <Tabs value={tab} onChange={(_, v: number) => { setTab(v); setPage(0) }} sx={{ borderBottom: 1, borderColor: 'divider', mb: 1.5 }}>
                <Tab label={`Importadas (${result.importedRows.length})`} />
                <Tab label={`Duplicatas (${result.duplicateRows.length})`} />
              </Tabs>

              {pageRows.length > 0 && (
                <>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                          <TableCell>Data</TableCell>
                          <TableCell>Descrição</TableCell>
                          <TableCell align="right">Valor</TableCell>
                          {tab === 0 && <TableCell>Categoria</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pageRows.map(row => (
                          <ResultRow key={row.fitId} row={row} showCategory={tab === 0} catMap={catMap} />
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {totalPages > 1 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} de {rows.length}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button size="small" variant="outlined" disabled={page === 0} onClick={() => setPage(p => p - 1)} sx={{ minWidth: 36, p: 0.5 }}>
                          <ChevronLeft size={16} />
                        </Button>
                        <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} sx={{ minWidth: 36, p: 0.5 }}>
                          <ChevronRight size={16} />
                        </Button>
                      </Box>
                    </Box>
                  )}
                </>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

function ResultRow({ row, showCategory, catMap }: { row: ImportedRow; showCategory: boolean; catMap: Record<string, string> }) {
  const isIncome = row.amount > 0
  const fmtCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: row.currency })
  return (
    <TableRow hover>
      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontSize: 13 }}>
        {format(row.date, 'dd/MM/yyyy', { locale: ptBR })}
      </TableCell>
      <TableCell sx={{ maxWidth: 240, fontSize: 13 }}>
        <Typography variant="body2" noWrap>{row.payee}</Typography>
      </TableCell>
      <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', fontSize: 13, color: isIncome ? 'success.main' : 'text.primary' }}>
        {isIncome ? '+' : ''}{fmtCurrency.format(row.amount)}
      </TableCell>
      {showCategory && (
        <TableCell sx={{ fontSize: 13 }}>
          {row.categoryId
            ? <Chip label={catMap[row.categoryId] ?? '—'} size="small" variant="outlined" />
            : <Typography variant="caption" color="text.secondary">Sem categoria</Typography>
          }
        </TableCell>
      )}
    </TableRow>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: 'primary' | 'default' | 'success' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Chip label={value} size="small" color={color} />
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
  )
}
