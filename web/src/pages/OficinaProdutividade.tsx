import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench,
  Award,
  DollarSign,
  TrendingUp,
  Users,
  Calendar,
  Search,
  Printer,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  Copy,
  Receipt,
  ArrowRight,
  Filter,
  CreditCard,
  Briefcase,
  ChevronRight,
  X,
  History,
  FileSpreadsheet,
  Smartphone,
} from 'lucide-react'
import { oficinaApi, erpApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type {
  Mecanico,
  MecanicoProdutividade,
  ExtratoItemComissao,
  MecanicoPagamento,
} from '../types'

const R = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const P = (v: number) => `${(v || 0).toFixed(1)}%`
const fmtData = (d?: string | null) => {
  if (!d) return '—'
  const [ano, mes, dia] = d.split('T')[0].split('-')
  return `${dia}/${mes}/${ano}`
}

type PeriodoPreset = 'hoje' | 'esta_semana' | 'este_mes' | 'mes_anterior' | 'ultimos_90' | 'personalizado'

function getPresetDates(preset: PeriodoPreset): { inicio: string; fim: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  const toIso = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  if (preset === 'hoje') {
    const d = toIso(now)
    return { inicio: d, fim: d }
  }
  if (preset === 'esta_semana') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) // segunda-feira
    const seg = new Date(now.setDate(diff))
    return { inicio: toIso(seg), fim: toIso(new Date()) }
  }
  if (preset === 'este_mes') {
    const pDia = new Date(y, m, 1)
    const uDia = new Date(y, m + 1, 0)
    return { inicio: toIso(pDia), fim: toIso(uDia) }
  }
  if (preset === 'mes_anterior') {
    const pDia = new Date(y, m - 1, 1)
    const uDia = new Date(y, m, 0)
    return { inicio: toIso(pDia), fim: toIso(uDia) }
  }
  if (preset === 'ultimos_90') {
    const pass = new Date()
    pass.setDate(pass.getDate() - 90)
    return { inicio: toIso(pass), fim: toIso(now) }
  }
  return { inicio: '', fim: '' }
}

