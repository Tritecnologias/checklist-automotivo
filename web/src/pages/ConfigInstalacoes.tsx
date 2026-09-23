import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../lib/api'
import type { Instalacao } from '../types'

export default function ConfigInstalacoes() {
  const qc = useQueryClient()
  const [nome, setNome]   = useState('')
  const [sigla, setSigla] = useState('')
  const [ordem, setOrdem] = useState('')
  const [erro, setErro]   = useState('')

  const { data: lista = [], isLoading } = useQuery<Instalacao[]>({
    queryKey: ['instalacoes'],
    queryFn: () => adminApi.getInstalacoes(),
  })

  const createMut = useMutation({
    mutationFn: () => adminApi.createInstalacao({
      nome: nome.trim(),
      sigla: sigla.trim(),
      ordem: ordem ? Number(ordem) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instalacoes'] })
      setNome(''); setSigla(''); setOrdem(''); setErro('')
    },
    onError: (e: Error) => setErro(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deleteInstalacao(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instalacoes'] }),
  })

  function handleAdd() {
    if (!nome.trim() || !sigla.trim()) { setErro('Nome e sigla são obrigatórios'); return }
    setErro('')
    createMut.mutate()
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">⚙️ Instalações</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Configure as posições de instalação disponíveis no cadastro de produtos (ex: LD, LE, D, T).
        </p>
      </div>

      {/* Formulário de adição */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <p className="text-sm font-medium text-slate-300">Nova instalação</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Nome completo *</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="ex: Lado Direito"
              className={inp}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Sigla *</label>
            <input
              value={sigla}
              onChange={e => setSigla(e.target.value.toUpperCase())}
              placeholder="ex: LD"
              maxLength={10}
              className={inp}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Ordem (opcional)</label>
          <input
            type="number"
            value={ordem}
            onChange={e => setOrdem(e.target.value)}
            placeholder="0"
            className={`${inp} w-28`}
          />
        </div>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <button
          onClick={handleAdd}
          disabled={createMut.isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {createMut.isPending ? 'Adicionando…' : '+ Adicionar'}
        </button>
      </div>

      {/* Lista */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="text-slate-400 text-sm text-center py-8">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Nenhuma instalação cadastrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sigla</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Ordem</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {lista.map(inst => (
                <tr key={inst.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold px-2 py-1 rounded bg-blue-500/15 text-blue-300 border border-blue-800/40">
                      {inst.sigla}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{inst.nome}</td>
                  <td className="px-4 py-3 text-slate-400 text-center">{inst.ordem}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteMut.mutate(inst.id)}
                      disabled={deleteMut.isPending}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const inp = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500'
