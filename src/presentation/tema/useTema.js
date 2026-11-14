import { useContext, useMemo } from 'react';
import { TemaContext } from './TemaContext';
import { coloresDelTema, paletaCategorica } from './tema';

/**
 * { preferencia: 'dia'|'noche'|'sistema', tema: 'dia'|'noche', cambiarPreferencia(p) }
 */
export function useTema() {
    return useContext(TemaContext);
}

/**
 * Colores resueltos del tema activo (hex/rgba), recalculados al cambiar de
 * tema. Para Recharts, jsPDF o cualquier cosa que no lea variables CSS.
 * Incluye `categorica`: paleta para series sin significado propio.
 */
export function useColoresTema() {
    const { tema } = useContext(TemaContext);
    return useMemo(() => ({ ...coloresDelTema(), categorica: paletaCategorica(tema), tema }), [tema]);
}
