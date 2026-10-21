import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Settings,
  UploadCloud,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  Store,
  Users,
  ShieldCheck,
  Layers,
  Wrench,
  Image as ImageIcon,
  Eye,
  Building2,
} from 'lucide-react'
import { erpApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useSystemConfig } from '../contexts/ConfigContext'

export default function Configuracoes() {
  const { isOwner, currentTenant, tenants } = useAuth()
  const { logoUrl: currentLogo, nomeSistema: currentNome, refetchConfig } = useSystemConfig()

  const [nomeSistema, setNomeSistema] = useState(currentNome || '4Rodas ERP')
  const [logoPreview, setLogoPreview] = useState<string | null>(currentLogo)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [aplicarTodasLojas, setAplicarTodasLojas] = useState(false)

  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNomeSistema(currentNome || '4Rodas ERP')
    setLogoPreview(currentLogo)
  }, [currentNome, currentLogo])

  function handleFileSelect(file: File) {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', text: 'Selecione um arquivo de imagem válido (PNG, JPG, SVG, WebP).' })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: 'error', text: 'A imagem deve ter no máximo 5MB.' })
      return
    }

    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = e => {
      setLogoPreview(e.target?.result as string)
      setFeedback(null)
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  async function handleSalvar() {
    setSaving(true)
    setFeedback(null)
    try {
      await erpApi.salvarConfigSistema({
        logo: logoPreview,
        nome_sistema: nomeSistema.trim() || '4Rodas ERP',
        aplicar_todas_lojas: isOwner ? aplicarTodasLojas : false,
      })

      refetchConfig()
      setFeedback({
        type: 'success',
        text: 'Configurações e logotipo atualizados com sucesso!',
      })
      setTimeout(() => setFeedback(null), 4000)
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Erro ao salvar configurações do sistema.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleRestaurarPadrao() {
    if (!confirm('Deseja restaurar o logotipo e nome padrão do sistema?')) return

    setSaving(true)
    setFeedback(null)
    try {
      await erpApi.removerLogoSistema()
      await erpApi.salvarConfigSistema({
        logo: null,
        nome_sistema: '4Rodas ERP',
        aplicar_todas_lojas: isOwner ? aplicarTodasLojas : false,
      })

      setLogoPreview(null)
      setLogoFile(null)
      setNomeSistema('4Rodas ERP')
      refetchConfig()

      setFeedback({
        type: 'success',
        text: 'Logotipo padrão restaurado com sucesso!',
      })
      setTimeout(() => setFeedback(null), 4000)
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Erro ao restaurar logotipo padrão.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Settings className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Configurações do Sistema</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Personalize o logotipo (logo.png), o nome da empresa e a identidade visual das telas do sistema
          </p>
        </div>

        {currentTenant && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Loja atual: <strong className="text-white">{currentTenant.nome}</strong></span>
          </div>
        )}
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              : 'bg-red-950/70 border-red-800 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Painel Principal de Identidade Visual e Logotipo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna da Esquerda: Formulário de Upload e Dados */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-400" />
              <span>Logotipo da Empresa (logo.png)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Faça upload do seu arquivo <code className="text-amber-300 font-mono">logo.png</code> para substituir a logo padrão em todo o sistema.
            </p>
          </div>

          {/* Nome do Sistema */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Nome do Sistema / Empresa
            </label>
            <input
              type="text"
              value={nomeSistema}
              onChange={e => setNomeSistema(e.target.value)}
              placeholder="Ex: 4Rodas ERP ou Minha Oficina Automotiva"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-[11px] text-slate-500">
              Nome exibido ao lado do logotipo na barra lateral, no cabeçalho e na tela de login.
            </p>
          </div>

          {/* Dropzone de Upload */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Arquivo da Logo (logo.png)
            </label>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-800/40 hover:bg-slate-800/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Clique para selecionar ou arraste sua <span className="text-blue-400">logo.png</span> aqui
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Formatos aceitos: PNG (recomendado com fundo transparente), JPG, SVG ou WebP (máx. 5MB)
                  </p>
                </div>
                {logoFile && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/15 border border-blue-500/30 rounded-lg text-xs text-blue-300 font-mono">
                    <span>{logoFile.name}</span>
                    <span className="text-[10px] text-slate-400">({(logoFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Multi-Loja (Owner) */}
          {isOwner && tenants && tenants.length > 1 && (
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aplicarTodasLojas}
                  onChange={e => setAplicarTodasLojas(e.target.checked)}
                  className="mt-0.5 rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-semibold text-white">
                    Aplicar este logotipo e nome para todas as lojas da empresa
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Se desmarcado, as alterações serão salvas como identidade específica da loja selecionada ({currentTenant?.nome}).
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRestaurarPadrao}
              disabled={saving}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-slate-800 border border-slate-700/80 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Logo Padrão</span>
            </button>

            <button
              type="button"
              onClick={handleSalvar}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg shadow-blue-600/25 transition-all"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Salvando…</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Logotipo</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Coluna da Direita: Pré-visualização ao Vivo */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span>Pré-visualização ao Vivo</span>
              </h3>
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Como ficará no sistema
              </span>
            </div>

            {/* Simulação 1: Sidebar do ERP */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                1. Na Barra Lateral (Sidebar ERP)
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                {logoPreview ? (
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/60 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-sm">
                    <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold shrink-0">
                    <span className="text-xs">4R</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest leading-none mb-1">
                    Sistema
                  </p>
                  <p className="text-sm font-bold text-white tracking-tight leading-none truncate">
                    {nomeSistema || '4Rodas ERP'}
                  </p>
                </div>
              </div>
            </div>

            {/* Simulação 2: Topbar do Checklist / OS */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                2. No Cabeçalho Superior (Checklist Automotivo)
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-2.5">
                {logoPreview ? (
                  <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center p-0.5 overflow-hidden shrink-0">
                    <img src={logoPreview} alt="Logo Topbar" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Wrench className="w-4 h-4" />
                  </div>
                )}
                <span className="text-sm font-bold text-white tracking-tight">
                  {nomeSistema || 'Checklist Automotivo'}
                </span>
              </div>
            </div>

            {/* Simulação 3: Tela de Login */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                3. Na Tela de Login
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 text-center">
                {logoPreview ? (
                  <div className="w-16 h-16 mx-auto mb-2 rounded-2xl bg-slate-900 border border-slate-700/80 p-2 flex items-center justify-center overflow-hidden shadow-md">
                    <img src={logoPreview} alt="Logo Login" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-2xl mb-2">
                    🔧
                  </div>
                )}
                <h4 className="text-base font-bold text-white">{nomeSistema || '4Rodas ERP'}</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Faça login para continuar</p>
              </div>
            </div>
          </div>

          {/* Dicas de Design */}
          <div className="bg-blue-950/30 border border-blue-900/50 rounded-2xl p-4 text-xs text-blue-300 space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-blue-200">
              <span>💡</span>
              <span>Dicas para a melhor apresentação da sua logo:</span>
            </p>
            <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px]">
              <li>Use um arquivo <strong className="text-white">PNG com fundo transparente</strong> para harmonizar perfeitamente com os temas escuros do sistema.</li>
              <li>Resolução recomendada: entre <strong>256×256</strong> e <strong>800×800 pixels</strong> (proporção quadrada ou horizontal).</li>
              <li>Imagens com bom contraste (letras ou símbolos claros/brancos/coloridos) têm leitura excelente no painel.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Outras Seções de Configurações */}
      <div className="space-y-3 pt-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-400">
          Outras Opções de Configuração e Administração
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link
            to="/erp/config/parametros"
            className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all group flex items-start gap-3"
          >
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0 group-hover:scale-105 transition-transform">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">Parâmetros do PDV</p>
              <p className="text-xs text-slate-400 mt-0.5">Limite de descontos e regras operacionais do caixa</p>
            </div>
          </Link>

          <Link
            to="/erp/permissoes"
            className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all group flex items-start gap-3"
          >
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">Papéis & Permissões</p>
              <p className="text-xs text-slate-400 mt-0.5">Controle de acessos de operadores, caixas e gerentes</p>
            </div>
          </Link>

          <Link
            to="/erp/lojas"
            className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all group flex items-start gap-3"
          >
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 group-hover:scale-105 transition-transform">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">Lojas & Filiais</p>
              <p className="text-xs text-slate-400 mt-0.5">Gestão das unidades cadastradas no sistema</p>
            </div>
          </Link>

          <Link
            to="/erp/usuarios"
            className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all group flex items-start gap-3"
          >
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0 group-hover:scale-105 transition-transform">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">Usuários</p>
              <p className="text-xs text-slate-400 mt-0.5">Cadastro de funcionários, operadores e caixas</p>
            </div>
          </Link>

          <Link
            to="/erp/config/tipos"
            className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all group flex items-start gap-3"
          >
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0 group-hover:scale-105 transition-transform">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-teal-300 transition-colors">Tipos de Produtos</p>
              <p className="text-xs text-slate-400 mt-0.5">Categorias e agrupamentos do estoque e catálogo</p>
            </div>
          </Link>

          <Link
            to="/erp/config/instalacoes"
            className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all group flex items-start gap-3"
          >
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0 group-hover:scale-105 transition-transform">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-rose-300 transition-colors">Instalações</p>
              <p className="text-xs text-slate-400 mt-0.5">Posições dos componentes para ordens de serviço</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
