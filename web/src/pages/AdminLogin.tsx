import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === 'admin@2026') {
      localStorage.setItem('admin_token', password)
      navigate('/admin/products')
    } else {
      setError('Senha incorreta')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-4xl">🔐</span>
          <h1 className="text-xl font-bold text-white mt-2">Painel Administrativo</h1>
          <p className="text-sm text-slate-400 mt-1">4 Rodas — Gestão de Dados</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="Digite a senha de acesso"
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
