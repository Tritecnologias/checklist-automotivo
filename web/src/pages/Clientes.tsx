import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { ClienteErp } from '../types'
import { useAuth } from '../contexts/AuthContext'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR')
}

function PlaceBadge({ plate }: { plate: string | null }) {
  if (!plate) return <span className="text-slate-500 text-xs">—</span>
  return (
    <span className="font-mono text-xs bg-slate-800 text-amber-400 px-2 py-0.5 rounded border border-slate-700">
      {plate}
    </span>
  )
}

function LojasBadge({ lojas }: { lojas: string | null }) {
  if (!lojas) return <span className="text-slate-600 text-xs">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {lojas.split(', ').map(n => (
        <span key={n} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-800/40 whitespace-nowrap">
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
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [inputVal, setInputVal] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['erp-clientes', tid, search, page],
    queryFn: () => erpApi.clientes({ search: search || undefined, page }),
    staleTime: 30_000,
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

  const clientes: ClienteErp[] = data?.data ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Clientes cadastrados no ERP com histórico de veículos
          </p>
        </div>
        <span className="text-xs text-slate-500">{total} clientes</span>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder="Buscar por nome ou placa…"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Buscar
        </button>
        {search && (
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
          >
            Limpar
          </button>
        )}
      </form>

      {/* Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-slate-400 text-sm">Carregando…</span>
          </div>
        ) : isError ? (
          <div className="text-center py-20 text-red-400">
            Erro ao carregar clientes. Verifique a conexão.
          </div>
        ) : clientes.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Placa</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Veículo</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lojas</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Compras</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Gasto</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Última Compra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {clientes.map(c => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/erp/clientes/${c.id}`)}
                  className="hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-100">{c.nome}</p>
                    {c.telefone && (
                      <p className="text-xs text-slate-500 mt-0.5">{c.telefone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PlaceBadge plate={c.placa} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{c.modelo ?? '—'}</td>
                  <td className="px-4 py-3"><LojasBadge lojas={c.lojas} /></td>
                  <td className="px-4 py-3 text-right text-slate-300">{c.qtd_compras}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-400">
                    {currency(c.total_gasto)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {formatDate(c.ultima_compra)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-xs text-slate-500">
            Página {page} de {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}
