import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { Venda } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { printThermalReceipt, type ThermalReceiptData } from '../lib/thermalPrint'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const today = () => new Date().toISOString().slice(0, 10)

export default function Vendas() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const [data, setData] = useState(today())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Venda | null>(null)

  const { data: res, isLoading } = useQuery({
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
            <div className="py-12 text-center text-slate-500 text-sm">Carregando…</div>
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

                <div className="border-t border-slate-800 pt-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pagamento</p>
                  {[
                    { label: 'Dinheiro',       val: detalhe.vr_dinheiro },
                    { label: 'Cartão',         val: detalhe.vr_cartao },
                    { label: 'PIX CNPJ',       val: detalhe.vr_pix },
                    { label: 'NOTA',           val: detalhe.vr_nota },
                    { label: 'Cheque',         val: detalhe.vr_cheque },
                    { label: 'Carnê',          val: detalhe.vr_carne },
                    { label: 'Ticket / Outros', val: detalhe.vr_ticket },
                    { label: 'Desconto/Ajust.', val: detalhe.vr_adicional },
                  ].filter(x => Number(x.val) !== 0).map(({ label, val }) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-slate-400">{label}</span>
                      <span className={Number(val) < 0 ? 'text-amber-400' : 'text-slate-300'}>{R(Number(val))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold border-t border-slate-800 pt-2">
                    <span className="text-white text-sm">Total</span>
                    <span className="text-emerald-400">{R(Number(detalhe.vr_total))}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
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
                    }
                    printThermalReceipt(receiptData)
                  }}
                  className="w-full mt-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-950/40 hover:scale-[1.02] active:scale-95"
                >
                  <span>🖨️</span>
                  <span>Imprimir 2ª Via do Cupom</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
