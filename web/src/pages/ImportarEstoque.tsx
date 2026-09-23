import { useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface ResultadoEstoque {
  importados: number
  parseados: number
  nao_encontrados: number
  message?: string
}

interface ResultadoClientes {
  existentes: number
  criados: number
  associados: number
}

interface Par { codBarra: string; saldo: number }

interface ClienteIn {
  nome_cliente: string
  telefone: string
  celular: string
  cpf_cnpj: string
  inf_adicional: string
}

// ── SQL Parsers (run in browser to stay under Traefik body limit) ─────────────

function parseSqlEstoque(sql: string): Par[] {
  const result: Par[] = []
  const blockMatch = sql.match(
    /INSERT INTO [`"]?cad_produtos[`"]?\s*\([^)]+\)\s*VALUES\s*([\s\S]*?)(?=UNLOCK TABLES)/i
  )
  if (!blockMatch) return result

  const rowRe = /^\s*\(\d+,\s*'[^']*',\s*'([^']*)',\s*(?:'[^']*'|[^,]*),\s*(?:'[^']*'|[^,]*),\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)/

  for (const line of blockMatch[1].split('\n')) {
    const m = line.match(rowRe)
    if (!m) continue
    const codBarra = m[1].trim()
    const saldo    = parseFloat(m[2])
    if (codBarra && saldo > 0) result.push({ codBarra, saldo })
  }
  return result
}

function parseMysqlValue(s: string, i: number): [string, number] {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
  if (i >= s.length) return ['', i]

  if (s[i] === "'") {
    i++
    let val = ''
    while (i < s.length) {
      if (s[i] === '\\') { val += s[i + 1] ?? ''; i += 2 }
      else if (s[i] === "'") { i++; break }
      else { val += s[i]; i++ }
    }
    while (i < s.length && s[i] === ' ') i++
    if (i < s.length && s[i] === ',') i++
    return [val, i]
  }

  if (s.slice(i, i + 4).toUpperCase() === 'NULL') {
    i += 4
    while (i < s.length && s[i] === ' ') i++
    if (i < s.length && s[i] === ',') i++
    return ['', i]
  }

  let j = i
  while (j < s.length && s[j] !== ',') j++
  const val = s.slice(i, j).trim()
  i = j + 1
  return [val, i]
}

function parseMysqlRow(line: string): string[] {
  const inner = line.trim().replace(/^\(/, '').replace(/\)[,;]?\s*$/, '')
  const vals: string[] = []
  let i = 0
  while (i < inner.length) {
    while (i < inner.length && (inner[i] === ' ' || inner[i] === '\t')) i++
    if (i >= inner.length) break
    const [val, next] = parseMysqlValue(inner, i)
    vals.push(val)
    i = next
  }
  return vals
}

function parseSqlClientes(sql: string): ClienteIn[] {
  const blockMatch = sql.match(
    /INSERT INTO [`"]?cad_clientes[`"]?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?)(?=UNLOCK TABLES|;\s*\n(?:UNLOCK|ALTER|CREATE|DROP|\/\*))/i
  )
  if (!blockMatch) return []

  const cols = blockMatch[1].split(',').map(c => c.replace(/[`"'\s]/g, ''))
  const nomeIdx    = cols.indexOf('nome_cliente')
  const telIdx     = cols.indexOf('telefone')
  const celIdx     = cols.indexOf('celular')
  const cpfIdx     = cols.indexOf('cpf_cnpj')
  const infIdx     = cols.indexOf('inf_adicional')
  const inativoIdx = cols.indexOf('inativo')

  if (nomeIdx < 0) return []

  const result: ClienteIn[] = []
  for (const line of blockMatch[2].split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('(')) continue

    const vals = parseMysqlRow(trimmed)
    if (vals.length <= nomeIdx) continue
    if (inativoIdx >= 0 && vals[inativoIdx] === '1') continue

    const nome = vals[nomeIdx].trim()
    if (!nome) continue

    result.push({
      nome_cliente:  nome,
      telefone:      telIdx  >= 0 ? vals[telIdx]  : '',
      celular:       celIdx  >= 0 ? vals[celIdx]   : '',
      cpf_cnpj:      cpfIdx  >= 0 ? vals[cpfIdx]   : '',
      inf_adicional: infIdx  >= 0 ? vals[infIdx]   : '',
    })
  }
  return result
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ImportarEstoque() {
  const { currentTenant, isOwner } = useAuth()
  const [aba, setAba] = useState<'estoque' | 'clientes'>('estoque')

  // Estoque tab state
  const fileRefEstoque = useRef<HTMLInputElement>(null)
  const [arquivoEstoque, setArquivoEstoque]     = useState<File | null>(null)
  const [loadingEstoque, setLoadingEstoque]     = useState(false)
  const [faseEstoque, setFaseEstoque]           = useState<'parseando' | 'enviando' | null>(null)
  const [resultadoEstoque, setResultadoEstoque] = useState<ResultadoEstoque | null>(null)
  const [erroEstoque, setErroEstoque]           = useState('')

  // Clientes tab state
  const fileRefClientes = useRef<HTMLInputElement>(null)
  const [arquivoClientes, setArquivoClientes]     = useState<File | null>(null)
  const [loadingClientes, setLoadingClientes]     = useState(false)
  const [faseClientes, setFaseClientes]           = useState<'parseando' | 'enviando' | null>(null)
  const [resultadoClientes, setResultadoClientes] = useState<ResultadoClientes | null>(null)
  const [erroClientes, setErroClientes]           = useState('')
  const [progressoClientes, setProgressoClientes] = useState<{ atual: number; total: number } | null>(null)

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        Acesso restrito ao proprietário.
      </div>
    )
  }

  // ── Estoque handlers ─────────────────────────────────────────────────────

  async function handleImportarEstoque() {
    if (!arquivoEstoque) return
    if (!currentTenant) { setErroEstoque('Selecione uma loja no menu lateral antes de importar.'); return }
    setLoadingEstoque(true); setFaseEstoque('parseando'); setErroEstoque(''); setResultadoEstoque(null)
    try {
      const sqlText = await arquivoEstoque.text()
      const pairs   = parseSqlEstoque(sqlText)
      setFaseEstoque('enviando')
      if (pairs.length === 0) {
        setErroEstoque('Nenhum produto com estoque encontrado no arquivo. Verifique se é o backup correto.'); return
      }
      const jwt = localStorage.getItem('erp_jwt_token') ?? ''
      const res = await fetch('/api/erp/estoque/importar-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}`, 'x-tenant-id': String(currentTenant.id) },
        body: JSON.stringify({ pairs }),
      })
      const data = await res.json()
      if (!res.ok) { setErroEstoque(data.message ?? `Erro ${res.status}`); return }
      setResultadoEstoque({ ...data, parseados: pairs.length })
    } catch (e: any) {
      setErroEstoque(e.message ?? 'Erro de conexão')
    } finally {
      setLoadingEstoque(false); setFaseEstoque(null)
    }
  }

  // ── Clientes handlers ────────────────────────────────────────────────────

  async function handleImportarClientes() {
    if (!arquivoClientes) return
    if (!currentTenant) { setErroClientes('Selecione uma loja no menu lateral antes de importar.'); return }
    setLoadingClientes(true); setFaseClientes('parseando'); setErroClientes(''); setResultadoClientes(null)
    try {
      const sqlText  = await arquivoClientes.text()
      const parsed   = parseSqlClientes(sqlText)
      setFaseClientes('enviando')
      if (parsed.length === 0) {
        setErroClientes('Nenhum cliente encontrado no arquivo. Verifique se é o backup correto.'); return
      }

      // Deduplicate by name before chunking
      const byName = new Map<string, ClienteIn>()
      for (const c of parsed) byName.set(c.nome_cliente.toUpperCase(), c)
      const unique = [...byName.values()]

      const jwt   = localStorage.getItem('erp_jwt_token') ?? ''
      const hdrs  = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}`, 'x-tenant-id': String(currentTenant.id) }
      const CHUNK = 100
      const totalLotes = Math.ceil(unique.length / CHUNK)

      let totalExistentes = 0
      let totalCriados    = 0
      let totalAssociados = 0

      for (let i = 0, lote = 0; i < unique.length; i += CHUNK, lote++) {
        setProgressoClientes({ atual: lote + 1, total: totalLotes })
        const chunk   = unique.slice(i, i + CHUNK)
        const res     = await fetch('/api/erp/clientes/importar', {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({ clientes: chunk }),
        })
        const text = await res.text()
        let data: any
        try { data = JSON.parse(text) } catch {
          setErroClientes(`Lote ${lote + 1}/${totalLotes}: resposta inválida do servidor (${res.status}). O arquivo pode ter dados incomuns.`)
          return
        }
        if (!res.ok) { setErroClientes(data.message ?? `Erro ${res.status}`); return }
        totalExistentes += data.existentes
        totalCriados    += data.criados
        totalAssociados += data.associados
      }
      setProgressoClientes(null)

      setResultadoClientes({ existentes: totalExistentes, criados: totalCriados, associados: totalAssociados })
    } catch (e: any) {
      setErroClientes(e.message ?? 'Erro de conexão')
    } finally {
      setLoadingClientes(false); setFaseClientes(null); setProgressoClientes(null)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Importar</h1>
        <p className="text-sm text-slate-400 mt-1">
          Carrega o backup SQL da loja selecionada e importa dados para o sistema.
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

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 p-1 rounded-xl">
        {(['estoque', 'clientes'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setAba(tab)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              aba === tab
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'estoque' ? '📦 Estoque' : '👥 Clientes'}
          </button>
        ))}
      </div>

      {/* ── Estoque tab ───────────────────────────────────────────── */}
      {aba === 'estoque' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Importa os saldos de estoque a partir da tabela <code className="text-slate-400">cad_produtos</code> do backup.
          </p>

          <div
            className="bg-slate-900 border-2 border-dashed border-slate-700 hover:border-blue-600 rounded-2xl p-8 text-center transition-colors cursor-pointer"
            onClick={() => fileRefEstoque.current?.click()}
          >
            <input ref={fileRefEstoque} type="file" accept=".sql" className="hidden"
              onChange={e => { setArquivoEstoque(e.target.files?.[0] ?? null); setResultadoEstoque(null); setErroEstoque('') }} />
            {arquivoEstoque ? (
              <div className="space-y-1">
                <p className="text-2xl">📄</p>
                <p className="text-white font-semibold text-sm">{arquivoEstoque.name}</p>
                <p className="text-slate-400 text-xs">{(arquivoEstoque.size / 1024 / 1024).toFixed(1)} MB — clique para trocar</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-3xl">⬆️</p>
                <p className="text-slate-300 text-sm font-medium">Clique para selecionar o arquivo .sql</p>
                <p className="text-slate-500 text-xs">Backup completo do banco da loja</p>
              </div>
            )}
          </div>

          <button
            onClick={handleImportarEstoque}
            disabled={!arquivoEstoque || !currentTenant || loadingEstoque}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-colors"
          >
            {faseEstoque === 'parseando' ? 'Lendo arquivo…' : faseEstoque === 'enviando' ? 'Enviando ao servidor…' : 'Importar estoque'}
          </button>

          {erroEstoque && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400">
              ⚠ {erroEstoque}
            </div>
          )}

          {resultadoEstoque && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
              <p className="text-white font-semibold">Importação concluída</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-500/10 border border-green-800/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{resultadoEstoque.importados}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Importados</p>
                </div>
                <div className="bg-slate-700/40 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-slate-300">{resultadoEstoque.parseados}</p>
                  <p className="text-xs text-slate-400 mt-0.5">No arquivo</p>
                </div>
                <div className={`border rounded-lg p-3 text-center ${resultadoEstoque.nao_encontrados > 0 ? 'bg-amber-500/10 border-amber-800/40' : 'bg-slate-700/40 border-slate-700'}`}>
                  <p className={`text-2xl font-bold ${resultadoEstoque.nao_encontrados > 0 ? 'text-amber-400' : 'text-slate-300'}`}>{resultadoEstoque.nao_encontrados}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Não encontrados</p>
                </div>
              </div>
              {resultadoEstoque.nao_encontrados > 0 && (
                <p className="text-xs text-amber-400/70">
                  Produtos não encontrados têm cod_barra diferente da base principal. Normal se os catálogos divergem.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Clientes tab ──────────────────────────────────────────── */}
      {aba === 'clientes' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Importa clientes da tabela <code className="text-slate-400">cad_clientes</code> do backup. Clientes já existentes (por CPF ou nome) são mantidos; apenas os novos são criados. Todos ficam associados à loja selecionada.
          </p>

          <div
            className="bg-slate-900 border-2 border-dashed border-slate-700 hover:border-blue-600 rounded-2xl p-8 text-center transition-colors cursor-pointer"
            onClick={() => fileRefClientes.current?.click()}
          >
            <input ref={fileRefClientes} type="file" accept=".sql" className="hidden"
              onChange={e => { setArquivoClientes(e.target.files?.[0] ?? null); setResultadoClientes(null); setErroClientes('') }} />
            {arquivoClientes ? (
              <div className="space-y-1">
                <p className="text-2xl">📄</p>
                <p className="text-white font-semibold text-sm">{arquivoClientes.name}</p>
                <p className="text-slate-400 text-xs">{(arquivoClientes.size / 1024 / 1024).toFixed(1)} MB — clique para trocar</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-3xl">⬆️</p>
                <p className="text-slate-300 text-sm font-medium">Clique para selecionar o arquivo .sql</p>
                <p className="text-slate-500 text-xs">Backup completo do banco da loja</p>
              </div>
            )}
          </div>

          <button
            onClick={handleImportarClientes}
            disabled={!arquivoClientes || !currentTenant || loadingClientes}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-colors"
          >
            {faseClientes === 'parseando' ? 'Lendo arquivo…'
              : progressoClientes ? `Enviando lote ${progressoClientes.atual}/${progressoClientes.total}…`
              : 'Importar clientes'}
          </button>

          {progressoClientes && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Lote {progressoClientes.atual} de {progressoClientes.total}</span>
                <span>{Math.round((progressoClientes.atual / progressoClientes.total) * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${(progressoClientes.atual / progressoClientes.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {erroClientes && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400">
              ⚠ {erroClientes}
            </div>
          )}

          {resultadoClientes && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
              <p className="text-white font-semibold">Importação concluída</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-500/10 border border-green-800/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{resultadoClientes.criados}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Novos clientes</p>
                </div>
                <div className="bg-slate-700/40 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-slate-300">{resultadoClientes.existentes}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Já existiam</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-800/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{resultadoClientes.associados}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Associados</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Todos os {resultadoClientes.associados} clientes agora estão vinculados a <strong className="text-slate-300">{currentTenant?.nome}</strong>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
