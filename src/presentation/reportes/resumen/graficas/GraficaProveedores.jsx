import { useMemo } from 'react';
import { formatoCompacto, formatoMoneda } from '../../../formato';
import TarjetaGrafica from '../../comunes/TarjetaGrafica';
import BarrasHorizontales from '../../comunes/BarrasHorizontales';
import { plural } from '../../comunes/texto';

/** Los 8 terceros a los que más se les pagó en el periodo. */
export default function GraficaProveedores({ resumen, colores, subtitulo }) {
    const filas = useMemo(
        () => resumen.filas.map((f) => ({ ...f, color: colores.neg, etiqueta: formatoCompacto(f.monto) })),
        [resumen, colores]
    );
    const nota = resumen.cantidad > filas.length
        ? `Top ${filas.length} de ${plural(resumen.cantidad, 'proveedor', 'proveedores')}`
        : plural(resumen.cantidad, 'proveedor', 'proveedores');

    return (
        <TarjetaGrafica
            titulo="Proveedores más pagados"
            subtitulo={subtitulo}
            vacia={filas.length === 0}
            mensajeVacio="No hay pagos a proveedores en este periodo."
        >
            <BarrasHorizontales filas={filas} colores={colores} nombreSerie="Pagado" conEtiquetas />
            <p className="px-2 pb-1 text-xs text-ink-3">
                {nota}. Total pagado a terceros: <span className="num">{formatoMoneda(resumen.total)}</span>.
            </p>
        </TarjetaGrafica>
    );
}
