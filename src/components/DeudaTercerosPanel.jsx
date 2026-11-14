// Cuentas por pagar: lo que se le debe a proveedores y terceros.
//
// Las escrituras van por ./deudas/operacionesDeuda (una transacción Dexie por
// operación, sync en segundo plano) y la lista se lee con liveQuery, así que
// se actualiza sola después de abonar, anular o sincronizar.
import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Plus } from 'lucide-react';
import { db } from '../services/db';
import { useAuth } from '../context/useAuth';
import ConfirmModal from './ConfirmModal';
import AutocompleteInput from './AutocompleteInput';
import { formatoFecha, formatoFechaHora, formatoMoneda } from '../presentation/formato';
import { aMonto, restarMontos } from '../domain/value-objects/dinero';
import { hoyLocal } from '../domain/value-objects/fecha';
import { useAccionUnica, useAviso, useConsultaViva } from './deudas/hooksDeuda';
import {
    AvisoEnLinea,
    CampoMonto,
    CampoSelect,
    ChipEstadoDeuda,
    FranjaKpi,
    HistorialAbonos,
    HojaModal,
    Kpi,
    MedidorAbono,
} from './deudas/piezasDeuda';
import {
    clavePago,
    ESTADO_DEUDA,
    estadoDe,
    fraccionAbonada,
    ordenarRecientes,
    pagosDe,
    resumirDeudas,
    validarAbono,
} from './deudas/reglasDeuda';
import {
    abonarDeudaTercero,
    analizarAnulacionDeAbono,
    analizarEliminacion,
    anularUltimoAbono,
    crearDeudaTercero,
    crearProveedor,
    eliminarDeuda,
    mensajeDeError,
} from './deudas/operacionesDeuda';

const VACIO = { deudas: [], terceros: [], proyectos: [], empresas: [], cajas: [] };
const PAGINA_PAGADAS = 30;
const ABONO_VACIO = { monto: '', cajaId: '', descripcion: '' };

function formularioVacio() {
    // La fecha se calcula al abrir el formulario, no al montar el panel: si
    // el panel quedaba abierto desde ayer, la deuda salía con la fecha de ayer.
    return { terceroId: '', empresaId: '', proyectoId: '', monto: '', descripcion: '', fechaDeuda: hoyLocal() };
}

// Fuera del componente para que la suscripción de liveQuery no se rehaga en
// cada render.
async function leerCuentasPorPagar() {
    const [deudas, terceros, proyectos, empresas, cajas] = await Promise.all([
        db.deudas_terceros.toArray(),
        db.terceros.toArray(),
        db.proyectos.toArray(),
        db.empresas.toArray(),
        db.cajas.toArray(),
    ]);
    return { deudas, terceros, proyectos, empresas, cajas };
}

function porNombre(a, b) {
    return String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');
}

function sufijoSinSenal() {
    return typeof navigator !== 'undefined' && navigator.onLine === false
        ? ' Se subirá a la nube cuando haya señal.'
        : '';
}

