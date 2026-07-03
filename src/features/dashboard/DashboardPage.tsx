import { useState } from 'react'
import { TrendingUp, TrendingDown, Wallet, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, LabelList,
} from 'recharts'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { startOfMonth, addMonths, subMonths, format, isSameMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useDashboardData } from './useDashboardData'
import { useDistinctOwners, ownerDisplay } from '@/components/OwnerSelect'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtShort = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1000) return `R$${(v / 1000).toFixed(1)}k`
  return `R$${v.toFixed(0)}`
}

export function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState<Date | null>(() => startOfMonth(new Date()))
  const [ownerFilter, setOwnerFilter] = useState<string | '__none__' | undefined>(undefined)
  const { spendingByCategory, monthlyCashFlow, netWorthPoints, summary } = useDashboardData(selectedMonth, ownerFilter)
  const distinctOwners = useDistinctOwners()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const allTime = selectedMonth === null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <DashboardFilters
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        ownerFilter={ownerFilter}
        onOwnerChange={setOwnerFilter}
        distinctOwners={distinctOwners}
      />

      {/* KPI cards — always visible */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
        <KpiCard label="Receitas" value={summary?.income ?? 0} icon={TrendingUp} positive />
        <KpiCard label="Despesas" value={summary?.expenses ?? 0} icon={TrendingDown} positive={false} />
        <KpiCard label="Saldo" value={summary?.balance ?? 0} icon={Wallet} positive={(summary?.balance ?? 0) >= 0} />
        {(summary?.uncategorized ?? 0) > 0 ? (
          <Paper variant="outlined" sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start', borderColor: 'warning.light' }}>
            <AlertCircle size={16} color="#ed6c02" style={{ marginTop: 2, flexShrink: 0 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.dark' }}>{summary!.uncategorized} sem categoria</Typography>
              <Typography variant="caption" sx={{ color: 'warning.main' }}>Categorize em Transações</Typography>
            </Box>
          </Paper>
        ) : (
          <KpiCard label="Sem categoria" value={0} icon={AlertCircle} positive />
        )}
      </Box>

      {/* Charts */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Gastos por categoria</Typography>
            {!spendingByCategory?.length
              ? <EmptyState label="Nenhum gasto categorizado neste período" />
              : (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart margin={{ top: 40, right: 20, bottom: 10, left: 20 }}>
                    <Pie
                      data={spendingByCategory}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="48%"
                      outerRadius={isMobile ? 70 : 80}
                      label={isMobile ? undefined : ({ name, value }) => `${(name as string).split(' ')[0]} ${fmtShort(value as number)}`}
                      labelLine={!isMobile}
                    >
                      {spendingByCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ paddingTop: 32 }} />
                  </PieChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Fluxo de caixa {allTime ? '(todo o período)' : '(12 meses)'}</Typography>
            {!monthlyCashFlow?.some(m => m.income > 0 || m.expenses > 0)
              ? <EmptyState label="Nenhuma transação encontrada" />
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyCashFlow} margin={{ top: 24, left: -20, right: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                    <Legend />
                    <Bar dataKey="income" name="Receita" fill="#22c55e" radius={[3, 3, 0, 0]}>
                      <LabelList dataKey="income" position="top" formatter={(v) => Number(v) > 0 ? fmtShort(Number(v)) : ''} style={{ fontSize: 10, fill: '#666' }} />
                    </Bar>
                    <Bar dataKey="expenses" name="Despesa" fill="#f97316" radius={[3, 3, 0, 0]}>
                      <LabelList dataKey="expenses" position="top" formatter={(v) => Number(v) > 0 ? fmtShort(Number(v)) : ''} style={{ fontSize: 10, fill: '#666' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        <Card sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Saldo ao longo do tempo</Typography>
            {!netWorthPoints?.length
              ? <EmptyState label="Importe arquivos OFX para ver o saldo ao longo do tempo" />
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={netWorthPoints} margin={{ top: 24, left: -10, right: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                    <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }}>
                      <LabelList dataKey="balance" position="top" formatter={(v) => fmtShort(Number(v))} style={{ fontSize: 10, fill: '#3b82f6' }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

type DashboardFiltersProps = {
  selectedMonth: Date | null
  onMonthChange: (m: Date | null) => void
  ownerFilter: string | '__none__' | undefined
  onOwnerChange: (v: string | '__none__' | undefined) => void
  distinctOwners: string[]
}

function DashboardFilters({ selectedMonth, onMonthChange, ownerFilter, onOwnerChange, distinctOwners }: DashboardFiltersProps) {
  const allTime = selectedMonth === null
  const isCurrentMonth = !allTime && isSameMonth(selectedMonth, new Date())
  const monthLabel = selectedMonth ? format(selectedMonth, 'MMMM yyyy', { locale: ptBR }) : ''

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>Dashboard</Typography>
      {distinctOwners.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Responsável</InputLabel>
          <Select
            label="Responsável"
            value={ownerFilter ?? ''}
            onChange={e => onOwnerChange((e.target.value as typeof ownerFilter) || undefined)}
          >
            <MenuItem value=""><em>Todos</em></MenuItem>
            <MenuItem value="__none__"><em>Sem responsável</em></MenuItem>
            {distinctOwners.map(o => (
              <MenuItem key={o} value={o}>{ownerDisplay(o)}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <Button
        size="small"
        variant={allTime ? 'contained' : 'outlined'}
        onClick={() => onMonthChange(allTime ? startOfMonth(new Date()) : null)}
        sx={{ minWidth: 0, px: 1.5, textTransform: 'none', fontSize: 13 }}
      >
        Tudo
      </Button>
      <IconButton size="small" onClick={() => onMonthChange(subMonths(selectedMonth ?? new Date(), 1))} disabled={allTime}>
        <ChevronLeft size={18} />
      </IconButton>
      <Typography
        variant="body2"
        sx={{ minWidth: 120, textAlign: 'center', fontWeight: 600, textTransform: 'capitalize', cursor: allTime ? 'default' : 'pointer', color: allTime ? 'text.disabled' : 'text.primary' }}
        onClick={() => { if (!allTime) onMonthChange(startOfMonth(new Date())) }}
        title={allTime ? '' : 'Voltar para mês atual'}
      >
        {allTime ? '—' : monthLabel}
      </Typography>
      <IconButton size="small" onClick={() => onMonthChange(addMonths(selectedMonth ?? new Date(), 1))} disabled={allTime || isCurrentMonth}>
        <ChevronRight size={18} />
      </IconButton>
    </Box>
  )
}

function KpiCard({ label, value, icon: Icon, positive }: { label: string; value: number; icon: React.ElementType; positive: boolean }) {
  return (
    <Card>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Icon size={16} color={positive ? '#22c55e' : '#f97316'} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, color: positive && value > 0 ? 'success.main' : 'text.primary' }}>
          {fmt(value)}
        </Typography>
      </CardContent>
    </Card>
  )
}

function EmptyState({ label }: { label: string }) {
  return <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>{label}</Typography>
}
