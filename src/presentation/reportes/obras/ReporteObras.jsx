import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatoMoneda, formatoPorcentaje } from '../../formato';
import { compararTexto } from '../comunes/calculosComunes';
import { crearPeriodo, describirPeriodo, rangoDePeriodo } from '../comunes/periodo';
import { useHoyLocal } from '../comunes/useHoyLocal';
import FiltroPeriodo from '../comunes/FiltroPeriodo';
import CampoSelect from '../comunes/CampoSelect';
import Kpi from '../comunes/Kpi';
import { plural } from '../comunes/texto';
import ListaMovimientosBreve from '../comunes/ListaMovimientosBreve';
import { ordenarPorEjecucion, resumenObras } from './calculos';

const ESTADOS = [
    { valor: 'Activo', texto: 'Activas' },
    { valor: 'Pausado', texto: 'Pausadas' },
    { valor: 'Finalizado', texto: 'Finalizadas' },
];
const CHIP_ESTADO = { Activo: 'chip-pos', Pausado: 'chip-warn' };
const ORDENES = [
    { id: 'ejecucion', etiqueta: 'Mayor ejecución' },
    { id: 'gasto', etiqueta: 'Mayor gasto en el periodo' },
    { id: 'nombre', etiqueta: 'Nombre' },
];

function ordenar(filas, orden) {
    if (orden === 'gasto') return [...filas].sort((a, b) => b.egresosPeriodo - a.egresosPeriodo || compararTexto(a.nombre, b.nombre));
    if (orden === 'nombre') return [...filas].sort((a, b) => compararTexto(a.nombre, b.nombre));
    return ordenarPorEjecucion(filas);
}

