import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import { useDashboardData } from './useDashboardData'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export function DashboardPage() {
  const { spendingByCategory, monthlyCashFlow, netWorthPoints, summary } = useDashboardData()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Dashboard</Typography>

      {/* KPI cards — always visible */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
        <KpiCard label="Receitas (mês)" value={summary?.income ?? 0} icon={TrendingUp} positive />
        <KpiCard label="Despesas (mês)" value={summary?.expenses ?? 0} icon={TrendingDown} positive={false} />
        <KpiCard label="Saldo (mês)" value={summary?.balance ?? 0} icon={Wallet} positive={(summary?.balance ?? 0) >= 0} />
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
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Gastos por categoria (mês atual)</Typography>
            {!spendingByCategory?.length
              ? <EmptyState label="Nenhum gasto categorizado este mês" />
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={spendingByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                      {spendingByCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Fluxo de caixa (12 meses)</Typography>
            {!monthlyCashFlow?.some(m => m.income > 0 || m.expenses > 0)
              ? <EmptyState label="Nenhuma transação encontrada" />
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyCashFlow} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                    <Legend />
                    <Bar dataKey="income" name="Receita" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expenses" name="Despesa" fill="#f97316" radius={[3, 3, 0, 0]} />
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
                  <LineChart data={netWorthPoints} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                    <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
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