export default function OficinaProdutividade() {
  const qc = useQueryClient()
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null

  // Abas: 'ranking' | 'extrato' | 'mecanicos'
  const [tab, setTab] = useState<'ranking' | 'extrato' | 'mecanicos'>('ranking')

  // Filtros de período
  const [preset, setPreset] = useState<PeriodoPreset>('este_mes')
  const defaultDates = useMemo(() => getPresetDates('este_mes'), [])
  const [dataInicio, setDataInicio] = useState<string>(defaultDates.inicio)
  const [dataFim, setDataFim] = useState<string>(defaultDates.fim)
  const [statusFiltro, setStatusFiltro] = useState<string>('todas')
  const [mecanicoFiltro, setMecanicoFiltro] = useState<string>('todos')
  const [buscaExtrato, setBuscaExtrato] = useState<string>('')

  // Modais
  const [mecanicoModalOpen, setMecanicoModalOpen] = useState(false)
  const [editingMecanico, setEditingMecanico] = useState<Mecanico | null>(null)
  const [mecanicoForm, setMecanicoForm] = useState<{
    nome: string
    apelido: string
    cpf: string
    telefone: string
    chave_pix: string
    comissao_servico_pct: number
    comissao_peca_pct: number
    ativo: boolean
    is_auxiliar: boolean
    user_id: string | number
  }>({
    nome: '',
    apelido: '',
    cpf: '',
    telefone: '',
    chave_pix: '',
    comissao_servico_pct: 0,
    comissao_peca_pct: 0,
    ativo: true,
    is_auxiliar: false,
    user_id: '',
  })
  const [mecanicoFormError, setMecanicoFormError] = useState('')

  // Modal Pagamento
  const [pagamentoModalOpen, setPagamentoModalOpen] = useState(false)
  const [pagamentoForm, setPagamentoForm] = useState({
    mecanico_id: 0,
    mecanico_nome: '',
    saldo_sugerido: 0,
    valor: 0,
    forma_pagamento: 'pix',
    data_pagamento: new Date().toISOString().split('T')[0],
    observacoes: '',
    gerar_contas_pagar: true,
  })
  const [pagamentoError, setPagamentoError] = useState('')

  // Modal Histórico de Pagamentos
  const [historicoModalMecanico, setHistoricoModalMecanico] = useState<Mecanico | null>(null)
  const [copiedPixId, setCopiedPixId] = useState<number | null>(null)

  // Handlers de Preset
  const handlePresetChange = (p: PeriodoPreset) => {
    setPreset(p)
    if (p !== 'personalizado') {
      const dates = getPresetDates(p)
      setDataInicio(dates.inicio)
      setDataFim(dates.fim)
    }
  }

  // Queries
  const { data: listaMecanicos = [], refetch: refetchMecanicos } = useQuery({
    queryKey: ['mecanicos', tid],
    queryFn: () => oficinaApi.listMecanicos(),
  })

  // Lista de usuários do sistema disponíveis para vínculo
  const { data: usuariosSistema = [] } = useQuery({
    queryKey: ['usuarios-sistema', tid],
    queryFn: () => oficinaApi.listUsuariosSistema(),
  })

  const {
    data: dadosProdutividade,
    isLoading: loadingProdutividade,
    isFetching: fetchingProdutividade,
    refetch: refetchProdutividade,
  } = useQuery({
    queryKey: [
      'oficina-produtividade',
      tid,
      dataInicio,
      dataFim,
      statusFiltro,
      mecanicoFiltro,
    ],
    queryFn: () =>
      oficinaApi.getProdutividade({
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        status: statusFiltro,
        mecanico_id: mecanicoFiltro !== 'todos' ? Number(mecanicoFiltro) : undefined,
      }),
    refetchInterval: 20_000,
  })

  // Query histórico de pagamentos para o modal de histórico
  const { data: pagamentosHistorico = [], isLoading: loadingHistorico } = useQuery({
    queryKey: ['oficina-pagamentos', historicoModalMecanico?.id],
    queryFn: () =>
      historicoModalMecanico ? oficinaApi.listPagamentosMecanico(historicoModalMecanico.id) : [],
    enabled: !!historicoModalMecanico,
  })

  // Mutations
  const { mutate: salvarMecanico, isPending: salvandoMecanico } = useMutation({
    mutationFn: () => {
      if (!mecanicoForm.nome.trim()) throw new Error('Nome do mecânico / técnico é obrigatório')
      const payload = {
        ...mecanicoForm,
        user_id: mecanicoForm.user_id ? Number(mecanicoForm.user_id) : null,
      }
      if (editingMecanico) {
        return oficinaApi.updateMecanico(editingMecanico.id, payload)
      }
      return oficinaApi.createMecanico(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mecanicos'] })
      qc.invalidateQueries({ queryKey: ['oficina-produtividade'] })
      qc.invalidateQueries({ queryKey: ['usuarios-sistema'] })
      setMecanicoModalOpen(false)
      setEditingMecanico(null)
    },
    onError: (err: any) => {
      setMecanicoFormError(err.message || 'Erro ao salvar mecânico')
    },
  })

  const { mutate: executarPagamento, isPending: pagandoComissao } = useMutation({
    mutationFn: () => {
      if (!pagamentoForm.mecanico_id) throw new Error('Mecânico não selecionado')
      if (pagamentoForm.valor <= 0) throw new Error('Informe um valor válido maior que zero')
      return oficinaApi.pagarComissao({
        mecanico_id: pagamentoForm.mecanico_id,
        valor: pagamentoForm.valor,
        data_pagamento: pagamentoForm.data_pagamento,
        periodo_inicio: dataInicio || undefined,
        periodo_fim: dataFim || undefined,
        forma_pagamento: pagamentoForm.forma_pagamento,
        observacoes: pagamentoForm.observacoes || undefined,
        gerar_contas_pagar: pagamentoForm.gerar_contas_pagar,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oficina-produtividade'] })
      qc.invalidateQueries({ queryKey: ['oficina-pagamentos'] })
      qc.invalidateQueries({ queryKey: ['contas-pagar'] })
      setPagamentoModalOpen(false)
    },
    onError: (err: any) => {
      setPagamentoError(err.message || 'Erro ao registrar pagamento')
    },
  })

  const { mutate: alternarStatusMecanico } = useMutation({
    mutationFn: (m: Mecanico) =>
      oficinaApi.updateMecanico(m.id, { ativo: !m.ativo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mecanicos'] })
      qc.invalidateQueries({ queryKey: ['oficina-produtividade'] })
    },
  })

  // Abrir Modal de Pagamento pré-preenchido
  const handleOpenPagamento = (m: MecanicoProdutividade | Mecanico, saldoSugerido: number = 0) => {
    setPagamentoForm({
      mecanico_id: m.id,
      mecanico_nome: m.nome + (m.apelido ? ` (${m.apelido})` : ''),
      saldo_sugerido: Math.max(0, saldoSugerido),
      valor: saldoSugerido > 0 ? Number(saldoSugerido.toFixed(2)) : 0,
      forma_pagamento: 'pix',
      data_pagamento: new Date().toISOString().split('T')[0],
      observacoes: `Comissão referente ao período ${dataInicio ? fmtData(dataInicio) : 'início'} a ${dataFim ? fmtData(dataFim) : 'fim'}`,
      gerar_contas_pagar: true,
    })
    setPagamentoError('')
    setPagamentoModalOpen(true)
  }

  // Copiar chave PIX
  const handleCopyPix = (id: number, chave: string) => {
    if (!chave) return
    navigator.clipboard.writeText(chave)
    setCopiedPixId(id)
    setTimeout(() => setCopiedPixId(null), 2500)
  }

  // Filtragem local do extrato
  const extratoFiltrado = useMemo(() => {
    if (!dadosProdutividade?.extrato) return []
    const q = buscaExtrato.trim().toLowerCase()
    return dadosProdutividade.extrato.filter((it) => {
      if (!q) return true
      return (
        it.os_numero.toLowerCase().includes(q) ||
        it.plate.toLowerCase().includes(q) ||
        it.model.toLowerCase().includes(q) ||
        it.client_name.toLowerCase().includes(q) ||
        it.descricao.toLowerCase().includes(q) ||
        it.mecanico_nome.toLowerCase().includes(q)
      )
    })
  }, [dadosProdutividade?.extrato, buscaExtrato])

  // Impressão do Espelho de Comissão
  const handlePrintEspelho = (mecId?: number) => {
    const alvo = mecId
      ? dadosProdutividade?.mecanicos.find((m) => m.id === mecId)
      : mecanicoFiltro !== 'todos'
      ? dadosProdutividade?.mecanicos.find((m) => m.id === Number(mecanicoFiltro))
      : null

    const itensParaImprimir = alvo
      ? (dadosProdutividade?.extrato || []).filter((e) => e.mecanico_id === alvo.id)
      : dadosProdutividade?.extrato || []

    const win = window.open('', '_blank', 'width=900,height=900')
    if (!win) return

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Espelho de Produtividade & Comissões - ${alvo ? alvo.nome : 'Oficina Geral'}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 15px; font-size: 11px; }
          .header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-start; }
          .title { font-size: 18px; font-weight: bold; color: #1e3a8a; margin: 0; }
          .sub { color: #64748b; font-size: 11px; margin-top: 3px; }
          .badge { background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; }
          .card-title { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: bold; margin-bottom: 4px; }
          .card-value { font-size: 14px; font-weight: bold; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
          th { background: #f1f5f9; color: #475569; text-align: left; padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #cbd5e1; text-transform: uppercase; }
          td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
          .text-right { text-align: right; }
          .badge-tipo { display: inline-block; padding: 2px 5px; border-radius: 4px; font-size: 9px; font-weight: bold; }
          .tipo-servico { background: #dbeafe; color: #1e40af; }
          .tipo-peca { background: #fef3c7; color: #92400e; }
          .totais { margin-top: 20px; width: 320px; margin-left: auto; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc; }
          .total-row { display: flex; justify-content: space-between; padding: 3px 0; }
          .total-main { font-size: 14px; font-weight: bold; border-top: 1px solid #cbd5e1; padding-top: 6px; margin-top: 4px; color: #166534; }
          .assinaturas { margin-top: 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
          .linha { border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">ESPELHO DE COMISSÕES & PRODUTIVIDADE</h1>
            <p class="sub">Período: ${dataInicio ? fmtData(dataInicio) : 'Desde o início'} até ${dataFim ? fmtData(dataFim) : 'Hoje'} &bull; Loja: ${currentTenant?.nome || 'Matriz'}</p>
          </div>
          <div>
            <span class="badge">${alvo ? `Mecânico: ${alvo.nome}` : 'Oficina Completa'}</span>
          </div>
        </div>

        ${alvo ? `
          <div class="grid">
            <div class="card">
              <div class="card-title">Mão de Obra (Serviços)</div>
              <div class="card-value">${R(alvo.total_servicos)}</div>
            </div>
            <div class="card">
              <div class="card-title">Peças Lançadas</div>
              <div class="card-value">${R(alvo.total_pecas)}</div>
            </div>
            <div class="card">
              <div class="card-title">Total Comissões</div>
              <div class="card-value" style="color: #2563eb;">${R(alvo.total_comissao)}</div>
            </div>
            <div class="card">
              <div class="card-title">Saldo Líquido a Pagar</div>
              <div class="card-value" style="color: #16a34a;">${R(alvo.saldo_a_pagar)}</div>
            </div>
          </div>
        ` : ''}

        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>OS / Doc</th>
              <th>Placa & Modelo</th>
              <th>Cliente</th>
              ${!alvo ? '<th>Técnico</th>' : ''}
              <th>Tipo</th>
              <th>Item / Descrição</th>
              <th class="text-right">Valor Base</th>
              <th class="text-right">% Com.</th>
              <th class="text-right">Comissão R$</th>
            </tr>
          </thead>
          <tbody>
            ${itensParaImprimir.length === 0 ? `
              <tr><td colspan="${!alvo ? 10 : 9}" style="text-align: center; padding: 20px; color: #94a3b8;">Nenhum item de comissão no período.</td></tr>
            ` : itensParaImprimir.map(it => `
              <tr>
                <td>${fmtData(it.data_os)}</td>
                <td><strong>#${it.os_numero}</strong></td>
                <td><strong>${it.plate}</strong> <span style="color:#64748b;">${it.model}</span></td>
                <td>${it.client_name || 'Consumidor'}</td>
                ${!alvo ? `<td>${it.mecanico_nome}</td>` : ''}
                <td><span class="badge-tipo ${it.tipo === 'service' ? 'tipo-servico' : 'tipo-peca'}">${it.tipo === 'service' ? 'Serviço' : 'Peça'}</span></td>
                <td>${it.descricao}</td>
                <td class="text-right">${R(it.valor_base)}</td>
                <td class="text-right">${P(it.comissao_pct)}</td>
                <td class="text-right" style="font-weight:bold; color: #166534;">${R(it.comissao_valor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totais">
          <div class="total-row">
            <span>Total Produzido no Período:</span>
            <strong>${R(alvo ? alvo.total_produzido : dadosProdutividade?.resumo.faturamento_total || 0)}</strong>
          </div>
          <div class="total-row">
            <span>Comissão Bruta Gerada:</span>
            <strong style="color:#2563eb;">${R(alvo ? alvo.total_comissao : dadosProdutividade?.resumo.total_comissoes || 0)}</strong>
          </div>
          <div class="total-row">
            <span>Total Já Pago / Adiantado:</span>
            <strong style="color:#991b1b;">- ${R(alvo ? alvo.total_pago : dadosProdutividade?.resumo.total_comissoes_pagas || 0)}</strong>
          </div>
          <div class="total-row total-main">
            <span>Saldo Final a Receber:</span>
            <span>${R(alvo ? alvo.saldo_a_pagar : dadosProdutividade?.resumo.saldo_comissoes_pendente || 0)}</span>
          </div>
        </div>

        <div class="assinaturas">
          <div>
            <div class="linha">Assinatura da Oficina / Gestão</div>
          </div>
          <div>
            <div class="linha">${alvo ? alvo.nome : 'Assinatura do Mecânico / Técnico'}</div>
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `
    win.document.write(html)
    win.document.close()
  }

  const resumo = dadosProdutividade?.resumo

  return (
    <div className="space-y-6">
      {/* ── HEADER DA PÁGINA ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Oficina & Produtividade
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-950/80 text-blue-300 border border-blue-800/80">
                OS & Comissões
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              Produtividade, ranking de serviços e apuração transparente de comissões por técnico
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handlePrintEspelho()}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
            title="Imprimir relatório geral de comissões"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Imprimir Geral</span>
          </button>

          <button
            onClick={() => {
              setEditingMecanico(null)
              setMecanicoForm({
                nome: '',
                apelido: '',
                cpf: '',
                telefone: '',
                chave_pix: '',
                comissao_servico_pct: 0,
                comissao_peca_pct: 0,
                ativo: true,
                is_auxiliar: false,
                user_id: '',
              })
              setMecanicoFormError('')
              setMecanicoModalOpen(true)
            }}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-blue-900/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Mecânico</span>
          </button>
        </div>
      </div>

      {/* ── BARRA DE FILTROS & PRESETS ──────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Presets Rápidos */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            {(
              [
                { id: 'hoje', label: 'Hoje' },
                { id: 'esta_semana', label: 'Esta Semana' },
                { id: 'este_mes', label: 'Este Mês' },
                { id: 'mes_anterior', label: 'Mês Anterior' },
                { id: 'ultimos_90', label: 'Últimos 90 Dias' },
                { id: 'personalizado', label: 'Personalizado' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  preset === p.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchProdutividade()}
              disabled={fetchingProdutividade}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700/80 transition-colors disabled:opacity-50"
            >
              {fetchingProdutividade ? 'Atualizando…' : '↻ Atualizar'}
            </button>
          </div>
        </div>

        {/* Inputs de Data Customizada e Seletores de Filtro */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-800/80">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Data Início
            </label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value)
                setPreset('personalizado')
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Data Fim
            </label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value)
                setPreset('personalizado')
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Mecânico / Técnico
            </label>
            <select
              value={mecanicoFiltro}
              onChange={(e) => setMecanicoFiltro(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos os Mecânicos</option>
              {listaMecanicos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} {m.apelido ? `(${m.apelido})` : ''} {!m.ativo ? '— Inativo' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Status das OS
            </label>
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todas">Todas as OS (Exceto canceladas)</option>
              <option value="concluidas">Apenas Finalizadas / Faturadas</option>
              <option value="abertas">Apenas Abertas / Em Execução</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── CARDS DE RESUMO (KPIS) ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Faturamento Oficina */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Faturamento OS</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-white font-mono">
              {R(resumo?.faturamento_total || 0)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {resumo?.qtd_os || 0} OS atendidas
            </p>
          </div>
        </div>

        {/* Mão de Obra */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Mão de Obra</span>
            <Wrench className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-indigo-300 font-mono">
              {R(resumo?.faturamento_servicos || 0)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {resumo?.qtd_servicos || 0} serviços prestados
            </p>
          </div>
        </div>

        {/* Peças nas OS */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Peças Aplicadas</span>
            <Briefcase className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-amber-300 font-mono">
              {R(resumo?.faturamento_pecas || 0)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Lançadas em serviços</p>
          </div>
        </div>

        {/* Total Comissões */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Comissão Gerada</span>
            <Award className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-purple-300 font-mono">
              {R(resumo?.total_comissoes || 0)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Total a crédito</p>
          </div>
        </div>

        {/* Comissões Pagas */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Já Pago</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-emerald-400 font-mono">
              {R(resumo?.total_comissoes_pagas || 0)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Adiantamentos e baixas</p>
          </div>
        </div>

        {/* Saldo a Pagar */}
        <div
          className={`border rounded-2xl p-4 shadow-lg flex flex-col justify-between transition-colors ${
            (resumo?.saldo_comissoes_pendente || 0) > 0
              ? 'bg-rose-950/30 border-rose-800/60 ring-1 ring-rose-500/20'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
              Saldo Pendente
            </span>
            <Clock className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-rose-400 font-mono">
              {R(resumo?.saldo_comissoes_pendente || 0)}
            </p>
            <p className="text-[10px] text-rose-300/80 mt-0.5">A acertar com equipe</p>
          </div>
        </div>
      </div>

      {/* ── DESTAQUE DO PERÍODO ──────────────────────────────────────────── */}
      {resumo?.mecanico_destaque && (
        <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/50 border border-blue-800/50 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 text-2xl shadow-lg shrink-0">
              🏆
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Destaque do Período
                </span>
                <span className="text-xs text-slate-400">
                  {P(resumo.mecanico_destaque.share_pct)} da mão de obra da oficina
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">
                {resumo.mecanico_destaque.nome}{' '}
                {resumo.mecanico_destaque.apelido && (
                  <span className="text-slate-400 font-normal">
                    &ldquo;{resumo.mecanico_destaque.apelido}&rdquo;
                  </span>
                )}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                Mão de Obra Realizada
              </span>
              <span className="text-base font-bold text-white font-mono">
                {R(resumo.mecanico_destaque.total_servicos)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                Comissão Acumulada
              </span>
              <span className="text-base font-bold text-purple-400 font-mono">
                {R(resumo.mecanico_destaque.total_comissao)}
              </span>
            </div>
            <button
              onClick={() => {
                setMecanicoFiltro(String(resumo.mecanico_destaque?.id))
                setTab('extrato')
              }}
              className="px-3.5 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <span>Ver Itens</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── ABAS DE NAVEGAÇÃO ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setTab('ranking')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            tab === 'ranking'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Produtividade & Ranking</span>
          {dadosProdutividade?.mecanicos && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                tab === 'ranking' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {dadosProdutividade.mecanicos.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab('extrato')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            tab === 'extrato'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Extrato Detalhado de Comissões</span>
          {dadosProdutividade?.extrato && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                tab === 'extrato' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {dadosProdutividade.extrato.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab('mecanicos')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            tab === 'mecanicos'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Gestão de Mecânicos</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              tab === 'mecanicos' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {listaMecanicos.length}
          </span>
        </button>
      </div>

      {/* ── CONTEÚDO DA ABA 1: RANKING & PRODUTIVIDADE ──────────────────── */}
      {tab === 'ranking' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-white">Ranking de Produtividade da Oficina</h2>
              <p className="text-xs text-slate-400">
                Desempenho comparativo de cada profissional com mão de obra, peças, comissão acumulada e saldo
              </p>
            </div>
            <div className="text-xs text-slate-400">
              {dadosProdutividade?.mecanicos.length || 0} técnico(s) no período
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                  <th className="px-4 py-3 text-center w-12">#</th>
                  <th className="px-4 py-3">Mecânico / Técnico</th>
                  <th className="px-4 py-3 text-right">Qtd OS</th>
                  <th className="px-4 py-3 text-right">Mão de Obra</th>
                  <th className="px-4 py-3 text-right">Peças</th>
                  <th className="px-4 py-3 text-right">Produção Total</th>
                  <th className="px-4 py-3 w-40">Participação (Share)</th>
                  <th className="px-4 py-3 text-right">Ticket Médio</th>
                  <th className="px-4 py-3 text-right">Comissão Total</th>
                  <th className="px-4 py-3 text-right">Já Pago</th>
                  <th className="px-4 py-3 text-right">Saldo Aberto</th>
                  <th className="px-4 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loadingProdutividade ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-500">
                      Calculando produtividade e apurando comissões…
                    </td>
                  </tr>
                ) : !dadosProdutividade?.mecanicos.length ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-500">
                      Nenhum mecânico com produção registrada no período selecionado.
                    </td>
                  </tr>
                ) : (
                  dadosProdutividade.mecanicos.map((m, idx) => {
                    const isTop1 = idx === 0 && m.total_produzido > 0
                    const isTop2 = idx === 1 && m.total_produzido > 0
                    const isTop3 = idx === 2 && m.total_produzido > 0

                    return (
                      <tr
                        key={m.id}
                        className={`hover:bg-slate-800/50 transition-colors ${
                          isTop1 ? 'bg-blue-950/10' : ''
                        }`}
                      >
                        {/* Posição no ranking */}
                        <td className="px-4 py-3 text-center">
                          {isTop1 ? (
                            <span className="text-base" title="1º Lugar">🥇</span>
                          ) : isTop2 ? (
                            <span className="text-base" title="2º Lugar">🥈</span>
                          ) : isTop3 ? (
                            <span className="text-base" title="3º Lugar">🥉</span>
                          ) : (
                            <span className="font-mono text-slate-500 font-bold">{idx + 1}º</span>
                          )}
                        </td>

                        {/* Mecânico */}
                        <td className="px-4 py-3">
                          <div className="font-bold text-white text-sm flex items-center gap-1.5 flex-wrap">
                            <span>{m.nome}</span>
                            {m.apelido && (
                              <span className="text-slate-400 font-normal text-xs">
                                ({m.apelido})
                              </span>
                            )}
                            {m.is_auxiliar && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                                Auxiliar
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            {m.telefone && <span>📞 {m.telefone}</span>}
                            {m.chave_pix && (
                              <span className="font-mono text-slate-500">
                                PIX: {m.chave_pix.slice(0, 14)}…
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Qtd OS */}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-300">
                          {m.qtd_os}
                        </td>

                        {/* Mão de Obra */}
                        <td className="px-4 py-3 text-right font-mono text-indigo-300 font-semibold">
                          {R(m.total_servicos)}
                        </td>

                        {/* Peças */}
                        <td className="px-4 py-3 text-right font-mono text-amber-300">
                          {R(m.total_pecas)}
                        </td>

                        {/* Produção Total */}
                        <td className="px-4 py-3 text-right font-mono font-bold text-white text-sm">
                          {R(m.total_produzido)}
                        </td>

                        {/* Share % */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] font-semibold text-slate-300 font-mono">
                              <span>{P(m.share_pct)}</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  isTop1
                                    ? 'bg-amber-400'
                                    : isTop2
                                    ? 'bg-blue-400'
                                    : 'bg-indigo-500'
                                }`}
                                style={{ width: `${Math.min(100, m.share_pct)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Ticket Médio */}
                        <td className="px-4 py-3 text-right font-mono text-slate-300">
                          {R(m.ticket_medio)}
                        </td>

                        {/* Comissão Gerada */}
                        <td className="px-4 py-3 text-right font-mono font-bold text-purple-300">
                          {R(m.total_comissao)}
                        </td>

                        {/* Já Pago */}
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">
                          {R(m.total_pago)}
                        </td>

                        {/* Saldo a Pagar */}
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {m.saldo_a_pagar > 0 ? (
                            <span className="text-rose-400 bg-rose-950/60 border border-rose-800/80 px-2 py-1 rounded-lg">
                              {R(m.saldo_a_pagar)}
                            </span>
                          ) : (
                            <span className="text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-1 rounded-lg">
                              Quitado ✓
                            </span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setMecanicoFiltro(String(m.id))
                                setTab('extrato')
                              }}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700 text-xs font-medium"
                              title="Ver extrato individual"
                            >
                              Extrato
                            </button>
                            <button
                              onClick={() => handleOpenPagamento(m, m.saldo_a_pagar)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-xs font-bold shadow flex items-center gap-1"
                              title="Realizar pagamento de comissão"
                            >
                              <span>Pagar</span>
                            </button>
                            <button
                              onClick={() => {
                                const realMec = listaMecanicos.find((lm) => lm.id === m.id)
                                if (realMec) setHistoricoModalMecanico(realMec)
                              }}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-blue-300 rounded-lg transition-colors border border-slate-700"
                              title="Histórico de pagamentos"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CONTEÚDO DA ABA 2: EXTRATO DETALHADO ───────────────────────── */}
      {tab === 'extrato' && (
        <div className="space-y-4">
          {/* Barra de Ações do Extrato */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={buscaExtrato}
                  onChange={(e) => setBuscaExtrato(e.target.value)}
                  placeholder="Filtrar por placa, cliente, OS, serviço ou mecânico..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {buscaExtrato && (
                <button
                  onClick={() => setBuscaExtrato('')}
                  className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded-lg border border-slate-700"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePrintEspelho()}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span>Imprimir Espelho de Comissão</span>
              </button>

              {mecanicoFiltro !== 'todos' && (
                <button
                  onClick={() => {
                    const m = dadosProdutividade?.mecanicos.find(
                      (mec) => mec.id === Number(mecanicoFiltro)
                    )
                    if (m) handleOpenPagamento(m, m.saldo_a_pagar)
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Pagar este Mecânico</span>
                </button>
              )}
            </div>
          </div>

          {/* Tabela do Extrato */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Lançamentos Item a Item de Mão de Obra e Peças
                </h3>
                <p className="text-[11px] text-slate-400">
                  Mostrando {extratoFiltrado.length} de {dadosProdutividade?.extrato.length || 0} registros
                </p>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Total Comissão no Extrato:{' '}
                <strong className="text-purple-400">
                  {R(extratoFiltrado.reduce((acc, it) => acc + (it.comissao_valor || 0), 0))}
                </strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <th className="px-4 py-3">Data OS</th>
                    <th className="px-4 py-3">OS</th>
                    <th className="px-4 py-3">Veículo / Placa</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Mecânico / Técnico</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Descrição do Item</th>
                    <th className="px-4 py-3 text-right">Qtd</th>
                    <th className="px-4 py-3 text-right">Valor Base</th>
                    <th className="px-4 py-3 text-right">% Com.</th>
                    <th className="px-4 py-3 text-right">Comissão R$</th>
                    <th className="px-4 py-3 text-center">Status OS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loadingProdutividade ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-500">
                        Carregando extrato de serviços e comissões…
                      </td>
                    </tr>
                  ) : !extratoFiltrado.length ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-500">
                        Nenhum item localizado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    extratoFiltrado.map((it) => (
                      <tr key={it.item_id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {fmtData(it.data_os)}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            to={`/orders/${it.order_id}`}
                            className="text-blue-400 hover:text-blue-300 font-mono font-bold hover:underline"
                          >
                            #{it.os_numero}
                          </Link>
                          {it.venda_controle && (
                            <span className="block text-[10px] text-emerald-400 font-mono">
                              PDV #{it.venda_controle}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-bold text-white block">{it.plate}</span>
                          <span className="text-[11px] text-slate-400">{it.model}</span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-slate-200 block truncate max-w-[150px]">
                            {it.client_name || 'Consumidor'}
                          </span>
                          {it.client_phone && (
                            <span className="text-[10px] text-slate-500">{it.client_phone}</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-semibold text-white block">
                            {it.mecanico_nome}
                          </span>
                          {it.auxiliar_nome && (
                            <span className="text-[10px] text-amber-400 block font-medium">
                              Auxiliar: {it.auxiliar_nome}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {it.tipo === 'service' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
                              Serviço
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80">
                              Peça
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-200 block">{it.descricao}</span>
                          {it.codigo && (
                            <span className="text-[10px] font-mono text-slate-500">
                              Cód: {it.codigo}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-slate-300">
                          {it.quantidade}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-medium text-slate-200">
                          {R(it.valor_base)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-400">
                          {P(it.comissao_pct)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-purple-400">
                          {R(it.comissao_valor)}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              it.order_status === 'closed'
                                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60'
                                : it.order_status === 'in_progress'
                                ? 'bg-blue-950/70 text-blue-300 border border-blue-800/60'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {it.order_status === 'closed'
                              ? 'Faturada'
                              : it.order_status === 'in_progress'
                              ? 'Em Andamento'
                              : 'Aberta'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTEÚDO DA ABA 3: GESTÃO DE MECÂNICOS ──────────────────────── */}
      {tab === 'mecanicos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Quadro de Mecânicos & Técnicos</h2>
              <p className="text-xs text-slate-400">
                Cadastre profissionais, configure percentuais de comissão e gerencie dados para pagamento
              </p>
            </div>
            <button
              onClick={() => {
                setEditingMecanico(null)
                setMecanicoForm({
                  nome: '',
                  apelido: '',
                  cpf: '',
                  telefone: '',
                  chave_pix: '',
                  comissao_servico_pct: 0,
                  comissao_peca_pct: 0,
                  ativo: true,
                  is_auxiliar: false,
                  user_id: '',
                })
                setMecanicoFormError('')
                setMecanicoModalOpen(true)
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Mecânico</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listaMecanicos.map((m) => (
              <div
                key={m.id}
                className={`bg-slate-900 border rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all ${
                  m.ativo ? 'border-slate-800' : 'border-slate-800/60 opacity-60 bg-slate-950/60'
                }`}
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 font-bold text-sm shrink-0">
                        {m.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
                          <span>{m.nome}</span>
                          {m.is_auxiliar ? (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                              Auxiliar
                            </span>
                          ) : (
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-semibold">
                              Titular
                            </span>
                          )}
                        </h3>
                        {m.apelido && (
                          <p className="text-xs text-slate-400">Apelido: &ldquo;{m.apelido}&rdquo;</p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => alternarStatusMecanico(m)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                        m.ativo
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                      title={m.ativo ? 'Clique para desativar' : 'Clique para ativar'}
                    >
                      {m.ativo ? 'Ativo ✓' : 'Inativo ✕'}
                    </button>
                  </div>

                  {/* Usuário Vinculado ao App */}
                  <div className="mb-3">
                    {m.user_nome ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-950/40 border border-purple-800/50 text-[11px] text-purple-200">
                        <Smartphone className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="truncate">
                          App: <strong className="text-white">{m.user_nome}</strong> <span className="text-purple-300">({m.user_email})</span>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/40 border border-slate-700/40 text-[11px] text-slate-500">
                        <Smartphone className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>Sem login vinculado ao App</span>
                      </div>
                    )}
                  </div>

                  {/* Informações de Contato & PIX */}
                  <div className="space-y-1.5 text-xs border-y border-slate-800/80 py-3 my-3">
                    {m.cpf && (
                      <div className="flex justify-between text-slate-400">
                        <span>CPF:</span>
                        <span className="font-mono text-slate-300">{m.cpf}</span>
                      </div>
                    )}
                    {m.telefone && (
                      <div className="flex justify-between text-slate-400">
                        <span>Telefone / WhatsApp:</span>
                        <a
                          href={`https://wa.me/55${m.telefone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-emerald-400 hover:underline"
                        >
                          📞 {m.telefone}
                        </a>
                      </div>
                    )}
                    {m.chave_pix ? (
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Chave PIX:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-white text-[11px]">
                            {m.chave_pix.length > 20 ? `${m.chave_pix.slice(0, 18)}…` : m.chave_pix}
                          </span>
                          <button
                            onClick={() => handleCopyPix(m.id, m.chave_pix!)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                            title="Copiar chave PIX"
                          >
                            {copiedPixId === m.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between text-slate-500">
                        <span>Chave PIX:</span>
                        <span>Não cadastrada</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rodapé do Card */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingMecanico(m)
                        setMecanicoForm({
                          nome: m.nome,
                          apelido: m.apelido || '',
                          cpf: m.cpf || '',
                          telefone: m.telefone || '',
                          chave_pix: m.chave_pix || '',
                          comissao_servico_pct: 0,
                          comissao_peca_pct: 0,
                          ativo: m.ativo,
                          is_auxiliar: Boolean(m.is_auxiliar),
                          user_id: m.user_id || '',
                        })
                        setMecanicoFormError('')
                        setMecanicoModalOpen(true)
                      }}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={() => setHistoricoModalMecanico(m)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Histórico</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleOpenPagamento(m, 0)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center gap-1"
                  >
                    <span>Lançar Pgto</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL: CADASTRAR / EDITAR MECÂNICO ─────────────────────────── */}
      {mecanicoModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                <span>{editingMecanico ? 'Editar Mecânico / Técnico' : 'Cadastrar Novo Mecânico'}</span>
              </h2>
              <button
                onClick={() => setMecanicoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {mecanicoFormError && (
              <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs px-3.5 py-2.5 rounded-xl mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{mecanicoFormError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                salvarMecanico()
              }}
              className="space-y-3.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={mecanicoForm.nome}
                    onChange={(e) => setMecanicoForm({ ...mecanicoForm, nome: e.target.value })}
                    placeholder="Ex: Carlos Roberto da Silva"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Apelido na Oficina
                  </label>
                  <input
                    type="text"
                    value={mecanicoForm.apelido}
                    onChange={(e) => setMecanicoForm({ ...mecanicoForm, apelido: e.target.value })}
                    placeholder="Ex: Carlinhos / Beto"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={mecanicoForm.cpf}
                    onChange={(e) => setMecanicoForm({ ...mecanicoForm, cpf: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={mecanicoForm.telefone}
                    onChange={(e) => setMecanicoForm({ ...mecanicoForm, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Chave PIX para Pagamento
                </label>
                <input
                  type="text"
                  value={mecanicoForm.chave_pix}
                  onChange={(e) => setMecanicoForm({ ...mecanicoForm, chave_pix: e.target.value })}
                  placeholder="CPF, E-mail, Celular ou Chave Aleatória"
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Vínculo com Usuário do Sistema */}
              <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <label className="block text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                  <span>Vincular a Usuário do Sistema (Login no App Mobile / Web)</span>
                </label>
                <select
                  value={mecanicoForm.user_id}
                  onChange={(e) =>
                    setMecanicoForm({
                      ...mecanicoForm,
                      user_id: e.target.value ? Number(e.target.value) : '',
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Nenhum usuário vinculado (apenas controle interno da oficina)</option>
                  {usuariosSistema.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.email}) {u.role === 'mecanico' ? '• Perfil Mecânico' : `• ${u.role}`}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  💡 Quando o técnico fizer login no app com esta conta, suas Ordens de Serviço serão vinculadas automaticamente para acompanhamento de produtividade e comissão.
                </p>
              </div>

              {/* Função na Oficina: Mecânico Titular vs Auxiliar (Mutuamente exclusivos) */}
              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                <label className="block text-xs font-semibold text-slate-300">
                  Função / Papel na Oficina
                </label>

                {/* Checkbox Mecânico Ativo na Oficina */}
                <div className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all ${
                  mecanicoForm.ativo && !mecanicoForm.is_auxiliar
                    ? 'bg-blue-950/30 border-blue-800/60'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    id="mecanico-ativo"
                    checked={mecanicoForm.ativo && !mecanicoForm.is_auxiliar}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMecanicoForm({ ...mecanicoForm, ativo: true, is_auxiliar: false });
                      } else {
                        setMecanicoForm({ ...mecanicoForm, ativo: false, is_auxiliar: false });
                      }
                    }}
                    className="w-4 h-4 mt-0.5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <label htmlFor="mecanico-ativo" className="text-xs font-semibold text-slate-200 cursor-pointer flex items-center gap-1.5">
                      <span>Mecânico Ativo na Oficina</span>
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.2 rounded font-medium">
                        Titular
                      </span>
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Profissional atua como mecânico titular responsável por serviços e peças na oficina.
                    </p>
                  </div>
                </div>

                {/* Checkbox Auxiliar de Mecânico */}
                <div className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all ${
                  mecanicoForm.ativo && mecanicoForm.is_auxiliar
                    ? 'bg-amber-950/30 border-amber-800/60'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    id="mecanico-auxiliar"
                    checked={mecanicoForm.ativo && mecanicoForm.is_auxiliar}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMecanicoForm({ ...mecanicoForm, ativo: true, is_auxiliar: true });
                      } else {
                        setMecanicoForm({ ...mecanicoForm, ativo: false, is_auxiliar: false });
                      }
                    }}
                    className="w-4 h-4 mt-0.5 rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <label htmlFor="mecanico-auxiliar" className="text-xs font-semibold text-amber-300 cursor-pointer flex items-center gap-1.5">
                      <span>Auxiliar de Mecânico / Ajudante</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded font-medium">
                        Equipe
                      </span>
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Identifica este profissional como auxiliar. Ele poderá ser atribuído na Ordem de Serviço para trabalhar junto com o mecânico titular.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setMecanicoModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoMecanico}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50"
                >
                  {salvandoMecanico ? 'Salvando…' : 'Salvar Mecânico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PAGAR / ADIANTAR COMISSÃO ───────────────────────────── */}
      {pagamentoModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>Registrar Pagamento de Comissão</span>
              </h2>
              <button
                onClick={() => setPagamentoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pagamentoError && (
              <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs px-3.5 py-2.5 rounded-xl mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{pagamentoError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                executarPagamento()
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mecânico Beneficiário *
                </label>
                <select
                  value={pagamentoForm.mecanico_id}
                  onChange={(e) => {
                    const mid = Number(e.target.value)
                    const m = dadosProdutividade?.mecanicos.find((mec) => mec.id === mid)
                    const s = m ? m.saldo_a_pagar : 0
                    setPagamentoForm({
                      ...pagamentoForm,
                      mecanico_id: mid,
                      mecanico_nome: m?.nome || '',
                      saldo_sugerido: s,
                      valor: s > 0 ? Number(s.toFixed(2)) : pagamentoForm.valor,
                    })
                  }}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  <option value={0}>Selecione o mecânico...</option>
                  {listaMecanicos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} {m.apelido ? `(${m.apelido})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {pagamentoForm.saldo_sugerido > 0 && (
                <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3 flex items-center justify-between text-xs">
                  <span className="text-emerald-300">Saldo Pendente Apurado:</span>
                  <div className="flex items-center gap-2">
                    <strong className="text-emerald-400 font-mono text-sm">
                      {R(pagamentoForm.saldo_sugerido)}
                    </strong>
                    <button
                      type="button"
                      onClick={() =>
                        setPagamentoForm({
                          ...pagamentoForm,
                          valor: Number(pagamentoForm.saldo_sugerido.toFixed(2)),
                        })
                      }
                      className="text-[10px] bg-emerald-800 hover:bg-emerald-700 text-white px-2 py-0.5 rounded font-bold transition-colors"
                    >
                      Usar Saldo Total
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Valor a Pagar (R$) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={pagamentoForm.valor}
                      onChange={(e) =>
                        setPagamentoForm({
                          ...pagamentoForm,
                          valor: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data do Pagamento *
                  </label>
                  <input
                    type="date"
                    required
                    value={pagamentoForm.data_pagamento}
                    onChange={(e) =>
                      setPagamentoForm({ ...pagamentoForm, data_pagamento: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={pagamentoForm.forma_pagamento}
                  onChange={(e) =>
                    setPagamentoForm({ ...pagamentoForm, forma_pagamento: e.target.value })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro em Espécie</option>
                  <option value="transferencia">Transferência Bancária (TED/DOC)</option>
                  <option value="cartao">Cartão de Débito</option>
                  <option value="outro">Outro / Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações / Período
                </label>
                <textarea
                  rows={2}
                  value={pagamentoForm.observacoes}
                  onChange={(e) =>
                    setPagamentoForm({ ...pagamentoForm, observacoes: e.target.value })
                  }
                  placeholder="Ex: Acerto de comissões da primeira quinzena..."
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="gerar-lancamento-chk"
                  checked={pagamentoForm.gerar_contas_pagar}
                  onChange={(e) =>
                    setPagamentoForm({ ...pagamentoForm, gerar_contas_pagar: e.target.checked })
                  }
                  className="w-4 h-4 mt-0.5 rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="gerar-lancamento-chk" className="text-xs text-slate-300 leading-snug">
                  <span className="font-semibold block text-white">
                    Integrar com o Financeiro do ERP
                  </span>
                  Lança automaticamente a saída em Despesas / Contas a Pagar (Categoria: Salários / Pró-labore / Comissões).
                </label>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPagamentoModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pagandoComissao || pagamentoForm.valor <= 0}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
                >
                  {pagandoComissao ? 'Registrando…' : 'Confirmar Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: HISTÓRICO DE PAGAMENTOS DO MECÂNICO ──────────────────── */}
      {historicoModalMecanico && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-400" />
                  <span>Histórico de Pagamentos de Comissão</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mecânico: <strong className="text-white">{historicoModalMecanico.nome}</strong>{' '}
                  {historicoModalMecanico.apelido && `(${historicoModalMecanico.apelido})`}
                </p>
              </div>
              <button
                onClick={() => setHistoricoModalMecanico(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto py-4 flex-1">
              {loadingHistorico ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Carregando recibos de pagamento…
                </div>
              ) : !pagamentosHistorico.length ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Nenhum pagamento registrado ainda para este mecânico.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pagamentosHistorico.map((p) => (
                    <div
                      key={p.id}
                      className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between flex-wrap gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-emerald-400 font-mono">
                            {R(p.valor)}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            {p.forma_pagamento}
                          </span>
                          {p.id_lancamento && (
                            <span className="text-[10px] text-blue-400 bg-blue-950/60 border border-blue-800/60 px-1.5 py-0.2 rounded font-mono">
                              Doc ERP #{p.id_lancamento}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {p.observacoes || 'Pagamento de comissão'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Registrado por {p.created_by || 'Sistema'} em{' '}
                          {new Date(p.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-300 font-semibold block">
                          Data Pgto: {fmtData(p.data_pagamento)}
                        </span>
                        {p.periodo_inicio && p.periodo_fim && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Ref: {fmtData(p.periodo_inicio)} a {fmtData(p.periodo_fim)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
              <span className="text-xs text-slate-400">
                Total Acumulado Pago:{' '}
                <strong className="text-emerald-400 font-mono">
                  {R(pagamentosHistorico.reduce((acc, p) => acc + (p.valor || 0), 0))}
                </strong>
              </span>
              <button
                onClick={() => setHistoricoModalMecanico(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
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
