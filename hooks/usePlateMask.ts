/**
 * Retorna a placa formatada detectando automaticamente o formato:
 *   Antigo:   ABC-1234
 *   Mercosul: ABC1D23  (4ª pos = dígito, 5ª pos = letra)
 */
export function formatPlate(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7);

  if (clean.length <= 3) return clean;

  const isMercosul =
    clean.length >= 5 &&
    /[0-9]/.test(clean[3]) &&
    /[A-Z]/.test(clean[4]);

  if (isMercosul) return clean;

  // Formato antigo: insere hífen após o 3º caractere
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

/** Extrai apenas os caracteres alfanuméricos (valor "limpo" para envio à API) */
export function cleanPlate(formatted: string): string {
  return formatted.replace(/[^A-Z0-9]/g, '');
}
