import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  Sliders,
  Percent,
  ShieldAlert,
  ShieldCheck,
  Building2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  HelpCircle,
  RefreshCw,
  Save,
} from 'lucide-react'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PRESETS = [0, 2, 4, 5, 7.5, 10, 15, 20]

export default function ConfigParametros() {
  const { isOwner, currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const qc = useQueryClient()

  const [percentual, setPercentual] = useState<string>('4.0')
  const [aplicarTodasLojas, setAplicarTodasLojas] = useState(false)
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const { data: parametros, isLoading, isFetching } = useQuery({
    queryKey: ['pdv-parametros', tid],
    queryFn: erpApi.obterParametrosPdv,
  })

  useEffect(() => {
    if (parametros?.limite_desconto_padrao !== undefined) {
      setPercentual(String(parametros.limite_desconto_padrao))
    }
  }, [parametros])

  const mutation = useMutation({
    mutationFn: erpApi.salvarParametrosPdv,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pdv-parametros'] })
      setFeedback({
        tipo: 'sucesso',
        texto: `Limite de desconto atualizado com sucesso para ${res.limite_desconto_padrao}%!`,
      })
      setTimeout(() => setFeedback(null), 5000)
    },
    onError: (err: any) => {
      setFeedback({
        tipo: 'erro',
        texto: err?.message || 'Erro ao salvar parâmetros.',
      })
    },
  })

  const numPct = Math.max(0, Math.min(100, parseFloat(percentual.replace(',', '.')) || 0))

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    if (isNaN(numPct) || numPct < 0 || numPct > 100) {
      setFeedback({ tipo: 'erro', texto: 'Informe uma porcentagem válida entre 0% e 100%.' })
      return
    }
    mutation.mutate({
      limite_desconto_padrao: numPct,
      aplicar_todas_lojas: aplicarTodasLojas,
    })
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-teal-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-950/40">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Parâmetros do PDV
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Administração
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Defina regras comerciais, políticas de desconto e tolerâncias operacionais
            </p>
          </div>
        </div>

        {/* Loja Ativa */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 self-start sm:self-auto text-xs">
          <Building2 className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">Unidade:</span>
          <strong className="text-white">{currentTenant?.nome || 'Loja Principal'}</strong>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-fade-in ${
          feedback.tipo === 'sucesso'
            ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
            : 'bg-red-950/60 border-red-500/60 text-red-200'
        }`}>
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="font-medium">{feedback.texto}</span>
        </div>
      )}

      {/* Card Principal: Limite de Desconto */}
      <div className="bg-slate-900 rounded-3xl border border-slate-800 shadow-xl overflow-hidden">
        {/* Banner do card */}
        <div className="p-6 border-b border-slate-800/80 bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 shrink-0">
              <Percent className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Limite de Desconto para Usuários Comuns
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-teal-300 font-mono font-bold border border-slate-700">
                  {numPct}% atual
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                Percentual máximo de desconto que operadores e caixas podem conceder sem exigir autorização ou PIN de supervisor/administrador.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
            {numPct === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/50 text-amber-300 border border-amber-800/60">
                <ShieldAlert className="w-3.5 h-3.5" />
                PIN Obrigatório sempre
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/60">
                <ShieldCheck className="w-3.5 h-3.5" />
                Até {numPct}% sem PIN
              </span>
            )}
          </div>
        </div>

        {/* Formulário de Configuração */}
        <form onSubmit={handleSalvar} className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Input Gigante / Destaque */}
            <div className="lg:col-span-5 bg-slate-950/60 rounded-2xl p-5 border border-slate-800 text-center space-y-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Porcentagem Máxima Permitida
              </label>

              <div className="inline-flex items-center justify-center gap-2 bg-slate-900 border-2 border-slate-700 focus-within:border-teal-500 rounded-2xl px-4 py-2 transition-colors">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={percentual}
                  onChange={e => setPercentual(e.target.value)}
                  className="w-28 text-center text-3xl font-black text-white bg-transparent focus:outline-none font-mono"
                  placeholder="0.0"
                />
                <span className="text-2xl font-black text-teal-400">%</span>
              </div>

              {/* Slider de ajuste fino */}
              <div className="pt-2 px-2">
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={Math.min(50, numPct)}
                  onChange={e => setPercentual(e.target.value)}
                  className="w-full accent-teal-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                  <span>0%</span>
                  <span>10%</span>
                  <span>25%</span>
                  <span>50%</span>
                </div>
              </div>
            </div>

            {/* Botões Rápidos de Presets */}
            <div className="lg:col-span-7 space-y-3">
              <span className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Valores Pré-definidos Rápidos:
              </span>
              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map(p => {
                  const isSelected = Math.abs(numPct - p) < 0.05
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPercentual(String(p))}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center ${
                        isSelected
                          ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-950/50 scale-[1.02]'
                          : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:border-slate-600'
                      }`}
                    >
                      {p === 0 ? '0% (PIN)' : `${p}%`}
                      {p === 4 && <span className="block text-[9px] font-normal opacity-70">Anterior</span>}
                    </button>
                  )
                })}
              </div>

              <div className="pt-2">
                <p className="text-xs text-slate-400 leading-relaxed">
                  💡 <strong>Como funciona na prática:</strong> Qualquer operador ou caixa pode conceder descontos até{' '}
                  <strong className="text-teal-300 font-mono">{numPct}%</strong> sem interrupção. Se o desconto ultrapassar{' '}
                  <strong className="text-teal-300 font-mono">{numPct}%</strong>, o PDV abrirá automaticamente a janela de PIN solicitando a liberação do supervisor.
                </p>
              </div>
            </div>
          </div>

          {/* Simulação em Tempo Real */}
          <div className="bg-slate-950/40 rounded-2xl p-4 border border-slate-800/80 space-y-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              Simulação de Impacto em Vendas:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block mb-1">Venda de R$ 100,00</span>
                <span className="text-slate-200">Desconto livre: <strong className="text-emerald-400">{R(100 * (numPct / 100))}</strong></span>
                <span className="text-[10px] text-slate-500 block mt-1">Exige PIN acima de {R(100 * (numPct / 100))}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block mb-1">Venda de R$ 500,00</span>
                <span className="text-slate-200">Desconto livre: <strong className="text-emerald-400">{R(500 * (numPct / 100))}</strong></span>
                <span className="text-[10px] text-slate-500 block mt-1">Exige PIN acima de {R(500 * (numPct / 100))}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block mb-1">Venda de R$ 1.000,00</span>
                <span className="text-slate-200">Desconto livre: <strong className="text-emerald-400">{R(1000 * (numPct / 100))}</strong></span>
                <span className="text-[10px] text-slate-500 block mt-1">Exige PIN acima de {R(1000 * (numPct / 100))}</span>
              </div>
            </div>
          </div>

          {/* Opção para todas as lojas (somente se for Owner) */}
          {isOwner && (
            <div className="pt-1">
              <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={aplicarTodasLojas}
                  onChange={e => setAplicarTodasLojas(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span>Aplicar esta regra de porcentagem para <strong>todas as lojas/unidades</strong> da rede</span>
              </label>
            </div>
          )}

          {/* Botão de Salvar */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setPercentual('4.0')}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restaurar 4% (Padrão)
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-lg shadow-teal-950/50 transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {mutation.isPending ? 'Salvando Parâmetro…' : 'Salvar Parâmetros'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
