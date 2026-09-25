import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { ProdutoEstoque } from '../types'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import { Boxes, Tag } from 'lucide-react'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const FILTROS = [
  { value: '',       label: 'Todos' },
  { value: 'baixo',  label: 'Estoque baixo' },
  { value: 'zerado', label: 'Zerado' },
]

type Tipo = 'entrada' | 'saida' | 'ajuste'

const TIPOS: { value: Tipo; label: string; desc: string; cor: string }[] = [
  { value: 'entrada', label: 'Entrada',           desc: 'Adiciona ao estoque atual',        cor: 'bg-green-600 hover:bg-green-500' },
  { value: 'saida',   label: 'Saída',             desc: 'Subtrai do estoque atual',         cor: 'bg-red-600 hover:bg-red-500'   },
  { value: 'ajuste',  label: 'Ajuste (inventário)',desc: 'Define o valor exato do estoque',  cor: 'bg-blue-600 hover:bg-blue-500' },
]

function AjusteModal({
  produto,
  onClose,
}: {
  produto: ProdutoEstoque
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<Tipo>('entrada')
  const [quantidade, setQuantidade] = useState('')

  const mut = useMutation({
    mutationFn: () =>
      erpApi.ajustarEstoque(produto.id, tipo, Number(quantidade)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estoque'] })
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      onClose()
    },
  })

  const qty = Number(quantidade)
  const novoEstoque =
    tipo === 'ajuste'  ? qty :
    tipo === 'entrada' ? produto.estoque + qty :
    Math.max(0, produto.estoque - qty)

  const tipoAtual = TIPOS.find(t => t.value === tipo)!
  const invalido = !quantidade || isNaN(qty) || qty < 0 || (tipo !== 'ajuste' && qty === 0)

  return (
    <Modal title={`Ajuste de Estoque — ${produto.nome_produto}`} onClose={onClose}>
      <div className="space-y-5">

        {/* Estoque atual */}
        <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
          <span className="text-sm text-slate-400">Estoque atual</span>
          <span className={`text-xl font-bold ${
            produto.estoque <= 0 ? 'text-red-400' :
            produto.estoque <= produto.min_estoque ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {produto.estoque} {produto.unidade}
          </span>
        </div>

        {/* Tipo de movimentação */}
        <div>
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Tipo de movimentação</p>
          <div className="grid grid-cols-3 gap-2">
            {TIPOS.map(t => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                  tipo === t.value
                    ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1.5">{tipoAtual.desc}</p>
        </div>

        {/* Quantidade */}
        <div>
          <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">
            {tipo === 'ajuste' ? 'Nova quantidade em estoque' : 'Quantidade'}
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={quantidade}
            onChange={e => setQuantidade(e.target.value)}
            placeholder="0"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-lg font-semibold focus:outline-none focus:border-blue-500"
            autoFocus
          />
        </div>

        {/* Preview do resultado */}
        {quantidade !== '' && !isNaN(qty) && (
          <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
            <span className="text-sm text-slate-400">Estoque após ajuste</span>
            <span className={`text-xl font-bold ${
              novoEstoque <= 0 ? 'text-red-400' :
              novoEstoque <= produto.min_estoque ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {novoEstoque} {produto.unidade}
            </span>
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={invalido || mut.isPending}
            className={`flex-1 px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 ${tipoAtual.cor}`}
          >
            {mut.isPending ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>

        {mut.isError && (
          <p className="text-red-400 text-xs text-center">
            Erro ao salvar. Tente novamente.
          </p>
        )}
      </div>
    </Modal>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Estoque() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState('')
  const [page, setPage] = useState(1)
  const [ajustando, setAjustando] = useState<ProdutoEstoque | null>(null)

  const { data: res, isLoading } = useQuery({
    queryKey: ['estoque', tid, search, filtro, page],
    queryFn: () => erpApi.estoque({ search, filtro, page }),
  })

  const produtos = res?.data ?? []

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Boxes className="w-6 h-6 text-blue-500 shrink-0" />
            <span>Estoque</span>
          </h1>
          {res && (
            <p className="text-sm text-slate-500 mt-0.5">{res.total} produtos cadastrados</p>
          )}
        </div>
        <Link
          to="/erp/produtos"
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow"
        >
          <Tag className="w-4 h-4 shrink-0" />
          <span>Cadastrar / Gerenciar Produtos</span>
        </Link>
      </div>

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
                <th className="px-4 py-3 text-center">Markup</th>
                <th className="px-4 py-3 text-center">Mín.</th>
                <th className="px-4 py-3 text-right">Estoque</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {produtos.map((p: ProdutoEstoque) => {
                const zerado = p.estoque <= 0
                const baixo  = !zerado && p.estoque <= p.min_estoque
                const custo  = Number(p.vr_custo) || 0
                const venda  = Number(p.vr_venda) || 0
                const markup = custo > 0 ? ((venda - custo) / custo) * 100 : null

                return (
                  <tr key={p.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="text-slate-200">{p.nome_produto}</p>
                      <p className="text-xs text-slate-500">{p.grupo || '—'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{p.cod_barra || '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{p.unidade}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{R(custo)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-200">{R(venda)}</td>
                    <td className="px-4 py-3 text-center">
                      {markup !== null ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                          markup >= 0
                            ? 'bg-emerald-900/40 text-emerald-400'
                            : 'bg-red-900/40 text-red-400'
                        }`}>
                          {markup >= 0 ? `+${markup.toFixed(1)}%` : `${markup.toFixed(1)}%`}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
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
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setAjustando(p)}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors whitespace-nowrap"
                      >
                        ± Ajustar
                      </button>
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

      {ajustando && (
        <AjusteModal produto={ajustando} onClose={() => setAjustando(null)} />
      )}
    </div>
  )
}
