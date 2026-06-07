import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDashboardData } from './useDashboardData'

export function DashboardPage() {
  const { spendingByCategory, monthlyCashFlow, netWorthPoints, summary } = useDashboardData()

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard</h2>

      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard label="Receitas (mês)" value={summary.income} icon={TrendingUp} positive />
          <SummaryCard label="Despesas (mês)" value={summary.expenses} icon={TrendingDown} positive={false} />
          <SummaryCard label="Saldo (mês)" value={summary.balance} icon={Wallet} positive={summary.balance >= 0} />
          {summary.uncategorized > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex gap-3 items-start">
              <AlertCircle className="size-4 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800">{summary.uncategorized} sem categoria</p>
                <p className="text-xs text-yellow-600">Categorize em Transações</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Gastos por categoria (mês atual)</CardTitle></CardHeader>
          <CardContent>
            {!spendingByCategory?.length
              ? <EmptyState label="Nenhum gasto categorizado este mês" />
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={spendingByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                      {spendingByCategory.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Fluxo de caixa (12 meses)</CardTitle></CardHeader>
          <CardContent>
            {!monthlyCashFlow?.some(m => m.income > 0 || m.expenses > 0)
              ? <EmptyState label="Nenhuma transação encontrada" />
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyCashFlow} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                    <Legend />
                    <Bar dataKey="income" name="Receita" fill="#22c55e" radius={[3,3,0,0]} />
                    <Bar dataKey="expenses" name="Despesa" fill="#f97316" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Saldo ao longo do tempo</CardTitle></CardHeader>
          <CardContent>
            {!netWorthPoints?.length
              ? <EmptyState label="Importe arquivos OFX para ver o saldo ao longo do tempo" />
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={netWorthPoints} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                    <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )
            }
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, icon: Icon, positive }: { label: string; value: number; icon: React.ElementType; positive: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`size-4 ${positive ? 'text-green-500' : 'text-orange-500'}`} />
        </div>
        <p className={`text-lg font-semibold ${positive ? 'text-green-600' : ''}`}>
          {formatCurrency(value)}
        </p>
      </CardContent>
    </Card>
  )
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground text-center py-8">{label}</p>
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
