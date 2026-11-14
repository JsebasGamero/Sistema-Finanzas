import { useCallback, useSyncExternalStore } from 'react';

/** ¿La ventana mide al menos `px` de ancho? Se actualiza al girar o redimensionar. */
export function useAnchoMinimo(px) {
    const consulta = `(min-width: ${px}px)`;
    const suscribir = useCallback((avisar) => {
        const lista = typeof window !== 'undefined' ? window.matchMedia?.(consulta) : null;
        if (!lista) return () => {};
        lista.addEventListener('change', avisar);
        return () => lista.removeEventListener('change', avisar);
    }, [consulta]);
    const leer = () => (typeof window !== 'undefined' ? window.matchMedia?.(consulta).matches ?? true : true);
    return useSyncExternalStore(suscribir, leer, () => true);
}
