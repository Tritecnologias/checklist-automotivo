import { useEffect, useState } from 'react';

/**
 * Atrasa a propagação de `value` por `delay` ms.
 * Ideal para evitar disparar buscas a cada keystroke.
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
