import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { ProdutoPdv, ClientePdv } from '../types'
import { useAuth } from '../contexts/AuthContext'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface CartItem {
  produto: ProdutoPdv
  quant: number
  valor: number
}

interface Pagamento {
  dinheiro: string
  cartao: string
  cheque: string
  carne: string
  ticket: string
}

const PAG_VAZIO: Pagamento = { dinheiro: '', cartao: '', cheque: '', carne: '', ticket: '' }

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

  const { mutate: finalizar, isPending: finalizando } = useMutation({
    mutationFn: () => {
      const itens = cart.map(c => ({ id_produto: c.produto.id, valor: c.valor, quant: c.quant }))
      const pag = {
        vr_dinheiro: parseNum(pagamento.dinheiro),
        vr_cartao:   parseNum(pagamento.cartao),
        vr_cheque:   parseNum(pagamento.cheque),
        vr_carne:    parseNum(pagamento.carne),
        vr_ticket:   parseNum(pagamento.ticket),
        vr_adicional: -(parseNum(desconto)),
        id_cliente: cliente?.id ?? 0,
        itens,
      }
      return erpApi.criarVenda(pag)
    },
    onSuccess: (data) => {
      setSucesso(data.controle)
      setCart([])
      setPagamento(PAG_VAZIO)
      setDesconto('')
      setCliente(null)
      setBusca('')
      setBuscaCliente('')
      setShowPagamento(false)
      qc.invalidateQueries({ queryKey: ['erp-dashboard'] })
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
  const descontoVal = parseNum(desconto)
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
    <div className="flex gap-6 h-[calc(100vh-3rem)] max-w-[1400px]">

      {/* ── COLUNA ESQUERDA: busca + carrinho ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {sucesso && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl px-5 py-3 text-green-300 text-sm font-medium">
            ✅ Venda finalizada! Controle: <strong className="font-mono">{sucesso}</strong>
          </div>
        )}

        {/* Busca produto */}
        <div className="relative">
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

        {/* Carrinho */}
        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Itens ({cart.length})
            </h2>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-300">
                Limpar tudo
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
              Nenhum item. Busque um produto acima.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="px-4 py-2 text-left">Produto</th>
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
                        <p className="text-xs text-slate-500 font-mono">{c.produto.cod_barra}</p>
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
                      <td className="px-4 py-2 text-right font-semibold text-emerald-400">
                        {R(c.valor * c.quant)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => remover(idx)} className="text-slate-600 hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── COLUNA DIREITA: cliente + totais + pagamento ── */}
      <div className="w-80 shrink-0 flex flex-col gap-4">

        {/* Cliente */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cliente</p>
          {cliente ? (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{cliente.nome_cliente}</p>
                <p className="text-xs text-slate-400">{cliente.cpf_cnpj || cliente.telefone || 'Sem contato'}</p>
              </div>
              <button onClick={() => { setCliente(null); setBuscaCliente('') }} className="text-slate-500 hover:text-red-400 text-xs mt-0.5">✕</button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={buscaCliente}
                onChange={e => setBuscaCliente(e.target.value)}
                placeholder="Buscar cliente (opcional)…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              {buscaCliente.length >= 2 && (clientes ?? []).length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                  {(clientes ?? []).map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setCliente(c); setBuscaCliente('') }}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-700 border-b border-slate-700/50 last:border-0"
                    >
                      <p className="text-sm text-white">{c.nome_cliente}</p>
                      <p className="text-xs text-slate-400">{c.cpf_cnpj || c.telefone}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Totais */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Resumo</p>

          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Subtotal</span>
            <span className="text-slate-200 font-medium">{R(subtotal)}</span>
          </div>

          <div className="flex items-center justify-between text-sm gap-2">
            <span className="text-slate-400 shrink-0">Desconto</span>
            <input
              value={desconto}
              onChange={e => setDesconto(e.target.value)}
              placeholder="0,00"
              className="w-24 text-right bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-amber-400 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {descontoVal > 0 && (
            <div className="flex justify-between text-xs text-amber-500">
              <span>Desconto aplicado</span>
              <span>− {R(descontoVal)}</span>
            </div>
          )}

          <div className="border-t border-slate-700 pt-3 flex justify-between">
            <span className="text-base font-bold text-white">Total</span>
            <span className="text-xl font-bold text-emerald-400">{R(total)}</span>
          </div>
        </div>

        {/* Pagamento */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pagamento</p>

          {[
            { key: 'dinheiro' as const, label: '💵 Dinheiro' },
            { key: 'cartao'   as const, label: '💳 Cartão' },
            { key: 'cheque'   as const, label: '📄 Cheque' },
            { key: 'carne'    as const, label: '📒 Carnê' },
            { key: 'ticket'   as const, label: '🎫 Ticket' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-400 w-24 shrink-0">{label}</span>
              <input
                value={pagamento[key]}
                onChange={e => setPagamento(p => ({ ...p, [key]: e.target.value }))}
                placeholder="0,00"
                className="flex-1 text-right bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}

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
          className="w-full py-4 rounded-2xl text-base font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {finalizando ? 'Processando…' : `✅ Finalizar Venda · ${R(total)}`}
        </button>

        {!podeFinalizar && cart.length > 0 && totalPagto < total && (
          <p className="text-xs text-red-400 text-center -mt-2">
            Faltam {R(total - totalPagto)} para cobrir o total
          </p>
        )}
      </div>
    </div>
  )
}

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(',', '.'))
  return isNaN(n) ? 0 : n
}
