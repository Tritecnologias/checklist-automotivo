import { useState, useMemo } from 'react'
import { X, Calculator, Banknote, Coins, Check, RotateCcw } from 'lucide-react'

interface ContadorCedulasModalProps {
  isOpen: boolean
  onClose: () => void
  onApply: (total: number) => void
  initialTotal?: number
}

const CEDULAS = [
  { val: 200, label: 'R$ 200,00' },
  { val: 100, label: 'R$ 100,00' },
  { val: 50,  label: 'R$ 50,00' },
  { val: 20,  label: 'R$ 20,00' },
  { val: 10,  label: 'R$ 10,00' },
  { val: 5,   label: 'R$ 5,00' },
  { val: 2,   label: 'R$ 2,00' },
]

const MOEDAS = [
  { val: 1.00, label: 'R$ 1,00' },
  { val: 0.50, label: 'R$ 0,50' },
  { val: 0.25, label: 'R$ 0,25' },
  { val: 0.10, label: 'R$ 0,10' },
  { val: 0.05, label: 'R$ 0,05' },
]

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ContadorCedulasModal({
  isOpen,
  onClose,
  onApply,
}: ContadorCedulasModalProps) {
  const [tab, setTab] = useState<'cedulas' | 'rapido'>('cedulas')

  // Estado da contagem por cédulas e moedas
  const [qtds, setQtds] = useState<Record<number, number>>({})

  // Estado do somador rápido de montantes (estilo calculadora / rascunho de papel)
  const [textoMontantes, setTextoMontantes] = useState('')

  function handleQtdChange(val: number, countStr: string) {
    const count = parseInt(countStr.replace(/\D/g, '') || '0', 10)
    setQtds(prev => ({ ...prev, [val]: Math.max(0, count) }))
  }

  // Total pela contagem de notas
  const totalCedulas = useMemo(() => {
    let sum = 0
    for (const [valStr, count] of Object.entries(qtds)) {
      sum += parseFloat(valStr) * (count || 0)
    }
    return sum
  }, [qtds])

  // Total pelo somador rápido (ex: 950 + 40 + 30 + 15 + 4)
  const totalRapido = useMemo(() => {
    if (!textoMontantes.trim()) return 0
    // Extrai todos os números válidos separados por espaço, quebra de linha, vírgula ou sinal de mais
    const tokens = textoMontantes
      .replace(/\+/g, ' ')
      .replace(/;/g, ' ')
      .split(/[\s\n]+/)
      .filter(Boolean)

    let sum = 0
    for (const token of tokens) {
      const num = parseFloat(token.replace(/\./g, '').replace(',', '.'))
      if (!isNaN(num)) sum += num
    }
    return sum
  }, [textoMontantes])

  const totalFinal = tab === 'cedulas' ? totalCedulas : totalRapido

  function handleReset() {
    setQtds({})
    setTextoMontantes('')
  }

  function handleConfirm() {
    onApply(totalFinal)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Contagem de Dinheiro da Gaveta</h2>
              <p className="text-xs text-slate-400">
                Conferência física de notas e moedas para fechamento de caixa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setTab('cedulas')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
              tab === 'cedulas'
                ? 'border-emerald-500 text-emerald-300 bg-slate-800/80'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span>Por Cédulas e Moedas</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('rapido')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
              tab === 'rapido'
                ? 'border-emerald-500 text-emerald-300 bg-slate-800/80'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>Somador Rápido de Montantes (Ex: 950 + 40 + 30...)</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
          {tab === 'cedulas' ? (
            <div className="space-y-6">
              {/* Cédulas */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-400" />
                  Cédulas
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {CEDULAS.map(c => {
                    const count = qtds[c.val] || ''
                    const sub = (qtds[c.val] || 0) * c.val
                    return (
                      <div
                        key={c.val}
                        className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-3 space-y-1.5 focus-within:border-emerald-500 transition-colors"
                      >
                        <span className="text-xs font-bold text-slate-200 block">{c.label}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={count}
                            onChange={e => handleQtdChange(c.val, e.target.value)}
                            placeholder="0"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-center text-white font-mono font-semibold focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-400 block text-right">
                          = {R(sub)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Moedas */}
              <div className="pt-3 border-t border-slate-800">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  Moedas
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {MOEDAS.map(m => {
                    const count = qtds[m.val] || ''
                    const sub = (qtds[m.val] || 0) * m.val
                    return (
                      <div
                        key={m.val}
                        className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-3 space-y-1.5 focus-within:border-amber-500 transition-colors"
                      >
                        <span className="text-xs font-bold text-slate-200 block">{m.label}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={count}
                          onChange={e => handleQtdChange(m.val, e.target.value)}
                          placeholder="0"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center text-white font-mono font-semibold focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-[11px] font-semibold text-amber-400 block text-right">
                          = {R(sub)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/50 text-xs text-blue-300">
                Digite ou cole os valores parciais separados por linha ou sinal de mais <strong>+</strong>.<br/>
                Exemplo: <em>950 + 40 + 30 + 15 + 4</em>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Montantes contados:
                </label>
                <textarea
                  rows={6}
                  value={textoMontantes}
                  onChange={e => setTextoMontantes(e.target.value)}
                  placeholder="950&#10;40&#10;30&#10;15&#10;4"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer com Total e Botões */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              title="Zerar contagem"
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <div>
              <span className="text-xs text-slate-400 block">Total Contado em Dinheiro:</span>
              <strong className="text-xl font-bold text-emerald-400 font-mono">
                {R(totalFinal)}
              </strong>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-emerald-600/30"
            >
              <Check className="w-4 h-4" />
              <span>Aplicar no Fechamento ({R(totalFinal)})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
