import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Search } from 'lucide-react';
import { formatoFecha, formatoFechaHora, formatoMoneda, formatoPorcentaje } from '../../formato';
import { plural } from '../comunes/texto';
import Kpi from '../comunes/Kpi';
import { resumenDeudas } from './calculos';

const VISTAS = [
    { id: 'terceros', etiqueta: 'A proveedores' },
    { id: 'cajas', etiqueta: 'Entre cajas' },
];
const FILTROS_ESTADO = [
    { id: 'abiertas', etiqueta: 'Abiertas' },
    { id: 'PAGADA', etiqueta: 'Pagadas' },
    { id: 'todas', etiqueta: 'Todas' },
];
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de un abono: los nuevos guardan timestamp, algunos viejos solo el día. */
function fechaAbono(valor) {
    return SOLO_FECHA.test(String(valor ?? '')) ? formatoFecha(valor) : formatoFechaHora(valor);
}

function Titulo({ deuda, vista, datos }) {
    if (vista === 'terceros') return datos.nombreTercero(deuda.tercero_id, 'Tercero sin registro');
    return (
        <span className="inline-flex min-w-0 items-center gap-1">
            <span className="truncate">{datos.nombreCaja(deuda.caja_deudora_id, 'Caja sin registro')}</span>
            <ArrowRight size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
            <span className="sr-only">le debe a</span>
            <span className="truncate">{datos.nombreCaja(deuda.caja_acreedora_id, 'Caja sin registro')}</span>
        </span>
    );
}

