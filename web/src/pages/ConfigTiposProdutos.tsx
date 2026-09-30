import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../lib/api'
import Modal from '../components/Modal'
import type { ProdutoTipo } from '../types'
import {
  Layers,
  Plus,
  Search,
  Pencil,
  Trash2,
  Wrench,
  Package,
  AlertTriangle,
  ArrowLeft,
  Check,
  Boxes,
} from 'lucide-react'

export default function ConfigTiposProdutos() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterNatureza, setFilterNatureza] = useState<'todos' | 'produto' | 'servico'>('todos')
  const [erro, setErro] = useState('')

  // Modais de Criação / Edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTipo, setEditingTipo] = useState<ProdutoTipo | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formIsService, setFormIsService] = useState<number>(0)

  // Modal de Exclusão
  const [confirmDelete, setConfirmDelete] = useState<ProdutoTipo | null>(null)

  const { data: tipos = [], isLoading } = useQuery<ProdutoTipo[]>({
    queryKey: ['product-types'],
    queryFn: () => adminApi.getProductTypes(),
  })

  // Mutações
  const createMut = useMutation({
    mutationFn: (data: { nome_tipo: string; is_service: number }) =>
      adminApi.createProductType(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-types'] })
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      closeModal()
    },
    onError: (e: Error) => setErro(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { nome_tipo: string; is_service: number } }) =>
      adminApi.updateProductType(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-types'] })
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      closeModal()
    },
    onError: (e: Error) => setErro(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deleteProductType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-types'] })
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      setConfirmDelete(null)
      setErro('')
    },
    onError: (e: Error) => setErro(e.message),
  })

  function openCreateModal() {
    setEditingTipo(null)
    setFormNome('')
    setFormIsService(0)
    setErro('')
    setModalOpen(true)
  }

  function openEditModal(tipo: ProdutoTipo) {
    setEditingTipo(tipo)
    setFormNome(tipo.nome_tipo)
    setFormIsService(Number(tipo.is_service ?? 0))
    setErro('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingTipo(null)
    setFormNome('')
    setFormIsService(0)
    setErro('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nome = formNome.trim()
    if (!nome) {
      setErro('Informe o nome do tipo de produto.')
      return
    }
    setErro('')
    if (editingTipo) {
      updateMut.mutate({ id: editingTipo.id, data: { nome_tipo: nome, is_service: formIsService } })
    } else {
      createMut.mutate({ nome_tipo: nome, is_service: formIsService })
    }
  }

  // Filtragem
  const filteredTipos = useMemo(() => {
    return tipos.filter(t => {
      const matchSearch = t.nome_tipo.toLowerCase().includes(search.toLowerCase())
      const matchNatureza =
        filterNatureza === 'todos' ? true :
        filterNatureza === 'servico' ? Number(t.is_service) === 1 :
        Number(t.is_service) === 0
      return matchSearch && matchNatureza
    })
  }, [tipos, search, filterNatureza])

  // Estatísticas
  const totalTipos = tipos.length
  const totalProdutos = tipos.filter(t => Number(t.is_service) === 0).length
  const totalServicos = tipos.filter(t => Number(t.is_service) === 1).length
  const totalItensVinculados = tipos.reduce((acc, t) => acc + (t.total_produtos || 0), 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to="/erp/produtos"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar aos Produtos</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400">
              <Layers className="w-6 h-6" />
            </span>
            Tipos de Produtos
          </h1>
          <p className="text-sm text-slate-400">
            Cadastre e categorize os tipos de itens do estoque e ordens de serviço (Peças e Mão de Obra).
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/25 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Tipo</span>
        </button>
      </div>

      {erro && (
        <div className="bg-red-950/60 border border-red-800 rounded-xl p-3.5 text-sm text-red-300 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{erro}</span>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total de Tipos</span>
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{totalTipos}</p>
          <span className="text-[11px] text-slate-500">Categorias cadastradas</span>
        </div>

        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Peças / Produtos</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{totalProdutos}</p>
          <span className="text-[11px] text-slate-500">Itens físicos de estoque</span>
        </div>

        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Mão de Obra</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-400 mt-2">{totalServicos}</p>
          <span className="text-[11px] text-slate-500">Serviços / Mão de obra</span>
        </div>

        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Produtos Vinculados</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-blue-400 mt-2">
            {totalItensVinculados.toLocaleString('pt-BR')}
          </p>
          <span className="text-[11px] text-slate-500">Em todo o catálogo</span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tipo de produto..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/70"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {(
            [
              { value: 'todos', label: 'Todos' },
              { value: 'produto', label: '📦 Peças / Físico' },
              { value: 'servico', label: '🛠️ Mão de Obra' },
            ] as const
          ).map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilterNatureza(tab.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 ${
                filterNatureza === tab.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Tipos */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando tipos de produto...</div>
        ) : filteredTipos.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Nenhum tipo de produto encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-950/70 text-slate-400 text-left border-b border-slate-800/80">
                  <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider w-20">ID</th>
                  <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider">Nome do Tipo</th>
                  <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider">Natureza</th>
                  <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-center">
                    Produtos Cadastrados
                  </th>
                  <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTipos.map(t => {
                  const isServ = Number(t.is_service) === 1
                  const totalProds = Number(t.total_produtos ?? 0)

                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">
                        #{t.id}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-white">
                        <span className="flex items-center gap-2">
                          {isServ ? (
                            <Wrench className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          ) : (
                            <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          {t.nome_tipo}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {isServ ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/60">
                            🛠️ Mão de Obra / Serviço
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                            📦 Peça / Produto Físico
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <Link
                          to={`/erp/produtos?tipo=${t.id}`}
                          title="Clique para filtrar produtos deste tipo"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors"
                        >
                          <Boxes className="w-3.5 h-3.5 text-blue-400" />
                          <span>{totalProds.toLocaleString('pt-BR')} itens</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(t)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                            title="Editar tipo"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setErro('')
                              setConfirmDelete(t)
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            title="Excluir tipo"
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

      {/* Modal Criar / Editar Tipo */}
      {modalOpen && (
        <Modal
          title={editingTipo ? `Editar Tipo #${editingTipo.id}` : 'Novo Tipo de Produto'}
          onClose={closeModal}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {erro && (
              <div className="bg-red-950/60 border border-red-800 rounded-xl p-3 text-sm text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{erro}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Nome do Tipo *
              </label>
              <input
                autoFocus
                value={formNome}
                onChange={e => setFormNome(e.target.value)}
                placeholder="Ex: PNEUS, HIGIENIZAÇÃO, PEÇAS..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Nome de identificação exibido no cadastro e nas buscas do sistema.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Natureza do Item *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setFormIsService(0)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    formIsService === 0
                      ? 'bg-emerald-950/30 border-emerald-500/70 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      formIsService === 0
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-600'
                    }`}
                  >
                    {formIsService === 0 && <Check className="w-3 h-3" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <span>📦</span> Peça / Produto Físico
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Possui estoque físico, preço de custo/compra e venda no PDV/Estoque.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setFormIsService(1)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    formIsService === 1
                      ? 'bg-purple-950/30 border-purple-500/70 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      formIsService === 1
                        ? 'border-purple-500 bg-purple-500 text-white'
                        : 'border-slate-600'
                    }`}
                  >
                    {formIsService === 1 && <Check className="w-3 h-3" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <span>🛠️</span> Mão de Obra / Serviço
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Serviço prestado. Contabilizado como mão de obra nas OS sem abater estoque.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-blue-600/30 transition-all"
              >
                {createMut.isPending || updateMut.isPending ? 'Salvando...' : 'Salvar Tipo'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {confirmDelete && (
        <Modal title="Excluir Tipo de Produto" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            {Number(confirmDelete.total_produtos ?? 0) > 0 ? (
              <div className="bg-amber-950/50 border border-amber-800/80 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Não é possível excluir este tipo</span>
                </div>
                <p className="text-xs text-slate-300">
                  Existem <strong>{Number(confirmDelete.total_produtos).toLocaleString('pt-BR')}</strong> produtos cadastrados vinculados a{' '}
                  <strong className="text-white">"{confirmDelete.nome_tipo}"</strong>.
                </p>
                <p className="text-xs text-slate-400">
                  Para remover este tipo, reclassifique os produtos existentes primeiro para outro tipo.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-300">
                Tem certeza que deseja excluir o tipo <strong className="text-white">"{confirmDelete.nome_tipo}"</strong>? Esta ação não pode ser desfeita.
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
              >
                {Number(confirmDelete.total_produtos ?? 0) > 0 ? 'Entendido' : 'Cancelar'}
              </button>
              {Number(confirmDelete.total_produtos ?? 0) === 0 && (
                <button
                  type="button"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate(confirmDelete.id)}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {deleteMut.isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
