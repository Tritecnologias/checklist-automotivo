import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  UserPlus,
  Pencil,
  Trash2,
  FileText,
  Search,
  X,
  Phone,
  Power,
  AlertTriangle,
  Building2,
  ExternalLink,
} from 'lucide-react'
import { erpApi } from '../lib/api'
import type { ClienteErp } from '../types'
import { useAuth } from '../contexts/AuthContext'
import ClienteModal from '../components/ClienteModal'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR')
}

function PlaceBadge({ plate }: { plate: string | null }) {
  if (!plate) return <span className="text-slate-500 text-xs">—</span>
  return (
    <span className="font-mono text-xs bg-slate-800 text-amber-400 px-2 py-0.5 rounded border border-slate-700 font-semibold tracking-wide">
      {plate}
    </span>
  )
}

function LojasBadge({ lojas }: { lojas: string | null }) {
  if (!lojas) return <span className="text-slate-600 text-xs">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {lojas.split(', ').map(n => (
        <span
          key={n}
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-800/40 whitespace-nowrap"
        >
          {n}
        </span>
      ))}
    </div>
  )
}

export default function Clientes() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos')
  const [page, setPage] = useState(1)
  const [inputVal, setInputVal] = useState('')

  // Modais de CRUD
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Modal de Exclusão
  const [deleteTarget, setDeleteTarget] = useState<ClienteErp | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['erp-clientes', tid, search, status, page],
    queryFn: () => erpApi.clientes({ search: search || undefined, status, page }),
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(inputVal)
    setPage(1)
  }

  function handleClear() {
    setInputVal('')
    setSearch('')
    setPage(1)
  }

  function handleOpenCreate() {
    setEditingId(null)
    setModalOpen(true)
  }

  function handleOpenEdit(client: ClienteErp) {
    setEditingId(client.id)
    setModalOpen(true)
  }

  async function handleToggleStatus(client: ClienteErp, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await erpApi.toggleClienteStatus(client.id)
      queryClient.invalidateQueries({ queryKey: ['erp-clientes'] })
      setFeedbackMsg({
        type: 'success',
        text: `Status do cliente "${client.nome}" atualizado!`,
      })
      setTimeout(() => setFeedbackMsg(null), 3000)
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || 'Erro ao alterar status do cliente.',
      })
      setTimeout(() => setFeedbackMsg(null), 4000)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await erpApi.excluirCliente(deleteTarget.id)
      queryClient.invalidateQueries({ queryKey: ['erp-clientes'] })
      setDeleteTarget(null)
      setFeedbackMsg({
        type: 'success',
        text: res.message || 'Cliente excluído/inativado com sucesso.',
      })
      setTimeout(() => setFeedbackMsg(null), 4000)
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || 'Erro ao excluir cliente.',
      })
      setTimeout(() => setFeedbackMsg(null), 4000)
    } finally {
      setDeleting(false)
    }
  }

  const clientes: ClienteErp[] = data?.data ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Clientes</h1>
            <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
              {total.toLocaleString('pt-BR')} cadastrados
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Clientes cadastrados no ERP com veículos, histórico de compras e ordens de serviço
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Novo Cliente</span>
        </button>
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between animate-fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              : 'bg-red-950/70 border-red-800 text-red-300'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="Buscar por nome, placa, telefone ou CPF/CNPJ…"
              className="w-full bg-slate-800/90 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            Buscar
          </button>
          {search && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
            >
              Limpar
            </button>
          )}
        </form>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700 self-start md:self-auto">
          <button
            type="button"
            onClick={() => { setStatus('ativos'); setPage(1); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              status === 'ativos'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ativos
          </button>
          <button
            type="button"
            onClick={() => { setStatus('inativos'); setPage(1); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              status === 'inativos'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Inativos
          </button>
          <button
            type="button"
            onClick={() => { setStatus('todos'); setPage(1); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              status === 'todos'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      {/* Clientes Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-slate-400 text-sm font-medium">Carregando clientes…</span>
          </div>
        ) : isError ? (
          <div className="text-center py-20 text-red-400 space-y-3">
            <p>Erro ao carregar lista de clientes. Verifique a conexão com o servidor.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors border border-slate-700 inline-flex items-center gap-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : clientes.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            Nenhum cliente encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left bg-slate-950/40">
                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Placa</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Veículo</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Lojas</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Compras</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total Gasto</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Última Compra</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {clientes.map(c => {
                  const phoneDigits = (c.telefone || c.celular || '').replace(/\D/g, '')
                  const hasWa = phoneDigits.length >= 10
                  const isInactive = c.inativo === 1

                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/erp/clientes/${c.id}`)}
                      className={`hover:bg-slate-800/70 cursor-pointer transition-colors group ${
                        isInactive ? 'opacity-60 bg-red-950/10' : ''
                      }`}
                    >
                      {/* Cliente info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                            {c.nome}
                          </p>
                          {isInactive && (
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800/50">
                              Inativo
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-400">
                          {c.telefone && (
                            <span className="flex items-center gap-1 text-slate-300">
                              <Phone className="w-3 h-3 text-slate-500" />
                              {c.telefone}
                              {hasWa && (
                                <a
                                  href={`https://wa.me/55${phoneDigits}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  title="Abrir no WhatsApp"
                                  className="text-emerald-400 hover:text-emerald-300 p-0.5 rounded hover:bg-emerald-950/50 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </span>
                          )}
                          {c.cpf_cnpj && (
                            <span className="font-mono text-[11px] text-slate-500">
                              CPF/CNPJ: {c.cpf_cnpj}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Placa */}
                      <td className="px-4 py-3">
                        <PlaceBadge plate={c.placa} />
                      </td>

                      {/* Veículo */}
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {c.modelo || <span className="text-slate-600">—</span>}
                      </td>

                      {/* Lojas */}
                      <td className="px-4 py-3">
                        <LojasBadge lojas={c.lojas} />
                      </td>

                      {/* Compras */}
                      <td className="px-4 py-3 text-right text-slate-300 font-medium">
                        {c.qtd_compras}
                      </td>

                      {/* Total gasto */}
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                        {currency(c.total_gasto)}
                      </td>

                      {/* Última compra */}
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {formatDate(c.ultima_compra)}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/erp/clientes/${c.id}`)}
                            title="Ver histórico e Ordens de Serviço"
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-600/15 rounded-lg transition-colors"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(c)}
                            title="Editar Dados do Cliente"
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-600/15 rounded-lg transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={e => handleToggleStatus(c, e)}
                            title={isInactive ? 'Reativar Cliente' : 'Inativar Cliente'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isInactive
                                ? 'text-red-400 hover:text-emerald-400 hover:bg-emerald-600/15'
                                : 'text-slate-400 hover:text-amber-400 hover:bg-amber-600/15'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            title="Excluir Cliente"
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-600/15 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            Página {page} de {pages} ({total} clientes)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              Próxima →
            </button>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Cliente */}
      <ClienteModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        clienteId={editingId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['erp-clientes'] })
          refetch()
        }}
      />

      {/* Modal de Confirmação de Exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Cliente</h3>
                <p className="text-xs text-slate-400">Confirmação de segurança</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              Deseja realmente remover o cliente{' '}
              <strong className="text-white font-semibold">{deleteTarget.nome}</strong>?
            </p>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Nota de Integridade:</p>
              <p>
                Se o cliente possuir histórico de compras ou ordens de serviço vinculadas, o sistema o{' '}
                <strong className="text-amber-400">inativará</strong> automaticamente para proteger os relatórios de fechamento de caixa e faturamento.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-red-600/30 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Excluindo…
                  </>
                ) : (
                  <>Confirmar Exclusão</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
