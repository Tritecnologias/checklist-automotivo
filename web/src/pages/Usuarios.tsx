import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  RotateCw, ShieldCheck, UserCheck, Search, Building2, 
  X, RotateCcw, Filter, UserX, CheckCircle2, Shield
} from 'lucide-react'
import { tenantsApi, usersApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { UserAdmin } from '../types'


const MULTI_TENANT_ROLES = ['manager', 'operator', 'caixa', 'mecanico']

const ROLE_OPTS = [
  { value: 'owner',    label: 'Proprietário' },
  { value: 'manager',  label: 'Gerente' },
  { value: 'operator', label: 'Operador' },
  { value: 'caixa',    label: 'Caixa' },
  { value: 'mecanico', label: 'Mecânico / Técnico' },
]

const ROLE_COLOR: Record<string, string> = {
  owner:    'bg-amber-500/20 text-amber-300',
  manager:  'bg-blue-500/20 text-blue-300',
  operator: 'bg-slate-500/20 text-slate-300',
  caixa:    'bg-green-500/20 text-green-300',
  mecanico: 'bg-purple-500/20 text-purple-300',
}

const EMPTY_FORM = {
  nome: '', email: '', password: '', role: 'operator',
  tenant_id: '' as string | number, tenant_ids: [] as number[],
}

export default function Usuarios() {
  const navigate = useNavigate()
  const { isOwner, tenants: authTenants } = useAuth()
  const qc = useQueryClient()

  const { data: users = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  })
  const { data: lojasApi = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list })
  const listaLojas = lojasApi.length > 0 ? lojasApi : (authTenants || [])

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [busca, setBusca] = useState('')
  const [filtroLoja, setFiltroLoja] = useState('')
  const [filtroPerfil, setFiltroPerfil] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativos' | 'inativos'>('todos')

  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [formError, setFormError] = useState('')

  const [editing, setEditing] = useState<UserAdmin | null>(null)
  const [editData, setEditData] = useState({ nome: '', role: '', tenant_id: '' as string | number, tenant_ids: [] as number[], ativo: true, password: '' })
  const [editError, setEditError] = useState('')

  const createMut = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowNew(false)
      setForm({ ...EMPTY_FORM })
    },
    onError: (e: any) => setFormError(e.message ?? 'Erro'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditing(null) },
    onError: (e: any) => setEditError(e.message ?? 'Erro'),
  })

  function handleCreate() {
    setFormError('')
    const { nome, email, password, role, tenant_id } = form
    if (!nome.trim() || !email.trim() || !password) {
      setFormError('Nome, e-mail e senha são obrigatórios')
      return
    }
    const payload: Parameters<typeof usersApi.create>[0] = {
      nome: nome.trim(), email: email.trim(), password, role,
    }
    if (MULTI_TENANT_ROLES.includes(role) && form.tenant_ids.length > 1) {
      payload.tenant_ids = form.tenant_ids
    } else if (tenant_id) {
      payload.tenant_id = Number(tenant_id)
    }
    createMut.mutate(payload)
  }

  function startEdit(u: UserAdmin) {
    setEditing(u)
    setEditData({ nome: u.nome, role: u.role, tenant_id: u.tenant_id ?? '', tenant_ids: [], ativo: !!u.ativo, password: '' })
    setEditError('')
    // Carregar lojas atuais do usuário
    if (u.tenant_count > 0) {
      usersApi.getTenants(u.id).then(ids => setEditData(d => ({ ...d, tenant_ids: ids })))
    }
  }

  function saveEdit() {
    if (!editing) return
    setEditError('')
    const payload: Parameters<typeof usersApi.update>[1] = {}
    if (editData.nome.trim()) payload.nome = editData.nome.trim()
    if (isOwner) {
      payload.role = editData.role
      if (editData.tenant_ids.length > 0) {
        payload.tenant_ids = editData.tenant_ids
        payload.tenant_id = editData.tenant_ids[0]
      } else {
        payload.tenant_id = editData.tenant_id !== '' ? Number(editData.tenant_id) : null
        payload.tenant_ids = []
      }
      payload.ativo = editData.ativo
    }
    if (editData.password) payload.password = editData.password
    updateMut.mutate({ id: editing.id, data: payload })
  }

  function toggleAtivo(u: UserAdmin) {
    updateMut.mutate({ id: u.id, data: { ativo: !u.ativo } })
  }

  // ── Estatísticas e Filtros em Tempo Real ──────────────────────────────────
  const stats = useMemo(() => {
    const total = users.length
    const ativos = users.filter(u => Boolean(u.ativo)).length
    const inativos = total - ativos
    const personalizados = users.filter(u => Boolean(u.custom_permissions)).length
    return { total, ativos, inativos, personalizados }
  }, [users])

  const usuariosFiltrados = useMemo(() => {
    return users.filter(u => {
      // 1. Busca textual (nome ou e-mail)
      if (busca.trim()) {
        const q = busca.toLowerCase().trim()
        const matchNome = (u.nome || '').toLowerCase().includes(q)
        const matchEmail = (u.email || '').toLowerCase().includes(q)
        if (!matchNome && !matchEmail) return false
      }

      // 2. Filtro por Loja
      if (filtroLoja) {
        if (filtroLoja === 'owner') {
          if (u.role !== 'owner') return false
        } else if (filtroLoja === 'sem_loja') {
          const hasStore = u.tenant_id || (u.tenant_ids && u.tenant_ids.length > 0)
          if (hasStore || u.role === 'owner') return false
        } else {
          const lid = Number(filtroLoja)
          const isDirect = u.tenant_id === lid
          const isMulti = Array.isArray(u.tenant_ids) && u.tenant_ids.includes(lid)
          if (!isDirect && !isMulti) return false
        }
      }

      // 3. Filtro por Perfil / Cargo
      if (filtroPerfil) {
        if (filtroPerfil === 'personalizado') {
          if (!u.custom_permissions) return false
        } else if (u.role !== filtroPerfil) {
          return false
        }
      }

      // 4. Filtro por Status
      if (filtroStatus === 'ativos' && !u.ativo) return false
      if (filtroStatus === 'inativos' && u.ativo) return false

      return true
    })
  }, [users, busca, filtroLoja, filtroPerfil, filtroStatus])

  const hasFiltrosAtivos = Boolean(
    busca.trim() !== '' ||
    filtroLoja !== '' ||
    filtroPerfil !== '' ||
    filtroStatus !== 'todos'
  )

  function limparFiltros() {
    setBusca('')
    setFiltroLoja('')
    setFiltroPerfil('')
    setFiltroStatus('todos')
  }

  return (
    <div className="max-w-6xl w-full">
      {/* Abas Superiores */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-3">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/30 flex items-center gap-2"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Usuários</span>
        </button>
        <button
          onClick={() => navigate('/erp/permissoes')}
          className="px-4 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 border border-slate-700/60"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>Papéis & Permissões</span>
        </button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuários</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie os colaboradores e acessos ao sistema</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50"
            title="Atualizar lista de usuários via AJAX"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-blue-400' : ''}`} />
            <span>{isFetching ? 'Atualizando…' : 'Atualizar'}</span>
          </button>
          <button
            onClick={() => { setShowNew(v => !v); setFormError('') }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <span>＋</span> Novo usuário
          </button>
        </div>
      </div>

      {/* Formulário novo usuário */}
      {showNew && (
        <div className="mb-6 bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Novo usuário</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nome</label>
              <input
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Nome completo"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">E-mail</label>
              <input
                type="email"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="usuario@email.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Senha inicial</label>
              <input
                type="password"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Perfil</label>
              <select
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value, tenant_id: '', tenant_ids: [] }))}
              >
                {(isOwner ? ROLE_OPTS : ROLE_OPTS.filter(r => r.value === 'operator')).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Loja(s) — para todos os perfis exceto owner */}
            {MULTI_TENANT_ROLES.includes(form.role) && isOwner && listaLojas.length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-2">
                  Lojas com acesso
                  <span className="ml-1 text-slate-500">(marque uma ou mais)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {listaLojas.map(l => (
                    <label key={l.id} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-blue-500"
                        checked={form.tenant_ids.includes(l.id)}
                        onChange={e => setForm(f => ({
                          ...f,
                          tenant_id: '',
                          tenant_ids: e.target.checked
                            ? [...f.tenant_ids, l.id]
                            : f.tenant_ids.filter(id => id !== l.id),
                        }))}
                      />
                      <span className="text-sm text-slate-300">{l.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {formError && <p className="text-xs text-red-400 mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {createMut.isPending ? 'Salvando…' : 'Criar usuário'}
            </button>
            <button
              onClick={() => { setShowNew(false); setFormError('') }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Edição inline */}
      {editing && (
        <div className="mb-6 bg-slate-800 border border-blue-600/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-blue-300">Editando: {editing.email}</h2>
            <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white text-sm">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nome</label>
              <input
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                value={editData.nome}
                onChange={e => setEditData(d => ({ ...d, nome: e.target.value }))}
                autoFocus
              />
            </div>
            {isOwner && (
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Perfil</label>
                <select
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  value={editData.role}
                  onChange={e => setEditData(d => ({ ...d, role: e.target.value, tenant_id: '' }))}
                >
                  {ROLE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {isOwner && MULTI_TENANT_ROLES.includes(editData.role) && listaLojas.length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-2">
                  Lojas com acesso
                  <span className="ml-1 text-slate-500">(marque uma ou mais)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {listaLojas.map(l => (
                    <label key={l.id} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-blue-500"
                        checked={editData.tenant_ids.includes(l.id)}
                        onChange={e => setEditData(d => ({
                          ...d,
                          tenant_ids: e.target.checked
                            ? [...d.tenant_ids, l.id]
                            : d.tenant_ids.filter(id => id !== l.id),
                        }))}
                      />
                      <span className="text-sm text-slate-300">{l.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nova senha (opcional)</label>
              <input
                type="password"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Deixe em branco para manter"
                value={editData.password}
                onChange={e => setEditData(d => ({ ...d, password: e.target.value }))}
              />
            </div>
            {isOwner && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-400">Status</label>
                <button
                  onClick={() => setEditData(d => ({ ...d, ativo: !d.ativo }))}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    editData.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {editData.ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            )}
          </div>
          {editError && <p className="text-xs text-red-400 mb-3">{editError}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={updateMut.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {updateMut.isPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── BARRA DE FILTROS ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-6 space-y-4 shadow-xl backdrop-blur-md">
        
        {/* Linha 1: Status rápidos e Contagem */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setFiltroStatus('todos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filtroStatus === 'todos'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/50'
              }`}
            >
              <span>Todos</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                filtroStatus === 'todos' ? 'bg-blue-700 text-white' : 'bg-slate-700 text-slate-300'
              }`}>
                {stats.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroStatus('ativos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filtroStatus === 'ativos'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Ativos</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                filtroStatus === 'ativos' ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-300'
              }`}>
                {stats.ativos}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroStatus('inativos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filtroStatus === 'inativos'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>Inativos</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                filtroStatus === 'inativos' ? 'bg-rose-700 text-white' : 'bg-slate-700 text-slate-300'
              }`}>
                {stats.inativos}
              </span>
            </button>

            {stats.personalizados > 0 && (
              <button
                type="button"
                onClick={() => setFiltroPerfil(filtroPerfil === 'personalizado' ? '' : 'personalizado')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  filtroPerfil === 'personalizado'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'bg-slate-800/70 hover:bg-slate-800 text-purple-300 hover:text-white border border-purple-500/30'
                }`}
              >
                <span>⚡ Personalizados</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  filtroPerfil === 'personalizado' ? 'bg-purple-700 text-white' : 'bg-purple-900/50 text-purple-200'
                }`}>
                  {stats.personalizados}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">
              Exibindo <strong className="text-white font-semibold">{usuariosFiltrados.length}</strong> de <strong className="text-slate-300">{stats.total}</strong> colaboradores
            </span>
            {hasFiltrosAtivos && (
              <button
                type="button"
                onClick={limparFiltros}
                className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-1 font-semibold"
                title="Limpar todos os filtros aplicados"
              >
                <X className="w-3.5 h-3.5" />
                <span>Limpar filtros</span>
              </button>
            )}
          </div>
        </div>

        {/* Linha 2: Busca por texto, Filtro por Loja e Filtro por Perfil */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          
          {/* Busca por Nome ou E-mail */}
          <div className="lg:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-full bg-slate-950/70 border border-slate-700/80 hover:border-slate-600 focus:border-blue-500 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-all shadow-inner"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                title="Limpar texto da busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro por Loja */}
          <div className="lg:col-span-4 relative">
            <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={filtroLoja}
              onChange={e => setFiltroLoja(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-700/80 hover:border-slate-600 focus:border-blue-500 rounded-xl pl-9 pr-8 py-2.5 text-sm text-white focus:outline-none transition-all appearance-none shadow-inner cursor-pointer"
            >
              <option value="">🏢 Todas as Lojas</option>
              {listaLojas.map(l => (
                <option key={l.id} value={String(l.id)}>
                  🏪 {l.nome}
                </option>
              ))}
              <option value="owner">⭐ Acesso a Todas (Proprietários)</option>
              <option value="sem_loja">⚠️ Sem loja vinculada</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <span className="text-xs">▼</span>
            </div>
          </div>

          {/* Filtro por Perfil / Cargo */}
          <div className="lg:col-span-3 relative">
            <ShieldCheck className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={filtroPerfil}
              onChange={e => setFiltroPerfil(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-700/80 hover:border-slate-600 focus:border-blue-500 rounded-xl pl-9 pr-8 py-2.5 text-sm text-white focus:outline-none transition-all appearance-none shadow-inner cursor-pointer"
            >
              <option value="">🛡️ Todos os Perfis</option>
              {ROLE_OPTS.map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
              <option value="personalizado">⚡ Permissões Personalizadas</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <span className="text-xs">▼</span>
            </div>
          </div>

        </div>

      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Carregando colaboradores...</p>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-850/60">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3.5">Usuário</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3.5">Perfil</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3.5">Loja</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {usuariosFiltrados.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-750/50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 flex items-center justify-center text-xs font-bold text-slate-200 shadow-sm shrink-0">
                          {u.nome ? u.nome.slice(0, 2).toUpperCase() : 'US'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white tracking-tight truncate">{u.nome}</p>
                          <p className="text-xs text-slate-400 font-mono truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-block text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${ROLE_COLOR[u.role] ?? 'bg-slate-500/20 text-slate-300'}`}>
                          {ROLE_OPTS.find(r => r.value === u.role)?.label ?? u.role}
                        </span>
                        {Boolean(u.custom_permissions) && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wide"
                            title="Este usuário possui permissões personalizadas exclusivas"
                          >
                            Personalizado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {u.role === 'owner' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                          ⭐ Todas
                        </span>
                      ) : u.tenant_count > 1 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30" title={`Acesso a ${u.tenant_count} lojas`}>
                          🏪 {u.tenant_count} lojas
                        </span>
                      ) : (
                        <span className="text-sm text-slate-300">{u.tenant_nome ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        u.ativo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.ativo ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {u.role !== 'owner' && (
                          <button
                            onClick={() => navigate(`/erp/permissoes?userId=${u.id}`)}
                            className="text-xs text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 font-semibold"
                            title="Configurar papéis e permissões deste usuário"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Permissões</span>
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(u)}
                          className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        {isOwner && (
                          <button
                            onClick={() => toggleAtivo(u)}
                            className={`text-xs transition-colors font-medium ${u.ativo ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                          >
                            {u.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                ))}
                {usuariosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <Search className="w-8 h-8 text-slate-500 stroke-[1.5]" />
                        <p className="text-white font-semibold text-sm">Nenhum colaborador encontrado</p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {hasFiltrosAtivos
                            ? 'Nenhum usuário corresponde aos filtros aplicados. Tente ajustar os termos de busca ou filtros.'
                            : 'Nenhum usuário cadastrado no sistema no momento.'}
                        </p>
                        {hasFiltrosAtivos && (
                          <button
                            type="button"
                            onClick={limparFiltros}
                            className="mt-2 px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restaurar filtros</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
