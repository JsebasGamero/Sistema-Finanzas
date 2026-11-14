import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { FileDown, Search, SlidersHorizontal, X } from 'lucide-react';
import ImagePreviewModal from '../../../components/ImagePreviewModal';
import { formatoFecha, formatoMoneda, formatoNumero } from '../../formato';
import { compararTexto } from '../comunes/calculosComunes';
import { crearPeriodo, describirPeriodo, rangoDePeriodo } from '../comunes/periodo';
import { useHoyLocal } from '../comunes/useHoyLocal';
import { usePorPartes } from '../comunes/usePorPartes';
import { plural } from '../comunes/texto';
import Kpi from '../comunes/Kpi';
import {
    FILTROS_VACIOS, ORDENES, agruparPorDia, construirTextosBusqueda, describirFiltros,
    filtrarMovimientos, ordenarMovimientos, resumenFiltrado, subtotalesPorDia, valoresDistintos,
} from './calculos';
import FiltrosMovimientos from './FiltrosMovimientos';
import FilaMovimiento from './FilaMovimiento';
import { exportarPdfMovimientos } from './exportarPdf';

const PERIODO_INICIAL = 'mes';
const PAGINA = 50;
const ID_FILTROS = 'mov-filtros';

function opcionesDe(filas) {
    return filas
        .map((f) => ({ valor: f.id, texto: f.nombre || 'Sin nombre' }))
        .sort((a, b) => compararTexto(a.texto, b.texto));
}

/**
 * Libro de movimientos: búsqueda, filtros que sí filtran, totales de lo
 * filtrado, lista agrupada por día que se monta por partes (REP-13) y PDF de
 * exactamente lo que se ve (REP-9).
 */