function DetalleObra({ obra, datos }) {
    return (
        <div id={`obra-detalle-${obra.id}`} className="space-y-4 bg-surface-2 px-4 pb-4 pt-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div><dt className="eyebrow">Presupuesto</dt><dd className="amount text-ink">{obra.presupuesto > 0 ? formatoMoneda(obra.presupuesto) : 'Sin presupuesto'}</dd></div>
                <div><dt className="eyebrow">Ejecutado</dt><dd className="amount text-ink">{formatoMoneda(obra.ejecutado)}</dd></div>
                <div>
                    <dt className="eyebrow">Disponible</dt>
                    <dd className={`amount ${obra.excedida ? 'text-neg' : 'text-ink'}`}>
                        {obra.presupuesto > 0 ? formatoMoneda(obra.disponible) : '–'}
                    </dd>
                </div>
                <div><dt className="eyebrow">Ingresos del periodo</dt><dd className="amount text-pos">{formatoMoneda(obra.ingresosPeriodo)}</dd></div>
            </dl>

            <div>
                <h4 className="eyebrow mb-2">Egresos del periodo por categoría</h4>
                {obra.categorias.length === 0 ? (
                    <p className="text-sm text-ink-3">Sin egresos en el periodo.</p>
                ) : (
                    <div className="overflow-x-auto rounded-md border border-line bg-surface">
                        <table className="tabla">
                            <thead>
                                <tr><th scope="col">Categoría</th><th scope="col" className="col-num">Monto</th><th scope="col" className="col-num">%</th></tr>
                            </thead>
                            <tbody>
                                {obra.categorias.map((c) => (
                                    <tr key={c.nombre}>
                                        <td>{c.nombre}</td>
                                        <td className="col-num">{formatoMoneda(c.monto)}</td>
                                        <td className="col-num text-ink-2">{formatoPorcentaje(c.fraccion)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr><td>Total</td><td className="col-num">{formatoMoneda(obra.egresosPeriodo)}</td><td className="col-num">{formatoPorcentaje(1)}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            <div>
                <h4 className="eyebrow mb-2">Movimientos del periodo</h4>
                <ListaMovimientosBreve movimientos={obra.movimientos} datos={datos} ocultar={['obra']} />
            </div>
        </div>
    );
}

/** Presupuesto contra ejecutado por obra, con desglose por categoría. */
export default function ReporteObras({ datos }) {
    const [periodo, setPeriodo] = useState(() => crearPeriodo('todo'));
    const [empresaId, setEmpresaId] = useState('');
    const [estado, setEstado] = useState('');
    const [orden, setOrden] = useState('ejecucion');
    const [abierta, setAbierta] = useState(null);

    const hoy = useHoyLocal();
    const rango = useMemo(() => rangoDePeriodo(periodo, hoy), [periodo, hoy]);
    const periodoTexto = useMemo(() => describirPeriodo(periodo, hoy), [periodo, hoy]);
    const resumen = useMemo(
        () => resumenObras(datos, { ...rango, empresaId, estado }, datos.nombreCategoria),
        [datos, rango, empresaId, estado]
    );
    const filas = useMemo(() => ordenar(resumen.filas, orden), [resumen, orden]);
    const opcionesEmpresa = useMemo(
        () => datos.empresas.map((e) => ({ valor: e.id, texto: e.nombre || 'Empresa sin nombre' })).sort((a, b) => compararTexto(a.texto, b.texto)),
        [datos.empresas]
    );
    const { totales } = resumen;
    const { disponible } = totales;

    return (
        <div className="space-y-4">
            <div className="card flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" role="group" aria-label="Filtros de obras">
                <FiltroPeriodo id="obras-periodo" valor={periodo} onCambiar={setPeriodo} />
                {opcionesEmpresa.length > 1 && (
                    <CampoSelect id="obras-empresa" etiqueta="Empresa" valor={empresaId} onCambiar={setEmpresaId} opciones={opcionesEmpresa} todos="Todas" />
                )}
                <CampoSelect id="obras-estado" etiqueta="Estado" valor={estado} onCambiar={setEstado} opciones={ESTADOS} todos="Todas" className="sm:w-40" />
                <div className="min-w-0 sm:w-56">
                    <label className="label" htmlFor="obras-orden">Ordenar</label>
                    <select id="obras-orden" className="input-field" value={orden} onChange={(e) => setOrden(e.target.value)}>
                        {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                    </select>
                </div>
            </div>

            <div className="kpi-strip" aria-label="Totales de obras">
                <Kpi etiqueta="Presupuesto" valor={formatoMoneda(totales.presupuesto)} meta={plural(filas.length, 'obra')} />
                <Kpi etiqueta="Ejecutado" tono="neg" valor={formatoMoneda(totales.ejecutado)} meta="Acumulado al cierre del periodo" />
                <Kpi
                    etiqueta="Disponible"
                    tono={disponible < 0 ? 'neg' : 'pos'}
                    colorearValor={disponible < 0}
                    valor={formatoMoneda(disponible)}
                    meta={`${plural(totales.conPresupuesto, 'obra')} con presupuesto`}
                />
                <Kpi etiqueta="Egresos del periodo" tono="neg" valor={formatoMoneda(totales.egresosPeriodo)} meta={periodoTexto} />
            </div>

            {filas.length === 0 ? (
                <div className="card empty-state">No hay obras con estos filtros.</div>
            ) : (
                <div className="ledger">
                    {filas.map((obra) => {
                        const expandida = abierta === obra.id;
                        const ancho = obra.fraccion !== null ? Math.min(obra.fraccion, 1) * 100 : 0;
                        return (
                            <div key={obra.id}>
                                <button
                                    type="button"
                                    className="ledger-row"
                                    aria-expanded={expandida}
                                    aria-controls={`obra-detalle-${obra.id}`}
                                    onClick={() => setAbierta(expandida ? null : obra.id)}
                                >
                                    <span className="min-w-0 flex-1 space-y-1.5">
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="truncate text-sm font-semibold text-ink">{obra.nombre}</span>
                                            {obra.estado && <span className={`chip ${CHIP_ESTADO[obra.estado] ?? ''}`}>{obra.estado}</span>}
                                            {obra.excedida && <span className="chip chip-neg">Excedida</span>}
                                        </span>
                                        {obra.fraccion !== null ? (
                                            <span className="meter block" aria-hidden="true">
                                                <span style={{ width: `${ancho}%`, background: obra.excedida ? 'var(--neg)' : 'var(--ink-2)' }} />
                                            </span>
                                        ) : null}
                                        <span className="block text-xs text-ink-3 num">
                                            {obra.fraccion !== null
                                                ? `${formatoMoneda(obra.ejecutado)} de ${formatoMoneda(obra.presupuesto)}`
                                                : `${formatoMoneda(obra.ejecutado)} ejecutado, sin presupuesto`}
                                            {datos.nombreEmpresa(obra.empresaId) && ` · ${datos.nombreEmpresa(obra.empresaId)}`}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className={`amount block text-sm ${obra.excedida ? 'text-neg' : 'text-ink'}`}>
                                            {obra.fraccion !== null ? formatoPorcentaje(obra.fraccion) : '–'}
                                        </span>
                                        <span className="block text-xs text-ink-3">ejecución</span>
                                    </span>
                                    <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-ink-3 transition-transform ${expandida ? 'rotate-180' : ''}`} />
                                </button>
                                {expandida && <DetalleObra obra={obra} datos={datos} />}
                            </div>
                        );
                    })}
                </div>
            )}

            {resumen.sinObra > 0 && (
                <p className="text-sm text-ink-2">
                    Egresos sin obra asignada en el periodo: <span className="amount text-neg">{formatoMoneda(resumen.sinObra)}</span>
                </p>
            )}
        </div>
    );
}