function FilaDeuda({ fila, vista, datos, abierta, onAlternar }) {
    const { deuda } = fila;
    const fecha = vista === 'terceros' ? deuda.fecha_deuda : deuda.fecha_prestamo;
    const meta = [
        formatoFecha(fecha || deuda.created_at),
        vista === 'terceros' ? datos.nombreProyecto(deuda.proyecto_id) : null,
        deuda.descripcion,
    ].filter(Boolean).join(' · ');
    const idDetalle = `deuda-detalle-${deuda.id}`;

    return (
        <div>
            <button type="button" className="ledger-row" aria-expanded={abierta} aria-controls={idDetalle} onClick={() => onAlternar(deuda.id)}>
                <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-sm font-semibold text-ink"><Titulo deuda={deuda} vista={vista} datos={datos} /></span>
                    <span className="block truncate text-xs text-ink-3">{meta}</span>
                    {fila.estado !== 'PENDIENTE' && (
                        <span className="meter block" aria-hidden="true">
                            <span style={{ width: `${fila.fraccionAbonada * 100}%`, background: 'var(--pos)' }} />
                        </span>
                    )}
                </span>
                <span className="shrink-0 text-right">
                    <span className={`amount block text-sm ${fila.estado === 'PAGADA' ? 'text-pos' : 'text-neg'}`}>
                        {fila.estado === 'PAGADA' ? formatoMoneda(fila.original) : formatoMoneda(fila.pendiente)}
                    </span>
                    <span className="block text-xs text-ink-3 num">
                        {fila.estado === 'PAGADA' ? 'pagada' : fila.estado === 'PARCIAL' ? `de ${formatoMoneda(fila.original)}` : 'pendiente'}
                    </span>
                </span>
                <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-ink-3 transition-transform ${abierta ? 'rotate-180' : ''}`} />
            </button>
            {abierta && (
                <div id={idDetalle} className="space-y-3 bg-surface-2 px-4 pb-4 pt-3 text-sm">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                        <div><dt className="eyebrow">Original</dt><dd className="amount text-ink">{formatoMoneda(fila.original)}</dd></div>
                        <div><dt className="eyebrow">Abonado</dt><dd className="amount text-pos">{formatoMoneda(fila.abonado)}</dd></div>
                        <div><dt className="eyebrow">Pendiente</dt><dd className="amount text-neg">{formatoMoneda(fila.pendiente)}</dd></div>
                        <div><dt className="eyebrow">Avance</dt><dd className="amount text-ink">{formatoPorcentaje(fila.fraccionAbonada)}</dd></div>
                    </dl>
                    {deuda.usuario_nombre && <p className="text-ink-2">Registró: {deuda.usuario_nombre}</p>}
                    <div>
                        <h4 className="eyebrow mb-2">Abonos</h4>
                        {fila.pagos.length === 0 ? (
                            <p className="text-ink-3">Sin abonos registrados.</p>
                        ) : (
                            <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                                {fila.pagos.map((pago, i) => (
                                    <li key={`${pago.fecha}-${i}`} className="flex items-center gap-3 px-3 py-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-ink">{pago.descripcion || 'Abono'}</p>
                                            <p className="truncate text-xs text-ink-3">
                                                {[fechaAbono(pago.fecha), datos.nombreCaja(pago.caja_id), pago.usuario_nombre].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        <span className="amount text-pos">{formatoMoneda(pago.monto)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <p className="text-xs text-ink-3">Los abonos se registran desde Deudas, en Inicio.</p>
                </div>
            )}
        </div>
    );
}

/**
 * Deudas a proveedores y préstamos entre cajas, agrupadas por estado con los
 * totales de cada grupo. El estado se calcula con la regla de dinero.
 */
export default function ReporteDeudas({ datos }) {
    const [vista, setVista] = useState('terceros');
    const [estado, setEstado] = useState('abiertas');
    const [busqueda, setBusqueda] = useState('');
    const busquedaDiferida = useDeferredValue(busqueda);
    const [abierta, setAbierta] = useState(null);

    const textoDe = useMemo(() => (vista === 'terceros'
        ? (d) => `${datos.nombreTercero(d.tercero_id)} ${datos.nombreProyecto(d.proyecto_id)}`
        : (d) => `${datos.nombreCaja(d.caja_deudora_id)} ${datos.nombreCaja(d.caja_acreedora_id)}`), [vista, datos]);

    const deTerceros = useMemo(() => resumenDeudas(datos.deudasTerceros, { estado: 'abiertas' }), [datos.deudasTerceros]);
    const deCajas = useMemo(() => resumenDeudas(datos.deudasCajas, { estado: 'abiertas' }), [datos.deudasCajas]);
    const resumen = useMemo(
        () => resumenDeudas(vista === 'terceros' ? datos.deudasTerceros : datos.deudasCajas, { estado, busqueda: busquedaDiferida, textoDe }),
        [vista, datos.deudasTerceros, datos.deudasCajas, estado, busquedaDiferida, textoDe]
    );

    function alternar(id) {
        setAbierta((actual) => (actual === id ? null : id));
    }

    return (
        <div className="space-y-4">
            <div className="kpi-strip" aria-label="Deudas abiertas">
                <Kpi
                    etiqueta="Por pagar a proveedores"
                    tono="neg"
                    valor={formatoMoneda(deTerceros.totales.pendiente)}
                    meta={`A hoy, ${plural(deTerceros.totales.cantidad, 'deuda')}`}
                />
                <Kpi
                    etiqueta="Préstamos entre cajas"
                    tono="warn"
                    valor={formatoMoneda(deCajas.totales.pendiente)}
                    meta={`A hoy, ${plural(deCajas.totales.cantidad, 'préstamo')}`}
                />
                <Kpi
                    etiqueta="Abonado a lo abierto"
                    tono="pos"
                    valor={formatoMoneda(deTerceros.totales.abonado + deCajas.totales.abonado)}
                    meta="Proveedores y cajas"
                />
            </div>

            <div className="card flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" role="group" aria-label="Filtros de deudas">
                <div>
                    <p className="label" id="deudas-vista">Deudas</p>
                    <div className="segmented" role="group" aria-labelledby="deudas-vista">
                        {VISTAS.map((v) => (
                            <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => { setVista(v.id); setAbierta(null); }}>
                                {v.etiqueta}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="label" id="deudas-estado">Estado</p>
                    <div className="segmented" role="group" aria-labelledby="deudas-estado">
                        {FILTROS_ESTADO.map((f) => (
                            <button key={f.id} type="button" aria-pressed={estado === f.id} onClick={() => setEstado(f.id)}>
                                {f.etiqueta}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="relative min-w-0 sm:flex-1">
                    <label className="label" htmlFor="deudas-busqueda">Buscar</label>
                    <Search size={18} className="pointer-events-none absolute left-3 bottom-3 text-ink-3" aria-hidden="true" />
                    <input
                        id="deudas-busqueda"
                        type="search"
                        className="input-field"
                        style={{ paddingLeft: 40 }}
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder={vista === 'terceros' ? 'Proveedor, obra o concepto' : 'Caja o concepto'}
                        autoComplete="off"
                    />
                </div>
            </div>

            {resumen.grupos.length === 0 ? (
                <div className="card empty-state">
                    {vista === 'terceros' ? 'No hay deudas a proveedores con estos filtros.' : 'No hay préstamos entre cajas con estos filtros.'}
                </div>
            ) : (
                <>
                    {resumen.grupos.map((grupo) => (
                        <section key={grupo.id} className="ledger" aria-label={grupo.etiqueta}>
                            <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-surface-2 px-4 py-2">
                                <h3 className="flex items-center gap-2">
                                    <span className={`chip ${grupo.chip}`}>{grupo.etiqueta}</span>
                                    <span className="text-xs text-ink-3">{plural(grupo.filas.length, vista === 'terceros' ? 'deuda' : 'préstamo')}</span>
                                </h3>
                                <span className="text-xs text-ink-2 num">
                                    {grupo.id === 'PAGADA'
                                        ? <>Pagado <span className="amount text-pos">{formatoMoneda(grupo.abonado)}</span></>
                                        : <>Pendiente <span className="amount text-neg">{formatoMoneda(grupo.pendiente)}</span> de {formatoMoneda(grupo.original)}</>}
                                </span>
                            </header>
                            {grupo.filas.map((fila) => (
                                <FilaDeuda
                                    key={fila.deuda.id}
                                    fila={fila}
                                    vista={vista}
                                    datos={datos}
                                    abierta={abierta === fila.deuda.id}
                                    onAlternar={alternar}
                                />
                            ))}
                        </section>
                    ))}
                    <div className="card">
                        <dl className="grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-3">
                            <div><dt className="eyebrow">Total original</dt><dd className="amount text-ink">{formatoMoneda(resumen.totales.original)}</dd></div>
                            <div><dt className="eyebrow">Total abonado</dt><dd className="amount text-pos">{formatoMoneda(resumen.totales.abonado)}</dd></div>
                            <div><dt className="eyebrow">Total pendiente</dt><dd className="amount text-neg">{formatoMoneda(resumen.totales.pendiente)}</dd></div>
                        </dl>
                    </div>
                </>
            )}
        </div>
    );
}