export default function ReporteMovimientos({ datos }) {
    const [busqueda, setBusqueda] = useState('');
    // La lista se filtra con el valor diferido: escribir no espera a que se
    // vuelva a pintar la lista en un teléfono lento.
    const busquedaDiferida = useDeferredValue(busqueda);
    const [periodo, setPeriodo] = useState(() => crearPeriodo(PERIODO_INICIAL));
    const [filtros, setFiltros] = useState(FILTROS_VACIOS);
    const [verFiltros, setVerFiltros] = useState(false);
    const [orden, setOrden] = useState('fecha_desc');
    const [abierta, setAbierta] = useState(null);
    const [soporte, setSoporte] = useState(null);
    const [exportando, setExportando] = useState(false);
    const [errorExportar, setErrorExportar] = useState('');
    const exportandoRef = useRef(false);

    const hoy = useHoyLocal();
    const rango = useMemo(() => rangoDePeriodo(periodo, hoy), [periodo, hoy]);
    const periodoTexto = useMemo(() => describirPeriodo(periodo, hoy), [periodo, hoy]);
    const textos = useMemo(() => construirTextosBusqueda(datos.transacciones, datos), [datos]);

    const opciones = useMemo(() => ({
        cajas: opcionesDe(datos.cajas),
        obras: opcionesDe(datos.proyectos),
        terceros: opcionesDe(datos.terceros),
        categorias: valoresDistintos(datos.transacciones, (tx) => datos.nombreCategoria(tx.categoria))
            .map((v) => ({ valor: v, texto: v })),
        usuarios: valoresDistintos(datos.transacciones, (tx) => tx.usuario_nombre)
            .map((v) => ({ valor: v, texto: v })),
    }), [datos]);

    const criterio = useMemo(
        () => ({ ...filtros, ...rango, busqueda: busquedaDiferida }),
        [filtros, rango, busquedaDiferida]
    );
    const filtradas = useMemo(
        () => filtrarMovimientos(datos.transacciones, criterio, { textos, nombreCategoria: datos.nombreCategoria }),
        [datos, criterio, textos]
    );
    const ordenadas = useMemo(() => ordenarMovimientos(filtradas, orden), [filtradas, orden]);
    const resumen = useMemo(() => resumenFiltrado(filtradas, filtros.cajaId), [filtradas, filtros.cajaId]);
    const subtotales = useMemo(() => subtotalesPorDia(filtradas, filtros.cajaId), [filtradas, filtros.cajaId]);

    const { limite, hayMas, siguiente, mostrarMas } = usePorPartes(ordenadas.length, JSON.stringify([criterio, orden]), PAGINA);
    const porFecha = orden.startsWith('fecha');
    const grupos = useMemo(() => {
        const visibles = ordenadas.slice(0, limite);
        return porFecha ? agruparPorDia(visibles) : [{ dia: null, filas: visibles }];
    }, [ordenadas, limite, porFecha]);

    const etiquetas = useMemo(() => describirFiltros(filtros, datos), [filtros, datos]);
    const cantidadFiltros = etiquetas.length + (periodo.preset !== PERIODO_INICIAL ? 1 : 0);
    const hayFiltros = cantidadFiltros > 0 || busqueda !== '';

    const alternar = useCallback((id) => setAbierta((actual) => (actual === id ? null : id)), []);
    const verSoporte = useCallback((tx) => setSoporte({ url: tx.soporte_url, titulo: tx.descripcion || 'Soporte' }), []);

    function cambiarFiltro(clave, valor) {
        setFiltros((previos) => ({ ...previos, [clave]: valor }));
    }

    function limpiar() {
        setFiltros(FILTROS_VACIOS);
        setPeriodo(crearPeriodo(PERIODO_INICIAL));
        setBusqueda('');
    }

    async function exportar() {
        // Guarda contra doble toque: el estado tarda un render en deshabilitar el botón.
        if (exportandoRef.current) return;
        exportandoRef.current = true;
        setExportando(true);
        setErrorExportar('');
        try {
            const termino = busquedaDiferida.trim();
            await exportarPdfMovimientos({
                filas: ordenadas,
                resumen,
                periodoTexto,
                filtrosTexto: [...etiquetas.map((e) => e.texto), ...(termino ? [`Búsqueda: "${termino}"`] : [])],
                cajaId: filtros.cajaId,
                datos,
            });
        } catch (error) {
            console.error('No se pudo generar el PDF de movimientos:', error);
            setErrorExportar('No se pudo generar el PDF. Intenta de nuevo.');
        } finally {
            exportandoRef.current = false;
            setExportando(false);
        }
    }

    const total = ordenadas.length;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                    <label htmlFor="mov-busqueda" className="sr-only">Buscar movimientos</label>
                    <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                    <input
                        id="mov-busqueda"
                        type="search"
                        className="input-field"
                        style={{ paddingLeft: 40 }}
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar descripción, categoría, caja, proveedor, obra o monto"
                        autoComplete="off"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        className="btn-secondary flex-1 sm:flex-none"
                        aria-expanded={verFiltros}
                        aria-controls={ID_FILTROS}
                        onClick={() => setVerFiltros((v) => !v)}
                    >
                        <SlidersHorizontal size={16} aria-hidden="true" />
                        Filtros
                        {cantidadFiltros > 0 && <span className="chip chip-accent">{cantidadFiltros}</span>}
                    </button>
                    <button
                        type="button"
                        className="btn-secondary flex-1 sm:flex-none"
                        onClick={exportar}
                        disabled={exportando || total === 0}
                        aria-label={exportando ? 'Generando PDF' : 'Exportar a PDF lo filtrado'}
                    >
                        <FileDown size={16} aria-hidden="true" />
                        {/* A 320 px "Exportar PDF" más el contador de filtros no caben en una fila. */}
                        <span className="sm:hidden">{exportando ? 'Generando' : 'PDF'}</span>
                        <span className="hidden sm:inline">{exportando ? 'Generando PDF' : 'Exportar PDF'}</span>
                    </button>
                </div>
            </div>
            {errorExportar && <p className="text-sm text-neg" role="alert">{errorExportar}</p>}

            {verFiltros && (
                <FiltrosMovimientos
                    id={ID_FILTROS}
                    periodo={periodo}
                    onPeriodo={setPeriodo}
                    filtros={filtros}
                    onFiltro={cambiarFiltro}
                    opciones={opciones}
                    onLimpiar={limpiar}
                    hayFiltros={hayFiltros}
                />
            )}

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink-2">{periodoTexto}</span>
                {etiquetas.map((e) => (
                    <button
                        key={e.clave}
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => cambiarFiltro(e.clave, '')}
                        aria-label={`Quitar filtro ${e.texto}`}
                    >
                        {e.texto}
                        <X size={14} aria-hidden="true" />
                    </button>
                ))}
            </div>

            <div className="kpi-strip" aria-label="Totales de lo filtrado">
                {resumen.caja ? (
                    <>
                        <Kpi etiqueta="Entradas a la caja" tono="pos" valor={formatoMoneda(resumen.caja.entradas)} meta="Incluye transferencias recibidas" />
                        <Kpi etiqueta="Salidas de la caja" tono="neg" valor={formatoMoneda(resumen.caja.salidas)} meta="Incluye transferencias enviadas" />
                        <Kpi
                            etiqueta="Neto de la caja"
                            tono={resumen.caja.neto < 0 ? 'neg' : 'pos'}
                            colorearValor
                            valor={formatoMoneda(resumen.caja.neto, { signo: true })}
                            meta="Cambio de saldo en el periodo"
                        />
                        <Kpi etiqueta="Ingresos menos egresos" valor={formatoMoneda(resumen.neto, { signo: true })} meta="Sin contar transferencias" />
                    </>
                ) : (
                    <>
                        <Kpi etiqueta="Ingresos" tono="pos" valor={formatoMoneda(resumen.ingresos)} />
                        <Kpi etiqueta="Egresos" tono="neg" valor={formatoMoneda(resumen.egresos)} />
                        <Kpi
                            etiqueta="Neto"
                            tono={resumen.neto < 0 ? 'neg' : 'pos'}
                            colorearValor
                            valor={formatoMoneda(resumen.neto, { signo: true })}
                            meta="Ingresos menos egresos"
                        />
                        <Kpi etiqueta="Transferencias" tono="info" valor={formatoMoneda(resumen.transferencias)} meta="No suman a ingresos ni egresos" />
                    </>
                )}
            </div>

            <div className="flex items-end justify-between gap-3">
                <p className="text-sm text-ink-2" aria-live="polite">
                    {busqueda !== busquedaDiferida ? 'Buscando…' : plural(total, 'movimiento')}
                </p>
                <div className="w-44 shrink-0">
                    <label className="label" htmlFor="mov-orden">Ordenar</label>
                    <select id="mov-orden" className="input-field" value={orden} onChange={(e) => setOrden(e.target.value)}>
                        {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                    </select>
                </div>
            </div>

            {total === 0 ? (
                <div className="card empty-state">
                    <p>No hay movimientos con estos filtros.</p>
                    {hayFiltros && (
                        <button type="button" className="btn-secondary btn-sm mt-3" onClick={limpiar}>
                            Quitar filtros
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {grupos.map((grupo) => {
                        const subtotal = grupo.dia !== null ? subtotales.get(grupo.dia) ?? 0 : 0;
                        return (
                            <section
                                key={grupo.dia ?? 'lista'}
                                className="ledger"
                                aria-label={grupo.dia ? formatoFecha(grupo.dia, 'larga') : 'Movimientos'}
                            >
                                {grupo.dia !== null && (
                                    <header className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2">
                                        <h3 className="eyebrow">{grupo.dia ? formatoFecha(grupo.dia, 'larga') : 'Sin fecha'}</h3>
                                        <span className={`amount text-sm ${subtotal < 0 ? 'text-neg' : 'text-ink-2'}`}>
                                            <span className="sr-only">{filtros.cajaId ? 'Neto de la caja en el día: ' : 'Neto del día: '}</span>
                                            {formatoMoneda(subtotal, { signo: true })}
                                        </span>
                                    </header>
                                )}
                                {grupo.filas.map((tx) => (
                                    <FilaMovimiento
                                        key={tx.id}
                                        tx={tx}
                                        datos={datos}
                                        cajaId={filtros.cajaId}
                                        abierta={abierta === tx.id}
                                        onAlternar={alternar}
                                        onVerSoporte={verSoporte}
                                    />
                                ))}
                            </section>
                        );
                    })}
                    {hayMas && (
                        <button type="button" className="btn-secondary w-full" onClick={mostrarMas}>
                            Mostrar {formatoNumero(siguiente)} más
                            <span className="text-ink-3 font-normal">({formatoNumero(limite)} de {formatoNumero(total)})</span>
                        </button>
                    )}
                </div>
            )}

            <ImagePreviewModal
                isOpen={!!soporte}
                onClose={() => setSoporte(null)}
                imageUrl={soporte?.url}
                title={soporte?.titulo}
            />
        </div>
    );
}
