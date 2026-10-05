export interface CepResult {
  cep: string
  logradouro: string
  complemento?: string
  bairro: string
  localidade: string
  uf: string
  formattedAddress: string
}

export async function lookupCep(cepInput: string): Promise<CepResult | null> {
  const clean = cepInput.replace(/\D/g, '')
  if (clean.length !== 8) return null

  // 1. Consulta primária: ViaCEP
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
    if (res.ok) {
      const data = await res.json()
      if (!data.erro) {
        const parts = [
          data.logradouro,
          data.bairro,
          data.localidade && data.uf ? `${data.localidade} - ${data.uf}` : (data.localidade || data.uf)
        ].filter(Boolean)

        return {
          cep: data.cep || clean,
          logradouro: data.logradouro || '',
          complemento: data.complemento || '',
          bairro: data.bairro || '',
          localidade: data.localidade || '',
          uf: data.uf || '',
          formattedAddress: parts.join(', '),
        }
      }
    }
  } catch (e) {
    console.warn('[ViaCEP] Falha na consulta primária, tentando fallback BrasilAPI:', e)
  }

  // 2. Fallback: BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${clean}`)
    if (res.ok) {
      const data = await res.json()
      const parts = [
        data.street,
        data.neighborhood,
        data.city && data.state ? `${data.city} - ${data.state}` : (data.city || data.state)
      ].filter(Boolean)

      return {
        cep: data.cep || clean,
        logradouro: data.street || '',
        bairro: data.neighborhood || '',
        localidade: data.city || '',
        uf: data.state || '',
        formattedAddress: parts.join(', '),
      }
    }
  } catch (e) {
    console.error('[BrasilAPI] Falha no fallback de CEP:', e)
  }

  return null
}

export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`
  }
  return digits
}
