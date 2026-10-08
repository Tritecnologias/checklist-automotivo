import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck,
  Users,
  UserCheck,
  ShoppingCart,
  Boxes,
  DollarSign,
  Wrench,
  SlidersHorizontal,
  Search,
  Check,
  RotateCw,
  AlertCircle,
  Copy,
  Undo2,
  CheckSquare,
  Square,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Info,
  CheckCircle2,
  Wallet,
  Tag,
  Receipt,
  HeartHandshake,
  Store,
  Layers,
  UploadCloud,
} from 'lucide-react'
import { permissionsApi, usersApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { PermissionCategory, UserAdmin, UserPermissionsDetail } from '../types'

type Mode = 'role' | 'user'

const ROLE_INFO: Record<string, { label: string; desc: string; color: string; bg: string }> = {
  caixa: {
    label: 'Caixa',
    desc: 'Operadores de caixa, recebimentos e atendimento no PDV',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  operator: {
    label: 'Operador',
    desc: 'Execução de Ordens de Serviço, checklists e inspeções',
    color: 'text-slate-300',
    bg: 'bg-slate-500/10 border-slate-500/30',
  },
  manager: {
    label: 'Gerente',
    desc: 'Gestão da loja, estoques, relatórios e supervisão operacional',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30',
  },
  mecanico: {
    label: 'Mecânico / Técnico',
    desc: 'Técnicos de oficina, serviços executados e controle de comissões',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/30',
  },
}

const CATEGORY_ICONS: Record<string, any> = {
  'PDV & Frente de Caixa': ShoppingCart,
  'Catálogo & Estoque': Boxes,
  'Clientes & CRM': Users,
  'Vendas & Financeiro': DollarSign,
  'Oficina & Ordens de Serviço': Wrench,
  'Gestão & Configurações': SlidersHorizontal,
}

export default function GerenciadorPapeis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isOwner, refreshUser } = useAuth()

  // Modo: 'role' ou 'user'
  const initialMode = (searchParams.get('mode') as Mode) || (searchParams.get('userId') ? 'user' : 'role')
  const [mode, setMode] = useState<Mode>(initialMode)

  // Cargo selecionado
  const initialRole = searchParams.get('role') || 'caixa'
  const [selectedRole, setSelectedRole] = useState<string>(initialRole)

  // Usuário selecionado
  const initialUserId = searchParams.get('userId') ? Number(searchParams.get('userId')) : null
  const [selectedUserId, setSelectedUserId] = useState<number | null>(initialUserId)

  // Filtro de busca de permissões
  const [searchTerm, setSearchTerm] = useState('')

  // Toast / Mensagem de feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Permissões em edição (conjunto de IDs de permissão marcados)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false)
  const [isDirty, setIsDirty] = useState<boolean>(false)

  // Consultas
  const { data: catalog = [], isLoading: loadingCatalog } = useQuery({
    queryKey: ['permissions-catalog'],
    queryFn: permissionsApi.getCatalog,
  })

  const { data: rolesMap = {}, isLoading: loadingRoles, refetch: refetchRoles } = useQuery({
    queryKey: ['roles-permissions'],
    queryFn: permissionsApi.getRolePermissions,
  })

  const { data: usersList = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  })

  const {
    data: userDetail,
    isLoading: loadingUserDetail,
    refetch: refetchUserDetail,
  } = useQuery({
    queryKey: ['user-permissions', selectedUserId],
    queryFn: () => (selectedUserId ? permissionsApi.getUserPermissions(selectedUserId) : null),
    enabled: mode === 'user' && !!selectedUserId,
  })

  // Sincroniza estado inicial ao trocar o cargo selecionado
  useEffect(() => {
    if (mode === 'role') {
      const perms = rolesMap[selectedRole] ?? []
      setSelectedPerms(perms)
      setIsDirty(false)
      setIsCustomMode(false)
    }
  }, [mode, selectedRole, rolesMap])

  // Sincroniza estado inicial ao trocar o usuário selecionado
  useEffect(() => {
    if (mode === 'user' && userDetail) {
      setSelectedPerms(userDetail.permissions ?? [])
      setIsCustomMode(Boolean(userDetail.custom_permissions))
      setIsDirty(false)
    }
  }, [mode, userDetail])

  // Se o usuário entrar no modo 'user' sem selecionar ninguém, seleciona o primeiro não-owner
  useEffect(() => {
    if (mode === 'user' && !selectedUserId && usersList.length > 0) {
      const firstNonOwner = usersList.find(u => u.role !== 'owner') || usersList[0]
      if (firstNonOwner) {
        setSelectedUserId(firstNonOwner.id)
      }
    }
  }, [mode, selectedUserId, usersList])

  // Contagem de usuários por cargo
  const userCountByRole = useMemo(() => {
    const counts: Record<string, number> = { caixa: 0, operator: 0, manager: 0, mecanico: 0 }
    for (const u of usersList) {
      if (counts[u.role] !== undefined) {
        counts[u.role]++
      }
    }
    return counts
  }, [usersList])

  // Lista plana de todos os IDs do catálogo
  const allCatalogIds = useMemo(() => {
    return catalog.flatMap(c => c.permissoes.map(p => p.id))
  }, [catalog])

  // Filtragem de catálogo pela busca
  const filteredCatalog = useMemo(() => {
    if (!searchTerm.trim()) return catalog
    const q = searchTerm.toLowerCase().trim()
    return catalog
      .map(cat => ({
        ...cat,
        permissoes: cat.permissoes.filter(
          p =>
            p.nome.toLowerCase().includes(q) ||
            p.descricao.toLowerCase().includes(q) ||
            (p.rota && p.rota.toLowerCase().includes(q)) ||
            cat.categoria.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.permissoes.length > 0)
  }, [catalog, searchTerm])

  // Notificação com auto-dismiss
  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Mutações
  const saveRoleMutation = useMutation({
    mutationFn: ({ role, perms }: { role: string; perms: string[] }) =>
      permissionsApi.saveRolePermissions(role, perms),
    onSuccess: () => {
      refetchRoles()
      qc.invalidateQueries({ queryKey: ['roles-permissions'] })
      refreshUser()
      setIsDirty(false)
      showToast(`Permissões do perfil "${ROLE_INFO[selectedRole]?.label || selectedRole}" salvas com sucesso!`)
    },
    onError: (err: any) => {
      showToast(err.message ?? 'Erro ao salvar permissões do cargo', 'error')
    },
  })

  const saveUserMutation = useMutation({
    mutationFn: ({ userId, perms, custom }: { userId: number; perms: string[]; custom: boolean }) =>
      permissionsApi.saveUserPermissions(userId, { permissions: perms, custom }),
    onSuccess: (data) => {
      refetchUserDetail()
      qc.invalidateQueries({ queryKey: ['user-permissions', selectedUserId] })
      qc.invalidateQueries({ queryKey: ['users'] })
      refreshUser()
      setIsDirty(false)
      setIsCustomMode(data.user.custom_permissions)
      showToast(
        data.user.custom_permissions
          ? `Permissões individuais de ${data.user.nome} salvas com sucesso!`
          : `Restauradas as permissões padrão do perfil para ${data.user.nome}!`
      )
    },
    onError: (err: any) => {
      showToast(err.message ?? 'Erro ao salvar permissões do usuário', 'error')
    },
  })

  // Alterna uma permissão específica
  function togglePermission(id: string) {
    if (mode === 'user' && !isCustomMode) {
      // Ao tentar editar permissão de usuário com padrão de perfil, ativa customização automaticamente
      setIsCustomMode(true)
    }
    setSelectedPerms(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      setIsDirty(true)
      return next
    })
  }

  // Marcar/Desmarcar todas de uma categoria
  function toggleCategory(cat: PermissionCategory) {
    if (mode === 'user' && !isCustomMode) {
      setIsCustomMode(true)
    }
    const catIds = cat.permissoes.map(p => p.id)
    const allSelected = catIds.every(id => selectedPerms.includes(id))

    setSelectedPerms(prev => {
      let next: string[]
      if (allSelected) {
        next = prev.filter(id => !catIds.includes(id))
      } else {
        const toAdd = catIds.filter(id => !prev.includes(id))
        next = [...prev, ...toAdd]
      }
      setIsDirty(true)
      return next
    })
  }

  // Marcar todas do sistema
  function selectAll() {
    if (mode === 'user' && !isCustomMode) setIsCustomMode(true)
    setSelectedPerms([...allCatalogIds])
    setIsDirty(true)
  }

  // Desmarcar todas
  function deselectAll() {
    if (mode === 'user' && !isCustomMode) setIsCustomMode(true)
    setSelectedPerms([])
    setIsDirty(true)
  }

  // Copiar permissões de outro cargo
  function copyFromRole(sourceRole: string) {
    const perms = rolesMap[sourceRole] ?? []
    if (mode === 'user' && !isCustomMode) setIsCustomMode(true)
    setSelectedPerms([...perms])
    setIsDirty(true)
    showToast(`Permissões copiadas do perfil "${ROLE_INFO[sourceRole]?.label || sourceRole}". Não esqueça de salvar.`)
  }

  // Habilitar personalização individual do usuário
  function enableUserCustom() {
    setIsCustomMode(true)
    setIsDirty(true)
  }

  // Restaurar padrão do perfil para o usuário
  function resetToRoleDefault() {
    if (!selectedUserId || !userDetail) return
    const defaultRolePerms = userDetail.rolePermissions || rolesMap[userDetail.role] || []
    setSelectedPerms([...defaultRolePerms])
    setIsCustomMode(false)
    setIsDirty(true)
  }

  // Salvar alterações
  function handleSave() {
    if (mode === 'role') {
      saveRoleMutation.mutate({ role: selectedRole, perms: selectedPerms })
    } else if (mode === 'user' && selectedUserId) {
      saveUserMutation.mutate({
        userId: selectedUserId,
        perms: selectedPerms,
        custom: isCustomMode,
      })
    }
  }

  // Usuário ativo no dropdown
  const currentUserObj = usersList.find(u => u.id === selectedUserId)

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {/* Toast flutuante */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-sm font-medium transition-all animate-in fade-in slide-in-from-top-4 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
              : 'bg-rose-950/95 border-rose-500/50 text-rose-200 shadow-rose-950/50'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cabeçalho da página */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Gerenciador de Papéis & Permissões</h1>
              <p className="text-sm text-slate-400">
                Defina permissões padrão para cargos ou regras personalizadas para usuários específicos
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              refetchRoles()
              if (selectedUserId) refetchUserDetail()
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            title="Atualizar dados"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={() => navigate('/erp/usuarios')}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span>Ver Usuários</span>
          </button>
        </div>
      </div>

      {/* Seletor de Modo: Por Perfil / Por Usuário */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Modo de Configuração
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              Escolha se deseja configurar um Perfil (cargo padrão) ou um Usuário específico
            </p>
          </div>

          {/* Segmented Control */}
          <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setMode('role')
                setSearchParams({ mode: 'role', role: selectedRole })
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'role'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Por Perfil (Cargo)</span>
            </button>
            <button
              onClick={() => {
                setMode('user')
                if (selectedUserId) {
                  setSearchParams({ mode: 'user', userId: String(selectedUserId) })
                } else {
                  setSearchParams({ mode: 'user' })
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'user'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Por Usuário Específico</span>
            </button>
          </div>
        </div>

        {/* MODO 1: Por Perfil (Cargo) */}
        {mode === 'role' && (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(['caixa', 'operator', 'manager', 'mecanico'] as const).map(roleKey => {
                const info = ROLE_INFO[roleKey]
                const isSelected = selectedRole === roleKey
                const userCount = userCountByRole[roleKey] || 0
                const permCount = (rolesMap[roleKey] || []).length

                return (
                  <button
                    key={roleKey}
                    onClick={() => {
                      setSelectedRole(roleKey)
                      setSearchParams({ mode: 'role', role: roleKey })
                    }}
                    className={`text-left p-4 rounded-xl border transition-all relative ${
                      isSelected
                        ? 'bg-slate-800/90 border-blue-500 shadow-lg shadow-blue-500/10 ring-2 ring-blue-500/20'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-sm font-bold ${info.color}`}>{info.label}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {userCount} {userCount === 1 ? 'usuário' : 'usuários'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                      {info.desc}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
                      <span>{permCount} funções liberadas</span>
                      {isSelected && <span className="text-blue-400 font-semibold flex items-center gap-1">Editando <Check className="w-3.5 h-3.5" /></span>}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Aviso informativo de cargo */}
            <div className="mt-4 flex items-start gap-3 p-3.5 bg-blue-950/30 border border-blue-800/40 rounded-xl text-xs text-blue-200">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-blue-300">
                  Editando permissões padrão do perfil: {ROLE_INFO[selectedRole]?.label}
                </span>
                <p className="text-blue-200/80 mt-0.5">
                  Qualquer usuário com este cargo receberá automaticamente as permissões marcadas abaixo, a menos que possua permissões personalizadas salvas individualmente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* MODO 2: Por Usuário Específico */}
        {mode === 'user' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="w-full md:w-96">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Selecione o Usuário
                </label>
                <select
                  value={selectedUserId ?? ''}
                  onChange={e => {
                    const id = Number(e.target.value)
                    setSelectedUserId(id)
                    setSearchParams({ mode: 'user', userId: String(id) })
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="" disabled>Selecione um usuário...</option>
                  {usersList
                    .filter(u => u.role !== 'owner')
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.nome} — {ROLE_INFO[u.role]?.label || u.role} {u.tenant_nome ? `(${u.tenant_nome})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {currentUserObj && userDetail && (
                <div className="flex items-center gap-3">
                  {isCustomMode ? (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-semibold">
                        <Sparkles className="w-3.5 h-3.5" />
                        Permissões Personalizadas Ativas
                      </span>
                      <button
                        onClick={resetToRoleDefault}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
                        title="Restaurar as permissões padrão do cargo"
                      >
                        <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Restaurar Padrão do Cargo</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
                        <Check className="w-3.5 h-3.5" />
                        Usando Padrão do Cargo ({ROLE_INFO[currentUserObj.role]?.label || currentUserObj.role})
                      </span>
                      <button
                        onClick={enableUserCustom}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-md shadow-blue-600/20"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Personalizar Permissões</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Aviso informativo de usuário */}
            {currentUserObj && (
              <div
                className={`flex items-start gap-3 p-3.5 rounded-xl text-xs border ${
                  isCustomMode
                    ? 'bg-purple-950/30 border-purple-800/40 text-purple-200'
                    : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
                }`}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    {currentUserObj.nome} ({currentUserObj.email}) — Cargo: {ROLE_INFO[currentUserObj.role]?.label || currentUserObj.role}
                  </span>
                  <p className="mt-0.5 opacity-90">
                    {isCustomMode
                      ? 'Este usuário possui permissões individuais exclusivas. As alterações feitas aqui afetarão somente este usuário e não impactarão os outros colaboradores.'
                      : `Este usuário herda todas as permissões do perfil ${ROLE_INFO[currentUserObj.role]?.label || currentUserObj.role}. Para permitir funções extras apenas para ele (como Cadastro de Produtos ou Clientes), marque as caixas desejadas abaixo.`}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de Ações Rápidas & Busca de Permissões */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Campo de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar função, tela ou papel (ex: produtos, clientes)..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Resumo de Funções e Controles */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Liberadas:</span>
            <span className="font-bold text-blue-400 font-mono">
              {selectedPerms.length} / {allCatalogIds.length}
            </span>
            <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(selectedPerms.length / Math.max(allCatalogIds.length, 1)) * 100}%`,
                }}
              />
            </div>
          </div>

          <button
            onClick={selectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors border border-slate-700"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>Marcar Todas</span>
          </button>

          <button
            onClick={deselectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors border border-slate-700"
          >
            <Square className="w-3.5 h-3.5 text-slate-400" />
            <span>Desmarcar Todas</span>
          </button>

          {/* Copiar de outro perfil */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors border border-slate-700">
              <Copy className="w-3.5 h-3.5 text-amber-400" />
              <span>Copiar de...</span>
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 w-48 overflow-hidden divide-y divide-slate-700/50">
              {(['caixa', 'operator', 'manager', 'mecanico'] as const).map(rk => (
                <button
                  key={rk}
                  onClick={() => copyFromRole(rk)}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-700 hover:text-white transition-colors flex items-center justify-between"
                >
                  <span>Perfil {ROLE_INFO[rk]?.label}</span>
                  <span className="text-[10px] text-slate-400">({rolesMap[rk]?.length ?? 0})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Categorias e Checkboxes de Permissões */}
      {loadingCatalog ? (
        <div className="p-12 text-center text-slate-500 text-sm flex items-center justify-center gap-3">
          <RotateCw className="w-5 h-5 animate-spin text-blue-400" />
          <span>Carregando catálogo de permissões…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCatalog.map(category => {
            const IconComp = CATEGORY_ICONS[category.categoria] || ShieldCheck
            const catPermIds = category.permissoes.map(p => p.id)
            const activeInCat = catPermIds.filter(id => selectedPerms.includes(id)).length
            const allInCatSelected = catPermIds.length > 0 && activeInCat === catPermIds.length

            return (
              <div
                key={category.categoria}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col"
              >
                {/* Cabeçalho da Categoria */}
                <div className="px-5 py-3.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white tracking-tight">
                        {category.categoria}
                      </h2>
                      <span className="text-[11px] text-slate-400">
                        {activeInCat} de {catPermIds.length} liberadas
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleCategory(category)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
                  >
                    {allInCatSelected ? 'Desmarcar cat.' : 'Marcar todas'}
                  </button>
                </div>

                {/* Lista de Checkboxes da Categoria */}
                <div className="p-3 divide-y divide-slate-800/40 flex-1">
                  {category.permissoes.map(item => {
                    const isChecked = selectedPerms.includes(item.id)

                    return (
                      <div
                        key={item.id}
                        onClick={() => togglePermission(item.id)}
                        className={`p-3 rounded-xl transition-all cursor-pointer flex items-start gap-3.5 select-none ${
                          isChecked
                            ? 'bg-blue-600/10 hover:bg-blue-600/15 border border-blue-500/30'
                            : 'hover:bg-slate-800/60 border border-transparent'
                        }`}
                      >
                        {/* Custom Checkbox visual */}
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                            isChecked
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40 ring-1 ring-blue-400'
                              : 'bg-slate-800 border border-slate-600 text-transparent'
                          }`}
                        >
                          <Check className={`w-3.5 h-3.5 stroke-[3] ${isChecked ? 'opacity-100' : 'opacity-0'}`} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-sm font-semibold transition-colors ${
                                isChecked ? 'text-white' : 'text-slate-300'
                              }`}
                            >
                              {item.nome}
                            </span>
                            {item.rota && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-500 border border-slate-800">
                                {item.rota}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                            {item.descricao}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Barra Fixa Inferior de Salvar (Floating Footer Bar) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 shadow-2xl py-3 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-slate-400">
                Alvo de configuração:
              </p>
              <p className="text-sm font-bold text-white flex items-center gap-2">
                {mode === 'role' ? (
                  <>
                    <span>Perfil: {ROLE_INFO[selectedRole]?.label || selectedRole}</span>
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      Padrão para {userCountByRole[selectedRole] ?? 0} usuários
                    </span>
                  </>
                ) : (
                  <>
                    <span>{currentUserObj?.nome || 'Usuário'}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isCustomMode
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {isCustomMode ? 'Personalizado' : 'Padrão do Perfil'}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 animate-pulse">
                <AlertCircle className="w-3.5 h-3.5" />
                Alterações não salvas
              </span>
            )}

            <button
              onClick={() => {
                if (mode === 'role') {
                  setSelectedPerms(rolesMap[selectedRole] ?? [])
                } else if (userDetail) {
                  setSelectedPerms(userDetail.permissions ?? [])
                  setIsCustomMode(Boolean(userDetail.custom_permissions))
                }
                setIsDirty(false)
              }}
              disabled={!isDirty}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-semibold rounded-xl transition-colors border border-slate-700"
            >
              Descartar
            </button>

            <button
              onClick={handleSave}
              disabled={saveRoleMutation.isPending || saveUserMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
            >
              {(saveRoleMutation.isPending || saveUserMutation.isPending) ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Salvando Permissões…</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Salvar Permissões</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
