import { useDeferredValue, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { formatoFecha, formatoMoneda } from '../../formato';
import { crearPeriodo, describirPeriodo, rangoDePeriodo } from '../comunes/periodo';
import { useHoyLocal } from '../comunes/useHoyLocal';
import { usePorPartes } from '../comunes/usePorPartes';
import { plural } from '../comunes/texto';
import FiltroPeriodo from '../comunes/FiltroPeriodo';
import Kpi from '../comunes/Kpi';
import ListaMovimientosBreve from '../comunes/ListaMovimientosBreve';
import { estadoDe } from '../deudas/calculos';
import { resumenProveedores } from './calculos';

const TIPOS_TERCERO = ['Proveedor', 'Contratista', 'Empleado'];
const PAGINA = 40;

function DetalleProveedor({ fila, datos }) {
    return (
        <div id={`prov-detalle-${fila.id}`} className="space-y-4 bg-surface-2 px-4 pb-4 pt-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div><dt className="eyebrow">Pagado en el periodo</dt><dd className="amount text-ink">{formatoMoneda(fila.pagado)}</dd></div>
                <div><dt className="eyebrow">De eso, abonos a deudas</dt><dd className="amount text-ink">{formatoMoneda(fila.abonos)}</dd></div>
                <div><dt className="eyebrow">Deuda pendiente hoy</dt><dd className={`amount ${fila.deudaPendiente > 0 ? 'text-neg' : 'text-ink'}`}>{formatoMoneda(fila.deudaPendiente)}</dd></div>
                {fila.documento && <div><dt className="eyebrow">NIT / cédula</dt><dd className="mono text-ink">{fila.documento}</dd></div>}
            </dl>

            {fila.deudasAbiertas.length > 0 && (
                <div>
                    <h4 className="eyebrow mb-2">Deudas abiertas</h4>
                    <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                        {fila.deudasAbiertas.map((d) => (
                            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm text-ink">{d.descripcion || 'Deuda sin concepto'}</p>
                                    <p className="truncate text-xs text-ink-3">
                                        {[formatoFecha(d.fecha_deuda), datos.nombreProyecto(d.proyecto_id)].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                                {estadoDe(d) === 'PARCIAL' && <span className="chip chip-warn">Con abonos</span>}
                                <span className="text-right">
                                    <span className="amount block text-sm text-neg">{formatoMoneda(d.monto_pendiente)}</span>
                                    <span className="block text-xs text-ink-3 num">de {formatoMoneda(d.monto_original)}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div>
                <h4 className="eyebrow mb-2">Últimos pagos</h4>
                <ListaMovimientosBreve movimientos={fila.ultimosPagos} datos={datos} ocultar={['tercero']} tamano={5} vacio="Sin pagos en el periodo." />
                {fila.cantidadPagos > fila.ultimosPagos.length && (
                    <p className="mt-2 text-xs text-ink-3">
                        {plural(fila.cantidadPagos, 'pago')} en el periodo. El detalle completo está en Movimientos, filtrando por este proveedor.
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Cuánto se le pagó a cada tercero en el periodo y cuánto se le debe hoy.
 * Lo pagado sale de las transacciones; el abono a una deuda se cuenta una vez
 * aunque se haya recategorizado (REP-11).
 */
export default function ReporteProveedores({ datos }) {
    const [periodo, setPeriodo] = useState(() => crearPeriodo('anio'));
    const [tipo, setTipo] = useState('');
    const [orden, setOrden] = useState('pagado');
    const [busqueda, setBusqueda] = useState('');
    const busquedaDiferida = useDeferredValue(busqueda);
    const [abierta, setAbierta] = useState(null);

    const hoy = useHoyLocal();
    const rango = useMemo(() => rangoDePeriodo(periodo, hoy), [periodo, hoy]);
    const periodoTexto = useMemo(() => describirPeriodo(periodo, hoy), [periodo, hoy]);
    const resumen = useMemo(
        () => resumenProveedores(datos, { ...rango, tipo, orden, busqueda: busquedaDiferida }),
        [datos, rango, tipo, orden, busquedaDiferida]
    );
    const { filas, totales } = resumen;
    const { limite, hayMas, siguiente, mostrarMas } = usePorPartes(filas.length, resumen, PAGINA);

    return (
        <div className="space-y-4">
            <div className="card flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" role="group" aria-label="Filtros de proveedores">
                <FiltroPeriodo id="prov-periodo" valor={periodo} onCambiar={setPeriodo} />
                <div className="min-w-0 sm:w-40">
                    <label className="label" htmlFor="prov-tipo">Tipo</label>
                    <select id="prov-tipo" className="input-field" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                        <option value="">Todos</option>
                        {TIPOS_TERCERO.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="relative min-w-0 sm:flex-1">
                    <label className="label" htmlFor="prov-busqueda">Buscar</label>
                    <Search size={18} className="pointer-events-none absolute left-3 bottom-3 text-ink-3" aria-hidden="true" />
                    <input
                        id="prov-busqueda"
                        type="search"
                        className="input-field"
                        style={{ paddingLeft: 40 }}
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Nombre o NIT"
                        autoComplete="off"
                    />
                </div>
            </div>

            <div className="kpi-strip" aria-label="Totales de proveedores">
                <Kpi etiqueta="Pagado" tono="neg" valor={formatoMoneda(totales.pagado)} meta={periodoTexto} />
                <Kpi etiqueta="De eso, abonos a deudas" valor={formatoMoneda(totales.abonos)} meta="Ya incluido en lo pagado" />
                <Kpi etiqueta="Deuda pendiente" tono="warn" valor={formatoMoneda(totales.deudaPendiente)} meta={`A hoy, ${plural(totales.conDeuda, 'tercero')}`} />
            </div>

            <div className="flex items-end justify-between gap-3">
                <p className="text-sm text-ink-2">{plural(filas.length, 'tercero')}</p>
                <div className="segmented" role="group" aria-label="Ordenar por">
                    <button type="button" aria-pressed={orden === 'pagado'} onClick={() => setOrden('pagado')}>Más pagado</button>
                    <button type="button" aria-pressed={orden === 'deuda'} onClick={() => setOrden('deuda')}>Más deuda</button>
                </div>
            </div>

            {filas.length === 0 ? (
                <div className="card empty-state">No hay pagos ni deudas a terceros con estos filtros.</div>
            ) : (
                <div className="ledger">
                    {filas.slice(0, limite).map((fila) => {
                        const expandida = abierta === fila.id;
                        return (
                            <div key={fila.id}>
                                <button
                                    type="button"
                                    className="ledger-row"
                                    aria-expanded={expandida}
                                    aria-controls={`prov-detalle-${fila.id}`}
                                    onClick={() => setAbierta(expandida ? null : fila.id)}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-ink">{fila.nombre}</span>
                                        <span className="block truncate text-xs text-ink-3">
                                            {[fila.tipo, plural(fila.cantidadPagos, 'pago')].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    {fila.deudaPendiente > 0 && (
                                        <span className="hidden text-right min-[420px]:block">
                                            <span className="amount block text-sm text-neg">{formatoMoneda(fila.deudaPendiente)}</span>
                                            <span className="block text-xs text-ink-3">se debe</span>
                                        </span>
                                    )}
                                    <span className="shrink-0 text-right">
                                        <span className="amount block text-sm text-ink">{formatoMoneda(fila.pagado)}</span>
                                        <span className="block text-xs text-ink-3">
                                            {fila.deudaPendiente > 0
                                                ? <><span className="min-[420px]:hidden text-neg">debe {formatoMoneda(fila.deudaPendiente)}</span><span className="hidden min-[420px]:inline">pagado</span></>
                                                : 'pagado'}
                                        </span>
                                    </span>
                                    <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-ink-3 transition-transform ${expandida ? 'rotate-180' : ''}`} />
                                </button>
                                {expandida && <DetalleProveedor fila={fila} datos={datos} />}
                            </div>
                        );
                    })}
                </div>
            )}
            {hayMas && (
                <button type="button" className="btn-secondary w-full" onClick={mostrarMas}>
                    Mostrar {siguiente} más ({limite} de {filas.length})
                </button>
            )}
        </div>
    );
}
