import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../lib/api'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import { Tag, Plus, Layers, AlertTriangle, Check } from 'lucide-react'
import type { Instalacao, ProdutoTipo } from '../types'

type Product = {
  id: number
  nome_produto: string
  cod_barra: string
  unidade: string
  id_tipo: number
  tipo_nome?: string
  is_service?: number
  vr_compra: number
  vr_venda: number
  vr_venda_2: number
  estoque: number
  inativo: number
  controla_estoque: number
}

const empty: Omit<Product, 'id'> = {
  nome_produto: '', cod_barra: '', unidade: 'UN', id_tipo: 1,
  vr_compra: 0, vr_venda: 0, vr_venda_2: 0, estoque: 0, inativo: 0,
  controla_estoque: 1,
}

const BRL = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

const STATUS_OPTIONS: { value: 'ativos' | 'inativos' | 'todos'; label: string }[] = [
  { value: 'ativos',   label: 'Ativos' },
  { value: 'todos',    label: 'Todos' },
  { value: 'inativos', label: 'Inativos' },
]

export default function AdminProducts() {
  const qc = useQueryClient()
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos')
  const [tipoFilter, setTipoFilter] = useState(searchParams.get('tipo') ?? '')
  const [page, setPage]     = useState(1)
  const [editing, setEditing]     = useState<Product | null>(null)
  const [adding, setAdding]       = useState(false)
  const [form, setForm]           = useState<Omit<Product, 'id'>>(empty)
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null)
  const [editingInstIds, setEditingInstIds] = useState<number[]>([])
  const [addingInstIds, setAddingInstIds]   = useState<number[]>([])

  // Modal rápido de novo tipo
  const [quickTipoOpen, setQuickTipoOpen] = useState(false)
  const [quickTipoNome, setQuickTipoNome] = useState('')
  const [quickTipoIsService, setQuickTipoIsService] = useState(0)
  const [quickTipoErro, setQuickTipoErro] = useState('')

  const { data: todosTipos = [] } = useQuery<ProdutoTipo[]>({
    queryKey: ['product-types'],
    queryFn: () => adminApi.getProductTypes(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-products', tid, search, status, tipoFilter, page],
    queryFn: () => adminApi.listProducts(search, page, status, tipoFilter || undefined),
  })

  const { data: todasInstalacoes = [] } = useQuery<Instalacao[]>({
    queryKey: ['instalacoes'],
    queryFn: () => adminApi.getInstalacoes(),
  })

  useEffect(() => {
    if (!editing) { setEditingInstIds([]); return }
    adminApi.getProductInstalacoes(editing.id)
      .then(setEditingInstIds)
      .catch(() => setEditingInstIds([]))
  }, [editing?.id])

  const updateMut = useMutation({
    mutationFn: async (p: Product) => {
      await adminApi.updateProduct(p.id, p)
      await adminApi.setProductInstalacoes(p.id, editingInstIds)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      setEditing(null)
    },
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await adminApi.createProduct(form) as { id: number }
      if (res.id && addingInstIds.length > 0) {
        await adminApi.setProductInstalacoes(res.id, addingInstIds)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      setAdding(false)
      setForm(empty)
      setAddingInstIds([])
    },
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => adminApi.toggleProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      setConfirmDelete(null)
    },
  })

  const quickTipoMut = useMutation({
    mutationFn: (data: { nome_tipo: string; is_service: number }) =>
      adminApi.createProductType(data),
    onSuccess: (newTipo) => {
      qc.invalidateQueries({ queryKey: ['product-types'] })
      if (adding) {
        setForm(f => ({ ...f, id_tipo: newTipo.id }))
      }
      if (editing) {
        setEditing(e => (e ? { ...e, id_tipo: newTipo.id } : null))
      }
      setQuickTipoOpen(false)
      setQuickTipoNome('')
      setQuickTipoIsService(0)
      setQuickTipoErro('')
    },
    onError: (err: Error) => setQuickTipoErro(err.message),
  })

  function onSearch(v: string) { setSearch(v); setPage(1) }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Tag className="w-6 h-6 text-blue-500 shrink-0" />
            <span>Produtos</span>
          </h1>
          {data && (
            <p className="text-sm text-slate-400 mt-0.5">
              {data.total.toLocaleString('pt-BR')} produtos {status === 'ativos' ? 'ativos' : status === 'inativos' ? 'inativos' : 'cadastrados'}
              {currentTenant?.nome && <span className="text-slate-500 ml-1.5">• Loja: {currentTenant.nome}</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/erp/config/tipos"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-700 transition-colors flex items-center gap-2"
          >
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Tipos de Produto</span>
          </Link>
          <button
            onClick={() => { setForm(empty); setAdding(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-blue-500/20"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Novo Produto</span>
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="flex rounded-lg overflow-hidden border border-slate-700 shrink-0">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setStatus(opt.value); setPage(1) }}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                status === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {opt.label}
              {data?.counts && (
                <span className="ml-1 opacity-75 text-xs">
                  (
                  {opt.value === 'ativos'
                    ? data.counts.total_ativos.toLocaleString('pt-BR')
                    : opt.value === 'inativos'
                    ? data.counts.total_inativos.toLocaleString('pt-BR')
                    : data.counts.total.toLocaleString('pt-BR')}
                  )
                </span>
              )}
            </button>
          ))}
        </div>

        <select
          value={tipoFilter}
          onChange={e => {
            const val = e.target.value
            setTipoFilter(val)
            setPage(1)
            if (val) setSearchParams({ tipo: val })
            else setSearchParams({})
          }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shrink-0"
        >
          <option value="">Todos os tipos</option>
          {todosTipos.map(t => (
            <option key={t.id} value={t.id}>
              {Number(t.is_service) === 1 ? '🛠️' : '📦'} {t.nome_tipo} ({Number(t.total_produtos ?? 0)})
            </option>
          ))}
        </select>

        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Buscar por nome ou código de barras..."
          className="flex-1 min-w-48 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
        />
      </div>

      {isLoading ? (
        <p className="text-slate-400 py-8 text-center">Carregando produtos...</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-slate-400 text-left">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Un.</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium text-right">Compra</th>
                  <th className="px-4 py-3 font-medium text-right">Venda</th>
                  <th className="px-4 py-3 font-medium text-center">Markup</th>
                  <th className="px-4 py-3 font-medium text-right">Estoque</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data?.data.map((p: Product) => (
                  <tr key={p.id} className={`hover:bg-slate-900/60 ${p.inativo ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 text-white max-w-xs truncate">{p.nome_produto}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{p.cod_barra}</td>
                    <td className="px-4 py-3 text-slate-400">{p.unidade}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                        Number(p.is_service) === 1
                          ? 'bg-purple-950/60 text-purple-300 border border-purple-800/50'
                          : 'bg-slate-800 text-slate-300 border border-slate-700/60'
                      }`}>
                        <span>{Number(p.is_service) === 1 ? '🛠️' : '📦'}</span>
                        <span className="truncate max-w-[130px]">{p.tipo_nome || 'PEÇAS'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-right">{BRL(p.vr_compra)}</td>
                    <td className="px-4 py-3 text-green-400 font-semibold text-right">{BRL(p.vr_venda)}</td>
                    <td className="px-4 py-3 text-center">
                      {p.vr_compra > 0 && p.vr_venda > 0 ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                          p.vr_venda >= p.vr_compra
                            ? 'bg-emerald-900/40 text-emerald-400'
                            : 'bg-red-900/40 text-red-400'
                        }`}>
                          {p.vr_venda >= p.vr_compra ? '+' : ''}
                          {(((p.vr_venda - p.vr_compra) / p.vr_compra) * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.controla_estoque === 0 ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-950/70 text-purple-300 border border-purple-800/60"
                          title="Não controla estoque (Estoque infinito)"
                        >
                          ∞ Infinito
                        </span>
                      ) : (
                        <span className="text-slate-300">{Number(p.estoque).toFixed(0)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleMut.mutate(p.id)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                          p.inativo
                            ? 'bg-red-900/40 text-red-400 hover:bg-red-900/70'
                            : 'bg-green-900/40 text-green-400 hover:bg-green-900/70'
                        }`}
                      >
                        {p.inativo ? 'Inativo' : 'Ativo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditing({ ...p })}
                          className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p)}
                          className="text-red-400 hover:text-red-300 text-xs font-medium"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
            <span>Página {page} de {data?.pages ?? 1}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-lg bg-slate-800 disabled:opacity-40 hover:bg-slate-700 transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(data?.pages ?? 1, p + 1))}
                disabled={page >= (data?.pages ?? 1)}
                className="px-3 py-1 rounded-lg bg-slate-800 disabled:opacity-40 hover:bg-slate-700 transition-colors"
              >
                Próxima →
              </button>
            </div>
          </div>
        </>
      )}

      {editing && (
        <Modal title="Editar Produto" onClose={() => setEditing(null)}>
          <ProductForm
            value={editing}
            onChange={v => setEditing(v as Product)}
            onSubmit={() => updateMut.mutate(editing)}
            loading={updateMut.isPending}
            label="Salvar alterações"
            todasInstalacoes={todasInstalacoes}
            selectedInstIds={editingInstIds}
            onInstChange={setEditingInstIds}
            todosTipos={todosTipos}
            onOpenQuickTipo={() => setQuickTipoOpen(true)}
          />
        </Modal>
      )}

      {adding && (
        <Modal title="Novo Produto" onClose={() => setAdding(false)}>
          <ProductForm
            value={form}
            onChange={setForm}
            onSubmit={() => createMut.mutate()}
            loading={createMut.isPending}
            label="Criar produto"
            todasInstalacoes={todasInstalacoes}
            selectedInstIds={addingInstIds}
            onInstChange={setAddingInstIds}
            todosTipos={todosTipos}
            onOpenQuickTipo={() => setQuickTipoOpen(true)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Excluir produto" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Tem certeza que deseja excluir permanentemente o produto:
            </p>
            <p className="font-semibold text-white bg-slate-800 rounded-lg px-4 py-3">
              {confirmDelete.nome_produto}
            </p>
            <p className="text-xs text-red-400">
              Esta ação não pode ser desfeita. O produto será removido do banco de dados.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMut.mutate(confirmDelete.id)}
                disabled={deleteMut.isPending}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {deleteMut.isPending ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Rápido de Criação de Tipo de Produto */}
      {quickTipoOpen && (
        <Modal title="Novo Tipo de Produto" onClose={() => setQuickTipoOpen(false)}>
          <form
            onSubmit={e => {
              e.preventDefault()
              const nome = quickTipoNome.trim()
              if (!nome) {
                setQuickTipoErro('Informe o nome do tipo')
                return
              }
              setQuickTipoErro('')
              quickTipoMut.mutate({ nome_tipo: nome, is_service: quickTipoIsService })
            }}
            className="space-y-4"
          >
            {quickTipoErro && (
              <div className="bg-red-950/60 border border-red-800 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{quickTipoErro}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Nome do Tipo *
              </label>
              <input
                autoFocus
                value={quickTipoNome}
                onChange={e => setQuickTipoNome(e.target.value)}
                placeholder="Ex: HIGIENIZAÇÃO, PNEUS..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Natureza do Item *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div
                  onClick={() => setQuickTipoIsService(0)}
                  className={`p-2.5 rounded-xl border cursor-pointer text-xs font-medium flex items-center gap-2 ${
                    quickTipoIsService === 0
                      ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    quickTipoIsService === 0 ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-600'
                  }`}>
                    {quickTipoIsService === 0 && <Check className="w-2.5 h-2.5" />}
                  </div>
                  <span>📦 Peça / Produto</span>
                </div>

                <div
                  onClick={() => setQuickTipoIsService(1)}
                  className={`p-2.5 rounded-xl border cursor-pointer text-xs font-medium flex items-center gap-2 ${
                    quickTipoIsService === 1
                      ? 'bg-purple-950/40 border-purple-500/80 text-purple-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    quickTipoIsService === 1 ? 'border-purple-500 bg-purple-500 text-white' : 'border-slate-600'
                  }`}>
                    {quickTipoIsService === 1 && <Check className="w-2.5 h-2.5" />}
                  </div>
                  <span>🛠️ Mão de Obra</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickTipoOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={quickTipoMut.isPending}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition-all"
              >
                {quickTipoMut.isPending ? 'Salvando...' : 'Salvar Tipo'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function ProductForm({
  value, onChange, onSubmit, loading, label,
  todasInstalacoes, selectedInstIds, onInstChange,
  todosTipos, onOpenQuickTipo,
}: {
  value: Omit<Product, 'id'>
  onChange: (v: Omit<Product, 'id'>) => void
  onSubmit: () => void
  loading: boolean
  label: string
  todasInstalacoes: Instalacao[]
  selectedInstIds: number[]
  onInstChange: (ids: number[]) => void
  todosTipos: ProdutoTipo[]
  onOpenQuickTipo: () => void
}) {
  const set = (field: keyof Omit<Product, 'id'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [field]: e.target.value })

  function toggleInst(id: number) {
    onInstChange(
      selectedInstIds.includes(id)
        ? selectedInstIds.filter(x => x !== id)
        : [...selectedInstIds, id]
    )
  }

  return (
    <div className="space-y-3">
      <Field label="Nome do produto *">
        <input value={value.nome_produto} onChange={set('nome_produto')} className={input} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código de barras">
          <input value={value.cod_barra} onChange={set('cod_barra')} className={input} />
        </Field>
        <Field label="Unidade">
          <input value={value.unidade} onChange={set('unidade')} className={input} placeholder="UN" />
        </Field>
      </div>
      <Field label="Tipo">
        <div className="flex gap-2">
          <select value={value.id_tipo} onChange={set('id_tipo')} className={`${input} flex-1`}>
            {todosTipos.map(t => (
              <option key={t.id} value={t.id}>
                {Number(t.is_service) === 1 ? '🛠️' : '📦'} {t.nome_tipo}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onOpenQuickTipo}
            title="Cadastrar novo tipo de produto"
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>Novo Tipo</span>
          </button>
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Preço compra">
          <input type="number" step="0.01" value={value.vr_compra} onChange={set('vr_compra')} className={input} />
        </Field>
        <Field label="Preço venda *">
          <input type="number" step="0.01" value={value.vr_venda} onChange={set('vr_venda')} className={input} />
        </Field>
        <Field label="Preço venda 2">
          <input type="number" step="0.01" value={value.vr_venda_2} onChange={set('vr_venda_2')} className={input} />
        </Field>
      </div>

      {/* Indicador de Porcentagem / Markup aplicada */}
      {(() => {
        const compra = Number(value.vr_compra) || 0
        const venda  = Number(value.vr_venda) || 0
        const venda2 = Number(value.vr_venda_2) || 0

        if (compra <= 0 && venda <= 0) return null

        const markup1 = compra > 0 ? ((venda - compra) / compra) * 100 : null
        const margem1 = venda > 0 ? ((venda - compra) / venda) * 100 : null
        const lucro1  = venda - compra

        const markup2 = compra > 0 && venda2 > 0 ? ((venda2 - compra) / compra) * 100 : null
        const lucro2  = venda2 > 0 ? venda2 - compra : null

        return (
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs flex-wrap gap-1">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <span>📈</span> Porcentagem aplicada (Markup):
              </span>
              <div className="flex items-center gap-2">
                {markup1 !== null ? (
                  <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                    markup1 >= 0
                      ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700/50'
                      : 'bg-red-900/60 text-red-400 border border-red-700/50'
                  }`}>
                    {markup1 >= 0 ? `+${markup1.toFixed(1)}%` : `${markup1.toFixed(1)}%`}
                  </span>
                ) : null}
                <span className="text-slate-400 text-xs">
                  (Lucro: <strong className={lucro1 >= 0 ? 'text-emerald-400' : 'text-red-400'}>{BRL(lucro1)}</strong>
                  {margem1 !== null ? ` · Margem: ${margem1.toFixed(1)}%` : ''})
                </span>
              </div>
            </div>

            {venda2 > 0 && markup2 !== null && (
              <div className="flex items-center justify-between text-xs border-t border-slate-700/50 pt-2 flex-wrap gap-1">
                <span className="text-slate-400 font-medium">Porcentagem (Venda 2):</span>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                    markup2 >= 0
                      ? 'bg-blue-900/60 text-blue-400 border border-blue-700/50'
                      : 'bg-red-900/60 text-red-400 border border-red-700/50'
                  }`}>
                    {markup2 >= 0 ? `+${markup2.toFixed(1)}%` : `${markup2.toFixed(1)}%`}
                  </span>
                  {lucro2 !== null && (
                    <span className="text-slate-400 text-xs">
                      (Lucro: <strong className={lucro2 >= 0 ? 'text-blue-400' : 'text-red-400'}>{BRL(lucro2)}</strong>)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Controle de estoque / Estoque infinito */}
      <div className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-3">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.controla_estoque === 0}
            onChange={(e) =>
              onChange({
                ...value,
                controla_estoque: e.target.checked ? 0 : 1,
              })
            }
            className="w-4 h-4 mt-0.5 rounded text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500 focus:ring-offset-slate-900"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">
                Não controla estoque (Estoque infinito)
              </span>
              {value.controla_estoque === 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950/90 text-purple-300 border border-purple-700">
                  ∞ ATIVADO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Ideal para serviços, mão de obra ou produtos sem limite de quantidade. As vendas não baixarão e não haverá restrição de estoque.
            </p>
          </div>
        </label>
      </div>

      {value.controla_estoque !== 0 ? (
        <Field label="Estoque atual">
          <input type="number" step="1" value={value.estoque} onChange={set('estoque')} className={input} />
        </Field>
      ) : (
        <Field label="Estoque atual">
          <div className="w-full bg-slate-800/40 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-400 text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <span className="text-purple-400 font-bold text-base">∞</span> Não se aplica (Estoque infinito)
            </span>
            <span className="text-xs text-slate-500 italic">Vendas ilimitadas</span>
          </div>
        </Field>
      )}
      {todasInstalacoes.length > 0 && (
        <Field label="Instalações">
          <div className="flex flex-wrap gap-2 pt-1">
            {todasInstalacoes.map(inst => {
              const checked = selectedInstIds.includes(inst.id)
              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => toggleInst(inst.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    checked
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {inst.sigla}
                  {inst.nome !== inst.sigla && (
                    <span className={`ml-1 font-normal ${checked ? 'text-blue-200' : 'text-slate-500'}`}>
                      {inst.nome}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Field>
      )}
      <button
        onClick={onSubmit}
        disabled={loading || !value.nome_produto}
        className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
      >
        {loading ? 'Salvando...' : label}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

const input = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500'
