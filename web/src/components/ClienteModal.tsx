import { useState, useEffect } from 'react'
import { X, Search, Building2, User, Phone, Mail, MapPin, Car, AlertCircle, Check } from 'lucide-react'
import { erpApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { ClienteErp } from '../types'

interface ClienteModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (savedId?: number) => void
  clienteId?: number | null
  initialData?: Partial<ClienteErp> | null
}

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  // CNPJ: 00.000.000/0000-00
  return digits
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 14)
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15)
}

function formatPlate(value: string): string {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
  if (clean.length > 3) {
    // Se padrão antigo ABC1234 -> ABC-1234 (se o 5º caractere for número)
    const isOldPattern = /^[A-Z]{3}[0-9]{4}$/.test(clean)
    if (isOldPattern) {
      return `${clean.slice(0, 3)}-${clean.slice(3)}`
    }
  }
  return clean
}

export default function ClienteModal({
  isOpen,
  onClose,
  onSuccess,
  clienteId,
  initialData,
}: ClienteModalProps) {
  const { tenants, currentTenant } = useAuth()

  const [loading, setLoading] = useState(false)
  const [fetchingDetails, setFetchingDetails] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Campos do formulário
  const [nome, setNome] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [celular, setCelular] = useState('')
  const [email, setEmail] = useState('')
  const [placa, setPlaca] = useState('')
  const [modelo, setModelo] = useState('')
  const [cep, setCep] = useState('')
  const [endereco, setEndereco] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [inativo, setInativo] = useState(0)
  const [selectedTenants, setSelectedTenants] = useState<number[]>([])

  // Inicialização e carregamento
  useEffect(() => {
    if (!isOpen) {
      setError(null)
      setSuccessMsg(null)
      return
    }

    if (clienteId) {
      setFetchingDetails(true)
      setError(null)
      erpApi.clienteDetalhes(clienteId)
        .then(c => {
          setNome(c.nome || '')
          setCpfCnpj(c.cpf_cnpj ? formatCpfCnpj(c.cpf_cnpj) : '')
          setTelefone(c.telefone ? formatPhone(c.telefone) : '')
          setCelular(c.celular ? formatPhone(c.celular) : '')
          setEmail(c.email || '')
          setPlaca(c.placa ? formatPlate(c.placa) : '')
          setModelo(c.modelo || '')
          setCep(c.cep || '')
          setEndereco(c.endereco || '')
          setBairro(c.bairro || '')
          setCidade(c.cidade || '')
          setUf(c.uf || '')
          setInativo(c.inativo ?? 0)
          setSelectedTenants(c.tenant_ids && c.tenant_ids.length > 0 ? c.tenant_ids : (currentTenant ? [currentTenant.id] : [1]))
        })
        .catch(err => {
          console.error('Erro ao carregar detalhes do cliente:', err)
          setError('Não foi possível carregar os dados completos do cliente.')
        })
        .finally(() => setFetchingDetails(false))
    } else {
      // Novo cliente
      setNome(initialData?.nome || '')
      setCpfCnpj(initialData?.cpf_cnpj ? formatCpfCnpj(initialData.cpf_cnpj) : '')
      setTelefone(initialData?.telefone ? formatPhone(initialData.telefone) : '')
      setCelular(initialData?.celular ? formatPhone(initialData.celular) : '')
      setEmail(initialData?.email || '')
      setPlaca(initialData?.placa ? formatPlate(initialData.placa) : '')
      setModelo(initialData?.modelo || '')
      setCep(initialData?.cep || '')
      setEndereco(initialData?.endereco || '')
      setBairro(initialData?.bairro || '')
      setCidade(initialData?.cidade || '')
      setUf(initialData?.uf || '')
      setInativo(0)
      setSelectedTenants(currentTenant ? [currentTenant.id] : [1])
    }
  }, [isOpen, clienteId, initialData, currentTenant])

  // Busca automática por CEP (ViaCEP)
  async function handleCepBlur() {
    const cleanCep = cep.replace(/\D/g, '')
    if (cleanCep.length === 8) {
      setCepLoading(true)
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        const data = await res.json()
        if (!data.erro) {
          if (data.logradouro && !endereco) setEndereco(data.logradouro)
          if (data.bairro && !bairro) setBairro(data.bairro)
          if (data.localidade && !cidade) setCidade(data.localidade)
          if (data.uf && !uf) setUf(data.uf)
        }
      } catch (err) {
        console.error('Erro ao consultar ViaCEP:', err)
      } finally {
        setCepLoading(false)
      }
    }
  }

  function toggleTenant(id: number) {
    setSelectedTenants(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setError('Por favor, informe o nome do cliente.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    const payload = {
      nome: nome.trim(),
      cpf_cnpj: cpfCnpj.trim() || undefined,
      telefone: telefone.trim() || undefined,
      celular: celular.trim() || undefined,
      email: email.trim() || undefined,
      placa: placa.trim() || undefined,
      modelo: modelo.trim() || undefined,
      cep: cep.trim() || undefined,
      endereco: endereco.trim() || undefined,
      bairro: bairro.trim() || undefined,
      cidade: cidade.trim() || undefined,
      uf: uf.trim().toUpperCase() || undefined,
      inativo,
      tenant_ids: selectedTenants.length > 0 ? selectedTenants : (currentTenant ? [currentTenant.id] : [1]),
    }

    try {
      if (clienteId) {
        await erpApi.atualizarCliente(clienteId, payload)
        setSuccessMsg('Cliente atualizado com sucesso!')
        setTimeout(() => {
          onSuccess(clienteId)
          onClose()
        }, 600)
      } else {
        const res = await erpApi.criarCliente(payload)
        setSuccessMsg('Cliente cadastrado com sucesso!')
        setTimeout(() => {
          onSuccess(res.id)
          onClose()
        }, 600)
      }
    } catch (err: any) {
      console.error('Erro ao salvar cliente:', err)
      setError(err?.message || 'Erro ao salvar informações do cliente. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {clienteId ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <p className="text-xs text-slate-400">
                {clienteId
                  ? 'Atualize os dados cadastrais, veículo e contatos do cliente'
                  : 'Cadastre um novo cliente para o ERP, PDV e Ordens de Serviço'}
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

        {/* Content */}
        {fetchingDetails ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Carregando informações do cliente…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-sm flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-sm flex items-center gap-3">
                <Check className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* SEÇÃO 1: Dados Pessoais / Principais */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                <User className="w-4 h-4" />
                <span>Dados do Cliente</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome Completo <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Ex: Alexandre da Silva"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    CPF ou CNPJ
                  </label>
                  <input
                    type="text"
                    value={cpfCnpj}
                    onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={18}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={telefone}
                    onChange={e => setTelefone(formatPhone(e.target.value))}
                    placeholder="(31) 3333-0000"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    Celular / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={celular}
                    onChange={e => setCelular(formatPhone(e.target.value))}
                    placeholder="(31) 99999-0000"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: Veículo */}
            <div className="space-y-4 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                <Car className="w-4 h-4" />
                <span>Veículo Principal</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Placa do Veículo
                  </label>
                  <input
                    type="text"
                    value={placa}
                    onChange={e => setPlaca(formatPlate(e.target.value))}
                    placeholder="Ex: ABC1D23 ou ABC-1234"
                    maxLength={8}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-amber-400 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono font-bold tracking-wider uppercase"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Modelo / Veículo
                  </label>
                  <input
                    type="text"
                    value={modelo}
                    onChange={e => setModelo(e.target.value)}
                    placeholder="Ex: Gol 1.6 / Celta / Corolla"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: Endereço */}
            <div className="space-y-4 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <MapPin className="w-4 h-4" />
                  <span>Endereço & Localização</span>
                </div>
                {cepLoading && (
                  <span className="text-xs text-blue-400 flex items-center gap-1.5 animate-pulse">
                    <Search className="w-3.5 h-3.5" /> Buscando CEP…
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    CEP
                  </label>
                  <input
                    type="text"
                    value={cep}
                    onChange={e => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    onBlur={handleCepBlur}
                    placeholder="30000000"
                    maxLength={8}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Endereço (Rua, Número, Complemento)
                  </label>
                  <input
                    type="text"
                    value={endereco}
                    onChange={e => setEndereco(e.target.value)}
                    placeholder="Ex: Av. Principal, 123"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Bairro
                  </label>
                  <input
                    type="text"
                    value={bairro}
                    onChange={e => setBairro(e.target.value)}
                    placeholder="Bairro"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cidade
                  </label>
                  <input
                    type="text"
                    value={cidade}
                    onChange={e => setCidade(e.target.value)}
                    placeholder="Cidade"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    UF
                  </label>
                  <input
                    type="text"
                    value={uf}
                    onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="MG"
                    maxLength={2}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 uppercase font-mono"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 4: Lojas Vinculadas & Status */}
            <div className="space-y-4 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Building2 className="w-4 h-4" />
                  <span>Lojas / Unidades com Acesso</span>
                </div>

                {clienteId && (
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={inativo === 1}
                      onChange={e => setInativo(e.target.checked ? 1 : 0)}
                      className="rounded bg-slate-800 border-slate-700 text-red-500 focus:ring-red-500"
                    />
                    <span className={inativo === 1 ? 'text-red-400 font-semibold' : 'text-slate-400'}>
                      {inativo === 1 ? 'Cliente Inativo' : 'Cliente Ativo'}
                    </span>
                  </label>
                )}
              </div>

              {tenants && tenants.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tenants.map(t => {
                    const isSelected = selectedTenants.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTenant(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-400' : 'bg-slate-600'}`} />
                        {t.nome}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Loja atual vinculada automaticamente.</p>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Salvando…
                  </>
                ) : (
                  <>Salvar Cliente</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
