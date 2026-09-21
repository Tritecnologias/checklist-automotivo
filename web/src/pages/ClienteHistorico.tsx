import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { erpApi } from '../lib/api'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('pt-BR')
}

const STATUS_LABEL: Record<string, string> = {
  open:        'Aberta',
  in_progress: 'Em andamento',
  closed:      'Encerrada',
}
const STATUS_CLASS: Record<string, string> = {
  open:        'bg-green-900/40 text-green-400',
  in_progress: 'bg-amber-900/40 text-amber-400',
  closed:      'bg-slate-700 text-slate-400',
}

export default function ClienteHistorico() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cliente-historico', id],
    queryFn: () => erpApi.clienteHistorico(Number(id)),
    enabled: Boolean(id),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-slate-400 text-sm">Carregando histórico…</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-center py-40 space-y-3">
        <p className="text-red-400">Erro ao carregar histórico do cliente.</p>
        <button
          onClick={() => navigate('/erp/clientes')}
          className="text-sm text-slate-400 hover:text-white underline"
        >
          Voltar para Clientes
        </button>
      </div>
    )
  }

  const { cliente, vendas, os } = data

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <button
          onClick={() => navigate('/erp/clientes')}
          className="hover:text-slate-300 transition-colors"
        >
          Clientes
        </button>
        <span>/</span>
        <span className="text-slate-300">{cliente.nome}</span>
      </div>

      {/* Header card */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Cliente</p>
            <p className="text-xl font-bold text-white">{cliente.nome}</p>
            {cliente.telefone && (
              <p className="text-sm text-slate-400 mt-0.5">{cliente.telefone}</p>
            )}
            {cliente.cpf_cnpj && (
              <p className="text-xs text-slate-500 mt-0.5">{cliente.cpf_cnpj}</p>
            )}
          </div>
          {(cliente.placa || cliente.modelo) && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Veículo</p>
              {cliente.placa && (
                <span className="font-mono text-base bg-slate-800 text-amber-400 px-3 py-1 rounded border border-slate-700 mr-2">
                  {cliente.placa}
                </span>
              )}
              {cliente.modelo && (
                <p className="text-sm text-slate-400 mt-2">{cliente.modelo}</p>
              )}
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Compras ERP</p>
            <p className="text-2xl font-bold text-green-400">
              {currency(vendas.reduce((s, v) => s + v.total, 0))}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{vendas.length} venda{vendas.length !== 1 ? 's' : ''}</p>
          </div>
          {os.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">OS do App</p>
              <p className="text-2xl font-bold text-blue-400">
                {currency(os.reduce((s, o) => s + o.total + o.laborAmount, 0))}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{os.length} ordem{os.length !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      </div>

      {/* Vendas ERP */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Compras no ERP
          <span className="ml-2 text-sm font-normal text-slate-500">({vendas.length})</span>
        </h2>
        {vendas.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma compra registrada.</p>
        ) : (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Controle</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Em Aberto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {vendas.map(v => (
                  <tr key={v.controle} className="hover:bg-slate-800 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{v.controle}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(v.data)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-400">
                      {currency(v.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {v.em_aberto > 0 ? (
                        <span className="text-red-400 font-semibold">{currency(v.em_aberto)}</span>
                      ) : (
                        <span className="text-slate-500 text-xs">Quitado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* OS do App */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Ordens de Serviço — App
          <span className="ml-2 text-sm font-normal text-slate-500">({os.length})</span>
        </h2>
        {os.length === 0 ? (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center">
            <p className="text-slate-500 text-sm">
              {cliente.placa
                ? `Nenhuma OS encontrada para a placa ${cliente.placa}.`
                : 'Placa não identificada — cruzamento de OS indisponível.'}
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">OS</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Modelo</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Peças</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">M.O.</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {os.map(o => (
                  <tr key={o.id} className="hover:bg-slate-800 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-300">
                        #{o.id.split('-')[0].toUpperCase()}
                      </p>
                      <p className="text-xs text-amber-400 font-mono mt-0.5">{o.plate}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{o.model || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[o.status] ?? STATUS_CLASS.closed}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 text-xs">{currency(o.total)}</td>
                    <td className="px-4 py-3 text-right text-blue-400 text-xs">{currency(o.laborAmount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-400">
                      {currency(o.total + o.laborAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