export default function DeudaTercerosPanel({ onDebtChanged }) {
    const { currentUser } = useAuth();
    const usuarioNombre = currentUser?.nombre || 'Desconocido';
    const { datos, cargando, error } = useConsultaViva(leerCuentasPorPagar, VACIO);
    const [ocupado, ejecutar] = useAccionUnica();
    const [aviso, mostrarAviso, limpiarAviso] = useAviso();

    const [vista, setVista] = useState('pendientes');
    const [filtroTercero, setFiltroTercero] = useState('');
    const [limitePagadas, setLimitePagadas] = useState(PAGINA_PAGADAS);
    const [abiertaId, setAbiertaId] = useState(null);

    // Hoja abierta: { tipo: 'nueva' } | { tipo: 'abono', deudaId }
    const [hoja, setHoja] = useState(null);
    const [form, setForm] = useState(formularioVacio);
    const [errores, setErrores] = useState({});
    const [abono, setAbono] = useState(ABONO_VACIO);
    const [erroresAbono, setErroresAbono] = useState({});
    const [saldoBajo, setSaldoBajo] = useState(null);
    const [accion, setAccion] = useState(null);

    const indices = useMemo(() => {
        const mapa = (filas) => new Map(filas.map((f) => [f.id, f]));
        return {
            terceros: mapa(datos.terceros),
            proyectos: mapa(datos.proyectos),
            empresas: mapa(datos.empresas),
            cajas: mapa(datos.cajas),
        };
    }, [datos]);
    const nombreTercero = useCallback((id) => indices.terceros.get(id)?.nombre ?? 'Proveedor eliminado', [indices]);
    const nombreProyecto = useCallback((id) => indices.proyectos.get(id)?.nombre ?? '', [indices]);
    const nombreEmpresa = useCallback((id) => indices.empresas.get(id)?.nombre ?? '', [indices]);
    const nombreCaja = useCallback((id) => indices.cajas.get(id)?.nombre ?? 'Caja eliminada', [indices]);

    const tercerosOrdenados = useMemo(() => [...datos.terceros].sort(porNombre), [datos.terceros]);
    const cajasOrdenadas = useMemo(() => [...datos.cajas].sort(porNombre), [datos.cajas]);
    const proyectosOrdenados = useMemo(() => [...datos.proyectos].sort(porNombre), [datos.proyectos]);
    const empresasOrdenadas = useMemo(() => [...datos.empresas].sort(porNombre), [datos.empresas]);

    const filtradas = useMemo(
        () => (filtroTercero ? datos.deudas.filter((d) => d.tercero_id === filtroTercero) : datos.deudas),
        [datos.deudas, filtroTercero]
    );
    const resumen = useMemo(() => resumirDeudas(filtradas), [filtradas]);
    const pendientes = useMemo(() => ordenarRecientes(resumen.pendientes, 'fecha_deuda'), [resumen]);
    const pagadas = useMemo(() => ordenarRecientes(resumen.pagadas, 'fecha_deuda'), [resumen]);

    // Saldo pendiente por proveedor (todas las deudas, sin filtro).
    const porProveedor = useMemo(() => {
        const totales = new Map();
        for (const deuda of resumirDeudas(datos.deudas).pendientes) {
            const actual = totales.get(deuda.tercero_id) ?? { id: deuda.tercero_id, total: 0, cuentas: 0 };
            actual.total += aMonto(deuda.monto_pendiente);
            actual.cuentas += 1;
            totales.set(deuda.tercero_id, actual);
        }
        return [...totales.values()].sort((a, b) => b.total - a.total);
    }, [datos.deudas]);
    const proveedoresConDeuda = porProveedor.length;

    const deudaAbono = hoja?.tipo === 'abono' ? datos.deudas.find((d) => d.id === hoja.deudaId) ?? null : null;

    const cerrarHoja = useCallback(() => {
        if (ocupado) return;
        setHoja(null);
        setSaldoBajo(null);
    }, [ocupado]);

    // ---------------- Nueva deuda ----------------

    function abrirNueva() {
        limpiarAviso();
        setForm(formularioVacio());
        setErrores({});
        setHoja({ tipo: 'nueva' });
    }

    function cambiarCampo(campo, valor) {
        setForm((previo) => ({ ...previo, [campo]: valor }));
        setErrores((previo) => ({ ...previo, [campo]: undefined, general: undefined }));
    }

    // Con la guarda: un doble toque en "Crear proveedor" creaba dos iguales.
    function crearTerceroAlVuelo(nombre) {
        return ejecutar(async () => {
            try {
                return await crearProveedor(nombre);
            } catch (err) {
                console.error('No se pudo crear el proveedor:', err);
                setErrores((previo) => ({ ...previo, terceroId: mensajeDeError(err, 'No se pudo crear el proveedor. Intenta de nuevo.') }));
                return null;
            }
        });
    }

    function enviarNueva(evento) {
        evento.preventDefault();
        if (ocupado) return;
        const nuevos = {};
        if (!form.terceroId) nuevos.terceroId = 'Elige el proveedor o créalo.';
        if (!(aMonto(form.monto) > 0)) nuevos.monto = 'Escribe un monto mayor a 0.';
        if (!form.fechaDeuda) nuevos.fechaDeuda = 'Elige la fecha de la deuda.';
        setErrores(nuevos);
        if (Object.keys(nuevos).length > 0) return;

        ejecutar(async () => {
            const monto = aMonto(form.monto);
            try {
                await crearDeudaTercero({
                    terceroId: form.terceroId,
                    empresaId: form.empresaId,
                    proyectoId: form.proyectoId,
                    monto,
                    fechaDeuda: form.fechaDeuda,
                    descripcion: form.descripcion,
                    usuarioNombre,
                });
                setHoja(null);
                setVista('pendientes');
                mostrarAviso('ok', `Deuda de ${formatoMoneda(monto)} con ${nombreTercero(form.terceroId)} registrada.${sufijoSinSenal()}`);
                onDebtChanged?.();
            } catch (err) {
                console.error('No se pudo registrar la deuda:', err);
                setErrores({ general: mensajeDeError(err, 'No se guardó la deuda. Intenta de nuevo.') });
            }
        });
    }

    // ---------------- Abono ----------------

    function abrirAbono(deuda) {
        limpiarAviso();
        setAbono(ABONO_VACIO);
        setErroresAbono({});
        setHoja({ tipo: 'abono', deudaId: deuda.id });
    }

    function cambiarAbono(campo, valor) {
        setAbono((previo) => ({ ...previo, [campo]: valor }));
        setErroresAbono((previo) => ({ ...previo, [campo]: undefined, general: undefined }));
    }

    function guardarAbono() {
        return ejecutar(async () => {
            const monto = aMonto(abono.monto);
            try {
                await abonarDeudaTercero({
                    deudaId: hoja.deudaId,
                    monto,
                    cajaId: abono.cajaId,
                    descripcion: abono.descripcion,
                    usuarioNombre,
                });
                setSaldoBajo(null);
                setHoja(null);
                mostrarAviso('ok', `Abono de ${formatoMoneda(monto)} registrado.${sufijoSinSenal()}`);
                onDebtChanged?.();
            } catch (err) {
                console.error('No se pudo registrar el abono:', err);
                setSaldoBajo(null);
                setErroresAbono({
                    general: mensajeDeError(err, 'No se guardó el abono y ningún saldo cambió. Intenta de nuevo.'),
                });
            }
        });
    }

    function enviarAbono(evento) {
        evento.preventDefault();
        if (ocupado || !deudaAbono) return;
        const nuevos = {};
        const invalido = validarAbono(deudaAbono, abono.monto);
        if (invalido) nuevos.monto = invalido;
        if (!abono.cajaId || !indices.cajas.has(abono.cajaId)) nuevos.cajaId = 'Elige la caja de donde sale el abono.';
        setErroresAbono(nuevos);
        if (Object.keys(nuevos).length > 0) return;

        const caja = indices.cajas.get(abono.cajaId);
        const monto = aMonto(abono.monto);
        const despues = restarMontos(aMonto(caja.saldo_actual), monto);
        if (despues < 0) {
            setSaldoBajo({ caja: caja.nombre, saldo: aMonto(caja.saldo_actual), monto, despues });
            return;
        }
        guardarAbono();
    }

    // ---------------- Anular / eliminar ----------------

    function pedirEliminar(deuda) {
        limpiarAviso();
        ejecutar(async () => {
            try {
                const analisis = await analizarEliminacion({ tipoDeuda: 'terceros', deudaId: deuda.id });
                if (!analisis) {
                    mostrarAviso('error', 'Esta deuda ya no existe.');
                    return;
                }
                setAccion({ tipo: 'eliminar', analisis });
            } catch (err) {
                console.error('No se pudo revisar la deuda:', err);
                mostrarAviso('error', 'No se pudo revisar la deuda. Intenta de nuevo.');
            }
        });
    }

    function pedirAnular(deuda) {
        limpiarAviso();
        ejecutar(async () => {
            try {
                const analisis = await analizarAnulacionDeAbono({ tipoDeuda: 'terceros', deudaId: deuda.id });
                if (!analisis) {
                    mostrarAviso('error', 'Esta deuda ya no tiene abonos para anular.');
                } else if (!analisis.movimiento) {
                    mostrarAviso('error', 'No se encontró el egreso de este abono, así que no se puede anular sin descuadrar los saldos. Registra un ingreso de ajuste.');
                } else if (analisis.cajasFaltantes.length > 0) {
                    mostrarAviso('error', 'La caja de este abono fue eliminada. No se puede anular sin descuadrar los saldos.');
                } else {
                    setAccion({ tipo: 'anular', analisis });
                }
            } catch (err) {
                console.error('No se pudo revisar el abono:', err);
                mostrarAviso('error', 'No se pudo revisar el abono. Intenta de nuevo.');
            }
        });
    }

    function confirmarAccion() {
        if (!accion) return undefined;
        return ejecutar(async () => {
            const { tipo, analisis } = accion;
            try {
                if (tipo === 'eliminar') {
                    await eliminarDeuda({ tipoDeuda: 'terceros', deudaId: analisis.deuda.id });
                    mostrarAviso('ok', 'Deuda eliminada.');
                } else {
                    await anularUltimoAbono({
                        tipoDeuda: 'terceros',
                        deudaId: analisis.deuda.id,
                        clave: clavePago(analisis.pago),
                        movimientoId: analisis.movimiento.id,
                    });
                    mostrarAviso('ok', `Abono de ${formatoMoneda(analisis.pago.monto)} anulado. El dinero volvió a la caja.`);
                }
                setAccion(null);
                onDebtChanged?.();
            } catch (err) {
                console.error('No se pudo completar la operación:', err);
                setAccion(null);
                mostrarAviso('error', mensajeDeError(err, tipo === 'eliminar'
                    ? 'No se pudo eliminar la deuda. No cambió nada.'
                    : 'No se pudo anular el abono. No cambió nada.'));
            }
        });
    }

    const alternar = useCallback((id) => setAbiertaId((actual) => (actual === id ? null : id)), []);

    if (cargando) {
        return (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando cuentas por pagar">
                <div className="skeleton h-6 w-48" />
                <div className="skeleton h-20" />
                <div className="skeleton h-16" />
            </div>
        );
    }

    const lista = vista === 'pendientes' ? pendientes : pagadas.slice(0, limitePagadas);
    const restantesPagadas = vista === 'pagadas' ? pagadas.length - lista.length : 0;
    const cajaAbono = indices.cajas.get(abono.cajaId);

    return (
        <section className="space-y-4" aria-labelledby="titulo-cuentas-por-pagar">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="titulo-cuentas-por-pagar" className="panel-title">Cuentas por pagar</h3>
                    <p className="mt-0.5 text-[13px] text-ink-3">Lo que se le debe a proveedores y terceros.</p>
                </div>
                <button type="button" className="btn-secondary" onClick={abrirNueva} disabled={ocupado}>
                    <Plus size={16} aria-hidden="true" />
                    Nueva deuda
                </button>
            </header>

            <AvisoEnLinea aviso={aviso} onCerrar={limpiarAviso} />

            {error && (
                <p role="alert" className="text-[14px] text-neg">No se pudieron leer las deudas guardadas en este dispositivo.</p>
            )}

            {datos.deudas.length === 0 ? (
                <div className="empty-state">
                    No hay deudas con proveedores. Regístralas cuando un proveedor te dé crédito.
                </div>
            ) : (
                <>
                    <FranjaKpi>
                        <Kpi
                            etiqueta={filtroTercero ? 'Por pagar a este proveedor' : 'Por pagar'}
                            valor={formatoMoneda(resumen.totalPendiente)}
                            meta={filtroTercero
                                ? `${pendientes.length} ${pendientes.length === 1 ? 'deuda abierta' : 'deudas abiertas'}`
                                : `${pendientes.length} ${pendientes.length === 1 ? 'deuda' : 'deudas'} con ${proveedoresConDeuda} ${proveedoresConDeuda === 1 ? 'proveedor' : 'proveedores'}`}
                            marca="var(--neg)"
                            colorValor={resumen.totalPendiente > 0 ? 'var(--neg)' : undefined}
                        />
                        <Kpi
                            etiqueta="Abonado"
                            valor={formatoMoneda(resumen.totalAbonado)}
                            meta={`de ${formatoMoneda(resumen.totalOriginal)} en deudas`}
                            marca="var(--pos)"
                        />
                    </FranjaKpi>

                    {!filtroTercero && porProveedor.length > 1 && (
                        <div>
                            <p className="eyebrow mb-1.5">Mayor saldo por proveedor</p>
                            <ul className="ledger">
                                {porProveedor.slice(0, 5).map((p) => (
                                    <li key={p.id ?? 'sin-proveedor'}>
                                        <button
                                            type="button"
                                            className="ledger-row"
                                            style={{ minHeight: 48, paddingTop: 8, paddingBottom: 8 }}
                                            onClick={() => { setFiltroTercero(p.id ?? ''); setVista('pendientes'); }}
                                            aria-label={`Ver solo las deudas con ${nombreTercero(p.id)}`}
                                        >
                                            <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{nombreTercero(p.id)}</span>
                                            <span className="num shrink-0 text-[12px] text-ink-3">{p.cuentas}</span>
                                            <span className="amount shrink-0 text-[14px] text-neg">{formatoMoneda(p.total)}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="segmented self-start" role="group" aria-label="Estado de las deudas">
                            <button type="button" aria-pressed={vista === 'pendientes'} onClick={() => setVista('pendientes')}>
                                Pendientes <span className="num text-ink-3">{pendientes.length}</span>
                            </button>
                            <button type="button" aria-pressed={vista === 'pagadas'} onClick={() => setVista('pagadas')}>
                                Pagadas <span className="num text-ink-3">{pagadas.length}</span>
                            </button>
                        </div>
                        <div className="sm:w-64">
                            <label htmlFor="filtro-proveedor" className="label">Proveedor</label>
                            <select
                                id="filtro-proveedor"
                                className="input-field"
                                value={filtroTercero}
                                onChange={(e) => { setFiltroTercero(e.target.value); setLimitePagadas(PAGINA_PAGADAS); }}
                            >
                                <option value="">Todos los proveedores</option>
                                {tercerosOrdenados.map((t) => (
                                    <option key={t.id} value={t.id}>{t.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {lista.length === 0 ? (
                        <div className="empty-state">
                            {vista === 'pendientes' ? 'No hay deudas pendientes.' : 'Todavía no hay deudas pagadas.'}
                        </div>
                    ) : (
                        <ul className="ledger">
                            {lista.map((deuda) => (
                                <FilaDeuda
                                    key={deuda.id}
                                    deuda={deuda}
                                    abierta={abiertaId === deuda.id}
                                    onAlternar={alternar}
                                    nombreTercero={nombreTercero}
                                    nombreProyecto={nombreProyecto}
                                    nombreEmpresa={nombreEmpresa}
                                    nombreCaja={nombreCaja}
                                    ocupado={ocupado}
                                    onAbonar={abrirAbono}
                                    onAnular={pedirAnular}
                                    onEliminar={pedirEliminar}
                                />
                            ))}
                        </ul>
                    )}

                    {restantesPagadas > 0 && (
                        <button type="button" className="btn-ghost w-full" onClick={() => setLimitePagadas((n) => n + PAGINA_PAGADAS)}>
                            Ver {Math.min(PAGINA_PAGADAS, restantesPagadas)} más ({restantesPagadas} sin mostrar)
                        </button>
                    )}
                </>
            )}

            {/* Nueva deuda */}
            <HojaModal abierta={hoja?.tipo === 'nueva'} titulo="Nueva deuda con proveedor" onCerrar={cerrarHoja} bloqueada={ocupado}>
                <form onSubmit={enviarNueva} noValidate className="space-y-4">
                    <div>
                        {/* El label apunta al input del combobox: con un <p> y
                            un role=group, el campo se anunciaba con el
                            placeholder y tocar "Proveedor" no lo enfocaba. El
                            error lo pinta AutocompleteInput, enlazado con
                            aria-describedby. */}
                        <label htmlFor="nueva-deuda-proveedor" className="label">Proveedor</label>
                        <AutocompleteInput
                            id="nueva-deuda-proveedor"
                            items={tercerosOrdenados}
                            value={form.terceroId}
                            onChange={(v) => cambiarCampo('terceroId', v)}
                            onCreateNew={crearTerceroAlVuelo}
                            placeholder="Escribir o elegir..."
                            displayKey="nombre"
                            valueKey="id"
                            createLabel="Crear proveedor:"
                            emptyMessage="Sin proveedores"
                            disabled={ocupado}
                            error={errores.terceroId}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <CampoSelect
                            id="nueva-deuda-empresa"
                            etiqueta="Empresa"
                            valor={form.empresaId}
                            onCambio={(v) => cambiarCampo('empresaId', v)}
                        >
                            <option value="">Sin empresa</option>
                            {empresasOrdenadas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                        </CampoSelect>
                        <CampoSelect
                            id="nueva-deuda-obra"
                            etiqueta="Obra"
                            valor={form.proyectoId}
                            onCambio={(v) => cambiarCampo('proyectoId', v)}
                        >
                            <option value="">Sin obra</option>
                            {proyectosOrdenados.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </CampoSelect>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <CampoMonto
                            id="nueva-deuda-monto"
                            etiqueta="Monto de la deuda"
                            valor={form.monto}
                            onCambio={(v) => cambiarCampo('monto', v)}
                            error={errores.monto}
                        />
                        <div>
                            <label htmlFor="nueva-deuda-fecha" className="label">Fecha de la deuda</label>
                            <input
                                id="nueva-deuda-fecha"
                                type="date"
                                className="input-field"
                                value={form.fechaDeuda}
                                max={hoyLocal()}
                                onChange={(e) => cambiarCampo('fechaDeuda', e.target.value)}
                                aria-invalid={errores.fechaDeuda ? true : undefined}
                            />
                            {errores.fechaDeuda && <p className="mt-1 text-[13px] text-neg">{errores.fechaDeuda}</p>}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="nueva-deuda-concepto" className="label">
                            Concepto <span className="font-normal text-ink-3">(opcional)</span>
                        </label>
                        <input
                            id="nueva-deuda-concepto"
                            type="text"
                            className="input-field"
                            value={form.descripcion}
                            onChange={(e) => cambiarCampo('descripcion', e.target.value)}
                            placeholder="Ej.: cemento y varilla, factura 1234"
                            maxLength={200}
                        />
                    </div>

                    {errores.general && <p role="alert" className="text-[14px] text-neg">{errores.general}</p>}

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" className="btn-secondary" onClick={cerrarHoja} disabled={ocupado}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={ocupado}>
                            {ocupado ? 'Guardando...' : 'Registrar deuda'}
                        </button>
                    </div>
                </form>
            </HojaModal>

            {/* Abono */}
            <HojaModal abierta={hoja?.tipo === 'abono'} titulo="Registrar abono" onCerrar={cerrarHoja} bloqueada={ocupado || !!saldoBajo}>
                {deudaAbono ? (
                    <form onSubmit={enviarAbono} noValidate className="space-y-4">
                        <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
                            <p className="text-[14px] text-ink">{nombreTercero(deudaAbono.tercero_id)}</p>
                            <div className="mt-1 flex items-baseline justify-between gap-3">
                                <span className="text-[13px] text-ink-3">Pendiente</span>
                                <span className="amount text-neg">{formatoMoneda(deudaAbono.monto_pendiente)}</span>
                            </div>
                        </div>

                        <CampoSelect
                            id="abono-deuda-caja"
                            etiqueta="Caja de donde sale"
                            valor={abono.cajaId}
                            onCambio={(v) => cambiarAbono('cajaId', v)}
                            error={erroresAbono.cajaId}
                        >
                            <option value="">Elegir caja</option>
                            {cajasOrdenadas.map((c) => (
                                <option key={c.id} value={c.id}>{c.nombre} ({formatoMoneda(c.saldo_actual)})</option>
                            ))}
                        </CampoSelect>

                        <CampoMonto
                            id="abono-deuda-monto"
                            etiqueta="Monto del abono"
                            valor={abono.monto}
                            onCambio={(v) => cambiarAbono('monto', v)}
                            error={erroresAbono.monto}
                            ayuda={<NotaSaldo caja={cajaAbono} monto={abono.monto} />}
                        />
                        <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => cambiarAbono('monto', String(Math.round(aMonto(deudaAbono.monto_pendiente))))}
                        >
                            Abonar todo lo pendiente
                        </button>

                        <div>
                            <label htmlFor="abono-deuda-concepto" className="label">
                                Concepto <span className="font-normal text-ink-3">(opcional)</span>
                            </label>
                            <input
                                id="abono-deuda-concepto"
                                type="text"
                                className="input-field"
                                value={abono.descripcion}
                                onChange={(e) => cambiarAbono('descripcion', e.target.value)}
                                placeholder="Ej.: transferencia del viernes"
                                maxLength={200}
                            />
                        </div>

                        {erroresAbono.general && <p role="alert" className="text-[14px] text-neg">{erroresAbono.general}</p>}

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" className="btn-secondary" onClick={cerrarHoja} disabled={ocupado}>Cancelar</button>
                            <button type="submit" className="btn-primary" disabled={ocupado}>
                                {ocupado ? 'Guardando...' : 'Registrar abono'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <p className="text-[14px] text-ink-3">Esta deuda ya no existe. Puede que la hayan eliminado desde otro dispositivo.</p>
                )}
                <ConfirmModal
                    isOpen={!!saldoBajo}
                    title="La caja quedará en negativo"
                    message={saldoBajo ? `${saldoBajo.caja} no tiene saldo suficiente. ¿Registrar el abono de todas formas?` : ''}
                    details={saldoBajo ? [
                        { label: 'Saldo actual', value: formatoMoneda(saldoBajo.saldo) },
                        { label: 'Abono', value: formatoMoneda(saldoBajo.monto) },
                        { label: 'Saldo después', value: formatoMoneda(saldoBajo.despues), highlight: true },
                    ] : undefined}
                    confirmText="Registrar de todas formas"
                    textoProcesando="Guardando..."
                    cancelText="Revisar"
                    type="default"
                    procesando={ocupado}
                    onConfirm={guardarAbono}
                    onCancel={() => { if (!ocupado) setSaldoBajo(null); }}
                />
            </HojaModal>

            <ConfirmacionAccion
                accion={accion}
                ocupado={ocupado}
                nombreTercero={nombreTercero}
                nombreCaja={nombreCaja}
                onConfirmar={confirmarAccion}
                onCancelar={() => { if (!ocupado) setAccion(null); }}
            />
        </section>
    );
}

function FilaDeuda({ deuda, abierta, onAlternar, nombreTercero, nombreProyecto, nombreEmpresa, nombreCaja, ocupado, onAbonar, onAnular, onEliminar }) {
    const estado = estadoDe(deuda);
    const pagada = estado === ESTADO_DEUDA.PAGADA;
    const pagos = pagosDe(deuda);
    const idDetalle = `deuda-${deuda.id}`;
    const proveedor = nombreTercero(deuda.tercero_id);
    const obra = deuda.proyecto_id ? nombreProyecto(deuda.proyecto_id) : '';
    const empresa = deuda.empresa_id ? nombreEmpresa(deuda.empresa_id) : '';

    return (
        <li>
            <button
                type="button"
                className="ledger-row"
                style={{ alignItems: 'flex-start' }}
                aria-expanded={abierta}
                aria-controls={idDetalle}
                onClick={() => onAlternar(deuda.id)}
            >
                <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-medium leading-snug text-ink">{proveedor}</p>
                    {(obra || deuda.descripcion) && (
                        <p className="truncate text-[13px] text-ink-3">
                            {[obra, deuda.descripcion].filter(Boolean).join(' · ')}
                        </p>
                    )}
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                            <ChipEstadoDeuda estado={estado} />
                            <span className="num">{formatoFecha(deuda.fecha_deuda || deuda.created_at)}</span>
                        </div>
                        <div className="shrink-0 text-right">
                            <p className={`amount text-[17px] ${pagada ? 'text-ink-2' : 'text-neg'}`}>
                                {formatoMoneda(pagada ? deuda.monto_original : deuda.monto_pendiente)}
                            </p>
                            {estado === ESTADO_DEUDA.PARCIAL && (
                                <p className="num text-[12px] text-ink-3">de {formatoMoneda(deuda.monto_original)}</p>
                            )}
                        </div>
                    </div>
                    {!pagada && (
                        <div className="mt-2">
                            <MedidorAbono fraccion={fraccionAbonada(deuda)} etiqueta={`Abonado a ${proveedor}`} />
                        </div>
                    )}
                </div>
                <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`mt-0.5 shrink-0 text-ink-3 transition-transform ${abierta ? 'rotate-180' : ''}`}
                />
            </button>

            {abierta && (
                <div id={idDetalle} className="space-y-3 border-t border-line bg-surface-2 px-4 py-3">
                    {deuda.descripcion && <p className="text-[14px] text-ink-2">{deuda.descripcion}</p>}
                    {(empresa || obra) && (
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                            {empresa && (<><dt className="text-ink-3">Empresa</dt><dd className="text-ink-2">{empresa}</dd></>)}
                            {obra && (<><dt className="text-ink-3">Obra</dt><dd className="text-ink-2">{obra}</dd></>)}
                        </dl>
                    )}
                    <p className="text-[12px] text-ink-3">
                        Registrada por {deuda.usuario_nombre || 'sin nombre'}
                        {deuda.created_at ? ` el ${formatoFechaHora(deuda.created_at)}` : ''}
                    </p>

                    {pagos.length > 0 && <HistorialAbonos pagos={pagos} nombreCaja={nombreCaja} />}

                    <div className="flex flex-wrap gap-2">
                        {!pagada && (
                            <button type="button" className="btn-primary" onClick={() => onAbonar(deuda)} disabled={ocupado}>
                                Registrar abono
                            </button>
                        )}
                        {pagos.length > 0 ? (
                            <button type="button" className="btn-secondary" onClick={() => onAnular(deuda)} disabled={ocupado}>
                                Anular último abono
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn-ghost"
                                style={{ color: 'var(--neg)' }}
                                onClick={() => onEliminar(deuda)}
                                disabled={ocupado}
                            >
                                Eliminar deuda
                            </button>
                        )}
                    </div>
                    {pagos.length > 0 && (
                        <p className="flex items-start gap-2 text-[12px] text-ink-3">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                            Para eliminar la deuda, primero anula sus abonos. Si no, sus egresos quedarían sin deuda y el reporte de proveedores dejaría de contarlos como pagados.
                        </p>
                    )}
                </div>
            )}
        </li>
    );
}

/** Saldo de la caja que paga y cómo queda, mientras se escribe el monto. */
function NotaSaldo({ caja, monto }) {
    if (!caja) return null;
    const saldo = aMonto(caja.saldo_actual);
    const valor = aMonto(monto);
    if (!(valor > 0)) return <span>{caja.nombre} tiene {formatoMoneda(saldo)}.</span>;
    const despues = restarMontos(saldo, valor);
    return (
        <span className={despues < 0 ? 'text-warn' : undefined}>
            {caja.nombre} tiene {formatoMoneda(saldo)} y quedará con {formatoMoneda(despues)}.
        </span>
    );
}

function ConfirmacionAccion({ accion, ocupado, nombreTercero, nombreCaja, onConfirmar, onCancelar }) {
    if (!accion) return null;
    const { tipo, analisis } = accion;
    const { deuda } = analisis;

    if (tipo === 'anular') {
        return (
            <ConfirmModal
                isOpen
                title="Anular último abono"
                message={`Se borra el abono a ${nombreTercero(deuda.tercero_id)} y su egreso: el dinero vuelve a la caja y la deuda vuelve a quedar con ese monto pendiente.`}
                details={[
                    { label: `Vuelve a ${nombreCaja(analisis.movimiento.caja_origen_id)}`, value: formatoMoneda(analisis.pago.monto) },
                    { label: 'Pendiente después', value: formatoMoneda(analisis.pendienteDespues), highlight: true },
                ]}
                confirmText="Anular abono"
                textoProcesando="Anulando..."
                cancelText="Cancelar"
                type="danger"
                procesando={ocupado}
                onConfirm={onConfirmar}
                onCancel={onCancelar}
            />
        );
    }

    return (
        <ConfirmModal
            isOpen
            title="Eliminar deuda"
            message={`Se elimina la deuda con ${nombreTercero(deuda.tercero_id)}. No tiene abonos, así que ningún saldo cambia.`}
            details={[
                { label: 'Monto', value: formatoMoneda(deuda.monto_original) },
                { label: 'Fecha', value: formatoFecha(deuda.fecha_deuda || deuda.created_at) },
            ]}
            confirmText="Eliminar deuda"
            textoProcesando="Eliminando..."
            cancelText="Cancelar"
            type="danger"
            procesando={ocupado}
            onConfirm={onConfirmar}
            onCancel={onCancelar}
        />
    );
}
