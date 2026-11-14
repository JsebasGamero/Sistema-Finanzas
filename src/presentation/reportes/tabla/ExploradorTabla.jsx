// Explorador de reportes: tabla dinámica configurable sobre AG-Grid
// Community (docs/REPORTES.md). Reemplaza a src/components/TablaReport.jsx.
//
// El usuario elige un conjunto (movimientos, cajas, obras...), lo ve en
// detalle (una fila por registro, con filtros, orden, columnas a su gusto,
// totales y selección) o en resumen (agrupado y pivotado por el motor de
// src/application/reportes/), y lo exporta tal como lo ve.
//
// Las filas se derivan con useMemo de `datos` + conjunto: no hay cargas
// asíncronas que puedan llegar tarde y pisar otro conjunto (REP-12). La
// configuración se recuerda por conjunto en este dispositivo (REP-19).
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, FilterX, Maximize2, Minimize2, Search, X } from 'lucide-react';
import { conjuntoPorId } from '../../../application/reportes/conjuntos';
import { useAuth } from '../../../context/useAuth';
import { aplicarFiltros, aplicarModeloFiltros, contarFiltrosActivos, describirModeloFiltros, normalizarTexto } from '../../../application/reportes/filtros';
import { construirResumen, normalizarConfigResumen, etiquetaDeValor } from '../../../application/reportes/resumen';
import { indicadoresDe } from '../../../application/reportes/indicadores';
import { tablaDesdeDetalle, tablaDesdeResumen, nombreArchivo } from '../../../application/reportes/exportacion';
import {
    configPorDefecto, normalizarConfigExplorador, normalizarVista, normalizarEstadoColumnas, normalizarFiltrosGrid,
    DENSIDADES, PRESET_PERSONALIZADO,
} from '../../../application/reportes/vistas';
import { aMonto, redondearMonto } from '../../../domain/value-objects/dinero';
import { hoyLocal, rangoDePreset, PRESETS_RANGO } from '../../../domain/value-objects/fecha';
import { formatoFecha, formatoFechaHora, formatoMoneda, formatoNumero, formatoPorcentaje } from '../../formato';
import ConfirmModal from '../../../components/ConfirmModal';
import ImagePreviewModal from '../../../components/ImagePreviewModal';
import { leerEstadoExplorador, guardarEstadoExplorador, leerVistas, guardarVistas } from './almacen';
import { columnasParaMenu } from './columnasMenu';
import { ID_COLUMNA_SELECCION } from './columnasGrid';
import { formatearValor } from './formatoCeldas';
// Import estático: el CSV no necesita librerías pesadas y, sin señal, un
// import() de este módulo fallaba igual que el de Excel aunque el aviso de
// error recomendara probar con CSV. xlsx y jspdf siguen diferidos dentro de
// exportar.js.
import { exportarExcel, exportarCsv, exportarPdf } from './exportar';
import { useAnchoMinimo } from './useAnchoMinimo';
import { useHoyLocal } from '../comunes/useHoyLocal';
import SelectorConjunto from './SelectorConjunto';
import MenuVistas from './MenuVistas';
import MenuColumnas from './MenuColumnas';
import MenuExportar from './MenuExportar';
import FranjaIndicadores from './FranjaIndicadores';
import GrillaDetalle from './GrillaDetalle';
import GrillaResumen from './GrillaResumen';
import PanelResumen from './PanelResumen';
import GraficaResumen from './GraficaResumen';
import './explorador.css';

const ETIQUETA_DENSIDAD = { compacta: 'Compacta', normal: 'Normal', amplia: 'Amplia' };

