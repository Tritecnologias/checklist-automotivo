import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tenantsApi, usersApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { UserAdmin } from '../types'

const ROLE_OPTS = [
  { value: 'owner',    label: 'Proprietário' },
  { value: 'manager',  label: 'Gerente' },
  { value: 'operator', label: 'Operador' },
  { value: 'caixa',    label: 'Caixa' },
]

const ROLE_COLOR: Record<string, string> = {
  owner:    'bg-amber-500/20 text-amber-300',
  manager:  'bg-blue-500/20 text-blue-300',
  operator: 'bg-slate-500/20 text-slate-300',
  caixa:    'bg-green-500/20 text-green-300',
}

const EMPTY_FORM = {
  nome: '', email: '', password: '', role: 'operator',
  tenant_id: '' as string | number, tenant_ids: [] as number[],
}

export default function Usuarios() {
  const { isOwner } = useAuth()
  const qc = useQueryClient()

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list })
  const { data: lojas = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list, enabled: isOwner })

  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [formError, setFormError] = useState('')

  const [editing, setEditing] = useState<UserAdmin | null>(null)
  const [editData, setEditData] = useState({ nome: '', role: '', tenant_id: '' as string | number, ativo: true, password: '' })
  const [editError, setEditError] = useState('')

  const createMut = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowNew(false)
      setForm({ ...EMPTY_FORM })
    },
    onError: (e: any) => setFormError(e.message ?? 'Erro'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditing(null) },
    onError: (e: any) => setEditError(e.message ?? 'Erro'),
  })

  function handleCreate() {
    setFormError('')
    const { nome, email, password, role, tenant_id } = form
    if (!nome.trim() || !email.trim() || !password) {
      setFormError('Nome, e-mail e senha são obrigatórios')
      return
    }
    const payload: Parameters<typeof usersApi.create>[0] = {
      nome: nome.trim(), email: email.trim(), password, role,
    }
    if (role === 'operator' && tenant_id) payload.tenant_id = Number(tenant_id)
    if (role === 'manager' && form.tenant_ids.length > 0) payload.tenant_ids = form.tenant_ids
    createMut.mutate(payload)
  }

  function startEdit(u: UserAdmin) {
    setEditing(u)
    setEditData({ nome: u.nome, role: u.role, tenant_id: u.tenant_id ?? '', ativo: !!u.ativo, password: '' })
    setEditError('')
  }

  function saveEdit() {
    if (!editing) return
    setEditError('')
    const payload: Parameters<typeof usersApi.update>[1] = {}
    if (editData.nome.trim()) payload.nome = editData.nome.trim()
    if (isOwner) {
      payload.role = editData.role
      payload.tenant_id = editData.tenant_id !== '' ? Number(editData.tenant_id) : null
      payload.ativo = editData.ativo
    }
    if (editData.password) payload.password = editData.password
    updateMut.mutate({ id: editing.id, data: payload })
  }

  function toggleAtivo(u: UserAdmin) {
    updateMut.mutate({ id: u.id, data: { ativo: !u.ativo } })
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuários</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie os acessos ao sistema</p>
        </div>
        <button
          onClick={() => { setShowNew(v => !v); setFormError('') }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <span>＋</span> Novo usuário
        </button>
      </div>

      {/* Formulário novo usuário */}
      {showNew && (
        <div className="mb-6 bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Novo usuário</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nome</label>
              <input
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Nome completo"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">E-mail</label>
              <input
                type="email"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="usuario@email.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Senha inicial</label>
              <input
                type="password"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Perfil</label>
              <select
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value, tenant_id: '', tenant_ids: [] }))}
              >
                {(isOwner ? ROLE_OPTS : ROLE_OPTS.filter(r => r.value === 'operator')).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Operador → uma loja */}
            {form.role === 'operator' && isOwner && (
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1.5">Loja</label>
                <select
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  value={form.tenant_id}
                  onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}
                >
                  <option value="">— Selecione uma loja —</option>
                  {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            )}

            {/* Gerente → múltiplas lojas (checkboxes) */}
            {form.role === 'manager' && isOwner && lojas.length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-2">Lojas com acesso</label>
                <div className="flex flex-wrap gap-3">
                  {lojas.map(l => (
                    <label key={l.id} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-blue-500"
                        checked={form.tenant_ids.includes(l.id)}
                        onChange={e => setForm(f => ({
                          ...f,
                          tenant_ids: e.target.checked
                            ? [...f.tenant_ids, l.id]
                            : f.tenant_ids.filter(id => id !== l.id),
                        }))}
                      />
                      <span className="text-sm text-slate-300">{l.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {formError && <p className="text-xs text-red-400 mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {createMut.isPending ? 'Salvando…' : 'Criar usuário'}
            </button>
            <button
              onClick={() => { setShowNew(false); setFormError('') }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Edição inline */}
      {editing && (
        <div className="mb-6 bg-slate-800 border border-blue-600/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-blue-300">Editando: {editing.email}</h2>
            <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white text-sm">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nome</label>
              <input
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                value={editData.nome}
                onChange={e => setEditData(d => ({ ...d, nome: e.target.value }))}
                autoFocus
              />
            </div>
            {isOwner && (
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Perfil</label>
                <select
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  value={editData.role}
                  onChange={e => setEditData(d => ({ ...d, role: e.target.value, tenant_id: '' }))}
                >
                  {ROLE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {isOwner && editData.role === 'operator' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Loja</label>
                <select
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  value={editData.tenant_id}
                  onChange={e => setEditData(d => ({ ...d, tenant_id: e.target.value }))}
                >
                  <option value="">— Sem loja —</option>
                  {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nova senha (opcional)</label>
              <input
                type="password"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Deixe em branco para manter"
                value={editData.password}
                onChange={e => setEditData(d => ({ ...d, password: e.target.value }))}
              />
            </div>
            {isOwner && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-400">Status</label>
                <button
                  onClick={() => setEditData(d => ({ ...d, ativo: !d.ativo }))}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    editData.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {editData.ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            )}
          </div>
          {editError && <p className="text-xs text-red-400 mb-3">{editError}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={updateMut.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {updateMut.isPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Carregando…</p>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Usuário</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Perfil</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Loja</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={i < users.length - 1 ? 'border-b border-slate-700/50' : ''}>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-white">{u.nome}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${ROLE_COLOR[u.role]}`}>
                      {ROLE_OPTS.find(r => r.value === u.role)?.label ?? u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-300">{u.tenant_nome ?? (u.role === 'owner' ? 'Todas' : '—')}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      u.ativo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    }`}>
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => startEdit(u)}
                        className="text-xs text-slate-400 hover:text-white transition-colors"
                      >
                        ✏️ Editar
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => toggleAtivo(u)}
                          className={`text-xs transition-colors ${u.ativo ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                        >
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 text-sm">Nenhum usuário encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
