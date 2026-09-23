import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type Tenant } from '../contexts/AuthContext'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Se owner com múltiplos tenants, mostra seletor
  const [pendingToken,   setPendingToken]   = useState<string | null>(null)
  const [pendingUser,    setPendingUser]    = useState<any>(null)
  const [pendingTenants, setPendingTenants] = useState<Tenant[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message ?? 'Credenciais inválidas'); return }

      const { token, user, tenants } = data as {
        token: string
        user: any
        tenants: Tenant[]
      }

      // Owner sem nenhum tenant cadastrado: entra direto no ERP sem filtro de loja
      if (user.role === 'owner' && tenants.length === 0) {
        login(token, user, [])
        navigate('/erp')
        return
      }

      // Apenas 1 tenant: entra direto
      if (tenants.length <= 1) {
        login(token, user, tenants)
        navigate('/erp')
        return
      }

      // Múltiplos tenants: mostrar seletor
      setPendingToken(token)
      setPendingUser(user)
      setPendingTenants(tenants)
    } catch {
      setError('Erro de conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  function handleSelectTenant(tenant: Tenant) {
    if (!pendingToken || !pendingUser) return
    login(pendingToken, pendingUser, pendingTenants)
    // O AuthContext já seleciona o primeiro tenant; precisamos garantir que selecionou o escolhido
    // Fazemos via login + switchTenant logo após
    localStorage.setItem('erp_current_tenant', JSON.stringify(tenant))
    navigate('/erp')
  }

  // ── Seletor de tenant ────────────────────────────────────────────────────────
  if (pendingTenants.length > 1) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <span className="text-4xl">🏪</span>
            <h1 className="text-xl font-bold text-white mt-3">Selecione a Loja</h1>
            <p className="text-sm text-slate-400 mt-1">
              Olá, {pendingUser?.nome}. Escolha a loja que deseja acessar.
            </p>
          </div>
          <div className="space-y-2">
            {pendingTenants.map(t => (
              <button
                key={t.id}
                onClick={() => handleSelectTenant(t)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-600 text-left transition-colors group"
              >
                <span className="text-2xl">🔧</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                    {t.nome}
                  </p>
                  <p className="text-xs text-slate-500">{t.slug}</p>
                </div>
                <span className="text-slate-600 group-hover:text-blue-400 text-sm">→</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setPendingToken(null); setPendingUser(null); setPendingTenants([]) }}
            className="w-full mt-4 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Voltar ao login
          </button>
        </div>
      </div>
    )
  }

  // ── Formulário de login ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-3xl mb-4">
            🔧
          </div>
          <h1 className="text-2xl font-bold text-white">4Rodas ERP</h1>
          <p className="text-sm text-slate-400 mt-1">Faça login para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="seu@email.com"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              ⚠ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors mt-2"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
