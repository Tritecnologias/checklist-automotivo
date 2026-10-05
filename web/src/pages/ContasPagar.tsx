import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { ContaPagar } from '../types'
import { useAuth } from '../contexts/AuthContext'
import {
  TrendingDown, CheckCircle2, Clock, AlertTriangle,
  CreditCard, Banknote, Zap, FileText, Calendar, X, Plus,
  Edit2, Trash2, RotateCcw, Building2, Tag, ShieldCheck, DollarSign
} from 'lucide-react'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const dateStr = String(d).split('T')[0]
  if (dateStr.includes('-')) {
    const [ano, mes, dia] = dateStr.split('-')
    if (ano && mes && dia) {
      return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`
    }
  }
  const parsed = new Date(d)
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR')
}

const STATUS_OPTS = [
  { value: '',  label: 'Todos' },
  { value: '0', label: 'A Pagar (Em aberto)' },
  { value: '1', label: 'Pagas' },
]

const FORMAS_OPTS = [
  { value: '',         label: 'Todas as formas' },
  { value: 'boleto',   label: '📄 Boleto' },
  { value: 'pix',      label: '⚡ PIX' },
  { value: 'dinheiro', label: '💵 Dinheiro' },
  { value: 'cartao',   label: '💳 Cartão' },
  { value: 'outros',   label: '🔄 Outros' },
]

const FORMAS_CADASTRO = [
  { id: 1,  label: '💵 Dinheiro (Caixa)' },
  { id: 11, label: '⚡ PIX' },
  { id: 4,  label: '📄 Boleto Bancário' },
  { id: 6,  label: 'Cartão de Débito' },
  { id: 7,  label: 'Cartão de Crédito' },
  { id: 2,  label: 'Cheque' },
  { id: 8,  label: 'Outros' },
]

const getDatesPreset = (preset: string) => {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${y}-${pad(m + 1)}-${pad(now.getDate())}`

  if (preset === 'hoje') {
    return { inicio: today, fim: today }
  }
  if (preset === '7dias') {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return {
      inicio: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      fim: today,
    }
  }
  if (preset === 'mes') {
    const inicio = `${y}-${pad(m + 1)}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const fim = `${y}-${pad(m + 1)}-${pad(lastDay)}`
    return { inicio, fim }
  }
  if (preset === 'mes_anterior') {
    const prevMonth = new Date(y, m - 1, 1)
    const py = prevMonth.getFullYear()
    const pm = prevMonth.getMonth()
    const inicio = `${py}-${pad(pm + 1)}-01`
    const lastDay = new Date(py, pm + 1, 0).getDate()
    const fim = `${py}-${pad(pm + 1)}-${pad(lastDay)}`
    return { inicio, fim }
  }
  return { inicio: '', fim: '' }
}

export default function ContasPagar() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const qc = useQueryClient()

  const [status, setStatus] = useState('0')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  // Filtros
  const [dataPreset, setDataPreset]   = useState<string>('')
  const [dataInicio, setDataInicio]   = useState('')
  const [dataFim, setDataFim]         = useState('')
  const [formaPagto, setFormaPagto]   = useState<string>('')
  const [categoriaId, setCategoriaId] = useState<number | undefined>(undefined)

  // Modais
  const [modalNovo, setModalNovo]           = useState(false)
  const [modalPagar, setModalPagar]         = useState<ContaPagar | null>(null)
  const [modalEditar, setModalEditar]       = useState<ContaPagar | null>(null)
  const [confirmDeleteId, setConfirmDelete] = useState<number | null>(null)

  // Form Nova Conta
  const [formDescricao, setFormDescricao]     = useState('')
  const [formFavorecido, setFormFavorecido]   = useState('')
  const [formValor, setFormValor]             = useState('')
  const [formVencimento, setFormVencimento]   = useState(new Date().toISOString().slice(0, 10))
  const [formCategoria, setFormCategoria]     = useState<number>(4)
  const [formModo, setFormModo]               = useState<number>(1)
  const [formDocumento, setFormDocumento]     = useState('')
  const [formParcelas, setFormParcelas]       = useState(1)
  const [formPagoAgora, setFormPagoAgora]     = useState(false)
  const [formErro, setFormErro]               = useState<string | null>(null)

  // Form Baixa / Pagar
  const [baixaData, setBaixaData] = useState(new Date().toISOString().slice(0, 10))
  const [baixaModo, setBaixaModo] = useState<number>(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const aplicarPreset = (p: string) => {
    setDataPreset(p)
    const { inicio, fim } = getDatesPreset(p)
    setDataInicio(inicio)
    setDataFim(fim)
    setPage(1)
  }

  const limparDatas = () => {
    setDataPreset('')
    setDataInicio('')
    setDataFim('')
    setPage(1)
  }

  const toggleForma = (forma: string) => {
    setFormaPagto(prev => (prev === forma ? '' : forma))
    setPage(1)
  }

  // Queries
  const { data: res, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['contas-pagar', tid, status, debouncedSearch, dataInicio, dataFim, formaPagto, categoriaId, page],
    queryFn: () => erpApi.contasPagar({
      status,
      search: debouncedSearch,
      data_inicio: dataInicio,
      data_fim: dataFim,
      forma_pagto: formaPagto,
      categoria: categoriaId,
      page,
    }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })

  const { data: categorias = [] } = useQuery({
    queryKey: ['contas-pagar-categorias'],
    queryFn: erpApi.categoriasContasPagar,
  })

  const { data: fornecedoresList = [] } = useQuery({
    queryKey: ['fornecedores-lista'],
    queryFn: () => erpApi.fornecedores(),
  })

  // Mutations
  const { mutate: criarConta, isPending: criando } = useMutation({
    mutationFn: (data: any) => erpApi.criarContaPagar(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contas-pagar'] })
      qc.invalidateQueries({ queryKey: ['caixa-status'] })
      qc.invalidateQueries({ queryKey: ['caixa-sessoes'] })
      qc.invalidateQueries({ queryKey: ['erp-dashboard'] })
      setModalNovo(false)
      limparFormNovo()
    },
    onError: (err: any) => setFormErro(err.message || 'Erro ao criar conta a pagar'),
  })

  const { mutate: pagarConta, isPending: baixando } = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => erpApi.pagarContaPagar(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contas-pagar'] })
      qc.invalidateQueries({ queryKey: ['caixa-status'] })
      qc.invalidateQueries({ queryKey: ['caixa-sessoes'] })
      qc.invalidateQueries({ queryKey: ['erp-dashboard'] })
      setModalPagar(null)
    },
  })

  const { mutate: estornarConta, isPending: estornando } = useMutation({
    mutationFn: (id: number) => erpApi.estornarContaPagar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contas-pagar'] })
      qc.invalidateQueries({ queryKey: ['caixa-status'] })
      qc.invalidateQueries({ queryKey: ['caixa-sessoes'] })
      qc.invalidateQueries({ queryKey: ['erp-dashboard'] })
    },
  })

  const { mutate: editarConta, isPending: editando } = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => erpApi.atualizarContaPagar(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contas-pagar'] })
      qc.invalidateQueries({ queryKey: ['caixa-status'] })
      qc.invalidateQueries({ queryKey: ['caixa-sessoes'] })
      qc.invalidateQueries({ queryKey: ['erp-dashboard'] })
      setModalEditar(null)
    },
  })

  const { mutate: excluirConta, isPending: excluindo } = useMutation({
    mutationFn: (id: number) => erpApi.excluirContaPagar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contas-pagar'] })
      qc.invalidateQueries({ queryKey: ['caixa-status'] })
      qc.invalidateQueries({ queryKey: ['caixa-sessoes'] })
      qc.invalidateQueries({ queryKey: ['erp-dashboard'] })
      setConfirmDelete(null)
    },
  })

  const limparFormNovo = () => {
    setFormDescricao('')
    setFormFavorecido('')
    setFormValor('')
    setFormVencimento(new Date().toISOString().slice(0, 10))
    setFormCategoria(4)
    setFormModo(1)
    setFormDocumento('')
    setFormParcelas(1)
    setFormPagoAgora(false)
    setFormErro(null)
  }

  const handleSubmeterNovo = (e: React.FormEvent) => {
    e.preventDefault()
    setFormErro(null)
    const val = parseFloat(formValor.replace(/\./g, '').replace(',', '.'))
    if (!formDescricao.trim()) {
      setFormErro('Informe a descrição da conta.')
      return
    }
    if (isNaN(val) || val <= 0) {
      setFormErro('Informe um valor válido maior que zero.')
      return
    }
    if (!formVencimento) {
      setFormErro('Informe a data de vencimento.')
      return
    }

    criarConta({
      descricao: formDescricao.trim(),
      favorecido: formFavorecido.trim() || formDescricao.trim(),
      valor: val,
      data_vencimento: formVencimento,
      id_planejamento: formCategoria,
      id_modo_lancamento: formModo,
      documento: formDocumento.trim(),
      parcelas: Number(formParcelas) || 1,
      pago_agora: formPagoAgora,
      data_pagamento: formPagoAgora ? formVencimento : undefined,
    })
  }

  const contas = res?.data ?? []
  const totais = res?.totais
  const somaPagina = contas.reduce((acc, c) => acc + Number(c.valor || 0), 0)

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── SELETOR DE ABA (RECEBER / PAGAR) & CABEÇALHO ── */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-5">
        <div>
          {/* Navegação entre Módulos Financeiros */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl mb-3 shadow-inner">
            <Link
              to="/erp/contas"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>Contas a Receber</span>
            </Link>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600/90 shadow-md">
              <TrendingDown className="w-3.5 h-3.5 text-white" />
              <span>Contas a Pagar</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <TrendingDown className="w-7 h-7 text-rose-400" />
            <span>Financeiro — Contas a Pagar</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Controle de despesas, fornecedores, contas de consumo e pagamentos previstos
          </p>
        </div>

        <button
          onClick={() => {
            limparFormNovo()
            setModalNovo(true)
          }}
          className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-950/50 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Conta a Pagar</span>
        </button>
      </div>

      {/* ── CARDS DE TOTAIS GERAIS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Filtrado */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Geral {formaPagto ? `(${FORMAS_OPTS.find(f => f.value === formaPagto)?.label || ''})` : ''}</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-bold text-white">
            {R(totais?.total ?? 0)}
          </p>
          <p className="text-[11px] text-slate-500 font-mono">
            {res?.total ?? 0} conta(s) a pagar
          </p>
        </div>

        {/* Total Pago */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Pago</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400">
            {R(totais?.total_pago ?? 0)}
          </p>
          <p className="text-[11px] text-emerald-500/80 font-medium">
            Despesas liquidadas
          </p>
        </div>

        {/* Total Pendente / A Pagar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <span>A Pagar (Em Aberto)</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-400">
            {R(totais?.total_pendente ?? 0)}
          </p>
          <p className="text-[11px] text-amber-500/80 font-medium">
            Pendentes de quitação
          </p>
        </div>

        {/* Total Vencido */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-red-400 text-xs font-semibold uppercase tracking-wider">
            <span>Vencidas em Atraso</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-xl font-bold text-red-400">
            {R(totais?.total_vencido ?? 0)}
          </p>
          <p className="text-[11px] text-red-500/80 font-medium">
            Data limite ultrapassada
          </p>
        </div>
      </div>

      {/* ── CARDS DE FORMAS DE PAGAMENTO SOMADAS NO PERÍODO ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              <span>Formas de Pagamento no Período</span>
            </h2>
            {formaPagto && (
              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-semibold">
                Filtro ativo: {FORMAS_OPTS.find(f => f.value === formaPagto)?.label}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Clique em um card para filtrar por forma de pagamento
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Boleto */}
          <button
            type="button"
            onClick={() => toggleForma('boleto')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'boleto'
                ? 'bg-amber-950/80 border-2 border-amber-400 shadow-lg shadow-amber-950/40 ring-2 ring-amber-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">Boleto</p>
                {formaPagto === 'boleto' && (
                  <span className="text-[9px] bg-amber-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.boleto ?? 0)}
              </p>
            </div>
          </button>

          {/* PIX */}
          <button
            type="button"
            onClick={() => toggleForma('pix')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'pix'
                ? 'bg-teal-950/80 border-2 border-teal-400 shadow-lg shadow-teal-950/40 ring-2 ring-teal-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-teal-950/60 border border-teal-800/60 flex items-center justify-center text-teal-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">PIX</p>
                {formaPagto === 'pix' && (
                  <span className="text-[9px] bg-teal-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.pix ?? 0)}
              </p>
            </div>
          </button>

          {/* Dinheiro */}
          <button
            type="button"
            onClick={() => toggleForma('dinheiro')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'dinheiro'
                ? 'bg-emerald-950/80 border-2 border-emerald-400 shadow-lg shadow-emerald-950/40 ring-2 ring-emerald-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">Dinheiro</p>
                {formaPagto === 'dinheiro' && (
                  <span className="text-[9px] bg-emerald-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.dinheiro ?? 0)}
              </p>
            </div>
          </button>

          {/* Cartão */}
          <button
            type="button"
            onClick={() => toggleForma('cartao')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'cartao'
                ? 'bg-blue-950/80 border-2 border-blue-400 shadow-lg shadow-blue-950/40 ring-2 ring-blue-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">Cartão</p>
                {formaPagto === 'cartao' && (
                  <span className="text-[9px] bg-blue-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.cartao ?? 0)}
              </p>
            </div>
          </button>

          {/* Outros */}
          <button
            type="button"
            onClick={() => toggleForma('outros')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'outros'
                ? 'bg-purple-950/80 border-2 border-purple-400 shadow-lg shadow-purple-950/40 ring-2 ring-purple-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-purple-950/60 border border-purple-800/60 flex items-center justify-center text-purple-400 shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">Outros</p>
                {formaPagto === 'outros' && (
                  <span className="text-[9px] bg-purple-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.outros ?? 0)}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* ── BARRA DE FILTROS (STATUS, DATAS, CATEGORIA E BUSCA) ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        {/* Linha 1: Status + Atalhos de Data */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
            {STATUS_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => { setStatus(o.value); setPage(1) }}
                className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  status === o.value
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Vencimento:</span>
            </span>
            {[
              { id: '',             label: 'Todas as datas' },
              { id: 'hoje',         label: 'Hoje' },
              { id: '7dias',        label: '7 dias' },
              { id: 'mes',          label: 'Este mês' },
              { id: 'mes_anterior', label: 'Mês anterior' },
            ].map(preset => (
              <button
                key={preset.id}
                onClick={() => aplicarPreset(preset.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  dataPreset === preset.id && (dataInicio || preset.id === '')
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Linha 2: Datas customizadas + Filtro Categoria + Filtro Forma Pagto + Busca */}
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">De:</span>
            <input
              type="date"
              value={dataInicio}
              onChange={e => {
                setDataInicio(e.target.value)
                setDataPreset('custom')
                setPage(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Até:</span>
            <input
              type="date"
              value={dataFim}
              onChange={e => {
                setDataFim(e.target.value)
                setDataPreset('custom')
                setPage(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-rose-500"
            />
          </div>

          {(dataInicio || dataFim) && (
            <button
              onClick={limparDatas}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors"
              title="Limpar filtro de datas"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpar data</span>
            </button>
          )}

          {/* Filtro Categoria */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <span>Categoria:</span>
            </span>
            <select
              value={categoriaId || ''}
              onChange={e => {
                setCategoriaId(e.target.value ? Number(e.target.value) : undefined)
                setPage(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="">Todas as categorias</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Forma Pagamento */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              <span>Forma:</span>
            </span>
            <select
              value={formaPagto}
              onChange={e => {
                setFormaPagto(e.target.value)
                setPage(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              {FORMAS_OPTS.map(f => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Busca por favorecido, histórico ou controle */}
          <div className="relative flex-1 min-w-56">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setDebouncedSearch(search)
                  setPage(1)
                }
              }}
              placeholder="Buscar por favorecido, histórico ou documento…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            {search !== debouncedSearch && (
              <span className="absolute right-3 top-2 text-[10px] text-rose-400 animate-pulse font-medium">
                Buscando…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── TABELA DE CONTAS A PAGAR ── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        {isError ? (
          <div className="py-12 text-center text-red-400 text-sm space-y-2">
            <p className="font-semibold">Erro ao carregar contas a pagar.</p>
            <p className="text-xs text-slate-500">{(error as any)?.message || 'Falha de comunicação com o servidor'}</p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors border border-slate-700"
            >
              Tentar novamente
            </button>
          </div>
        ) : isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Carregando contas a pagar…</div>
        ) : contas.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm space-y-2">
            <p className="text-base font-semibold text-slate-400">Nenhuma conta a pagar encontrada.</p>
            <p className="text-xs text-slate-600">Altere os filtros de data ou lance uma nova despesa no botão acima.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="px-5 py-3">Vencimento</th>
                <th className="px-5 py-3">Favorecido / Fornecedor</th>
                <th className="px-5 py-3">Descrição / Documento</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3 text-center">Forma Pagto</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-center w-28">Status</th>
                <th className="px-5 py-3 text-right w-36">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {contas.map((c: ContaPagar) => {
                const vencido = c.status === 0 && new Date(c.data_vencimento) < new Date()
                const modo = String(c.modo_lancamento || '').toUpperCase()

                return (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <span className={vencido ? 'text-red-400 font-semibold' : 'text-slate-300'}>
                        {fmtDate(c.data_vencimento)}
                      </span>
                      {vencido && <span className="ml-1 text-[10px] text-red-500 uppercase font-semibold">(vencida)</span>}
                    </td>

                    <td className="px-5 py-3 text-slate-200 max-w-[180px] truncate font-medium">
                      {c.favorecido || '—'}
                    </td>

                    <td className="px-5 py-3 text-slate-400 text-xs max-w-[220px]">
                      <div className="truncate font-medium text-slate-300">{c.historico || '—'}</div>
                      {c.documento && (
                        <div className="text-[10px] text-slate-500 font-mono">Doc: {c.documento}</div>
                      )}
                    </td>

                    <td className="px-5 py-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
                        {c.categoria || 'Despesa'}
                      </span>
                    </td>

                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        modo.includes('PIX')
                          ? 'bg-teal-950/70 text-teal-300 border-teal-800/60'
                          : modo.includes('BOLETO')
                          ? 'bg-amber-950/70 text-amber-300 border-amber-800/60'
                          : modo.includes('DINHEIRO')
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                          : modo.includes('CART')
                          ? 'bg-blue-950/70 text-blue-300 border-blue-800/60'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {c.modo_lancamento || 'Boleto'}
                      </span>
                    </td>

                    <td className="px-5 py-3 text-right font-bold text-rose-400">
                      {R(Number(c.valor))}
                    </td>

                    <td className="px-5 py-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        c.status === 1
                          ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
                          : vencido
                          ? 'bg-red-900/30 text-red-400 border border-red-800/40'
                          : 'bg-amber-900/20 text-amber-400 border border-amber-800/40'
                      }`}>
                        {c.status === 1 ? 'Pago' : vencido ? 'Vencida' : 'A Pagar'}
                      </span>
                    </td>

                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status === 0 ? (
                          <button
                            onClick={() => {
                              setModalPagar(c)
                              setBaixaModo(c.id_modo_lancamento || 1)
                              setBaixaData(new Date().toISOString().slice(0, 10))
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-800/40 hover:bg-emerald-700/50 text-emerald-300 text-xs font-semibold border border-emerald-700/60 transition-colors"
                            title="Dar baixa / Pagar conta"
                          >
                            Pagar
                          </button>
                        ) : (
                          <button
                            onClick={() => estornarConta(c.id)}
                            disabled={estornando}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs border border-slate-700 transition-colors"
                            title="Estornar baixa (retornar a pendente)"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => setModalEditar(c)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                          title="Editar lançamento"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setConfirmDelete(c.id)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-300 border border-slate-700 hover:border-red-700/60 transition-colors"
                          title="Excluir despesa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700 bg-slate-800/80 text-white font-semibold">
                <td colSpan={5} className="px-5 py-3.5 text-right text-xs uppercase tracking-wider text-slate-300 font-bold">
                  {(res?.pages ?? 0) > 1 ? (
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-white">Soma Total das Contas Filtradas:</span>
                      <span className="text-[11px] font-normal text-slate-400">
                        Nesta página ({contas.length}): {R(somaPagina)}
                      </span>
                    </div>
                  ) : (
                    <span>Soma Total:</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right font-black text-rose-400 text-base tabular-nums">
                  {R(totais?.total ?? 0)}
                </td>
                <td colSpan={2} className="px-5 py-3.5 text-center text-xs text-slate-400">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {res?.total ?? 0} item(ns)
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {(res?.pages ?? 0) > 1 && (
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-sm text-slate-500">
            <span>{res?.total} lançamentos</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
              >
                ←
              </button>
              <span className="px-2 py-1 text-slate-400">{page} / {res?.pages}</span>
              <button
                disabled={page >= (res?.pages ?? 1)}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: NOVA CONTA A PAGAR ── */}
      {modalNovo && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">💳</span>
                <div>
                  <h2 className="text-lg font-bold text-white">Nova Conta a Pagar</h2>
                  <p className="text-xs text-slate-400">Cadastre um pagamento de fornecedor, aluguel, consumo ou despesa</p>
                </div>
              </div>
              <button
                onClick={() => setModalNovo(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmeterNovo} className="space-y-4 pt-4">
              {formErro && (
                <div className="bg-red-950/60 border border-red-500/80 rounded-xl p-3 text-red-200 text-xs">
                  {formErro}
                </div>
              )}

              {/* Descrição */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Descrição da Despesa <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compra de Óleo 5W30, Aluguel Loja, Conta CEMIG"
                  value={formDescricao}
                  onChange={e => setFormDescricao(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Favorecido / Fornecedor com Autocomplete */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Favorecido / Fornecedor
                </label>
                <input
                  type="text"
                  list="fornecedores-sugestoes"
                  placeholder="Ex: Pellegrino Distribuidora, Sabesp, Enel"
                  value={formFavorecido}
                  onChange={e => setFormFavorecido(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500"
                />
                <datalist id="fornecedores-sugestoes">
                  {fornecedoresList.map(f => (
                    <option key={f.id} value={f.nome} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Valor */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Valor Total (R$) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={formValor}
                    onChange={e => setFormValor(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500 font-mono font-bold"
                  />
                </div>

                {/* Vencimento */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data de Vencimento <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formVencimento}
                    onChange={e => setFormVencimento(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Categoria */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Categoria de Despesa
                  </label>
                  <select
                    value={formCategoria}
                    onChange={e => setFormCategoria(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    {categorias.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Forma de Pagamento */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={formModo}
                    onChange={e => setFormModo(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    {FORMAS_CADASTRO.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Documento / NF */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nº do Documento / Boleto / NF
                  </label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formDocumento}
                    onChange={e => setFormDocumento(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Parcelas */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Parcelamento
                  </label>
                  <select
                    value={formParcelas}
                    onChange={e => setFormParcelas(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value={1}>À vista (1 parcela)</option>
                    {[2, 3, 4, 5, 6, 10, 12, 24, 36, 48].map(p => (
                      <option key={p} value={p}>
                        {p}x mensais
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Checkbox Já está paga */}
              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formPagoAgora}
                    onChange={e => setFormPagoAgora(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 bg-slate-800 border-slate-700"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Esta conta já foi paga agora (marcar como liquidada)
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalNovo(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={criando}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-rose-950/40"
                >
                  {criando ? 'Salvando…' : 'Salvar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: BAIXAR / PAGAR CONTA ── */}
      {modalPagar && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Confirmar Pagamento</h3>
              </div>
              <button onClick={() => setModalPagar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-800/80 rounded-xl p-3 space-y-1.5 text-xs text-slate-300 border border-slate-700/60">
              <p><strong className="text-white">Despesa:</strong> {modalPagar.historico}</p>
              <p><strong className="text-white">Favorecido:</strong> {modalPagar.favorecido}</p>
              <p><strong className="text-white">Valor:</strong> <span className="text-rose-400 font-bold text-sm">{R(modalPagar.valor)}</span></p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Data do Pagamento
                </label>
                <input
                  type="date"
                  value={baixaData}
                  onChange={e => setBaixaData(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Forma de Pagamento Utilizada
                </label>
                <select
                  value={baixaModo}
                  onChange={e => setBaixaModo(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {FORMAS_CADASTRO.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalPagar(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={baixando}
                onClick={() => pagarConta({
                  id: modalPagar.id,
                  data: { data_pagamento: baixaData, id_modo_lancamento: baixaModo }
                })}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-emerald-950/40"
              >
                {baixando ? 'Processando…' : 'Confirmar Baixa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR CONTA A PAGAR ── */}
      {modalEditar && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Editar Conta a Pagar</h3>
              </div>
              <button onClick={() => setModalEditar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault()
                const f = e.currentTarget as any
                editarConta({
                  id: modalEditar.id,
                  data: {
                    descricao: f.descricao.value,
                    favorecido: f.favorecido.value,
                    valor: parseFloat(f.valor.value.replace(/\./g, '').replace(',', '.')),
                    data_vencimento: f.vencimento.value,
                    id_planejamento: Number(f.categoria.value),
                    id_modo_lancamento: Number(f.modo.value),
                    documento: f.documento.value,
                  },
                })
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Descrição</label>
                <input
                  name="descricao"
                  defaultValue={modalEditar.historico}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Favorecido</label>
                <input
                  name="favorecido"
                  defaultValue={modalEditar.favorecido}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Valor (R$)</label>
                  <input
                    name="valor"
                    defaultValue={modalEditar.valor.toFixed(2).replace('.', ',')}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Vencimento</label>
                  <input
                    type="date"
                    name="vencimento"
                    defaultValue={String(modalEditar.data_vencimento).slice(0, 10)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Categoria</label>
                  <select
                    name="categoria"
                    defaultValue={modalEditar.id_planejamento}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm cursor-pointer"
                  >
                    {categorias.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Forma</label>
                  <select
                    name="modo"
                    defaultValue={modalEditar.id_modo_lancamento}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm cursor-pointer"
                  >
                    {FORMAS_CADASTRO.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Documento / NF</label>
                <input
                  name="documento"
                  defaultValue={modalEditar.documento}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalEditar(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editando}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {editando ? 'Salvando…' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRMAR EXCLUSÃO ── */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-sm shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-red-950/70 border border-red-700/60 rounded-full flex items-center justify-center text-red-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Excluir Conta a Pagar?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Esta ação removerá o lançamento definitivamente do sistema.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={excluindo}
                onClick={() => excluirConta(confirmDeleteId)}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                {excluindo ? 'Excluindo…' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
