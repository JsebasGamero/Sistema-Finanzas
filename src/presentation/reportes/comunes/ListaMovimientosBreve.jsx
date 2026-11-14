import { TIPO_MOVIMIENTO } from '../../../domain/value-objects/tipoMovimiento';
import { formatoFecha, formatoMoneda, formatoNumero } from '../../formato';
import { valorConSigno } from './calculosComunes';
import { usePorPartes } from './usePorPartes';
import MarcaTipo from './MarcaTipo';

/**
 * Lista corta de movimientos dentro del detalle de una obra, un proveedor o
 * una caja. Se monta por partes (REP-13: antes el detalle pintaba todas las
 * transacciones del ítem; el max-height solo limitaba la altura, no el DOM).
 *
 * @param {{ movimientos: object[], datos: object, cajaId?: string, tamano?: number,
 *           ocultar?: Array<'caja'|'obra'|'tercero'>, vacio?: string }} props
 */
export default function ListaMovimientosBreve({ movimientos, datos, cajaId = '', tamano = 10, ocultar = [], vacio = 'Sin movimientos en el periodo.' }) {
    const { limite, hayMas, siguiente, mostrarMas } = usePorPartes(movimientos.length, movimientos, tamano);

    if (movimientos.length === 0) return <p className="text-sm text-ink-3">{vacio}</p>;

    return (
        <div>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                {movimientos.slice(0, limite).map((tx) => {
                    const neutro = tx.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA && !cajaId;
                    const valor = valorConSigno(tx, cajaId);
                    const meta = [
                        formatoFecha(tx.fecha),
                        tx.descripcion ? datos.nombreCategoria(tx.categoria) : null,
                        ocultar.includes('caja') ? null : datos.nombreCaja(tx.caja_origen_id),
                        ocultar.includes('obra') ? null : datos.nombreProyecto(tx.proyecto_id),
                        ocultar.includes('tercero') ? null : datos.nombreTercero(tx.tercero_id),
                    ].filter(Boolean).join(' · ');
                    return (
                        <li key={tx.id} className="flex items-center gap-3 px-3 py-2">
                            <MarcaTipo tipo={tx.tipo_movimiento} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-ink">{tx.descripcion || datos.nombreCategoria(tx.categoria)}</p>
                                <p className="truncate text-xs text-ink-3">{meta}</p>
                            </div>
                            <span className={`amount text-sm ${neutro ? 'text-info' : valor < 0 ? 'text-neg' : 'text-pos'}`}>
                                {neutro ? formatoMoneda(tx.monto) : formatoMoneda(valor, { signo: true })}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {hayMas && (
                <button type="button" className="btn-ghost btn-sm mt-2" onClick={mostrarMas}>
                    Mostrar {formatoNumero(siguiente)} más ({formatoNumero(limite)} de {formatoNumero(movimientos.length)})
                </button>
            )}
        </div>
    );
}