function nuevoIdVista() {
    return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function textoPeriodo(conjunto, config, rango) {
    if (!conjunto.campoFecha) return 'Sin periodo (estos datos no tienen fecha)';
    if (!rango.desde && !rango.hasta) return 'Todo';
    const preset = PRESETS_RANGO.find((p) => p.id === config.preset);
    const desde = rango.desde ? formatoFecha(rango.desde) : 'el inicio';
    const hasta = rango.hasta ? formatoFecha(rango.hasta) : 'hoy';
    const rangoTexto = `del ${desde} al ${hasta}`;
    return preset ? `${preset.etiqueta} (${rangoTexto})` : rangoTexto.charAt(0).toUpperCase() + rangoTexto.slice(1);
}

function formatearFiltro(valor, tipoFiltro, columna) {
    if (tipoFiltro === 'date') return formatoFecha(valor);
    if (tipoFiltro === 'number') {
        // Las columnas de porcentaje se filtran sobre lo que se ve: 90 es
        // "90 %". formatoNumero no lleva decimales y escribía otro filtro.
        if (columna?.tipo === 'porcentaje') return formatoPorcentaje(aMonto(valor) / 100);
        return formatoNumero(valor);
    }
    return `"${valor ?? ''}"`;
}

function Esqueleto() {
    return (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando la tabla">
            <div className="skeleton h-11" />
            <div className="skeleton h-20" />
            <div className="skeleton h-96" />
        </div>
    );
}

export default function ExploradorTabla({ datos }) {
    const [estado, setEstado] = useState(leerEstadoExplorador);
    const [version, setVersion] = useState(0);
    const versionRef = useRef(0);
    const [vistas, setVistas] = useState(leerVistas);
    const [pantallaCompleta, setPantallaCompleta] = useState(false);
    const [visibles, setVisibles] = useState(null);
    const [seleccion, setSeleccion] = useState([]);
    const [aviso, setAviso] = useState(null);
    const [soporte, setSoporte] = useState(null);
    const [vistaABorrar, setVistaABorrar] = useState(null);
    const [exportando, setExportando] = useState(null);
    const exportandoRef = useRef(false);
    const apiRef = useRef(null);
    const escritorio = useAnchoMinimo(768);
    const hoy = useHoyLocal();

    // En el modo local nada se sube a la nube: la columna "Sincronizado" diría
    // "Pendiente" en todas las filas para siempre. Se quita (y con ella su
    // dimensión de agrupación).
    const modoLocal = Boolean(useAuth().currentUser?.modoLocal);
    const conjunto = useMemo(() => {
        const base = conjuntoPorId(estado.conjuntoId);
        if (!modoLocal || !base.columnas.some((c) => c.campo === 'sincronizado')) return base;
        return { ...base, columnas: base.columnas.filter((c) => c.campo !== 'sincronizado') };
    }, [estado.conjuntoId, modoLocal]);
    const config = useMemo(
        () => estado.configs[conjunto.id] ?? configPorDefecto(conjunto.id),
        [estado.configs, conjunto.id]
    );

    useEffect(() => {
        guardarEstadoExplorador(estado);
    }, [estado]);

    // ----- Actualizaciones de estado -----

    const actualizarConfigDe = useCallback((conjuntoId, parcial) => {
        setEstado((previo) => {
            const actual = previo.configs[conjuntoId] ?? configPorDefecto(conjuntoId);
            return { ...previo, configs: { ...previo.configs, [conjuntoId]: { ...actual, ...parcial } } };
        });
    }, []);

    const actualizarConfig = useCallback((parcial) => actualizarConfigDe(conjunto.id, parcial), [actualizarConfigDe, conjunto.id]);

    const nuevaVersionGrilla = useCallback(() => {
        versionRef.current += 1;
        setVersion(versionRef.current);
    }, []);

    function cambiarConjunto(id) {
        if (id === conjunto.id) return;
        setEstado((previo) => ({ ...previo, conjuntoId: id }));
        setSeleccion([]);
        setAviso(null);
    }

    function cambiarModo(modo) {
        if (modo === config.modo) return;
        actualizarConfig({ modo });
        setSeleccion([]);
    }

    function cambiarPreset(preset) {
        if (preset === PRESET_PERSONALIZADO) {
            // Arranca con el rango que se estaba viendo, para ajustarlo.
            const rangoActual = rangoDePreset(config.preset);
            actualizarConfig({ preset, desde: rangoActual.desde || config.desde, hasta: rangoActual.hasta || config.hasta });
        } else {
            actualizarConfig({ preset, desde: '', hasta: '' });
        }
    }

    function cambiarFecha(campo, valor) {
        const siguiente = { ...config, [campo]: valor };
        // Si el usuario cruza las fechas, se ordenan en vez de dejar 0 filas.
        if (siguiente.desde && siguiente.hasta && siguiente.desde > siguiente.hasta) {
            actualizarConfig({ desde: siguiente.hasta, hasta: siguiente.desde });
        } else {
            actualizarConfig({ [campo]: valor });
        }
    }

    function cambiarResumen(parcial) {
        actualizarConfig({ configResumen: normalizarConfigResumen({ ...config.configResumen, ...parcial }, conjunto) });
    }

    // ----- Datos -----

    // REP-12: derivadas de los datos, sin efectos asíncronos.
    const filas = useMemo(() => conjunto.construirFilas(datos ?? {}, datos ?? {}), [conjunto, datos]);

    const rango = useMemo(() => {
        if (!conjunto.campoFecha) return { desde: '', hasta: '' };
        if (config.preset === PRESET_PERSONALIZADO) return { desde: config.desde, hasta: config.hasta };
        return rangoDePreset(config.preset, hoy);
    }, [conjunto.campoFecha, config.preset, config.desde, config.hasta, hoy]);

    const esResumen = config.modo === 'resumen';
    const columnasMenu = useMemo(() => columnasParaMenu(conjunto, config.estadoColumnas), [conjunto, config.estadoColumnas]);
    const columnasBusqueda = useMemo(() => {
        const porCampo = new Map(conjunto.columnas.map((c) => [c.campo, c]));
        const visibles = columnasMenu.filter((c) => c.visible).map((c) => porCampo.get(c.campo)).filter(Boolean);
        if (!esResumen) return visibles;
        // En resumen lo que se ve son los rótulos de grupo. Si se agrupa por
        // una columna oculta en el detalle (Empresa, en Movimientos), buscar
        // ese rótulo dejaba 0 filas. Las dimensiones de texto usan el campo
        // como id; las derivadas de la fecha ya las cubre la columna fecha.
        const { filas: dimFilas = [], columnas: dimColumna = null } = config.configResumen ?? {};
        const extra = [...dimFilas, dimColumna]
            .map((id) => (id ? porCampo.get(id) : null))
            .filter((c) => c && c.tipo === 'texto' && !visibles.includes(c));
        return extra.length ? [...visibles, ...extra] : visibles;
    }, [conjunto, columnasMenu, esResumen, config.configResumen]);

    const busqueda = useDeferredValue(config.busqueda);
    const filasFiltradas = useMemo(() => aplicarFiltros(filas, {
        busqueda,
        desde: rango.desde,
        hasta: rango.hasta,
        campoFecha: conjunto.campoFecha,
        columnasBusqueda,
    }), [filas, busqueda, rango, conjunto.campoFecha, columnasBusqueda]);

    const filasResumen = useMemo(
        () => (esResumen ? aplicarModeloFiltros(filasFiltradas, config.filtrosGrid, conjunto.columnas) : null),
        [esResumen, filasFiltradas, config.filtrosGrid, conjunto.columnas]
    );
    const resumen = useMemo(
        () => (filasResumen ? construirResumen(filasResumen, config.configResumen, conjunto) : null),
        [filasResumen, config.configResumen, conjunto]
    );

    // REP-18: en detalle, las cifras salen de lo que la grilla deja ver
    // después de sus filtros de columna.
    const claveGrilla = `${conjunto.id}:${version}`;
    const filasIndicadores = esResumen
        ? filasResumen
        : (visibles?.clave === claveGrilla ? visibles.filas : filasFiltradas);
    const indicadores = useMemo(
        () => indicadoresDe(conjunto.id, filasIndicadores, { conSincronizacion: !modoLocal }),
        [conjunto.id, filasIndicadores, modoLocal]
    );
    const filtrosActivos = contarFiltrosActivos(config.filtrosGrid, conjunto.columnas);

    // ----- Callbacks de la grilla -----

    const alApi = useCallback((api) => {
        apiRef.current = api;
    }, []);

    const alEstadoGrilla = useCallback(({ conjuntoId, version: versionGrilla, estadoColumnas, filtrosGrid }) => {
        // Una grilla vieja (de antes de aplicar una vista) no pisa la vista nueva.
        if (versionGrilla !== versionRef.current) return;
        const conjuntoGrilla = conjuntoPorId(conjuntoId);
        actualizarConfigDe(conjuntoId, {
            estadoColumnas,
            filtrosGrid: normalizarFiltrosGrid(filtrosGrid, conjuntoGrilla),
        });
    }, [actualizarConfigDe]);

    const alVisibles = useCallback(({ conjuntoId, version: versionGrilla, filas: filasVisibles }) => {
        setVisibles({ clave: `${conjuntoId}:${versionGrilla}`, filas: filasVisibles });
    }, []);

    const alVerSoporte = useCallback((url, titulo) => setSoporte({ url, titulo }), []);

    function conApi(accion) {
        const api = apiRef.current;
        if (!api || api.isDestroyed?.()) return;
        accion(api);
        actualizarConfig({ estadoColumnas: normalizarEstadoColumnas(api.getColumnState(), conjunto) });
    }

    const accionesColumnas = {
        onAlternar: (campo, visible) => conApi((api) => api.setColumnsVisible([campo], visible)),
        onFijar: (campo, fijar) => conApi((api) => api.setColumnsPinned([campo], fijar ? 'left' : null)),
        onMover: (campo, delta) => conApi((api) => {
            const orden = api.getColumnState().map((c) => c.colId);
            const desde = orden.indexOf(campo);
            const hasta = desde + delta;
            if (desde < 0 || hasta < 0 || hasta >= orden.length || orden[hasta] === ID_COLUMNA_SELECCION) return;
            api.moveColumns([campo], hasta);
        }),
        onRestablecer: () => conApi((api) => api.resetColumnState()),
    };

    function quitarFiltrosGrilla() {
        const api = apiRef.current;
        if (!esResumen && api && !api.isDestroyed?.()) api.setFilterModel(null);
        actualizarConfig({ filtrosGrid: null });
    }

    // ----- Pantalla completa -----

    useEffect(() => {
        if (!pantallaCompleta) return undefined;
        const alTeclear = (evento) => {
            if (evento.key !== 'Escape' || evento.defaultPrevented) return;
            // Un Escape dirigido a otra capa (el filtro de una columna,
            // "Borrar vista", "Ver soporte") cierra esa capa y nada más.
            // Ni AG-Grid ni useDialogo llaman preventDefault, y este oyente
            // puede correr antes que el del modal: se mira dónde está el foco
            // y si hay un modal abierto.
            if (evento.target?.closest?.('.ag-popup, [role="dialog"]')) return;
            if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
            setPantallaCompleta(false);
        };
        document.addEventListener('keydown', alTeclear);
        return () => document.removeEventListener('keydown', alTeclear);
    }, [pantallaCompleta]);

    // ----- Vistas -----

    function aplicarVista(vista) {
        const normalizada = normalizarVista(vista);
        if (!normalizada) return;
        const configVista = normalizarConfigExplorador(normalizada, normalizada.conjuntoId);
        setEstado((previo) => ({
            ...previo,
            conjuntoId: normalizada.conjuntoId,
            densidad: normalizada.densidad ?? previo.densidad,
            configs: { ...previo.configs, [normalizada.conjuntoId]: configVista },
        }));
        nuevaVersionGrilla();
        setSeleccion([]);
        setAviso({ tono: 'info', texto: `Vista aplicada: ${normalizada.nombre}.` });
    }

    function guardarVista(nombre) {
        const limpio = String(nombre ?? '').trim();
        if (!limpio) return { ok: false, mensaje: 'Escribe un nombre para la vista.' };
        const api = apiRef.current && !apiRef.current.isDestroyed?.() ? apiRef.current : null;
        const existente = vistas.find((v) => normalizarTexto(v.nombre) === normalizarTexto(limpio));
        const vista = normalizarVista({
            ...config,
            estadoColumnas: api && !esResumen ? api.getColumnState() : config.estadoColumnas,
            filtrosGrid: api && !esResumen ? api.getFilterModel() : config.filtrosGrid,
            id: existente?.id ?? nuevoIdVista(),
            nombre: limpio,
            conjuntoId: conjunto.id,
            densidad: estado.densidad,
            creada: new Date().toISOString(),
        });
        const nuevas = existente ? vistas.map((v) => (v.id === existente.id ? vista : v)) : [...vistas, vista];
        setVistas(nuevas);
        if (!guardarVistas(nuevas)) {
            return { ok: false, mensaje: 'No se pudo guardar en este dispositivo. La vista dura hasta cerrar la app.' };
        }
        return { ok: true, mensaje: existente ? `Vista "${limpio}" actualizada.` : `Vista "${limpio}" guardada.` };
    }

    function borrarVista() {
        if (!vistaABorrar) return;
        const nuevas = vistas.filter((v) => v.id !== vistaABorrar.id);
        setVistas(nuevas);
        guardarVistas(nuevas);
        setAviso({ tono: 'info', texto: `Vista borrada: ${vistaABorrar.nombre}.` });
        setVistaABorrar(null);
    }

    // ----- Exportar -----

    function lineasDeContexto() {
        const lineas = [`Periodo: ${textoPeriodo(conjunto, config, rango)}`];
        if (config.busqueda.trim()) lineas.push(`Búsqueda: "${config.busqueda.trim()}"`);
        const api = apiRef.current;
        const modelo = !esResumen && api && !api.isDestroyed?.() ? api.getFilterModel() : config.filtrosGrid;
        const filtros = describirModeloFiltros(modelo, conjunto.columnas, formatearFiltro);
        if (filtros.length) lineas.push(`Filtros: ${filtros.join('; ')}`);
        if (esResumen && resumen) lineas.push(`Valor: ${etiquetaDeValor(resumen.config, conjunto)}`);
        return lineas;
    }

    function tablaParaExportar() {
        if (esResumen) return resumen ? tablaDesdeResumen(resumen, conjunto) : null;
        const api = apiRef.current;
        const porCampo = new Map(conjunto.columnas.map((c) => [c.campo, c]));
        if (!api || api.isDestroyed?.()) {
            return tablaDesdeDetalle({ columnas: columnasBusqueda, filas: filasFiltradas });
        }
        // Exactamente lo que se ve: columnas visibles en su orden y filas
        // filtradas y ordenadas por la grilla.
        const columnas = api.getAllDisplayedColumns().map((c) => porCampo.get(c.getColId())).filter(Boolean);
        const filasVistas = [];
        api.forEachNodeAfterFilterAndSort((nodo) => {
            if (nodo.data) filasVistas.push(nodo.data);
        });
        return tablaDesdeDetalle({ columnas, filas: filasVistas });
    }

    async function exportar(formato) {
        // Un doble toque no genera dos archivos.
        if (exportandoRef.current) return;
        exportandoRef.current = true;
        setExportando(formato);
        setAviso(null);
        try {
            const tabla = tablaParaExportar();
            if (!tabla || tabla.filas.length === 0) {
                setAviso({ tono: 'warn', texto: 'No hay filas para exportar con el periodo, la búsqueda y los filtros actuales.' });
                return;
            }
            const titulo = esResumen ? `${conjunto.etiqueta} · Resumen` : conjunto.etiqueta;
            const base = esResumen ? `${conjunto.etiqueta} resumen` : conjunto.etiqueta;
            const fechaArchivo = hoyLocal();
            const lineas = lineasDeContexto();
            if (formato === 'excel') {
                const info = [
                    ['Reporte', titulo],
                    ...lineas.map((linea) => {
                        const [clave, ...resto] = linea.split(': ');
                        return [clave, resto.join(': ')];
                    }),
                    ['Generado', formatoFechaHora(new Date())],
                ];
                await exportarExcel({ tabla, titulo, info, nombre: nombreArchivo(base, fechaArchivo, 'xlsx') });
            } else if (formato === 'csv') {
                exportarCsv({ tabla, nombre: nombreArchivo(base, fechaArchivo, 'csv') });
            } else {
                await exportarPdf({ tabla, titulo, lineas, nombre: nombreArchivo(base, fechaArchivo, 'pdf') });
            }
        } catch (error) {
            console.error('No se pudo exportar el reporte:', error);
            setAviso({ tono: 'neg', texto: 'No se pudo generar el archivo. Intenta de nuevo; si sigue fallando, prueba con CSV.' });
        } finally {
            exportandoRef.current = false;
            setExportando(null);
        }
    }

    // ----- Selección -----

    const resumenSeleccion = useMemo(() => {
        if (!seleccion.length) return [];
        return (conjunto.camposSeleccion ?? []).map((campo) => {
            const columna = conjunto.columnas.find((c) => c.campo === campo);
            let suma = 0;
            for (const fila of seleccion) suma += aMonto(fila[campo]);
            return { campo, etiqueta: columna?.etiqueta ?? campo, valor: redondearMonto(suma), tipo: columna?.tipo ?? 'dinero' };
        });
    }, [seleccion, conjunto]);

    function quitarSeleccion() {
        const api = apiRef.current;
        if (api && !api.isDestroyed?.()) api.deselectAll();
        setSeleccion([]);
    }

    // ----- Render -----

    if (!datos || datos.cargando) return <Esqueleto />;

    const totalRegistros = filas.length;
    const registrosVistos = filasIndicadores?.length ?? 0;
    const sinDatos = totalRegistros === 0;

    return (
        <div className={`explorador ${pantallaCompleta ? 'pantalla-completa' : ''}`}>
            {/* Barra de herramientas: se envuelve en 320 px. */}
            <div className="explorador-barra" role="toolbar" aria-label="Opciones de la tabla">
                <SelectorConjunto conjunto={conjunto} onCambiar={cambiarConjunto} />
                <div className="segmented" role="group" aria-label="Modo de la tabla">
                    <button type="button" aria-pressed={!esResumen} onClick={() => cambiarModo('detalle')}>Detalle</button>
                    <button type="button" aria-pressed={esResumen} onClick={() => cambiarModo('resumen')}>Resumen</button>
                </div>
                <div className="explorador-campo-periodo">
                    <label htmlFor="explorador-periodo" className="sr-only">Periodo</label>
                    <select
                        id="explorador-periodo"
                        className="input-field"
                        value={conjunto.campoFecha ? config.preset : 'todo'}
                        disabled={!conjunto.campoFecha}
                        title={conjunto.campoFecha ? 'Periodo' : 'Estos datos no tienen fecha'}
                        onChange={(e) => cambiarPreset(e.target.value)}
                    >
                        {PRESETS_RANGO.map((p) => <option key={p.id} value={p.id}>{p.id === 'todo' ? 'Todo el periodo' : p.etiqueta}</option>)}
                        <option value={PRESET_PERSONALIZADO}>Personalizado…</option>
                    </select>
                </div>
                {conjunto.campoFecha && config.preset === PRESET_PERSONALIZADO && (
                    <div className="explorador-fechas">
                        <div>
                            <label htmlFor="explorador-desde" className="sr-only">Desde</label>
                            <input
                                id="explorador-desde"
                                type="date"
                                className="input-field"
                                value={config.desde}
                                max={config.hasta || undefined}
                                onChange={(e) => cambiarFecha('desde', e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="explorador-hasta" className="sr-only">Hasta</label>
                            <input
                                id="explorador-hasta"
                                type="date"
                                className="input-field"
                                value={config.hasta}
                                min={config.desde || undefined}
                                onChange={(e) => cambiarFecha('hasta', e.target.value)}
                            />
                        </div>
                    </div>
                )}
                <div className="explorador-busqueda">
                    <Search size={16} aria-hidden="true" />
                    <label htmlFor="explorador-buscar" className="sr-only">Buscar en la tabla</label>
                    <input
                        id="explorador-buscar"
                        type="search"
                        className="input-field"
                        placeholder="Buscar en lo que se ve…"
                        value={config.busqueda}
                        onChange={(e) => actualizarConfig({ busqueda: e.target.value })}
                    />
                </div>

                <div className="explorador-barra-grupo explorador-barra-acciones">
                    <MenuVistas vistas={vistas} onAplicar={aplicarVista} onGuardar={guardarVista} onBorrar={setVistaABorrar} />
                    <MenuColumnas columnas={columnasMenu} deshabilitado={esResumen} {...accionesColumnas} />
                    <MenuExportar exportando={exportando} onExportar={exportar} />
                    <button
                        type="button"
                        className="btn-icon"
                        aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
                        title={pantallaCompleta ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
                        aria-pressed={pantallaCompleta}
                        onClick={() => setPantallaCompleta((v) => !v)}
                    >
                        {pantallaCompleta ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
                    </button>
                    <div className="segmented explorador-densidad" role="group" aria-label="Densidad de filas">
                        {DENSIDADES.map((d) => (
                            <button
                                key={d}
                                type="button"
                                aria-pressed={estado.densidad === d}
                                onClick={() => setEstado((previo) => ({ ...previo, densidad: d }))}
                            >
                                {ETIQUETA_DENSIDAD[d]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {aviso && (
                <div className="explorador-aviso" data-tono={aviso.tono} role={aviso.tono === 'neg' ? 'alert' : 'status'}>
                    <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                    <span className="flex-1">{aviso.texto}</span>
                    <button type="button" className="explorador-icono-mini" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>
            )}

            {sinDatos ? (
                <div className="card empty-state">
                    <p className="font-semibold text-ink">Todavía no hay {conjunto.etiqueta.toLowerCase()} en este dispositivo.</p>
                    <p className="mt-1">Cuando se registren o se sincronicen, aparecen aquí. Puedes elegir otros datos arriba.</p>
                </div>
            ) : (
                <>
                    <FranjaIndicadores indicadores={indicadores} />

                    <div className="explorador-estado" aria-live="polite">
                        <span>
                            <strong className="text-ink num">{formatoNumero(registrosVistos)}</strong> de{' '}
                            <span className="num">{formatoNumero(totalRegistros)}</span> registros
                            {conjunto.campoFecha && config.preset !== 'todo' ? ` · ${textoPeriodo(conjunto, config, rango)}` : ''}
                        </span>
                        {filtrosActivos > 0 && (
                            <button type="button" className="btn-ghost btn-sm" onClick={quitarFiltrosGrilla}>
                                <FilterX size={14} aria-hidden="true" />
                                Quitar {filtrosActivos === 1 ? 'el filtro de columna' : `${filtrosActivos} filtros de columna`}
                            </button>
                        )}
                    </div>

                    {esResumen ? (
                        <>
                            <PanelResumen
                                key={conjunto.id}
                                conjunto={conjunto}
                                config={resumen?.config ?? config.configResumen}
                                mapaCalor={config.mapaCalor}
                                mostrarGrafica={config.mostrarGrafica}
                                onCambio={cambiarResumen}
                                onOpciones={actualizarConfig}
                                abiertoInicial={escritorio}
                            />
                            {resumen && resumen.filas.length > 0 ? (
                                <>
                                    <GrillaResumen
                                        resumen={resumen}
                                        conjunto={conjunto}
                                        densidad={estado.densidad}
                                        mapaCalor={config.mapaCalor}
                                    />
                                    {config.mostrarGrafica && <GraficaResumen resumen={resumen} conjunto={conjunto} />}
                                </>
                            ) : (
                                <div className="card empty-state">
                                    Ningún registro cumple el periodo, la búsqueda y los filtros. Prueba con un periodo más amplio.
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {resumenSeleccion.length > 0 && (
                                <div className="explorador-seleccion" role="status">
                                    <strong>{seleccion.length} {seleccion.length === 1 ? 'seleccionada' : 'seleccionadas'}</strong>
                                    {resumenSeleccion.map((s) => (
                                        <span key={s.campo}>
                                            {s.etiqueta}: <span className="amount">{s.tipo === 'dinero' ? formatoMoneda(s.valor, { signo: s.campo === 'neto' }) : formatearValor(s.valor, s.tipo)}</span>
                                        </span>
                                    ))}
                                    <button type="button" className="btn-ghost btn-sm ml-auto" onClick={quitarSeleccion}>
                                        Quitar selección
                                    </button>
                                </div>
                            )}
                            <GrillaDetalle
                                key={claveGrilla}
                                conjunto={conjunto}
                                filas={filasFiltradas}
                                densidad={estado.densidad}
                                version={version}
                                estadoInicial={config}
                                onApi={alApi}
                                onEstado={alEstadoGrilla}
                                onVisibles={alVisibles}
                                onSeleccion={setSeleccion}
                                onVerSoporte={alVerSoporte}
                            />
                        </>
                    )}
                </>
            )}

            <ConfirmModal
                isOpen={Boolean(vistaABorrar)}
                title="Borrar vista"
                message={vistaABorrar ? `Se borrará la vista "${vistaABorrar.nombre}" de este dispositivo. Los datos no cambian.` : ''}
                confirmText="Borrar vista"
                cancelText="Cancelar"
                type="danger"
                onConfirm={borrarVista}
                onCancel={() => setVistaABorrar(null)}
            />
            <ImagePreviewModal
                isOpen={Boolean(soporte)}
                imageUrl={soporte?.url}
                title={soporte ? `Soporte: ${soporte.titulo}` : ''}
                onClose={() => setSoporte(null)}
            />
        </div>
    );
}
