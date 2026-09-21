import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../lib/api'
import Modal from '../components/Modal'

type Client = {
  id: number
  nome_cliente: string
  cpf_cnpj: string
  telefone: string
  celular: string
  email: string
  cep: string
  endereco: string
  bairro: string
  cidade: string
  uf: string
  inativo: number
}

const empty: Omit<Client, 'id'> = {
  nome_cliente: '', cpf_cnpj: '', telefone: '', celular: '', email: '',
  cep: '', endereco: '', bairro: '', cidade: '', uf: '', inativo: 0,
}

export default function AdminClients() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)
  const [editing, setEditing]     = useState<Client | null>(null)
  const [adding, setAdding]       = useState(false)
  const [form, setForm]           = useState<Omit<Client, 'id'>>(empty)
  const [confirmDelete, setConfirmDelete] = useState<Client | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-clients', search, page],
    queryFn: () => adminApi.listClients(search, page),
  })

  const updateMut = useMutation({
    mutationFn: (c: Client) => adminApi.updateClient(c.id, c),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-clients'] }); setEditing(null) },
  })

  const createMut = useMutation({
    mutationFn: () => adminApi.createClient(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-clients'] })
      setAdding(false)
      setForm(empty)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => adminApi.toggleClient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-clients'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deleteClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-clients'] })
      setConfirmDelete(null)
    },
  })

  function onSearch(v: string) { setSearch(v); setPage(1) }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">👥 Clientes</h1>
          {data && <p className="text-sm text-slate-400 mt-0.5">{data.total.toLocaleString('pt-BR')} clientes cadastrados</p>}
        </div>
        <button
          onClick={() => { setForm(empty); setAdding(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Novo Cliente
        </button>
      </div>

      <input
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Buscar por nome, CPF/CNPJ ou cidade..."
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white mb-4 focus:outline-none focus:border-blue-500"
      />

      {isLoading ? (
        <p className="text-slate-400 py-8 text-center">Carregando clientes...</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-slate-400 text-left">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">CPF/CNPJ</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Cidade/UF</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data?.data.map((c: Client) => (
                  <tr key={c.id} className={`hover:bg-slate-900/60 ${c.inativo ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 text-white max-w-xs truncate">{c.nome_cliente}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{c.cpf_cnpj}</td>
                    <td className="px-4 py-3 text-slate-400">{c.celular || c.telefone}</td>
                    <td className="px-4 py-3 text-slate-400">{c.cidade}{c.uf ? `/${c.uf}` : ''}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleMut.mutate(c.id)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                          c.inativo
                            ? 'bg-red-900/40 text-red-400 hover:bg-red-900/70'
                            : 'bg-green-900/40 text-green-400 hover:bg-green-900/70'
                        }`}
                      >
                        {c.inativo ? 'Inativo' : 'Ativo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditing({ ...c })}
                          className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(c)}
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
        <Modal title="Editar Cliente" onClose={() => setEditing(null)}>
          <ClientForm
            value={editing}
            onChange={v => setEditing(v as Client)}
            onSubmit={() => updateMut.mutate(editing)}
            loading={updateMut.isPending}
            label="Salvar alterações"
          />
        </Modal>
      )}

      {adding && (
        <Modal title="Novo Cliente" onClose={() => setAdding(false)}>
          <ClientForm
            value={form}
            onChange={setForm}
            onSubmit={() => createMut.mutate()}
            loading={createMut.isPending}
            label="Criar cliente"
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Excluir cliente" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Tem certeza que deseja excluir permanentemente o cliente:
            </p>
            <p className="font-semibold text-white bg-slate-800 rounded-lg px-4 py-3">
              {confirmDelete.nome_cliente}
            </p>
            <p className="text-xs text-red-400">
              Esta ação não pode ser desfeita. O cliente será removido do banco de dados.
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

function ClientForm({
  value, onChange, onSubmit, loading, label,
}: {
  value: Omit<Client, 'id'>
  onChange: (v: Omit<Client, 'id'>) => void
  onSubmit: () => void
  loading: boolean
  label: string
}) {
  const set = (field: keyof Omit<Client, 'id'>) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value })

  return (
    <div className="space-y-3">
      <Field label="Nome do cliente *">
        <input value={value.nome_cliente} onChange={set('nome_cliente')} className={inp} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CPF / CNPJ">
          <input value={value.cpf_cnpj} onChange={set('cpf_cnpj')} className={inp} />
        </Field>
        <Field label="E-mail">
          <input type="email" value={value.email} onChange={set('email')} className={inp} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefone">
          <input value={value.telefone} onChange={set('telefone')} className={inp} />
        </Field>
        <Field label="Celular">
          <input value={value.celular} onChange={set('celular')} className={inp} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="CEP">
          <input value={value.cep} onChange={set('cep')} className={inp} />
        </Field>
        <Field label="UF">
          <input value={value.uf} onChange={set('uf')} maxLength={2} className={inp} />
        </Field>
        <Field label="Cidade">
          <input value={value.cidade} onChange={set('cidade')} className={inp} />
        </Field>
      </div>
      <Field label="Endereço">
        <input value={value.endereco} onChange={set('endereco')} className={inp} />
      </Field>
      <Field label="Bairro">
        <input value={value.bairro} onChange={set('bairro')} className={inp} />
      </Field>
      <button
        onClick={onSubmit}
        disabled={loading || !value.nome_cliente}
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

const inp = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500'
