import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { ProdutoPdv, ClientePdv, OsEncerradaPdv } from '../types'
import { useAuth } from '../contexts/AuthContext'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

interface CartItem {
  produto: ProdutoPdv
  quant: number
  valor: number
}

interface Pagamento {
  dinheiro: string
  cartao: string
  pix: string
  nota: string
}

const PAG_VAZIO: Pagamento = { dinheiro: '', cartao: '', pix: '', nota: '' }

export default function Pdv() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const qc = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const [busca, setBusca] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [cliente, setCliente] = useState<ClientePdv | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [pagamento, setPagamento] = useState<Pagamento>(PAG_VAZIO)
  const [showPagamento, setShowPagamento] = useState(false)
  const [desconto, setDesconto] = useState('')
  const [sucesso, setSucesso] = useState<string | null>(null)

  // ── Estado de Integração com OS Encerradas ──────────────────────────────────
  const [showOsModal, setShowOsModal]               = useState(false)
  const [buscaOs, setBuscaOs]                       = useState('')
  const [apenasPendentesOs, setApenasPendentesOs]   = useState(true)
  const [osImportada, setOsImportada]               = useState<{ id: string; plate: string; model: string } | null>(null)
  const [importandoOsId, setImportandoOsId]         = useState<string | null>(null)
  const [osFeedback, setOsFeedback]                 = useState<string | null>(null)

  const { data: statusCaixa } = useQuery({
    queryKey: ['caixa-status', tid],
    queryFn: erpApi.caixaStatus,
  })

  const { data: produtos, isFetching: buscando } = useQuery({
    queryKey: ['pdv-produtos', tid, busca],
    queryFn: () => erpApi.buscaProdutos(busca),
    enabled: busca.length >= 2,
    placeholderData: [],
  })

  const { data: clientes } = useQuery({
    queryKey: ['pdv-clientes', tid, buscaCliente],
    queryFn: () => erpApi.buscaClientes(buscaCliente),
    enabled: buscaCliente.length >= 2,
    placeholderData: [],
  })

  // Query para busca de OS encerradas no modal
  const { data: ordensEncerradas = [], isFetching: buscandoOs, refetch: refetchOs } = useQuery({
    queryKey: ['pdv-os-encerradas', tid, buscaOs, apenasPendentesOs],
    queryFn: () => erpApi.listarOsEncerradas({ search: buscaOs, apenasPendentes: apenasPendentesOs }),
    enabled: showOsModal,
  })

  const handleImportarOs = async (osId: string) => {
    try {
      setImportandoOsId(osId)
      const dados = await erpApi.carregarOsPdv(osId)

      // Vincula cliente se encontrado
      if (dados.cliente) {
        setCliente(dados.cliente)
      }

      // Adiciona itens no carrinho
      setCart(dados.itens)
      setOsImportada({
        id: dados.order.id,
        plate: dados.order.plate,
        model: dados.order.model,
      })

      setShowOsModal(false)
      setOsFeedback(`OS ${dados.order.plate} (${dados.order.model}) importada com sucesso! ${dados.itens.length} item(ns) no carrinho.`)
      setTimeout(() => setOsFeedback(null), 5000)
    } catch (err: any) {
      alert(err.message || 'Erro ao importar OS para o PDV')
    } finally {
      setImportandoOsId(null)
    }
  }

  const { mutate: finalizar, isPending: finalizando } = useMutation({
    mutationFn: () => {
      const itens = cart.map(c => ({ id_produto: c.produto.id, valor: c.valor, quant: c.quant }))
      const pag = {
        vr_dinheiro: parseNum(pagamento.dinheiro),
        vr_cartao:   parseNum(pagamento.cartao),
        vr_pix:      parseNum(pagamento.pix),
        vr_nota:     parseNum(pagamento.nota),
        vr_adicional: -(descontoVal),
        id_cliente: cliente?.id ?? 0,
        itens,
        id_os: osImportada?.id,
      }
      return erpApi.criarVenda(pag)
    },
    onSuccess: (data) => {
      setSucesso(data.controle)
      setCart([])
      setPagamento(PAG_VAZIO)
      setDesconto('')
      setCliente(null)
      setOsImportada(null)
      setBusca('')
      setBuscaCliente('')
      setShowPagamento(false)
      qc.invalidateQueries({ queryKey: ['erp-dashboard'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setTimeout(() => { setSucesso(null); searchRef.current?.focus() }, 4000)
    },
  })

  const adicionarItem = useCallback((p: ProdutoPdv) => {
    setBusca('')
    setCart(prev => {
      const idx = prev.findIndex(c => c.produto.id === p.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quant: next[idx].quant + 1 }
        return next
      }
      return [...prev, { produto: p, quant: 1, valor: p.vr_venda }]
    })
    searchRef.current?.focus()
  }, [])

  const alterarQuant = (idx: number, delta: number) => {
    setCart(prev => {
      const next = [...prev]
      const novo = next[idx].quant + delta
      if (novo <= 0) return prev.filter((_, i) => i !== idx)
      next[idx] = { ...next[idx], quant: novo }
      return next
    })
  }

  const alterarValor = (idx: number, val: string) => {
    setCart(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], valor: parseFloat(val.replace(',', '.')) || 0 }
      return next
    })
  }

  const remover = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx))

  const subtotal = cart.reduce((s, c) => s + c.valor * c.quant, 0)
  const descontoVal = parseDesconto(subtotal, desconto)
  const total = Math.max(0, subtotal - descontoVal)
  const totalPagto = Object.values(pagamento).reduce((s, v) => s + parseNum(v), 0)
  const troco = Math.max(0, totalPagto - total)
  const podeFinalizar = cart.length > 0 && totalPagto >= total

  if (!statusCaixa) {
    return (
      <div className="flex flex-col items-center justify-center h-72 gap-4 text-center">
        <p className="text-4xl">🔴</p>
        <p className="text-white font-semibold">Caixa fechado</p>
        <p className="text-slate-400 text-sm">Abra o caixa antes de realizar vendas.</p>
        <a href="/erp/caixa" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold">
          Ir para Caixa
        </a>
      </div>
    )
  }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-5.5rem)] max-w-[1400px]">

      {/* ── COLUNA ESQUERDA: busca + carrinho ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {sucesso && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl px-5 py-3 text-green-300 text-sm font-medium">
            ✅ Venda finalizada! Controle: <strong className="font-mono">{sucesso}</strong>
          </div>
        )}

        {osFeedback && (
          <div className="bg-indigo-950/60 border border-indigo-700 rounded-xl px-5 py-3 text-indigo-300 text-sm font-medium flex items-center justify-between">
            <span>🚗 {osFeedback}</span>
            <button onClick={() => setOsFeedback(null)} className="text-indigo-400 hover:text-white text-xs">✕</button>
          </div>
        )}

        {/* Barra Superior: Busca de Produto + Botão de Buscar OS */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              ref={searchRef}
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar produto por nome ou código…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-base focus:outline-none focus:border-blue-500"
            />
            {buscando && <span className="absolute right-4 top-3.5 text-slate-500 text-sm">…</span>}

            {busca.length >= 2 && (produtos ?? []).length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                {(produtos ?? []).map(p => (
                  <button
                    key={p.id}
                    onClick={() => adicionarItem(p)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-700 border-b border-slate-700/50 last:border-0"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">{p.nome_produto}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.cod_barra} · {p.unidade}</p>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-sm font-bold text-emerald-400">{R(p.vr_venda)}</p>
                        <p className={`text-xs ${p.estoque <= 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          Estq: {p.estoque}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Botão Buscar OS Encerrada */}
          <button
            onClick={() => {
              setShowOsModal(true)
              refetchOs()
            }}
            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shrink-0 shadow-lg shadow-indigo-950/40"
          >
            <span>🚗</span>
            <span>Buscar OS Encerrada</span>
          </button>
        </div>

        {/* Carrinho */}
        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Itens ({cart.length})
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => {
                  setCart([])
                  setOsImportada(null)
                }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Limpar tudo
              </button>
            )}
          </div>

          {/* Aviso se itens pertencem a uma OS importada */}
          {osImportada && (
            <div className="bg-indigo-950/50 border-b border-indigo-800/60 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🚗</span>
                <span className="text-xs text-indigo-200">
                  Itens importados da OS <strong className="text-white font-mono font-bold">{osImportada.plate}</strong> ({osImportada.model})
                </span>
              </div>
              <button
                onClick={() => setOsImportada(null)}
                className="text-[11px] text-indigo-400 hover:text-indigo-200 underline"
                title="Desvincular da OS (mantém os itens no carrinho)"
              >
                Desvincular OS
              </button>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
              <p>Nenhum item no carrinho.</p>
              <p className="text-xs text-slate-600">Busque um produto acima ou importe uma Ordem de Serviço encerrada.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="px-4 py-2 text-left">Produto / Serviço</th>
                    <th className="px-4 py-2 text-center w-28">Qtd</th>
                    <th className="px-4 py-2 text-right w-32">Valor unit.</th>
                    <th className="px-4 py-2 text-right w-28">Total</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {cart.map((c, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="px-4 py-2">
                        <p className="text-slate-200 text-sm">{c.produto.nome_produto}</p>
                        <p className="text-xs text-slate-500 font-mono">{c.produto.cod_barra || 'S/ COD'}</p>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => alterarQuant(idx, -1)} className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold">−</button>
                          <span className="w-8 text-center text-white font-medium">{c.quant}</span>
                          <button onClick={() => alterarQuant(idx, +1)} className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold">+</button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          value={String(c.valor).replace('.', ',')}
                          onChange={e => alterarValor(idx, e.target.value)}
                          className="w-24 text-right bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-white">
                        {R(c.valor * c.quant)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => remover(idx)} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── COLUNA DIREITA: cliente + resumo + pagamento ── */}
      <div className="w-96 flex flex-col gap-4 shrink-0">

        {/* Cliente */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cliente</p>
          {cliente ? (
            <div className="flex items-center justify-between bg-slate-800 rounded-xl px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-white">{cliente.nome_cliente}</p>
                <p className="text-xs text-slate-400">{cliente.cpf_cnpj || cliente.telefone || cliente.celular || 'Sem documento'}</p>
              </div>
              <button onClick={() => setCliente(null)} className="text-slate-500 hover:text-red-400 text-xs ml-2">✕</button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={buscaCliente}
                onChange={e => setBuscaCliente(e.target.value)}
                placeholder="Identificar cliente (opcional)…"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
              />
              {buscaCliente.length >= 2 && (clientes ?? []).length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                  {(clientes ?? []).map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setCliente(c); setBuscaCliente('') }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-700 border-b border-slate-700/50 last:border-0"
                    >
                      <p className="text-sm text-white font-medium">{c.nome_cliente}</p>
                      <p className="text-xs text-slate-400">{c.cpf_cnpj || c.telefone || ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Totais */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-2">
          <div className="flex justify-between text-sm text-slate-400">
            <span>Subtotal</span>
            <span>{R(subtotal)}</span>
          </div>

          <div className="flex justify-between items-center text-sm text-slate-400">
            <span className="flex items-center gap-1">
              Desconto
              <span className="text-[10px] text-slate-500">(R$ ou %)</span>
            </span>
            <div className="flex items-center gap-1.5">
              {desconto.trim().endsWith('%') && descontoVal > 0 && (
                <span className="text-xs text-amber-400 font-mono">
                  (-{R(descontoVal)})
                </span>
              )}
              <input
                value={desconto}
                onChange={e => setDesconto(e.target.value)}
                placeholder="0,00 ou 4%"
                className="w-28 text-right bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="border-t border-slate-800 pt-2 flex justify-between text-base font-bold text-white">
            <span>Total</span>
            <span className="text-emerald-400 text-xl font-black">{R(total)}</span>
          </div>
        </div>

        {/* Formas de pagamento */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-2.5 flex-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pagamento</p>

          {(['dinheiro', 'cartao', 'pix', 'nota'] as (keyof Pagamento)[]).map(key => {
            const labels: Record<keyof Pagamento, string> = {
              dinheiro: '💵 Dinheiro',
              cartao:   '💳 Cartão',
              pix:      '⚡ PIX CNPJ',
              nota:     '📝 NOTA',
            }
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 w-28 shrink-0">{labels[key]}</span>
                <input
                  value={pagamento[key]}
                  onChange={e => setPagamento(p => ({ ...p, [key]: e.target.value }))}
                  placeholder="0,00"
                  className="flex-1 text-right bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            )
          })}

          {totalPagto > 0 && (
            <div className="border-t border-slate-700 pt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total recebido</span>
                <span className={totalPagto >= total ? 'text-emerald-400' : 'text-red-400'}>
                  {R(totalPagto)}
                </span>
              </div>
              {troco > 0 && (
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-amber-400">Troco</span>
                  <span className="text-amber-400">{R(troco)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botão finalizar */}
        <button
          onClick={() => finalizar()}
          disabled={!podeFinalizar || finalizando}
          className="w-full py-4 rounded-2xl text-base font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40"
        >
          {finalizando ? 'Processando…' : `✅ Finalizar Venda · ${R(total)}`}
        </button>

        {!podeFinalizar && cart.length > 0 && totalPagto < total && (
          <p className="text-xs text-red-400 text-center -mt-2">
            Faltam {R(total - totalPagto)} para cobrir o total
          </p>
        )}
      </div>

      {/* ── MODAL: BUSCA DE ORDENS DE SERVIÇO ENCERRADAS ── */}
      {showOsModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚗</span>
                <div>
                  <h2 className="text-lg font-bold text-white">Ordens de Serviço Encerradas</h2>
                  <p className="text-xs text-slate-400">Importe itens e serviços de uma OS concluída para faturamento no caixa</p>
                </div>
              </div>
              <button
                onClick={() => setShowOsModal(false)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Filtros da busca de OS */}
            <div className="flex flex-col sm:flex-row items-center gap-3 py-4 border-b border-slate-800">
              <input
                type="text"
                autoFocus
                placeholder="Buscar por placa, modelo ou código da OS…"
                value={buscaOs}
                onChange={e => setBuscaOs(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
              />

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={apenasPendentesOs}
                  onChange={e => setApenasPendentesOs(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span>Apenas pendentes de pagamento</span>
              </label>
            </div>

            {/* Lista de OSs encontradas */}
            <div className="flex-1 overflow-y-auto py-2 space-y-3">
              {buscandoOs ? (
                <div className="py-16 text-center text-slate-500 text-sm">Buscando ordens de serviço…</div>
              ) : ordensEncerradas.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Nenhuma OS encerrada encontrada para os filtros informados.
                </div>
              ) : (
                ordensEncerradas.map((os: OsEncerradaPdv) => {
                  const jaFaturada = !!os.vendaControle
                  const importandoEste = importandoOsId === os.id

                  return (
                    <div
                      key={os.id}
                      className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-4 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-base text-white tracking-wider bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                            {os.plate}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            #{os.id.split('-')[0].toUpperCase()}
                          </span>
                          {jaFaturada ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                              ✓ Faturada (#{os.vendaControle})
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/60">
                              ⏳ Pendente de Pagamento
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-slate-200 font-medium">
                          {os.model} &middot; <span className="text-slate-400">{os.mileage.toLocaleString('pt-BR')} km</span>
                        </p>

                        <p className="text-xs text-slate-500">
                          Encerrada em: {fmtDate(os.closedAt || os.updatedAt)} &middot; {os.totalItens} item(ns)
                        </p>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-right">
                          <p className="text-xs text-slate-400">{jaFaturada ? 'Total Faturado' : 'Total da OS'}</p>
                          <p className="text-lg font-bold text-emerald-400">{R(os.totalAmount)}</p>
                          {os.laborAmount > 0 && (
                            <p className="text-[10px] text-blue-400">M.O.: {R(os.laborAmount)}</p>
                          )}
                          {Boolean(os.discountAmount && os.discountAmount > 0) && (
                            <p className="text-[10px] text-amber-400 font-medium">Desc: -{R(os.discountAmount!)}</p>
                          )}
                        </div>

                        <button
                          onClick={() => handleImportarOs(os.id)}
                          disabled={importandoEste}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0 ${
                            jaFaturada
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50'
                          }`}
                        >
                          <span>{importandoEste ? 'Carregando…' : 'Importar para PDV →'}</span>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowOsModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function parseDesconto(subtotal: number, s: string): number {
  const str = String(s).trim()
  if (!str) return 0
  if (str.endsWith('%')) {
    const pct = parseFloat(str.slice(0, -1).replace(',', '.'))
    if (isNaN(pct) || pct <= 0) return 0
    return Math.round((subtotal * pct / 100) * 100) / 100
  }
  const val = parseFloat(str.replace(',', '.'))
  return isNaN(val) || val <= 0 ? 0 : val
}
