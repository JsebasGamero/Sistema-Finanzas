import { useMemo } from 'react';
import { formatoMoneda, formatoPorcentaje } from '../../../formato';
import TarjetaGrafica from '../../comunes/TarjetaGrafica';
import BarrasHorizontales from '../../comunes/BarrasHorizontales';

/**
 * Egresos por categoría: top 8 y "Otras". El % de cada barra es sobre el
 * total de egresos del periodo (REP-8), no sobre las barras visibles.
 */
export default function GraficaCategorias({ resumen, colores, subtitulo }) {
    const filas = useMemo(
        () => resumen.filas.map((f) => ({
            ...f,
            color: f.esOtras ? colores.ink3 : colores.neg,
            etiqueta: formatoPorcentaje(f.fraccion),
        })),
        [resumen, colores]
    );

    return (
        <TarjetaGrafica
            titulo="Egresos por categoría"
            subtitulo={resumen.total > 0 ? `${subtitulo} · total ${formatoMoneda(resumen.total)}` : subtitulo}
            vacia={filas.length === 0}
            mensajeVacio="No hay egresos en este periodo."
        >
            <BarrasHorizontales filas={filas} colores={colores} nombreSerie="Egresos" conEtiquetas />
            <p className="px-2 pb-1 text-xs text-ink-3">Porcentaje sobre el total de egresos del periodo.</p>
        </TarjetaGrafica>
    );
}
