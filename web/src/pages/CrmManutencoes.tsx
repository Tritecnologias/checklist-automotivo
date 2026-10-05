import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { CrmManutencaoPreventivaItem } from '../types'
import {
  Users,
  Search,
  MessageCircle,
  Clock,
  Gauge,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  DollarSign,
  Printer,
  RefreshCw,
  Copy,
  ExternalLink,
  Phone,
  Car,
  Wrench,
  Filter,
  Check,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CrmManutencoes() {
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos')
  const [sort, setSort] = useState<string>('dias_desc')
  const [copiadoId, setCopiadoId] = useState<string | null>(null)
  const [modalItem, setModalItem] = useState<CrmManutencaoPreventivaItem | null>(null)
  const [mensagemCustom, setMensagemCustom] = useState<string>('')

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['crm-manutencoes', statusFiltro, categoriaFiltro, busca, sort],
    queryFn: () =>
      erpApi.crmManutencoesPreventivas({
        status: statusFiltro,
        categoria: categoriaFiltro,
        search: busca,
        sort,
      }),
  })

  const resumo = data?.resumo
  const clientes = data?.clientes || []

  const handleCopiarMensagem = (item: CrmManutencaoPreventivaItem, texto?: string) => {
    const txt = texto || item.mensagem_whatsapp
    navigator.clipboard.writeText(txt)
    setCopiadoId(item.id)
    setTimeout(() => setCopiadoId(null), 2500)
  }

  const handleAbrirModal = (item: CrmManutencaoPreventivaItem) => {
    setModalItem(item)
    setMensagemCustom(item.mensagem_whatsapp)
  }

  const handleEnviarWhatsappCustom = () => {
    if (!modalItem || !modalItem.telefone) return
    const cleanPhone = modalItem.telefone.replace(/\D/g, '')
    const ddi = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`
    const url = `https://wa.me/${ddi}?text=${encodeURIComponent(mensagemCustom)}`
    window.open(url, '_blank')
    setModalItem(null)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 print:p-0 print:max-w-none">
      {/* ── CABEÇALHO ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 print:border-none print:pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl text-white shadow-lg shadow-emerald-600/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Próxima Manutenção Preventiva & Retorno de Clientes
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  CRM Automotivo
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Identifique veículos no prazo ideal de revisão, fidelize clientes e gere receita ativa de pós-venda via WhatsApp
              </p>
            </div>
          </div>
        </div>

        {/* Ações de Topo */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700/80 transition-all shadow-sm"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Atualizar</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-600/20"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Relação</span>
          </button>
        </div>
      </div>

      {/* ── CARDS DE RESUMO DO CRM / FUNIL DE RETORNO ── */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total Monitorados */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Veículos Ativos</span>
              <Car className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-extrabold text-white font-mono">{resumo.total_veiculos}</p>
            <p className="text-[11px] text-slate-500 mt-1">Frota com histórico</p>
          </div>

          {/* Prontos para Contato (4 a 6 meses) */}
          <div
            onClick={() => setStatusFiltro(statusFiltro === 'proximo' ? 'todos' : 'proximo')}
            className={`cursor-pointer border rounded-2xl p-4 shadow-lg transition-all ${
              statusFiltro === 'proximo'
                ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/30'
                : 'bg-slate-900 border-amber-500/30 hover:border-amber-500/60'
            }`}
          >
            <div className="flex items-center justify-between text-amber-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Hora de Contatar</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-extrabold text-amber-400 font-mono">{resumo.proximos}</p>
            <p className="text-[11px] text-amber-300/80 mt-1">4 a 6 meses sem visita</p>
          </div>

          {/* Vencidos (6 a 12 meses) */}
          <div
            onClick={() => setStatusFiltro(statusFiltro === 'vencido' ? 'todos' : 'vencido')}
            className={`cursor-pointer border rounded-2xl p-4 shadow-lg transition-all ${
              statusFiltro === 'vencido'
                ? 'bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/30'
                : 'bg-slate-900 border-rose-500/30 hover:border-rose-500/60'
            }`}
          >
            <div className="flex items-center justify-between text-rose-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Revisão Vencida</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <p className="text-2xl font-extrabold text-rose-400 font-mono">{resumo.vencidos}</p>
            <p className="text-[11px] text-rose-300/80 mt-1">6 a 12 meses sem visita</p>
          </div>

          {/* Clientes Sumidos (+1 ano) */}
          <div
            onClick={() => setStatusFiltro(statusFiltro === 'inativo' ? 'todos' : 'inativo')}
            className={`cursor-pointer border rounded-2xl p-4 shadow-lg transition-all ${
              statusFiltro === 'inativo'
                ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                : 'bg-slate-900 border-purple-500/30 hover:border-purple-500/60'
            }`}
          >
            <div className="flex items-center justify-between text-purple-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Clientes Sumidos</span>
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-extrabold text-purple-400 font-mono">{resumo.inativos}</p>
            <p className="text-[11px] text-purple-300/80 mt-1">Mais de 1 ano sem retorno</p>
          </div>

          {/* Em Dia (< 4 meses) */}
          <div
            onClick={() => setStatusFiltro(statusFiltro === 'em_dia' ? 'todos' : 'em_dia')}
            className={`cursor-pointer border rounded-2xl p-4 shadow-lg transition-all ${
              statusFiltro === 'em_dia'
                ? 'bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/30'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Em Dia</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-400 font-mono">{resumo.em_dia}</p>
            <p className="text-[11px] text-slate-500 mt-1">Menos de 4 meses</p>
          </div>

          {/* Potencial de Receita */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Receita Potencial</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xl font-extrabold text-emerald-400 font-mono tracking-tight">
              {R(resumo.potencial_receita_estimada)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {resumo.proximos + resumo.vencidos} clientes aptos
            </p>
          </div>
        </div>
      )}

      {/* ── BARRA DE PESQUISA, FILTROS E ORDENAÇÃO ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-lg shadow-black/20 print:hidden">
        {/* Linha 1: Input de Busca e Ordenação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por placa, cliente, modelo ou telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9.5 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              Ordenar por:
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="dias_desc">Mais tempo sem visita (Urgência)</option>
              <option value="dias_asc">Menos tempo sem visita</option>
              <option value="gasto_desc">Maior valor histórico (Clientes VIP)</option>
              <option value="nome_asc">Nome do Cliente (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Linha 2: Pílulas de Filtro de Status */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-500" />
            Prazo:
          </span>
          {[
            { id: 'todos', label: 'Todos os Prazos' },
            { id: 'proximo', label: '🟡 Prontos para Contato (4 a 6 meses)', count: resumo?.proximos },
            { id: 'vencido', label: '🔴 Revisão Vencida (6 a 12 meses)', count: resumo?.vencidos },
            { id: 'inativo', label: '⚠️ Clientes Sumidos (+1 ano)', count: resumo?.inativos },
            { id: 'em_dia', label: '🟢 Em Dia (< 4 meses)', count: resumo?.em_dia },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFiltro(pill.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                statusFiltro === pill.id
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
              }`}
            >
              {pill.label}
              {pill.count !== undefined && <span className="ml-1.5 font-mono text-[10px] opacity-80">({pill.count})</span>}
            </button>
          ))}
        </div>

        {/* Linha 3: Pílulas de Categoria de Serviço */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1">
            <Wrench className="w-3 h-3 text-slate-500" />
            Serviço:
          </span>
          {[
            { id: 'todos', label: 'Todas Categorias' },
            { id: 'oleo', label: '🛢️ Óleo & Filtros' },
            { id: 'alinhamento', label: '⚖️ Alinhamento & Pneus' },
            { id: 'freio', label: '🛑 Freios & Suspensão' },
            { id: 'geral', label: '🔧 Revisão Geral' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoriaFiltro(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                categoriaFiltro === cat.id
                  ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Indicador de Carregamento */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-sm font-medium">Analisando histórico de manutenção de veículos e clientes…</p>
        </div>
      )}

      {/* Lista Vazia */}
      {!isLoading && clientes.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <p className="text-4xl">🚗</p>
          <h3 className="text-base font-bold text-white">Nenhum veículo encontrado para os filtros selecionados</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Tente remover os filtros de busca ou alterar o status de prazo para listar outros clientes cadastrados no sistema.
          </p>
        </div>
      )}

      {/* ── LISTAGEM DE VEÍCULOS / CLIENTES CRM ── */}
      {!isLoading && clientes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Exibindo <strong className="text-slate-200 font-mono">{clientes.length}</strong> veículos com manutenção preventiva mapeada
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {clientes.map((c) => {
              const statusCfg = {
                proximo: {
                  badge: 'bg-amber-950/60 text-amber-300 border-amber-700/60',
                  icon: '🟡',
                  label: 'Pronto para Contato (4 a 6 meses)',
                },
                vencido: {
                  badge: 'bg-rose-950/60 text-rose-300 border-rose-700/60',
                  icon: '🔴',
                  label: 'Revisão Vencida (6 a 12 meses)',
                },
                inativo: {
                  badge: 'bg-purple-950/60 text-purple-300 border-purple-700/60',
                  icon: '⚠️',
                  label: 'Cliente Sumido (+1 ano)',
                },
                em_dia: {
                  badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60',
                  icon: '🟢',
                  label: 'Em Dia (< 4 meses)',
                },
              }[c.status_manutencao]

              return (
                <div
                  key={c.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4.5 space-y-3.5 shadow-lg shadow-black/20 transition-all flex flex-col justify-between"
                >
                  {/* Topo do Card: Placa, Modelo e Status */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {/* Placa em formato mercosul */}
                        <div className="flex items-center gap-2">
                          <span className="inline-block bg-slate-950 border border-slate-700 px-2.5 py-0.5 rounded-md font-mono font-extrabold text-sm text-white tracking-widest shadow-inner">
                            {c.placa}
                          </span>
                          <span className="font-bold text-white text-sm truncate max-w-[200px]" title={c.modelo}>
                            {c.modelo}
                          </span>
                        </div>

                        {/* Nome do Cliente e Loja */}
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className="text-slate-300 font-semibold truncate max-w-[220px]" title={c.cliente_nome}>
                            {c.cliente_nome}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">· {c.tenant_nome}</span>
                        </div>
                      </div>

                      {/* Badge do Status */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${statusCfg.badge}`}>
                        <span>{statusCfg.icon}</span>
                        <span>{c.meses_sem_visita} meses</span>
                      </span>
                    </div>

                    {/* Linha de Métricas: Dias sem visita, Km e Gasto */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 my-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-medium">Última Visita</span>
                        <span className="text-slate-200 font-mono font-semibold">
                          {new Date(c.data_ultima_visita).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-[10px] text-slate-500 block">({c.dias_sem_visita} dias atrás)</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-medium">Quilometragem</span>
                        <span className="text-slate-200 font-mono font-semibold">
                          {c.km_ultima_visita > 0 ? `${c.km_ultima_visita.toLocaleString('pt-BR')} km` : 'Não informada'}
                        </span>
                        {c.km_estimado_atual && (
                          <span className="text-[10px] text-amber-400 font-mono block" title="Estimativa baseada em 1.000 km/mês">
                            est. ~{c.km_estimado_atual.toLocaleString('pt-BR')} km
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-medium">Total Histórico</span>
                        <span className="text-emerald-400 font-mono font-bold">{R(c.total_gasto)}</span>
                        <span className="text-[10px] text-slate-500 block">
                          {c.total_visitas} {c.total_visitas === 1 ? 'visita' : 'visitas'}
                        </span>
                      </div>
                    </div>

                    {/* Serviços Anteriores e Recomendação */}
                    <div className="space-y-1.5 text-xs">
                      {c.servicos_recentes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold mr-1">Últimos itens:</span>
                          {c.servicos_recentes.map((s, idx) => (
                            <span key={idx} className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-md border border-slate-700/60 truncate max-w-[200px]">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-2 text-xs text-emerald-300 flex items-start gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold">Recomendação: </strong>
                          <span>{c.recomendacao}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Card: Ações de Contato */}
                  <div className="border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-2">
                    {/* Telefone */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      {c.telefone ? (
                        <span className="font-mono text-slate-200 font-semibold">{c.telefone}</span>
                      ) : (
                        <span className="text-slate-500 italic">Telefone não cadastrado</span>
                      )}
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex items-center gap-1.5">
                      {c.cliente_id && (
                        <Link
                          to={`/erp/clientes/${c.cliente_id}`}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-all"
                          title="Ver histórico completo do cliente"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopiarMensagem(c)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-all"
                        title="Copiar mensagem pré-escrita para WhatsApp"
                      >
                        {copiadoId === c.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>

                      {c.link_whatsapp ? (
                        <a
                          href={c.link_whatsapp}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/40"
                        >
                          <MessageCircle className="w-3.5 h-3.5 fill-current" />
                          <span>WhatsApp</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAbrirModal(c)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-all"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Mensagem</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MODAL: CUSTOMIZAR E ENVIAR MENSAGEM WHATSAPP ── */}
      {modalItem && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-emerald-400" />
                  Enviar Mensagem de Manutenção Preventiva
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {modalItem.cliente_nome} · {modalItem.modelo} ({modalItem.placa})
                </p>
              </div>
              <button
                onClick={() => setModalItem(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Mensagem Personalizada para WhatsApp:
              </label>
              <textarea
                rows={7}
                value={mensagemCustom}
                onChange={(e) => setMensagemCustom(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-sans leading-relaxed resize-none"
              />
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs text-slate-400 flex justify-between">
              <span>Telefone de Destino:</span>
              <span className="text-white font-mono font-bold">
                {modalItem.telefone || 'Nenhum telefone informado'}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleCopiarMensagem(modalItem, mensagemCustom)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-all"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Texto</span>
              </button>

              <button
                type="button"
                onClick={handleEnviarWhatsappCustom}
                disabled={!modalItem.telefone_valido}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/30"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>Abrir no WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
