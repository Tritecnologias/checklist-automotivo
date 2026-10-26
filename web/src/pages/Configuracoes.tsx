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
  Link2,
  Unlink,
} from 'lucide-react'
import { erpApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useSystemConfig } from '../contexts/ConfigContext'

export default function Configuracoes() {
  const { isOwner, currentTenant, tenants } = useAuth()
  const {
    logoUrl: currentLogo,
    nomeSistema: currentNome,
    logoSize: currentLogoSize,
    logoLayout: currentLogoLayout,
    logoWidth: currentLogoWidth,
    logoHeight: currentLogoHeight,
    refetchConfig,
  } = useSystemConfig()

  const [nomeSistema, setNomeSistema] = useState(currentNome || '4Rodas ERP')
  const [logoPreview, setLogoPreview] = useState<string | null>(currentLogo)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoSize, setLogoSize] = useState<'sm' | 'md' | 'lg' | 'xl'>(currentLogoSize || 'lg')
  const [logoLayout, setLogoLayout] = useState<'inline' | 'stacked'>(currentLogoLayout || 'inline')
  const [logoWidth, setLogoWidth] = useState<number>(currentLogoWidth || 52)
  const [logoHeight, setLogoHeight] = useState<number>(currentLogoHeight || 52)
  const [manterProporcao, setManterProporcao] = useState(
    currentLogoWidth && currentLogoHeight ? currentLogoWidth === currentLogoHeight : true
  )
  const [aplicarTodasLojas, setAplicarTodasLojas] = useState(false)

  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNomeSistema(currentNome || '4Rodas ERP')
    setLogoPreview(currentLogo)
    setLogoSize(currentLogoSize || 'lg')
    setLogoLayout(currentLogoLayout || 'inline')
    setLogoWidth(currentLogoWidth || 52)
    setLogoHeight(currentLogoHeight || 52)
    setManterProporcao(
      currentLogoWidth && currentLogoHeight ? currentLogoWidth === currentLogoHeight : true
    )
  }, [currentNome, currentLogo, currentLogoSize, currentLogoLayout, currentLogoWidth, currentLogoHeight])

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
        logo_size: logoSize,
        logo_layout: logoLayout,
        logo_width: logoWidth,
        logo_height: logoHeight,
        aplicar_todas_lojas: isOwner ? aplicarTodasLojas : false,
      })

      refetchConfig()
      setFeedback({
        type: 'success',
        text: 'Configurações, logotipo e dimensões atualizados com sucesso!',
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
        logo_size: 'lg',
        logo_layout: 'inline',
        logo_width: null,
        logo_height: null,
        aplicar_todas_lojas: isOwner ? aplicarTodasLojas : false,
      })

      setLogoPreview(null)
      setLogoFile(null)
      setNomeSistema('4Rodas ERP')
      setLogoSize('lg')
      setLogoLayout('inline')
      setLogoWidth(52)
      setLogoHeight(52)
      setManterProporcao(true)
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

          {/* Tamanho de Exibição do Logotipo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Tamanho de Exibição do Logotipo
              </label>
              <span className="text-[11px] font-medium text-blue-400">
                Selecione o tamanho ideal para sua marca
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'sm', label: 'Compacto', badge: '36px', size: 36, desc: 'Discreto e sutil' },
                { id: 'md', label: 'Médio', badge: '44px', size: 44, desc: 'Equilibrado' },
                { id: 'lg', label: 'Grande', badge: '52px', size: 52, desc: 'Recomendado (Nítido)', popular: true },
                { id: 'xl', label: 'Extra Grande', badge: '64px', size: 64, desc: 'Destaque visual' },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setLogoSize(item.id as any)
                    setLogoWidth(item.size)
                    setLogoHeight(item.size)
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    logoSize === item.id && logoWidth === item.size && logoHeight === item.size
                      ? 'border-blue-500 bg-blue-500/15 text-white ring-1 ring-blue-500/50 shadow-sm'
                      : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                      logoSize === item.id && logoWidth === item.size && logoHeight === item.size
                        ? 'bg-blue-500/30 text-blue-200'
                        : 'bg-slate-700/60 text-slate-400'
                    }`}>
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 leading-snug">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Ajuste Fino de Altura e Largura (Pixels) */}
          <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/80 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                  <span>Ajuste de Altura e Largura (Pixels)</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Defina exatamente as dimensões em pixels para o logotipo caber no seu espaço.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setManterProporcao(!manterProporcao)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                  manterProporcao
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {manterProporcao ? <Link2 className="w-3.5 h-3.5 text-blue-400" /> : <Unlink className="w-3.5 h-3.5 text-slate-400" />}
                <span>{manterProporcao ? 'Proporção 1:1 Vinculada' : 'Dimensões Livres'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Largura (Width) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Largura (Width)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={24}
                      max={220}
                      value={logoWidth}
                      onChange={e => {
                        const val = Math.max(20, Math.min(240, Number(e.target.value) || 20))
                        setLogoWidth(val)
                        if (manterProporcao) setLogoHeight(val)
                      }}
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white text-right focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[11px] text-slate-400 font-mono">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={24}
                  max={220}
                  step={2}
                  value={logoWidth}
                  onChange={e => {
                    const val = Number(e.target.value)
                    setLogoWidth(val)
                    if (manterProporcao) setLogoHeight(val)
                  }}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>24px</span>
                  <span>120px</span>
                  <span>220px</span>
                </div>
              </div>

              {/* Altura (Height) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Altura (Height)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={24}
                      max={160}
                      value={logoHeight}
                      onChange={e => {
                        const val = Math.max(20, Math.min(160, Number(e.target.value) || 20))
                        setLogoHeight(val)
                        if (manterProporcao) setLogoWidth(val)
                      }}
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white text-right focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[11px] text-slate-400 font-mono">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={24}
                  max={160}
                  step={2}
                  value={logoHeight}
                  onChange={e => {
                    const val = Number(e.target.value)
                    setLogoHeight(val)
                    if (manterProporcao) setLogoWidth(val)
                  }}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>24px</span>
                  <span>80px</span>
                  <span>160px</span>
                </div>
              </div>
            </div>

            {/* Presets Rápidos */}
            <div className="space-y-1.5 pt-1 border-t border-slate-700/60">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Atalhos de formatos comuns:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '48×48 px (Médio)', w: 48, h: 48, prop: true },
                  { label: '64×64 px (Grande)', w: 64, h: 64, prop: true },
                  { label: '80×80 px (Destaque)', w: 80, h: 80, prop: true },
                  { label: '100×100 px (Máx. Quadrado)', w: 100, h: 100, prop: true },
                  { label: '140×48 px (Horizontal)', w: 140, h: 48, prop: false },
                  { label: '170×60 px (Banner Topo)', w: 170, h: 60, prop: false },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setManterProporcao(p.prop)
                      setLogoWidth(p.w)
                      setLogoHeight(p.h)
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all ${
                      logoWidth === p.w && logoHeight === p.h
                        ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-sm'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Estilo de Exibição na Barra Lateral */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Disposição na Barra Lateral (Menu ERP)
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setLogoLayout('inline')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  logoLayout === 'inline'
                    ? 'border-blue-500 bg-blue-500/15 text-white ring-1 ring-blue-500/50 shadow-sm'
                    : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-[10px] font-bold text-blue-400">
                  <span>[Icon]</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Horizontal (Ao lado do texto)</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300 font-normal">Padrão</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Logotipo ampliado à esquerda com o nome da empresa ao lado.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLogoLayout('stacked')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  logoLayout === 'stacked'
                    ? 'border-blue-500 bg-blue-500/15 text-white ring-1 ring-blue-500/50 shadow-sm'
                    : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex flex-col items-center justify-center shrink-0 text-amber-400">
                  <span className="text-xs">⭐</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Vertical (Destaque Centralizado)</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-normal">Ideal p/ Emblemas</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Logotipo centralizado com tamanho máximo no topo do menu.
                  </p>
                </div>
              </button>
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
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  1. Na Barra Lateral (Sidebar ERP)
                </p>
                <span className="text-[10px] text-blue-400 font-mono font-bold">
                  {logoLayout === 'stacked' ? 'Vertical' : 'Horizontal'} • {logoWidth}×{logoHeight}px
                </span>
              </div>

              {logoLayout === 'stacked' && logoPreview ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center text-center">
                  <div
                    className="flex items-center justify-center overflow-hidden transition-all"
                    style={{
                      width: `${logoWidth}px`,
                      height: `${logoHeight}px`,
                      maxWidth: '180px',
                      maxHeight: '140px',
                    }}
                  >
                    <img src={logoPreview} alt="Logo Preview" className="max-h-full max-w-full object-contain drop-shadow-md" />
                  </div>
                  <p className="text-xs font-bold text-white tracking-tight mt-2 truncate max-w-full">
                    {nomeSistema || '4Rodas ERP'}
                  </p>
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                  {logoPreview ? (
                    <div
                      className="rounded-xl flex items-center justify-center overflow-hidden shrink-0 transition-all"
                      style={{
                        width: `${logoWidth}px`,
                        height: `${logoHeight}px`,
                        maxWidth: '110px',
                        maxHeight: '90px',
                      }}
                    >
                      <img src={logoPreview} alt="Logo Preview" className="max-h-full max-w-full object-contain drop-shadow-sm" />
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
                    <p className="text-sm font-bold text-white tracking-tight leading-snug break-words line-clamp-2">
                      {nomeSistema || '4Rodas ERP'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Simulação 2: Topbar do Checklist / OS */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                2. No Cabeçalho Superior (Checklist Automotivo)
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-2.5">
                {logoPreview ? (
                  <div
                    className="flex items-center justify-center overflow-hidden shrink-0 transition-all"
                    style={{
                      width: `${logoWidth}px`,
                      height: `${Math.min(logoHeight, 46)}px`,
                      maxHeight: '46px',
                      maxWidth: '220px',
                    }}
                  >
                    <img src={logoPreview} alt="Logo Topbar" className="max-h-full max-w-full object-contain drop-shadow-sm" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
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
                  <div
                    className="mx-auto mb-2 flex items-center justify-center overflow-hidden transition-all"
                    style={{
                      width: `${Math.max(logoWidth, 64)}px`,
                      height: `${Math.max(logoHeight, 64)}px`,
                      maxHeight: '160px',
                      maxWidth: '280px',
                    }}
                  >
                    <img src={logoPreview} alt="Logo Login" className="max-h-full max-w-full object-contain drop-shadow-md" />
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
