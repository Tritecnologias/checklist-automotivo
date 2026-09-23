import { useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface Resultado {
  importados: number
  parseados: number
  nao_encontrados: number
  message?: string
}

export default function ImportarEstoque() {
  const { currentTenant, isOwner } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState('')

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        Acesso restrito ao proprietário.
      </div>
    )
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setArquivo(f)
    setResultado(null)
    setErro('')
  }

  async function handleImportar() {
    if (!arquivo) return
    if (!currentTenant) {
      setErro('Selecione uma loja no menu lateral antes de importar.')
      return
    }

    setLoading(true)
    setErro('')
    setResultado(null)

    try {
      const text = await arquivo.text()
      const jwt      = localStorage.getItem('erp_jwt_token') ?? ''
      const tenantId = currentTenant.id

      const res = await fetch('/api/erp/estoque/importar-sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': `Bearer ${jwt}`,
          'x-tenant-id': String(tenantId),
        },
        body: text,
      })

      const data = await res.json()
      if (!res.ok) { setErro(data.message ?? `Erro ${res.status}`); return }
      setResultado(data)
    } catch (e: any) {
      setErro(e.message ?? 'Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  const tamanhoMB = arquivo ? (arquivo.size / 1024 / 1024).toFixed(1) : null

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Importar Estoque</h1>
        <p className="text-sm text-slate-400 mt-1">
          Carrega o backup SQL da loja selecionada e importa os saldos de estoque.
        </p>
      </div>

      {/* Loja ativa */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-3">
        <span className="text-slate-400 text-sm">Loja de destino:</span>
        {currentTenant ? (
          <span className="text-white font-semibold text-sm">{currentTenant.nome}</span>
        ) : (
          <span className="text-amber-400 text-sm">⚠ Nenhuma loja selecionada — escolha no menu lateral</span>
        )}
      </div>

      {/* Seleção de arquivo */}
      <div className="bg-slate-900 border-2 border-dashed border-slate-700 hover:border-blue-600 rounded-2xl p-8 text-center transition-colors cursor-pointer"
           onClick={() => fileRef.current?.click()}>
        <input
          ref={fileRef}
          type="file"
          accept=".sql"
          className="hidden"
          onChange={handleFile}
        />
        {arquivo ? (
          <div className="space-y-1">
            <p className="text-2xl">📄</p>
            <p className="text-white font-semibold text-sm">{arquivo.name}</p>
            <p className="text-slate-400 text-xs">{tamanhoMB} MB — clique para trocar</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-3xl">⬆️</p>
            <p className="text-slate-300 text-sm font-medium">Clique para selecionar o arquivo .sql</p>
            <p className="text-slate-500 text-xs">Backup completo do banco da loja</p>
          </div>
        )}
      </div>

      {/* Botão */}
      <button
        onClick={handleImportar}
        disabled={!arquivo || !currentTenant || loading}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-colors"
      >
        {loading ? 'Importando… aguarde' : 'Importar estoque'}
      </button>

      {/* Erro */}
      {erro && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400">
          ⚠ {erro}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
          <p className="text-white font-semibold">Importação concluída</p>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-500/10 border border-green-800/40 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{resultado.importados}</p>
              <p className="text-xs text-slate-400 mt-0.5">Importados</p>
            </div>
            <div className="bg-slate-700/40 border border-slate-700 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-slate-300">{resultado.parseados}</p>
              <p className="text-xs text-slate-400 mt-0.5">No arquivo</p>
            </div>
            <div className={`border rounded-lg p-3 text-center ${resultado.nao_encontrados > 0 ? 'bg-amber-500/10 border-amber-800/40' : 'bg-slate-700/40 border-slate-700'}`}>
              <p className={`text-2xl font-bold ${resultado.nao_encontrados > 0 ? 'text-amber-400' : 'text-slate-300'}`}>{resultado.nao_encontrados}</p>
              <p className="text-xs text-slate-400 mt-0.5">Não encontrados</p>
            </div>
          </div>

          {resultado.message && (
            <p className="text-xs text-slate-400">{resultado.message}</p>
          )}

          {resultado.nao_encontrados > 0 && (
            <p className="text-xs text-amber-400/70">
              Produtos não encontrados têm cod_barra diferente da base principal (Veneza). Normal se os catálogos divergem.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
