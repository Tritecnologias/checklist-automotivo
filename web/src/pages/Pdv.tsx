import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal, Lock, Wallet, ArrowRight } from 'lucide-react'
import { api, erpApi } from '../lib/api'
import type { ProdutoPdv, ClientePdv, OsEncerradaPdv } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { printThermalReceipt, type ThermalReceiptData } from '../lib/thermalPrint'

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
  outros: string
}

const PAG_VAZIO: Pagamento = { dinheiro: '', cartao: '', pix: '', nota: '', outros: '' }

export default function Pdv() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentTenant, user } = useAuth()
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
  const [vendaRecente, setVendaRecente] = useState<ThermalReceiptData | null>(null)
  const [avisosEstoqueVenda, setAvisosEstoqueVenda] = useState<string[] | null>(null)

  // ── Autorização de Desconto (> 4%) ─────────────────────────────────────────
  const [autorizacaoAdmin, setAutorizacaoAdmin] = useState<{
    supervisorName: string
    pin: string
    valorAutorizado: number
  } | null>(null)
  const [showPinModal, setShowPinModal] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [verificandoPin, setVerificandoPin] = useState(false)

  // ── Estado de Integração com OS Encerradas ──────────────────────────────────
  const [showOsModal, setShowOsModal]               = useState(false)
  const [buscaOs, setBuscaOs]                       = useState('')
  const [apenasPendentesOs, setApenasPendentesOs]   = useState(true)
  const [osImportada, setOsImportada]               = useState<{ id: string; plate: string; model: string } | null>(null)
  const [importandoOsId, setImportandoOsId]         = useState<string | null>(null)
  const [osFeedback, setOsFeedback]                 = useState<string | null>(null)

  const { data: statusCaixa, isLoading: carregandoCaixa } = useQuery({
    queryKey: ['caixa-status', tid],
    queryFn: erpApi.caixaStatus,
    refetchInterval: 15_000,
  })

  const isCaixaAberto = Boolean(statusCaixa && statusCaixa.aberto && statusCaixa.id)

  const { data: parametros } = useQuery({
    queryKey: ['pdv-parametros', tid],
    queryFn: erpApi.obterParametrosPdv,
  })
  const limiteDescontoPct = Number(parametros?.limite_desconto_padrao ?? 4.0)

  const { data: produtos, isFetching: buscando } = useQuery({
    queryKey: ['pdv-produtos', tid, busca],
    queryFn: () => erpApi.buscaProdutos(busca),
    enabled: isCaixaAberto && busca.length >= 2,
    placeholderData: [],
  })

  const { data: clientes } = useQuery({
    queryKey: ['pdv-clientes', tid, buscaCliente],
    queryFn: () => erpApi.buscaClientes(buscaCliente),
    enabled: isCaixaAberto && buscaCliente.length >= 2,
    placeholderData: [],
  })

  // Query para busca de OS encerradas no modal
  const { data: ordensEncerradas = [], isFetching: buscandoOs, refetch: refetchOs } = useQuery({
    queryKey: ['pdv-os-encerradas', tid, buscaOs, apenasPendentesOs],
    queryFn: () => erpApi.listarOsEncerradas({ search: buscaOs, apenasPendentes: apenasPendentesOs }),
    enabled: isCaixaAberto && showOsModal,
  })

  const handleImportarOs = async (osId: string) => {
    if (!isCaixaAberto) {
      alert('O caixa está fechado. Abra o caixa antes de importar Ordens de Serviço para o PDV.')
      return
    }
    try {
      setImportandoOsId(osId)
      const dados = await erpApi.carregarOsPdv(osId)

      if (dados.order?.vendaControle) {
        alert(`Esta OS já foi finalizada no caixa na Venda #${dados.order.vendaControle} e não pode ser finalizada novamente nem zerada.`)
        return
      }

      if (!dados.itens || dados.itens.length === 0) {
        alert('Esta Ordem de Serviço não possui itens válidos para faturamento.')
        return
      }

      const totalItens = dados.itens.reduce((sum: number, it: any) => sum + (it.valor * it.quant), 0)
      if (totalItens <= 0) {
        alert('Esta Ordem de Serviço possui valor total zerado (R$ 0,00) e não pode ser faturada no caixa.')
        return
      }

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

  // Auto-importar OS quando redirecionado da Finalização da OS (?osId=...)
  useEffect(() => {
    const osIdParam = searchParams.get('osId')
    if (osIdParam && isCaixaAberto && !importandoOsId && cart.length === 0) {
      handleImportarOs(osIdParam)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('osId')
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, isCaixaAberto])

  const { mutate: finalizar, isPending: finalizando } = useMutation({
    mutationFn: () => {
      if (!isCaixaAberto) {
        throw new Error('O caixa está fechado. Abra o caixa antes de realizar vendas no PDV.')
      }
      if (total <= 0) {
        throw new Error('O valor total da venda não pode ser zerado (R$ 0,00).')
      }
      const itens = cart.map(c => ({ id_produto: c.produto.id, valor: c.valor, quant: c.quant }))
      const outrosVal = parseNum(pagamento.outros)
      const pag = {
        vr_dinheiro: parseNum(pagamento.dinheiro),
        vr_cartao:   parseNum(pagamento.cartao),
        vr_pix:      parseNum(pagamento.pix),
        vr_nota:     parseNum(pagamento.nota),
        vr_outros:   outrosVal,
        vr_adicional: -(descontoVal),
        id_cliente: cliente?.id ?? 0,
        itens,
        id_os: osImportada?.id,
        supervisor_pin: autorizacaoAdmin?.pin,
      }

      // Prepara snapshot da venda para impressão térmica
      const snapshot: ThermalReceiptData = {
        empresa: currentTenant?.nome || '4Rodas Centro Automotivo',
        controle: '',
        dataHora: new Date().toLocaleString('pt-BR'),
        cliente: cliente ? {
          nome: cliente.nome_cliente,
          documento: cliente.cpf_cnpj,
          telefone: cliente.telefone || cliente.celular,
        } : null,
        os: osImportada ? {
          plate: osImportada.plate,
          model: osImportada.model,
        } : null,
        itens: cart.length > 0
          ? cart.map(c => ({
              nome: c.produto.nome_produto,
              quant: c.quant,
              valorUnit: c.valor,
              total: c.valor * c.quant,
            }))
          : [
              {
                nome: 'LANÇAMENTO AVULSO (OUTROS)',
                quant: 1,
                valorUnit: outrosVal,
                total: outrosVal,
              },
            ],
        subtotal,
        desconto: descontoVal,
        total,
        pagamentos: [
          { nome: 'Dinheiro', valor: parseNum(pagamento.dinheiro) },
          { nome: 'Cartão', valor: parseNum(pagamento.cartao) },
          { nome: 'PIX CNPJ', valor: parseNum(pagamento.pix) },
          { nome: 'NOTA', valor: parseNum(pagamento.nota) },
          { nome: 'Outros', valor: outrosVal },
        ].filter(p => p.valor > 0),
        troco,
      }

      return erpApi.criarVenda(pag).then(res => ({ ...res, snapshot }))
    },
    onSuccess: (data) => {
      setSucesso(data.controle)
      if (data.snapshot) {
        data.snapshot.controle = data.controle
        setVendaRecente(data.snapshot)
      }
      if (data.avisos_estoque && data.avisos_estoque.length > 0) {
        setAvisosEstoqueVenda(data.avisos_estoque)
      }
      setCart([])
      setPagamento(PAG_VAZIO)
      setDesconto('')
      setAutorizacaoAdmin(null)
      setCliente(null)
      setOsImportada(null)
      setBusca('')
      setBuscaCliente('')
      setShowPagamento(false)
      qc.invalidateQueries({ queryKey: ['erp-dashboard'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['pdv-produtos'] })
      qc.invalidateQueries({ queryKey: ['pdv-os-encerradas'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      searchRef.current?.focus()
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
      if (novo <= 0) {
        const filtered = prev.filter((_, i) => i !== idx)
        if (filtered.length === 0) setOsImportada(null)
        return filtered
      }
      next[idx] = { ...next[idx], quant: novo }
      return next
    })
  }

  const alterarValor = (idx: number, val: string) => {
    setCart(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], valor: Math.max(0, parseFloat(val.replace(',', '.')) || 0) }
      return next
    })
  }

  const remover = (idx: number) => {
    setCart(prev => {
      const next = prev.filter((_, i) => i !== idx)
      if (next.length === 0) setOsImportada(null)
      return next
    })
  }

  const cartSubtotal = cart.reduce((s, c) => s + c.valor * c.quant, 0)
  const outrosVal = parseNum(pagamento.outros)
  const isVendaAvulsa = cart.length === 0 && outrosVal > 0
  const subtotal = cart.length > 0 ? cartSubtotal : outrosVal
  const descontoVal = parseDesconto(subtotal, desconto)
  const limiteDescontoPermitido = Math.round((subtotal * (limiteDescontoPct / 100)) * 100) / 100
  const excedeLimiteDesconto = subtotal > 0 && descontoVal > (limiteDescontoPermitido + 0.005)
  const pctDesconto = subtotal > 0 ? (descontoVal / subtotal) * 100 : 0
  const isDescontoAutorizado = !excedeLimiteDesconto || (
    user?.role === 'owner' ||
    (autorizacaoAdmin !== null && autorizacaoAdmin.valorAutorizado >= descontoVal)
  )
  const total = Math.max(0, subtotal - descontoVal)
  const totalPagto = Object.values(pagamento).reduce((s, v) => s + parseNum(v), 0)
  const troco = Math.max(0, totalPagto - total)
  const pagtoCobreTotal = (cart.length > 0 && totalPagto >= total) || (isVendaAvulsa && totalPagto >= total)
  const podeFinalizar = pagtoCobreTotal && isDescontoAutorizado && total > 0 && isCaixaAberto
  const itensComAlertaEstoque = cart.filter(
    c => !c.produto.is_service && c.produto.controla_estoque !== 0 && (c.produto.estoque <= 0 || c.quant > c.produto.estoque)
  )

  const handlePinSubmit = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setPinError('O PIN deve conter exatamente 4 dígitos.')
      return
    }
    setVerificandoPin(true)
    setPinError('')
    try {
      const res = await api.verifySupervisorPin(pin)
      if (res.authorized) {
        setAutorizacaoAdmin({
          supervisorName: res.supervisorName || 'Supervisor',
          pin,
          valorAutorizado: descontoVal,
        })
        setShowPinModal(false)
        setPin('')
        setPinError('')
      } else {
        setPinError('PIN inválido. Somente administradores podem autorizar descontos.')
      }
    } catch (err: any) {
      setPinError(err?.message || 'Erro ao validar PIN. Tente novamente.')
    } finally {
      setVerificandoPin(false)
    }
  }

  if (carregandoCaixa) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Verificando status do caixa...</p>
      </div>
    )
  }

  if (!isCaixaAberto) {
    const ultimo = statusCaixa?.ultimo_caixa_fechado
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] px-4">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div className="relative inline-flex items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 text-3xl shadow-inner">
              <Lock className="w-10 h-10" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
            </span>
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              Caixa Fechado
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">PDV Bloqueado</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              O caixa desta loja está atualmente fechado. Para utilizar o PDV, realizar vendas no balcão ou importar Ordens de Serviço (OS), é obrigatório realizar a abertura do caixa.
            </p>
          </div>

          {ultimo && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-left space-y-2.5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Última Sessão Encerrada</p>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Data e Hora:</span>
                <span className="text-slate-200 font-mono font-medium">
                  {fmtDate(`${ultimo.data_fechamento}T${ultimo.hora_fechamento || '00:00:00'}`)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Total Fechado:</span>
                <span className="text-emerald-400 font-bold font-mono">
                  {R(ultimo.vr_fechamento || ultimo.vr_fechado_turno || 0)}
                </span>
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-col gap-3">
            <Link
              to="/erp/caixa"
              className="w-full py-3.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-950/50 transition-all flex items-center justify-center gap-2 group"
            >
              <Wallet className="w-4 h-4 transition-transform group-hover:scale-110" />
              <span>Abrir Caixa Agora</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              to="/erp"
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors text-center"
            >
              Voltar ao Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-5.5rem)] max-w-[1400px]">

      {/* ── COLUNA ESQUERDA: busca + carrinho ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {sucesso && (
          <div className="bg-emerald-950/70 border border-emerald-500/80 rounded-2xl px-5 py-3.5 text-emerald-200 text-sm font-medium flex items-center justify-between gap-4 flex-wrap shadow-xl shadow-emerald-950/50">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-white font-bold text-sm">Venda finalizada com sucesso!</p>
                <p className="text-xs text-emerald-300 font-mono">
                  Controle: <strong className="text-white">{sucesso}</strong>
                  {vendaRecente && <> · Total: <strong className="text-white">{R(vendaRecente.total)}</strong></>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {vendaRecente && (
                <button
                  type="button"
                  onClick={() => printThermalReceipt(vendaRecente)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/50 transition-all hover:scale-105 active:scale-95"
                >
                  <span>🖨️</span>
                  <span>Imprimir Comprovante</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => { setSucesso(null); setVendaRecente(null); }}
                className="text-emerald-400 hover:text-white text-xs px-2.5 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 rounded-lg transition-colors"
                title="Fechar aviso"
              >
                ✕
              </button>
            </div>
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
                        {p.is_service ? (
                          <span className="text-[10px] text-indigo-400 font-medium">Serviço</span>
                        ) : p.controla_estoque === 0 ? (
                          <span className="text-[10px] text-purple-400 font-medium font-mono">∞ Estoque Livre</span>
                        ) : (
                          <p className={`text-xs ${p.estoque <= 0 ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
                            {p.estoque <= 0 ? '⚠️ Sem estoque' : `Estq: ${p.estoque}`}
                          </p>
                        )}
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
              if (!isCaixaAberto) {
                alert('O caixa está fechado. Abra o caixa antes de importar Ordens de Serviço para o PDV.')
                return
              }
              setShowOsModal(true)
              refetchOs()
            }}
            disabled={!isCaixaAberto}
            className={`px-4 py-3 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shrink-0 shadow-lg ${
              !isCaixaAberto
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-slate-700/50'
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-950/40'
            }`}
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
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm gap-2 p-6">
              {outrosVal > 0 ? (
                <div className="bg-purple-950/40 border border-purple-500/40 rounded-2xl p-6 text-center space-y-2 max-w-sm w-full shadow-lg">
                  <span className="text-3xl">🔄</span>
                  <p className="text-white font-bold text-base">Lançamento Avulso (Outros)</p>
                  <p className="text-3xl font-black text-emerald-400 font-mono">
                    {R(outrosVal)}
                  </p>
                  <p className="text-xs text-purple-200/80">
                    Valor informado no campo Outros. Pronto para finalizar a venda sem OS ou orçamento.
                  </p>
                </div>
              ) : (
                <>
                  <p>Nenhum item no carrinho.</p>
                  <p className="text-xs text-slate-600">Busque um produto acima, importe uma OS ou lance um valor em Outros.</p>
                </>
              )}
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-slate-200 text-sm font-medium">{c.produto.nome_produto}</p>
                          {c.produto.is_service ? (
                            <span className="text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 rounded px-1.5 py-0.5">
                              Serviço
                            </span>
                          ) : c.produto.controla_estoque === 0 ? (
                            <span className="text-[10px] bg-purple-950/70 text-purple-300 border border-purple-800/60 rounded px-1.5 py-0.5 font-semibold">
                              ∞ Estoque Livre
                            </span>
                          ) : c.produto.estoque <= 0 ? (
                            <span className="text-[10px] bg-red-900/60 text-red-300 border border-red-700/60 rounded px-1.5 py-0.5 font-semibold">
                              ⚠️ Sem estoque (0)
                            </span>
                          ) : c.quant > c.produto.estoque ? (
                            <span className="text-[10px] bg-amber-900/60 text-amber-300 border border-amber-700/60 rounded px-1.5 py-0.5 font-semibold">
                              ⚠️ Qtd ({c.quant}) &gt; Estoque ({c.produto.estoque})
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono">
                              Estq: {c.produto.estoque}
                            </span>
                          )}
                        </div>
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
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cliente</p>
            {cliente && osImportada && (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span>✓</span>
                <span>Dados Conferidos</span>
              </span>
            )}
          </div>
          {cliente ? (
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700/80 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate" title={cliente.nome_cliente}>
                    {cliente.nome_cliente}
                  </p>
                  <p className="text-xs text-slate-300 font-mono">
                    {cliente.cpf_cnpj ? `CPF/CNPJ: ${cliente.cpf_cnpj}` : 'Sem documento'}
                  </p>
                </div>
                <button
                  onClick={() => setCliente(null)}
                  className="text-slate-400 hover:text-red-400 text-xs p-1 rounded hover:bg-slate-700 transition-colors"
                  title="Remover cliente da venda"
                >
                  ✕
                </button>
              </div>

              {(cliente.telefone || cliente.celular) && (
                <p className="text-xs text-slate-300 flex items-center gap-1.5 font-mono">
                  <span className="text-slate-400">📞</span>
                  <span>{cliente.celular || cliente.telefone}</span>
                </p>
              )}

              {(cliente.endereco || cliente.cep) && (
                <div className="text-xs text-slate-400 pt-1.5 border-t border-slate-700/60 space-y-0.5">
                  {cliente.endereco && (
                    <p className="line-clamp-2 text-slate-300">
                      <span className="text-slate-400">📍</span> {cliente.endereco}
                    </p>
                  )}
                  {cliente.cep && (
                    <p className="font-mono text-[11px] text-slate-400">CEP: {cliente.cep}</p>
                  )}
                </div>
              )}
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
            <span className="flex items-center gap-1.5">
              <span>Desconto</span>
              <span className="text-[10px] text-slate-500">(R$ ou %)</span>
              {(user?.role === 'owner' || user?.role === 'manager') && (
                <Link
                  to="/erp/config/parametros"
                  title={`Configurar limite de desconto padrão (atual: ${limiteDescontoPct}%)`}
                  className="inline-flex items-center gap-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded transition-all border border-slate-700/60"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>{limiteDescontoPct}%</span>
                </Link>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              {descontoVal > 0 && (
                <span className={`text-xs font-mono font-medium ${
                  excedeLimiteDesconto
                    ? (isDescontoAutorizado ? 'text-emerald-400' : 'text-amber-400')
                    : 'text-slate-400'
                }`}>
                  (-{R(descontoVal)}{desconto.trim().endsWith('%') ? '' : ` · ${pctDesconto.toFixed(1)}%`})
                </span>
              )}
              <input
                value={desconto}
                onChange={e => {
                  const val = e.target.value
                  setDesconto(val)
                  if (autorizacaoAdmin) {
                    const novoVal = parseDesconto(subtotal, val)
                    if (novoVal > autorizacaoAdmin.valorAutorizado) {
                      setAutorizacaoAdmin(null)
                    }
                  }
                }}
                placeholder={`0,00 ou ${limiteDescontoPct}%`}
                className={`w-28 text-right bg-slate-800 border rounded px-2 py-0.5 text-white text-sm focus:outline-none font-mono transition-colors ${
                  excedeLimiteDesconto && !isDescontoAutorizado
                    ? 'border-amber-500/80 focus:border-amber-400 text-amber-200'
                    : 'border-slate-700 focus:border-blue-500'
                }`}
              />
            </div>
          </div>

          {/* Aviso / Status de Autorização de Desconto */}
          {excedeLimiteDesconto && (
            <div className={`p-2.5 rounded-xl text-xs border flex items-center justify-between gap-2 transition-all ${
              isDescontoAutorizado
                ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-300'
                : 'bg-amber-950/40 border-amber-600/50 text-amber-300'
            }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm">{isDescontoAutorizado ? '✅' : '🔒'}</span>
                <span className="truncate">
                  {isDescontoAutorizado
                    ? `Desconto de ${pctDesconto.toFixed(1)}% autorizado por ${user?.role === 'owner' ? 'Owner' : autorizacaoAdmin?.supervisorName || 'Administrador'}`
                    : `Desconto de ${pctDesconto.toFixed(1)}% acima de ${limiteDescontoPct}% (máx: ${R(limiteDescontoPermitido)})`}
                </span>
              </div>
              {!isDescontoAutorizado && (
                <button
                  type="button"
                  onClick={() => {
                    setPin('')
                    setPinError('')
                    setShowPinModal(true)
                  }}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white rounded-lg text-[11px] font-bold shrink-0 transition-all shadow-sm shadow-amber-950/40 flex items-center gap-1"
                >
                  <span>🔑</span>
                  <span>Autorizar</span>
                </button>
              )}
            </div>
          )}

          <div className="border-t border-slate-800 pt-2 flex justify-between text-base font-bold text-white">
            <span>Total</span>
            <span className="text-emerald-400 text-xl font-black">{R(total)}</span>
          </div>
        </div>

        {/* Formas de pagamento */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-2.5 flex-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pagamento</p>

          {(['dinheiro', 'cartao', 'pix', 'nota', 'outros'] as (keyof Pagamento)[]).map(key => {
            const labels: Record<keyof Pagamento, string> = {
              dinheiro: '💵 Dinheiro',
              cartao:   '💳 Cartão',
              pix:      '⚡ PIX CNPJ',
              nota:     '📝 NOTA',
              outros:   '🔄 Outros',
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

        {itensComAlertaEstoque.length > 0 && (
          <div className="bg-amber-950/50 border border-amber-600/70 rounded-xl p-3 text-amber-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
              <span>⚠️</span>
              <span>Atenção: Saldo de estoque insuficiente</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              {itensComAlertaEstoque.length} produto(s) no carrinho estão sem estoque ou com quantidade superior ao saldo na loja. A venda pode ser realizada normalmente.
            </p>
          </div>
        )}

        {/* Botão finalizar */}
        <button
          onClick={() => {
            if (total <= 0) {
              alert('O valor total da venda não pode ser zerado (R$ 0,00).')
              return
            }
            if (excedeLimiteDesconto && !isDescontoAutorizado) {
              setPin('')
              setPinError('')
              setShowPinModal(true)
              return
            }
            finalizar()
          }}
          disabled={!pagtoCobreTotal || total <= 0 || finalizando}
          className={`w-full py-4 rounded-2xl text-base font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg active:scale-[0.99] ${
            total <= 0
              ? 'bg-slate-800 text-slate-500 border border-slate-700/60'
              : excedeLimiteDesconto && !isDescontoAutorizado
              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
          }`}
        >
          {finalizando
            ? 'Processando…'
            : total <= 0
            ? '⚠️ Venda Zerada (R$ 0,00) não permitida'
            : excedeLimiteDesconto && !isDescontoAutorizado
            ? `🔒 Autorizar Desconto (> ${limiteDescontoPct}%) e Finalizar · ${R(total)}`
            : `✅ Finalizar Venda · ${R(total)}`}
        </button>

        {!pagtoCobreTotal && cart.length > 0 && totalPagto < total && (
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
                              🔒 Finalizada no Caixa (#{os.vendaControle})
                            </span>
                          ) : os.totalAmount <= 0 ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800/60">
                              ⚠️ OS Zerada (R$ 0,00)
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

                        {os.client?.name && (
                          <div className="text-xs text-slate-300 space-y-0.5">
                            <p className="font-medium text-indigo-300 flex items-center gap-1.5">
                              <span>👤</span> {os.client.name}
                              {os.client.phone && <span className="text-slate-400 font-mono">({os.client.phone})</span>}
                            </p>
                            {(os.client.document || os.client.address || os.client.cep) && (
                              <p className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2">
                                {os.client.document && (
                                  <span className="font-mono text-slate-300">Doc: {os.client.document}</span>
                                )}
                                {os.client.address && (
                                  <span>&bull; {os.client.address}</span>
                                )}
                                {os.client.cep && (
                                  <span className="font-mono text-slate-400">({os.client.cep})</span>
                                )}
                              </p>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-slate-500">
                          Encerrada em: {fmtDate(os.closedAt || os.updatedAt)} &middot; {os.totalItens} item(ns)
                        </p>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-right">
                          <p className="text-xs text-slate-400">{jaFaturada ? 'Total Faturado' : 'Total da OS'}</p>
                          <p className={`text-lg font-bold ${jaFaturada ? 'text-slate-400' : 'text-emerald-400'}`}>{R(os.totalAmount)}</p>
                          {os.laborAmount > 0 && (
                            <p className="text-[10px] text-blue-400">M.O.: {R(os.laborAmount)}</p>
                          )}
                          {Boolean(os.discountAmount && os.discountAmount > 0) && (
                            <p className="text-[10px] text-amber-400 font-medium">Desc: -{R(os.discountAmount!)}</p>
                          )}
                        </div>

                        {jaFaturada ? (
                          <button
                            type="button"
                            disabled
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed flex items-center gap-1.5 shrink-0"
                            title={`Esta OS já foi finalizada na Venda #${os.vendaControle} e não pode ser finalizada novamente.`}
                          >
                            <span>🔒 Já Finalizada</span>
                          </button>
                        ) : os.totalAmount <= 0 ? (
                          <button
                            type="button"
                            disabled
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed flex items-center gap-1.5 shrink-0"
                            title="Esta OS está zerada (R$ 0,00) e não pode ser faturada."
                          >
                            <span>⚠️ OS Zerada</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleImportarOs(os.id)}
                            disabled={importandoEste || !isCaixaAberto}
                            title={!isCaixaAberto ? 'O caixa está fechado. Abra o caixa antes de importar.' : undefined}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50 transition-all shadow-md flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span>{importandoEste ? 'Carregando…' : 'Importar para PDV →'}</span>
                          </button>
                        )}
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

      {/* ── MODAL: AVISOS DE ESTOQUE APÓS VENDA ── */}
      {avisosEstoqueVenda && avisosEstoqueVenda.length > 0 && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-amber-500 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="text-base font-bold text-white">Alerta de Estoque</h3>
                <p className="text-xs text-amber-400/80">Venda finalizada com produtos sem estoque na loja</p>
              </div>
            </div>
            <p className="text-xs text-slate-300">
              A venda foi registrada com sucesso, mas os seguintes itens apresentaram pendência de estoque na loja:
            </p>
            <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-3 space-y-2 max-h-56 overflow-y-auto">
              {avisosEstoqueVenda.map((aviso, i) => (
                <div key={i} className="text-xs text-amber-200 flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span>{aviso}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setAvisosEstoqueVenda(null)}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-amber-950/40"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: AUTORIZAÇÃO DE DESCONTO (> {limiteDescontoPct}%) ── */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔒</span>
              <div>
                <h2 className="text-lg font-bold text-white">Autorização de Desconto</h2>
                <p className="text-xs text-slate-400">Requer permissão de Administrador</p>
              </div>
            </div>

            <p className="text-slate-300 text-xs mb-3 leading-relaxed">
              O desconto aplicado de <strong className="text-amber-400 font-mono">{R(descontoVal)} ({pctDesconto.toFixed(1)}%)</strong> excede o limite máximo padrão de <strong>{limiteDescontoPct.toFixed(1).replace('.', ',')}% ({R(limiteDescontoPermitido)})</strong>.
            </p>

            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800 text-xs space-y-1.5 mb-4">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal da Venda:</span>
                <span className="text-slate-200 font-mono font-semibold">{R(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Desconto Solicitado:</span>
                <span className="text-amber-400 font-mono font-bold">{R(descontoVal)} ({pctDesconto.toFixed(1)}%)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Limite sem PIN ({limiteDescontoPct}%):</span>
                <span className="text-slate-400 font-mono">{R(limiteDescontoPermitido)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-1 text-slate-300">
                <span>Novo Total da Venda:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">{R(total)}</span>
              </div>
            </div>

            <p className="text-slate-300 text-xs font-semibold mb-2">
              Digite o PIN do Administrador (4 dígitos):
            </p>

            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                setPinError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && pin.length === 4 && handlePinSubmit()}
              placeholder="••••"
              className="w-full bg-slate-800 border border-slate-700 text-white text-center text-2xl tracking-[0.5em] placeholder-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 mb-2 font-mono"
              autoFocus
            />

            {pinError && (
              <p className="text-red-400 text-xs mb-3 font-medium flex items-center gap-1">
                <span>⚠️</span>
                <span>{pinError}</span>
              </p>
            )}

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowPinModal(false)
                  setPin('')
                  setPinError('')
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePinSubmit}
                disabled={verificandoPin || pin.length < 4}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-bold disabled:opacity-50 transition-all shadow-md shadow-amber-950/40"
              >
                {verificandoPin ? 'Validando…' : 'Autorizar'}
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
