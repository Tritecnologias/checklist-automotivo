import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../lib/api'
import Modal from '../components/Modal'

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
  const [editing, setEditing] = useState<Product | null>(null)
  const [adding, setAdding]   = useState(false)
  const [form, setForm]       = useState<Omit<Product, 'id'>>(empty)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-products', search, page],
    queryFn: () => adminApi.listProducts(search, page),
  })

  const updateMut = useMutation({
    mutationFn: (p: Product) => adminApi.updateProduct(p.id, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-products'] }); setEditing(null) },
  })

  const createMut = useMutation({
    mutationFn: () => adminApi.createProduct(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      setAdding(false)
      setForm(empty)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => adminApi.toggleProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
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
                      <button
                        onClick={() => setEditing({ ...p })}
                        className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                      >
                        Editar
                      </button>
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
          />
        </Modal>
      )}
    </div>
  )
}

function ProductForm({
  value, onChange, onSubmit, loading, label,
}: {
  value: Omit<Product, 'id'>
  onChange: (v: Omit<Product, 'id'>) => void
  onSubmit: () => void
  loading: boolean
  label: string
}) {
  const set = (field: keyof Omit<Product, 'id'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [field]: e.target.value })

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
      <Field label="Estoque">
        <input type="number" step="1" value={value.estoque} onChange={set('estoque')} className={input} />
      </Field>
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
