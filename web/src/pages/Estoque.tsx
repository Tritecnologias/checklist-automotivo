import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { ProdutoEstoque } from '../types'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const FILTROS = [
  { value: '',      label: 'Todos' },
  { value: 'baixo', label: 'Estoque baixo' },
  { value: 'zerado',label: 'Zerado' },
]

export default function Estoque() {
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState('')
  const [page, setPage] = useState(1)

  const { data: res, isLoading } = useQuery({
    queryKey: ['estoque', search, filtro, page],
    queryFn: () => erpApi.estoque({ search, filtro, page }),
  })

  const produtos = res?.data ?? []

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold text-white">Estoque</h1>

      <div className="flex gap-3 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {FILTROS.map(f => (
            <button
              key={f.value}
              onClick={() => { setFiltro(f.value); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filtro === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar produto…"
          className="flex-1 min-w-48 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Carregando…</div>
        ) : produtos.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">Nenhum produto encontrado</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Cód. barras</th>
                <th className="px-4 py-3 text-center">Un.</th>
                <th className="px-4 py-3 text-right">Custo</th>
                <th className="px-4 py-3 text-right">Venda</th>
                <th className="px-4 py-3 text-center">Mín.</th>
                <th className="px-4 py-3 text-right">Estoque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {produtos.map((p: ProdutoEstoque) => {
                const zerado = p.estoque <= 0
                const baixo  = !zerado && p.estoque <= p.min_estoque
                return (
                  <tr key={p.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="text-slate-200">{p.nome_produto}</p>
                      <p className="text-xs text-slate-500">{p.grupo || '—'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{p.cod_barra || '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{p.unidade}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{R(Number(p.vr_custo))}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-200">{R(Number(p.vr_venda))}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{p.min_estoque}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${
                        zerado ? 'text-red-400' : baixo ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {p.estoque}
                      </span>
                      {zerado && <span className="ml-1 text-xs text-red-500 font-normal">zerado</span>}
                      {baixo  && <span className="ml-1 text-xs text-amber-500 font-normal">baixo</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {(res?.pages ?? 0) > 1 && (
          <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-sm text-slate-500">
            <span>{res?.total} produtos</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40">←</button>
              <span className="px-2 py-1 text-slate-400">{page} / {res?.pages}</span>
              <button disabled={page >= (res?.pages ?? 1)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
