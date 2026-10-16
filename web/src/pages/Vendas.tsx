import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { Venda } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { printThermalReceipt, type ThermalReceiptData } from '../lib/thermalPrint'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const today = () => new Date().toISOString().slice(0, 10)

export default function Vendas() {
  const { currentTenant, user } = useAuth()
  const tid = currentTenant?.id ?? null
  const [data, setData] = useState(today())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Venda | null>(null)

  const { data: res, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['vendas', tid, data, search, page],
    queryFn: () => erpApi.vendas({ data, search, page }),
  })

  const { data: detalhe, isLoading: loadingDetalhe } = useQuery({
    queryKey: ['venda', selected?.controle],
    queryFn: () => erpApi.venda(selected!.controle),
    enabled: !!selected,
  })

  const vendas = res?.data ?? []

  return (
    <div className="flex gap-6 max-w-6xl">
      {/* Lista */}
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Vendas</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Loja: <span className="text-blue-400 font-semibold">{currentTenant?.nome || 'Loja Principal'}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <input
            type="date"
            value={data}
            onChange={e => { setData(e.target.value); setPage(1) }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por cliente, placa, modelo ou controle…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>Carregando vendas…</span>
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-red-400 text-sm space-y-2">
              <p>Erro ao carregar vendas. {(error as any)?.message || 'Tente novamente.'}</p>
              <button
                onClick={() => refetch()}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg transition-colors border border-slate-700"
              >
                Tentar novamente
              </button>
            </div>
          ) : vendas.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">Nenhuma venda encontrada</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="px-4 py-3">Controle</th>
                  <th className="px-4 py-3">Cliente / Veículo</th>
                  <th className="px-4 py-3">Hora</th>
                  <th className="px-4 py-3 text-right">Forma / Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {vendas.map(v => (
                  <tr
                    key={v.controle}
                    onClick={() => setSelected(v)}
                    className={`cursor-pointer hover:bg-slate-800/50 transition-colors ${
                      selected?.controle === v.controle ? 'bg-blue-900/20' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.controle}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-200 font-medium">{v.nome_cliente || 'Consumidor final'}</span>
                          {v.os_id && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              OS
                            </span>
                          )}
                        </div>
                        {(v.os_plate || v.os_model) && (
                          <span className="text-xs text-slate-400 font-mono mt-0.5">
                            🚗 {[v.os_model, v.os_plate].filter(Boolean).join(' • ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{v.hora_venda}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-semibold text-emerald-400">{R(Number(v.vr_total))}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {Number(v.vr_pix) > 0 && <span className="text-[10px] px-1 py-0.2 rounded bg-teal-900/40 text-teal-300">PIX</span>}
                          {Number(v.vr_cartao) > 0 && <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-900/40 text-indigo-300">Cartão</span>}
                          {Number(v.vr_dinheiro) > 0 && <span className="text-[10px] px-1 py-0.2 rounded bg-amber-900/40 text-amber-300">Dinheiro</span>}
                          {Number(v.vr_nota) > 0 && <span className="text-[10px] px-1 py-0.2 rounded bg-purple-900/40 text-purple-300">Nota</span>}
                          {Number(v.vr_ticket) > 0 && <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">Outros</span>}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(res?.pages ?? 0) > 1 && (
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-sm text-slate-500">
              <span>{res?.total} vendas</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40">
                  ←
                </button>
                <span className="px-2 py-1 text-slate-400">{page} / {res?.pages}</span>
                <button disabled={page >= (res?.pages ?? 1)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40">
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detalhe */}
      {selected && (
        <div className="w-80 shrink-0">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden sticky top-0">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Detalhe da venda</h2>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-xs">✕ fechar</button>
            </div>

            {loadingDetalhe || !detalhe ? (
              <div className="py-12 text-center text-slate-500 text-sm">Carregando…</div>
            ) : (
              <div className="p-5 space-y-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Controle</p>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-slate-300">{detalhe.controle}</p>
                    {detalhe.os_id && (
                      <a
                        href={`/os/${detalhe.os_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
                      >
                        Ver OS #{detalhe.os_plate || detalhe.os_id.slice(0, 8)} ↗
                      </a>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="text-slate-200 font-medium">{detalhe.nome_cliente || 'Consumidor final'}</p>
                  {(detalhe.os_plate || detalhe.os_model) && (
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      🚗 {[detalhe.os_model, detalhe.os_plate].filter(Boolean).join(' • ')}
                    </p>
                  )}
                  {(detalhe.cpf_cnpj || detalhe.telefone || detalhe.celular) && (
                    <div className="text-[11px] text-slate-400 mt-2 space-y-0.5 bg-slate-800/40 p-2 rounded-lg border border-slate-800">
                      {detalhe.cpf_cnpj && <p>CPF/CNPJ: {detalhe.cpf_cnpj}</p>}
                      {(detalhe.telefone || detalhe.celular) && <p>Tel: {detalhe.telefone || detalhe.celular}</p>}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Itens</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(detalhe.itens ?? []).map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-xs text-slate-600 mt-0.5 w-4">{item.quant}×</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-200 text-xs leading-snug">{item.nome_produto}</p>
                        </div>
                        <span className="text-xs font-semibold text-emerald-400 shrink-0">
                          {R(Number(item.vr_total))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resumo Financeiro da Venda & Pagamentos */}
                {(() => {
                  const subtotalItens = (detalhe.itens ?? []).reduce((acc, it) => acc + (Number(it.vr_total) || 0), 0)
                  const vrAdicional = Number(detalhe.vr_adicional || 0)
                  const vrTotal = Number(detalhe.vr_total || 0)
                  const temAjuste = Math.abs(vrAdicional) >= 0.01

                  const pagamentos = [
                    { label: 'Dinheiro',        val: Number(detalhe.vr_dinheiro || 0) },
                    { label: 'Cartão',          val: Number(detalhe.vr_cartao || 0) },
                    { label: 'PIX CNPJ',        val: Number(detalhe.vr_pix || 0) },
                    { label: 'NOTA',            val: Number(detalhe.vr_nota || 0) },
                    { label: 'Cheque',          val: Number(detalhe.vr_cheque || 0) },
                    { label: 'Carnê',           val: Number(detalhe.vr_carne || 0) },
                    { label: 'Ticket / Outros', val: Number(detalhe.vr_ticket || 0) },
                  ].filter(x => x.val > 0)

                  const totalPago = pagamentos.reduce((acc, p) => acc + p.val, 0)

                  return (
                    <div className="space-y-3">
                      {/* Resumo de Valores */}
                      <div className="border-t border-slate-800 pt-3 space-y-1.5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Resumo da Venda</p>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>Subtotal itens</span>
                          <span className="font-mono text-slate-200">{R(subtotalItens > 0 ? subtotalItens : vrTotal)}</span>
                        </div>
                        {temAjuste && vrAdicional < 0 && (
                          <div className="flex justify-between text-xs text-emerald-400 font-medium">
                            <span>Desconto</span>
                            <span className="font-mono">- {R(Math.abs(vrAdicional))}</span>
                          </div>
                        )}
                        {temAjuste && vrAdicional > 0 && (
                          <div className="flex justify-between text-xs text-amber-400 font-medium">
                            <span>Acréscimo</span>
                            <span className="font-mono">+ {R(vrAdicional)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold border-t border-slate-800/80 pt-1.5 mt-1">
                          <span className="text-white text-xs">Total da Venda</span>
                          <span className="text-emerald-400 font-mono text-sm">{R(vrTotal)}</span>
                        </div>
                      </div>

                      {/* Meios de Pagamento */}
                      <div className="border-t border-slate-800 pt-3 space-y-1.5">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Forma de Pagamento</p>
                        {pagamentos.length > 0 ? (
                          pagamentos.map(({ label, val }) => (
                            <div key={label} className="flex justify-between text-xs">
                              <span className="text-slate-400">{label}</span>
                              <span className="text-slate-200 font-mono">{R(val)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 italic">Sem registro de pagamento</p>
                        )}
                        <div className="flex justify-between font-bold border-t border-slate-800 pt-2 mt-1">
                          <span className="text-white text-xs">Total Pago</span>
                          <span className="text-emerald-400 font-mono text-sm">{R(totalPago > 0 ? totalPago : vrTotal)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                <button
                  type="button"
                  onClick={() => {
                    const isRecebimentoNotinha = (detalhe.itens ?? []).some(
                      i => (i.nome_produto || '').toUpperCase().includes('RECEBIMENTO DE NOTINHA')
                    ) || (detalhe.itens?.length === 0 && Number(detalhe.vr_total) > 0)
                    const receiptData: ThermalReceiptData = {
                      empresa: currentTenant?.nome || '4Rodas Centro Automotivo',
                      controle: detalhe.controle,
                      dataHora: `${detalhe.data_venda} ${detalhe.hora_venda || ''}`.trim(),
                      cliente: detalhe.nome_cliente ? {
                        nome: detalhe.nome_cliente,
                        documento: (detalhe as any).cpf_cnpj,
                        telefone: (detalhe as any).telefone || (detalhe as any).celular,
                      } : null,
                      os: (detalhe as any).os_plate ? {
                        plate: (detalhe as any).os_plate,
                        model: (detalhe as any).os_model,
                      } : null,
                      itens: (detalhe.itens ?? []).map(i => ({
                        nome: i.nome_produto,
                        quant: Number(i.quant),
                        valorUnit: Number(i.valor),
                        total: Number(i.vr_total),
                      })),
                      subtotal: (detalhe.itens ?? []).reduce((s, i) => s + Number(i.vr_total), 0),
                      desconto: Number(detalhe.vr_adicional) < 0 ? Math.abs(Number(detalhe.vr_adicional)) : 0,
                      total: Number(detalhe.vr_total),
                      pagamentos: [
                        { nome: 'Dinheiro', valor: Number(detalhe.vr_dinheiro || 0) },
                        { nome: 'Cartão', valor: Number(detalhe.vr_cartao || 0) },
                        { nome: 'PIX CNPJ', valor: Number(detalhe.vr_pix || 0) },
                        { nome: 'NOTA', valor: Number(detalhe.vr_nota || 0) },
                        { nome: 'Cheque', valor: Number(detalhe.vr_cheque || 0) },
                        { nome: 'Carnê', valor: Number(detalhe.vr_carne || 0) },
                        { nome: 'Ticket', valor: Number(detalhe.vr_ticket || 0) },
                      ].filter(p => p.valor > 0),
                      operador: (detalhe as any).nome_operador || (detalhe as any).nome_login || user?.nome,
                      isRecebimentoNotinha,
                      exibirAssinatura: isRecebimentoNotinha,
                    }
                    printThermalReceipt(receiptData)
                  }}
                  className="w-full mt-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-950/40 hover:scale-[1.02] active:scale-95"
                >
                  <span>🖨️</span>
                  <span>{((detalhe.itens ?? []).some(i => (i.nome_produto || '').toUpperCase().includes('RECEBIMENTO DE NOTINHA'))) ? 'Imprimir 2ª Via do Recebimento (com Assinatura)' : 'Imprimir 2ª Via do Cupom'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
