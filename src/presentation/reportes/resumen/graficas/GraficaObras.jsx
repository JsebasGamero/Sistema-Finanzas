import { esCero, restarMontos } from '../../../../domain/value-objects/dinero';
import { formatoMoneda, formatoPorcentaje } from '../../../formato';
import TarjetaGrafica from '../../comunes/TarjetaGrafica';
import LeyendaGrafica from '../../comunes/LeyendaGrafica';

const MAXIMO = 8;

/**
 * Ejecución de presupuesto por obra: barra de lo ejecutado y marca vertical
 * donde está el presupuesto. Si la barra pasa la marca, la obra va excedida.
 *
 * Se dibuja en HTML y no con Recharts: cada fila necesita su propia escala
 * (presupuesto o gasto, el mayor) y una marca por fila, y así los nombres
 * largos de obra se leen completos a 320 px.
 */
export default function GraficaObras({ obras, subtitulo }) {
    const visibles = obras.slice(0, MAXIMO);

    return (
        <TarjetaGrafica
            titulo="Ejecución de obras"
            subtitulo={subtitulo}
            vacia={visibles.length === 0}
            mensajeVacio="No hay obras con presupuesto o gastos."
            leyenda={(
                <LeyendaGrafica
                    items={[
                        { nombre: 'Ejecutado', color: 'var(--ink-2)' },
                        { nombre: 'Excedido', color: 'var(--neg)' },
                        { nombre: 'Presupuesto', color: 'var(--ink)', forma: 'marca' },
                    ]}
                />
            )}
        >
            <ul className="px-2 divide-y divide-line">
                {visibles.map((obra) => {
                    const escala = Math.max(obra.presupuesto, obra.ejecutado) || 1;
                    const ancho = Math.min((obra.ejecutado / escala) * 100, 100);
                    const marca = obra.fraccion !== null ? (obra.presupuesto / escala) * 100 : null;
                    const porcentaje = obra.fraccion !== null ? formatoPorcentaje(obra.fraccion) : 'Sin presupuesto';
                    return (
                        <li key={obra.id} className="py-2.5">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="min-w-0 truncate text-sm font-medium text-ink">{obra.nombre}</span>
                                <span className={`amount text-sm ${obra.excedida ? 'text-neg' : 'text-ink'}`}>{porcentaje}</span>
                            </div>
                            <div
                                className="relative mt-1.5 h-2.5 rounded-sm bg-surface-3"
                                role="img"
                                aria-label={`${obra.nombre}: ejecutado ${formatoMoneda(obra.ejecutado)}${obra.fraccion !== null ? ` de ${formatoMoneda(obra.presupuesto)}, ${porcentaje}` : ', sin presupuesto'}`}
                            >
                                <span
                                    className={`absolute inset-y-0 left-0 rounded-sm ${obra.excedida ? 'bg-neg' : 'bg-ink-2'}`}
                                    style={{ width: `${ancho}%` }}
                                />
                                {marca !== null && (
                                    <span className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `calc(${marca}% - 1px)` }} />
                                )}
                            </div>
                            <p className="mt-1 text-xs text-ink-3 num">
                                {formatoMoneda(obra.ejecutado)}
                                {obra.fraccion !== null && ` de ${formatoMoneda(obra.presupuesto)}`}
                                {/* Solo si el periodo no cubre toda la obra; si no, repetiría la misma cifra. */}
                                {obra.egresosPeriodo > 0 && !esCero(restarMontos(obra.egresosPeriodo, obra.ejecutado))
                                    && ` · ${formatoMoneda(obra.egresosPeriodo)} en el periodo`}
                            </p>
                        </li>
                    );
                })}
            </ul>
            {obras.length > MAXIMO && (
                <p className="px-2 pt-1 pb-1 text-xs text-ink-3">
                    {obras.length - MAXIMO} obras más en la pestaña Obras.
                </p>
            )}
        </TarjetaGrafica>
    );
}
