import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ErpDashboard() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null

  const { data, isLoading } = useQuery({
    queryKey: ['erp-dashboard', tid],
    queryFn: erpApi.dashboard,
    refetchInterval: 30_000,
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Carregando dashboard…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Status do caixa */}
      {data.caixa ? (
        <div className="bg-green-900/20 border border-green-800/50 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-green-400 text-lg">🟢</span>
          <span className="text-green-300 text-sm font-medium">
            Caixa aberto desde {data.caixa.hora_abertura} · Terminal {data.caixa.terminal} · Turno {data.caixa.turno}
          </span>
        </div>
      ) : (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-red-400 text-lg">🔴</span>
          <span className="text-red-300 text-sm font-medium">Caixa fechado</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Vendas hoje" value={R(data.hoje.total)} sub={`${data.hoje.count} ${data.hoje.count === 1 ? 'venda' : 'vendas'}`} color="blue" />
        <KpiCard label="Semana" value={R(data.semana.total)} sub="últimos 7 dias" color="violet" />
        <KpiCard label="Mês atual" value={R(data.mes.total)} color="emerald" />
        <KpiCard
          label="Contas a receber"
          value={R(data.contas.total)}
          sub={`${data.contas.count} lançamento${data.contas.count !== 1 ? 's' : ''} em aberto`}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top produtos hoje */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Top produtos hoje
          </h2>
          {data.top_produtos.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-8">Nenhuma venda hoje ainda</p>
          ) : (
            <div className="space-y-3">
              {data.top_produtos.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-600 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{p.nome}</p>
                    <p className="text-xs text-slate-500">{p.quant} un.</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400">{R(p.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estoque baixo */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Estoque baixo / crítico
            </h2>
            <Link to="/erp/produtos" className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Ver produtos →
            </Link>
          </div>
          {data.estoque_baixo.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-8">Estoque em dia ✓</p>
          ) : (
            <div className="space-y-3">
              {data.estoque_baixo.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{p.nome}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${p.estoque <= 0 ? 'text-red-400' : 'text-amber-400'}`}>
                      {p.estoque} un.
                    </span>
                    <span className="text-xs text-slate-600 ml-1">/ mín {p.min_estoque}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: 'blue' | 'violet' | 'emerald' | 'amber'
}) {
  const colors = {
    blue:    'border-blue-800/40 bg-blue-900/10',
    violet:  'border-violet-800/40 bg-violet-900/10',
    emerald: 'border-emerald-800/40 bg-emerald-900/10',
    amber:   'border-amber-800/40 bg-amber-900/10',
  }
  const textColors = {
    blue: 'text-blue-300', violet: 'text-violet-300',
    emerald: 'text-emerald-300', amber: 'text-amber-300',
  }
  return (
    <div className={`rounded-2xl border p-5 ${colors[color]}`}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold ${textColors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}
