import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../lib/api'
import Modal from '../components/Modal'
import type { Instalacao } from '../types'

type Product = {
  id: number
  nome_produto: string
  cod_barra: string
  unidade: string
  id_tipo: number
  vr_compra: number
  vr_venda: number
  vr_venda_2: number
  estoque: number
  inativo: number
}

const empty: Omit<Product, 'id'> = {
  nome_produto: '', cod_barra: '', unidade: 'UN', id_tipo: 1,
  vr_compra: 0, vr_venda: 0, vr_venda_2: 0, estoque: 0, inativo: 0,
}

const BRL = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export default function AdminProducts() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)
  const [editing, setEditing]     = useState<Product | null>(null)
  const [adding, setAdding]       = useState(false)
  const [form, setForm]           = useState<Omit<Product, 'id'>>(empty)
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null)
  const [editingInstIds, setEditingInstIds] = useState<number[]>([])
  const [addingInstIds, setAddingInstIds]   = useState<number[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['admin-products', search, page],
    queryFn: () => adminApi.listProducts(search, page),
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-products'] }); setEditing(null) },
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
      setAdding(false)
      setForm(empty)
      setAddingInstIds([])
    },
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => adminApi.toggleProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      setConfirmDelete(null)
    },
  })

  function onSearch(v: string) { setSearch(v); setPage(1) }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">📦 Produtos</h1>
          {data && <p className="text-sm text-slate-400 mt-0.5">{data.total.toLocaleString('pt-BR')} produtos cadastrados</p>}
        </div>
        <button
          onClick={() => { setForm(empty); setAdding(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Novo Produto
        </button>
      </div>

      <input
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Buscar por nome ou código de barras..."
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white mb-4 focus:outline-none focus:border-blue-500"
      />

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
                    <td className="px-4 py-3 text-right text-slate-300">{Number(p.estoque).toFixed(0)}</td>
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
    </div>
  )
}

function ProductForm({
  value, onChange, onSubmit, loading, label,
  todasInstalacoes, selectedInstIds, onInstChange,
}: {
  value: Omit<Product, 'id'>
  onChange: (v: Omit<Product, 'id'>) => void
  onSubmit: () => void
  loading: boolean
  label: string
  todasInstalacoes: Instalacao[]
  selectedInstIds: number[]
  onInstChange: (ids: number[]) => void
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
        <select value={value.id_tipo} onChange={set('id_tipo')} className={input}>
          <option value={1}>Peça / Produto</option>
          <option value={2}>Mão de obra</option>
          <option value={9}>Alinhamento / Balanceamento</option>
        </select>
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

      <Field label="Estoque">
        <input type="number" step="1" value={value.estoque} onChange={set('estoque')} className={input} />
      </Field>
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
