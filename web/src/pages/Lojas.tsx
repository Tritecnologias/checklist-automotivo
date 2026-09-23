import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tenantsApi } from '../lib/api'
import type { TenantAdmin } from '../types'

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function Lojas() {
  const qc = useQueryClient()
  const { data: lojas = [], isLoading } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list })

  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ nome: '', slug: '' })
  const [formError, setFormError] = useState('')

  const [editing, setEditing] = useState<TenantAdmin | null>(null)
  const [editNome, setEditNome] = useState('')

  const createMut = useMutation({
    mutationFn: tenantsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setShowNew(false); setForm({ nome: '', slug: '' }) },
    onError: (e: any) => setFormError(e.message ?? 'Erro'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { nome?: string; ativo?: boolean } }) =>
      tenantsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })

  function handleCreate() {
    setFormError('')
    if (!form.nome.trim() || !form.slug.trim()) { setFormError('Nome e slug são obrigatórios'); return }
    createMut.mutate(form)
  }

  function handleNomeChange(v: string) {
    setForm({ nome: v, slug: slugify(v) })
  }

  function startEdit(l: TenantAdmin) { setEditing(l); setEditNome(l.nome) }

  function saveEdit() {
    if (!editing || !editNome.trim()) return
    updateMut.mutate({ id: editing.id, data: { nome: editNome.trim() } }, {
      onSuccess: () => setEditing(null),
    })
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Lojas</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie as unidades do sistema</p>
        </div>
        <button
          onClick={() => { setShowNew(v => !v); setFormError('') }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <span>＋</span> Nova loja
        </button>
      </div>

      {/* Formulário nova loja */}
      {showNew && (
        <div className="mb-6 bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Nova loja</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nome</label>
              <input
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Ex: Loja Centro"
                value={form.nome}
                onChange={e => handleNomeChange(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Slug (URL amigável)</label>
              <input
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="loja-centro"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              />
            </div>
          </div>
          {formError && <p className="text-xs text-red-400 mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {createMut.isPending ? 'Salvando…' : 'Criar loja'}
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

      {/* Lista */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Carregando…</p>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Nome</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Slug</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {lojas.map((l, i) => (
                <tr key={l.id} className={i < lojas.length - 1 ? 'border-b border-slate-700/50' : ''}>
                  <td className="px-5 py-3.5">
                    <code className="text-xs font-mono font-bold text-slate-300 bg-slate-900 px-2 py-0.5 rounded">{l.id}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    {editing?.id === l.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white w-44 focus:outline-none focus:border-blue-500"
                          value={editNome}
                          onChange={e => setEditNome(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                          autoFocus
                        />
                        <button onClick={saveEdit} className="text-xs text-blue-400 hover:text-blue-300 font-semibold">Salvar</button>
                        <button onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-white">{l.nome}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-slate-400 bg-slate-900 px-2 py-0.5 rounded">{l.slug}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      l.ativo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    }`}>
                      {l.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {editing?.id !== l.id && (
                        <button
                          onClick={() => startEdit(l)}
                          className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          ✏️ Editar
                        </button>
                      )}
                      <button
                        onClick={() => updateMut.mutate({ id: l.id, data: { ativo: !l.ativo } })}
                        className={`text-xs transition-colors ${l.ativo ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                      >
                        {l.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {lojas.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 text-sm">Nenhuma loja cadastrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
