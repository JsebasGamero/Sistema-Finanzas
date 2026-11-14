import { useCallback, useState } from 'react';

/**
 * Muestra una lista larga por partes ("Mostrar 50 más") en vez de montar
 * miles de filas de una vez (REP-13: con 3.000 movimientos la pestaña tardaba
 * en abrir en un Android de gama media y el buscador se trababa).
 *
 * `firma` identifica los filtros actuales: si cambia, el límite vuelve a la
 * primera parte. Se deriva en el render en lugar de resetear con un efecto,
 * así no hay un render intermedio con la lista vieja.
 */
export function usePorPartes(total, firma, tamano = 50) {
    const [estado, setEstado] = useState({ firma, limite: tamano });
    const limite = estado.firma === firma ? estado.limite : tamano;

    const mostrarMas = useCallback(() => {
        setEstado({ firma, limite: limite + tamano });
    }, [firma, limite, tamano]);

    return {
        limite: Math.min(limite, total),
        hayMas: limite < total,
        siguiente: Math.min(tamano, Math.max(total - limite, 0)),
        mostrarMas,
    };
}
