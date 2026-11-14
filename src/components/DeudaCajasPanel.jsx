// Préstamos entre cajas: lo que una caja le debe a otra.
//
// Las escrituras van por ./deudas/operacionesDeuda (una transacción Dexie por
// operación, sync en segundo plano) y la lista se lee con liveQuery, así que
// se actualiza sola después de abonar, anular o sincronizar.
import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Plus } from 'lucide-react';
import { db } from '../services/db';
import { useAuth } from '../context/useAuth';
import ConfirmModal from './ConfirmModal';
import { formatoFecha, formatoFechaHora, formatoMoneda } from '../presentation/formato';
import { aMonto, restarMontos } from '../domain/value-objects/dinero';
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
    abonarPrestamoEntreCajas,
    analizarAnulacionDeAbono,
    analizarEliminacion,
    anularUltimoAbono,
    crearPrestamoEntreCajas,
    eliminarDeuda,
    mensajeDeError,
} from './deudas/operacionesDeuda';

const VACIO = { deudas: [], cajas: [] };
const PAGINA_PAGADAS = 30;
const FORM_VACIO = { acreedoraId: '', deudoraId: '', monto: '', descripcion: '' };

// Fuera del componente para que la suscripción de liveQuery no se rehaga en
// cada render.
async function leerPrestamos() {
    const [deudas, cajas] = await Promise.all([db.deudas_cajas.toArray(), db.cajas.toArray()]);
    return { deudas, cajas };
}

function sufijoSinSenal() {
    return typeof navigator !== 'undefined' && navigator.onLine === false
        ? ' Se subirá a la nube cuando haya señal.'
        : '';
}

export default function DeudaCajasPanel({ onDebtChanged }) {
    const { currentUser } = useAuth();
    const usuarioNombre = currentUser?.nombre || 'Desconocido';
    const { datos, cargando, error } = useConsultaViva(leerPrestamos, VACIO);
    const [ocupado, ejecutar] = useAccionUnica();
    const [aviso, mostrarAviso, limpiarAviso] = useAviso();

    const [vista, setVista] = useState('pendientes');
    const [limitePagadas, setLimitePagadas] = useState(PAGINA_PAGADAS);
    const [abiertaId, setAbiertaId] = useState(null);

    // Hoja abierta: { tipo: 'nuevo' } | { tipo: 'abono', deudaId }
    const [hoja, setHoja] = useState(null);
    const [form, setForm] = useState(FORM_VACIO);
    const [errores, setErrores] = useState({});
    const [montoAbono, setMontoAbono] = useState('');
    const [errorMonto, setErrorMonto] = useState('');
    const [errorAbono, setErrorAbono] = useState('');
    // Confirmación de saldo insuficiente (reemplaza el confirm() nativo).
    const [saldoBajo, setSaldoBajo] = useState(null);
    // Confirmación de eliminar préstamo o anular abono.
    const [accion, setAccion] = useState(null);

    const cajasPorId = useMemo(() => new Map(datos.cajas.map((c) => [c.id, c])), [datos.cajas]);
    const nombreCaja = useCallback((id) => cajasPorId.get(id)?.nombre ?? 'Caja eliminada', [cajasPorId]);
    const cajasOrdenadas = useMemo(
        () => [...datos.cajas].sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es')),
        [datos.cajas]
    );
    const resumen = useMemo(() => resumirDeudas(datos.deudas), [datos.deudas]);
    const pendientes = useMemo(() => ordenarRecientes(resumen.pendientes, 'fecha_prestamo'), [resumen]);
    const pagadas = useMemo(() => ordenarRecientes(resumen.pagadas, 'fecha_prestamo'), [resumen]);

    const deudaAbono = hoja?.tipo === 'abono' ? datos.deudas.find((d) => d.id === hoja.deudaId) ?? null : null;
    const faltaCaja = (deuda) => !cajasPorId.has(deuda.caja_deudora_id) || !cajasPorId.has(deuda.caja_acreedora_id);

    const cerrarHoja = useCallback(() => {
        if (ocupado) return;
        setHoja(null);
        setSaldoBajo(null);
    }, [ocupado]);

    // ---------------- Nuevo préstamo ----------------

    function abrirNuevo() {
        limpiarAviso();
        setForm(FORM_VACIO);
        setErrores({});
        setHoja({ tipo: 'nuevo' });
    }

    function cambiarCampo(campo, valor) {
        setForm((previo) => ({ ...previo, [campo]: valor }));
        setErrores((previo) => ({ ...previo, [campo]: undefined, general: undefined }));
    }

    function guardarNuevo() {
        return ejecutar(async () => {
            const monto = aMonto(form.monto);
            try {
                await crearPrestamoEntreCajas({
                    cajaAcreedoraId: form.acreedoraId,
                    cajaDeudoraId: form.deudoraId,
                    monto,
                    descripcion: form.descripcion,
                    usuarioNombre,
                });
                setSaldoBajo(null);
                setHoja(null);
                setForm(FORM_VACIO);
                setVista('pendientes');
                mostrarAviso('ok', `Préstamo de ${formatoMoneda(monto)} registrado.${sufijoSinSenal()}`);
                onDebtChanged?.();
            } catch (err) {
                console.error('No se pudo registrar el préstamo:', err);
                setSaldoBajo(null);
                setErrores({
                    general: mensajeDeError(err, 'No se guardó el préstamo y ningún saldo cambió. Intenta de nuevo.'),
                });
            }
        });
    }

    function enviarNuevo(evento) {
        evento.preventDefault();
        if (ocupado) return;
        const nuevos = {};
        if (!form.acreedoraId) nuevos.acreedoraId = 'Elige la caja que presta.';
        if (!form.deudoraId) nuevos.deudoraId = 'Elige la caja que recibe.';
        else if (form.deudoraId === form.acreedoraId) nuevos.deudoraId = 'Debe ser una caja distinta a la que presta.';
        if (!(aMonto(form.monto) > 0)) nuevos.monto = 'Escribe un monto mayor a 0.';
        setErrores(nuevos);
        if (Object.keys(nuevos).length > 0) return;

        const acreedora = cajasPorId.get(form.acreedoraId);
        const monto = aMonto(form.monto);
        const despues = restarMontos(aMonto(acreedora?.saldo_actual), monto);
        if (acreedora && despues < 0) {
            setSaldoBajo({ accion: 'nuevo', caja: acreedora.nombre, saldo: aMonto(acreedora.saldo_actual), monto, despues });
            return;
        }
        guardarNuevo();
    }

    // ---------------- Abono ----------------

    function abrirAbono(deuda) {
        limpiarAviso();
        setMontoAbono('');
        setErrorMonto('');
        setErrorAbono('');
        setHoja({ tipo: 'abono', deudaId: deuda.id });
    }

    function guardarAbono() {
        return ejecutar(async () => {
            const monto = aMonto(montoAbono);
            try {
                await abonarPrestamoEntreCajas({ deudaId: hoja.deudaId, monto, usuarioNombre });
                setSaldoBajo(null);
                setHoja(null);
                mostrarAviso('ok', `Abono de ${formatoMoneda(monto)} registrado.${sufijoSinSenal()}`);
                onDebtChanged?.();
            } catch (err) {
                console.error('No se pudo registrar el abono:', err);
                setSaldoBajo(null);
                setErrorAbono(mensajeDeError(err, 'No se guardó el abono y ningún saldo cambió. Intenta de nuevo.'));
            }
        });
    }

    function enviarAbono(evento) {
        evento.preventDefault();
        if (ocupado || !deudaAbono) return;
        setErrorAbono('');
        const invalido = validarAbono(deudaAbono, montoAbono);
        if (invalido) {
            setErrorMonto(invalido);
            return;
        }
        if (faltaCaja(deudaAbono)) {
            setErrorAbono('Una de las cajas de este préstamo fue eliminada. No se puede abonar sin descuadrar los saldos.');
            return;
        }
        const deudora = cajasPorId.get(deudaAbono.caja_deudora_id);
        const monto = aMonto(montoAbono);
        const despues = restarMontos(aMonto(deudora.saldo_actual), monto);
        if (despues < 0) {
            setSaldoBajo({ accion: 'abono', caja: deudora.nombre, saldo: aMonto(deudora.saldo_actual), monto, despues });
            return;
        }
        guardarAbono();
    }

    // ---------------- Anular / eliminar ----------------

    function pedirEliminar(deuda) {
        limpiarAviso();
        ejecutar(async () => {
            try {
                const analisis = await analizarEliminacion({ tipoDeuda: 'cajas', deudaId: deuda.id });
                if (!analisis) {
                    mostrarAviso('error', 'Este préstamo ya no existe.');
                    return;
                }
                setAccion({ tipo: 'eliminar', analisis });
            } catch (err) {
                console.error('No se pudo revisar el préstamo:', err);
                mostrarAviso('error', 'No se pudo revisar el préstamo. Intenta de nuevo.');
            }
        });
    }

    function pedirAnular(deuda) {
        limpiarAviso();
        ejecutar(async () => {
            try {
                const analisis = await analizarAnulacionDeAbono({ tipoDeuda: 'cajas', deudaId: deuda.id });
                if (!analisis) {
                    mostrarAviso('error', 'Este préstamo ya no tiene abonos para anular.');
                } else if (!analisis.movimiento) {
                    mostrarAviso('error', 'No se encontró el movimiento de este abono, así que no se puede anular sin descuadrar los saldos. Registra una transferencia de ajuste.');
                } else if (analisis.cajasFaltantes.length > 0) {
                    mostrarAviso('error', 'Una de las cajas de este abono fue eliminada. No se puede anular sin descuadrar los saldos.');
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
                    const revertible = analisis.movimiento && analisis.cajasFaltantes.length === 0;
                    const { movimientoRevertido } = await eliminarDeuda({
                        tipoDeuda: 'cajas',
                        deudaId: analisis.deuda.id,
                        movimientoId: revertible ? analisis.movimiento.id : null,
                    });
                    mostrarAviso('ok', movimientoRevertido
                        ? 'Préstamo eliminado. Se revirtió su transferencia: el dinero volvió a la caja que prestó.'
                        : 'Préstamo eliminado. Los saldos de las cajas no cambiaron.');
                } else {
                    await anularUltimoAbono({
                        tipoDeuda: 'cajas',
                        deudaId: analisis.deuda.id,
                        clave: clavePago(analisis.pago),
                        movimientoId: analisis.movimiento.id,
                    });
                    mostrarAviso('ok', `Abono de ${formatoMoneda(analisis.pago.monto)} anulado. Los saldos de las cajas volvieron a como estaban.`);
                }
                setAccion(null);
                onDebtChanged?.();
            } catch (err) {
                console.error('No se pudo completar la operación:', err);
                setAccion(null);
                mostrarAviso('error', mensajeDeError(err, tipo === 'eliminar'
                    ? 'No se pudo eliminar el préstamo. No cambió nada.'
                    : 'No se pudo anular el abono. No cambió nada.'));
            }
        });
    }

    const alternar = useCallback((id) => setAbiertaId((actual) => (actual === id ? null : id)), []);

    if (cargando) {
        return (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando préstamos">
                <div className="skeleton h-6 w-48" />
                <div className="skeleton h-20" />
                <div className="skeleton h-16" />
            </div>
        );
    }

    const lista = vista === 'pendientes' ? pendientes : pagadas.slice(0, limitePagadas);
    const restantesPagadas = vista === 'pagadas' ? pagadas.length - lista.length : 0;
    const prestamosAbiertos = pendientes.length;

    return (
        <section className="space-y-4" aria-labelledby="titulo-prestamos-cajas">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="titulo-prestamos-cajas" className="panel-title">Préstamos entre cajas</h3>
                    <p className="mt-0.5 text-[13px] text-ink-3">Lo que una caja le debe a otra.</p>
                </div>
                <button type="button" className="btn-secondary" onClick={abrirNuevo} disabled={ocupado}>
                    <Plus size={16} aria-hidden="true" />
                    Nuevo préstamo
                </button>
            </header>

            <AvisoEnLinea aviso={aviso} onCerrar={limpiarAviso} />

            {error && (
                <p role="alert" className="text-[14px] text-neg">No se pudieron leer los préstamos guardados en este dispositivo.</p>
            )}

            {datos.deudas.length > 0 && (
                <FranjaKpi>
                    <Kpi
                        etiqueta="Por devolver"
                        valor={formatoMoneda(resumen.totalPendiente)}
                        meta={prestamosAbiertos === 1 ? '1 préstamo abierto' : `${prestamosAbiertos} préstamos abiertos`}
                        marca="var(--warn)"
                    />
                    <Kpi
                        etiqueta="Devuelto"
                        valor={formatoMoneda(resumen.totalAbonado)}
                        meta={`de ${formatoMoneda(resumen.totalOriginal)} prestado`}
                        marca="var(--pos)"
                    />
                </FranjaKpi>
            )}

            {datos.deudas.length === 0 ? (
                <div className="empty-state">
                    No hay préstamos entre cajas. Regístralos cuando una caja le preste dinero a otra.
                </div>
            ) : (
                <>
                    <div className="segmented" role="group" aria-label="Estado de los préstamos">
                        <button type="button" aria-pressed={vista === 'pendientes'} onClick={() => setVista('pendientes')}>
                            Pendientes <span className="num text-ink-3">{pendientes.length}</span>
                        </button>
                        <button type="button" aria-pressed={vista === 'pagadas'} onClick={() => setVista('pagadas')}>
                            Pagados <span className="num text-ink-3">{pagadas.length}</span>
                        </button>
                    </div>

                    {lista.length === 0 ? (
                        <div className="empty-state">
                            {vista === 'pendientes' ? 'No hay préstamos pendientes.' : 'Todavía no hay préstamos pagados.'}
                        </div>
                    ) : (
                        <ul className="ledger">
                            {lista.map((deuda) => (
                                <FilaPrestamo
                                    key={deuda.id}
                                    deuda={deuda}
                                    abierta={abiertaId === deuda.id}
                                    onAlternar={alternar}
                                    nombreCaja={nombreCaja}
                                    cajaFalta={faltaCaja(deuda)}
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

            {/* Nuevo préstamo */}
            <HojaModal
                abierta={hoja?.tipo === 'nuevo'}
                titulo="Nuevo préstamo entre cajas"
                onCerrar={cerrarHoja}
                bloqueada={ocupado || !!saldoBajo}
            >
                <form onSubmit={enviarNuevo} noValidate className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <CampoSelect
                            id="prestamo-acreedora"
                            etiqueta="Caja que presta"
                            valor={form.acreedoraId}
                            onCambio={(v) => cambiarCampo('acreedoraId', v)}
                            error={errores.acreedoraId}
                        >
                            <option value="">Elegir caja</option>
                            {cajasOrdenadas.map((c) => (
                                <option key={c.id} value={c.id}>{c.nombre} ({formatoMoneda(c.saldo_actual)})</option>
                            ))}
                        </CampoSelect>
                        <CampoSelect
                            id="prestamo-deudora"
                            etiqueta="Caja que recibe"
                            valor={form.deudoraId}
                            onCambio={(v) => cambiarCampo('deudoraId', v)}
                            error={errores.deudoraId}
                        >
                            <option value="">Elegir caja</option>
                            {cajasOrdenadas.map((c) => (
                                <option key={c.id} value={c.id} disabled={c.id === form.acreedoraId}>{c.nombre}</option>
                            ))}
                        </CampoSelect>
                    </div>

                    <CampoMonto
                        id="prestamo-monto"
                        etiqueta="Monto del préstamo"
                        valor={form.monto}
                        onCambio={(v) => cambiarCampo('monto', v)}
                        error={errores.monto}
                        ayuda={<NotaSaldo caja={cajasPorId.get(form.acreedoraId)} monto={form.monto} verbo="Sale de" />}
                    />

                    <div>
                        <label htmlFor="prestamo-concepto" className="label">
                            Concepto <span className="font-normal text-ink-3">(opcional)</span>
                        </label>
                        <input
                            id="prestamo-concepto"
                            type="text"
                            className="input-field"
                            value={form.descripcion}
                            onChange={(e) => cambiarCampo('descripcion', e.target.value)}
                            placeholder="Ej.: materiales de la semana"
                            maxLength={200}
                        />
                    </div>

                    {errores.general && <p role="alert" className="text-[14px] text-neg">{errores.general}</p>}

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" className="btn-secondary" onClick={cerrarHoja} disabled={ocupado}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={ocupado}>
                            {ocupado ? 'Guardando...' : 'Registrar préstamo'}
                        </button>
                    </div>
                </form>
                <ConfirmacionSaldo saldoBajo={saldoBajo} ocupado={ocupado} onConfirmar={guardarNuevo} onCancelar={() => setSaldoBajo(null)} />
            </HojaModal>

            {/* Abono */}
            <HojaModal
                abierta={hoja?.tipo === 'abono'}
                titulo="Registrar abono"
                onCerrar={cerrarHoja}
                bloqueada={ocupado || !!saldoBajo}
            >
                {deudaAbono ? (
                    <form onSubmit={enviarAbono} noValidate className="space-y-4">
                        <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
                            <p className="text-[14px] text-ink">
                                {nombreCaja(deudaAbono.caja_deudora_id)}{' '}
                                <span className="text-ink-3">le debe a</span>{' '}
                                {nombreCaja(deudaAbono.caja_acreedora_id)}
                            </p>
                            <div className="mt-1 flex items-baseline justify-between gap-3">
                                <span className="text-[13px] text-ink-3">Pendiente</span>
                                <span className="amount text-neg">{formatoMoneda(deudaAbono.monto_pendiente)}</span>
                            </div>
                        </div>

                        <CampoMonto
                            id="abono-prestamo-monto"
                            etiqueta="Monto del abono"
                            valor={montoAbono}
                            onCambio={(v) => { setMontoAbono(v); setErrorMonto(''); }}
                            error={errorMonto}
                            ayuda={<NotaSaldo caja={cajasPorId.get(deudaAbono.caja_deudora_id)} monto={montoAbono} verbo="Sale de" />}
                        />
                        <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => { setMontoAbono(String(Math.round(aMonto(deudaAbono.monto_pendiente)))); setErrorMonto(''); }}
                        >
                            Abonar todo lo pendiente
                        </button>

                        {errorAbono && <p role="alert" className="text-[14px] text-neg">{errorAbono}</p>}

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" className="btn-secondary" onClick={cerrarHoja} disabled={ocupado}>Cancelar</button>
                            <button type="submit" className="btn-primary" disabled={ocupado || faltaCaja(deudaAbono)}>
                                {ocupado ? 'Guardando...' : 'Registrar abono'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <p className="text-[14px] text-ink-3">Este préstamo ya no existe. Puede que lo hayan eliminado desde otro dispositivo.</p>
                )}
                <ConfirmacionSaldo saldoBajo={saldoBajo} ocupado={ocupado} onConfirmar={guardarAbono} onCancelar={() => setSaldoBajo(null)} />
            </HojaModal>

            <ConfirmacionAccion
                accion={accion}
                ocupado={ocupado}
                nombreCaja={nombreCaja}
                onConfirmar={confirmarAccion}
                onCancelar={() => { if (!ocupado) setAccion(null); }}
            />
        </section>
    );
}

function FilaPrestamo({ deuda, abierta, onAlternar, nombreCaja, cajaFalta, ocupado, onAbonar, onAnular, onEliminar }) {
    const estado = estadoDe(deuda);
    const pagada = estado === ESTADO_DEUDA.PAGADA;
    const pagos = pagosDe(deuda);
    const idDetalle = `prestamo-${deuda.id}`;
    const deudora = nombreCaja(deuda.caja_deudora_id);
    const acreedora = nombreCaja(deuda.caja_acreedora_id);

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
                    <p className="break-words text-[15px] font-medium leading-snug text-ink">
                        {deudora} <span className="font-normal text-ink-3">debe a</span> {acreedora}
                    </p>
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                            <ChipEstadoDeuda estado={estado} masculino />
                            <span className="num">{formatoFecha(deuda.fecha_prestamo || deuda.created_at)}</span>
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
                            <MedidorAbono fraccion={fraccionAbonada(deuda)} etiqueta={`Devuelto del préstamo de ${deudora}`} />
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
                    <p className="text-[12px] text-ink-3">
                        Registrado por {deuda.usuario_nombre || 'sin nombre'}
                        {deuda.created_at ? ` el ${formatoFechaHora(deuda.created_at)}` : ''}
                    </p>

                    {pagos.length > 0 && <HistorialAbonos pagos={pagos} />}

                    {cajaFalta && !pagada && (
                        <p className="flex items-start gap-2 text-[13px] text-warn">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                            Una de las cajas de este préstamo fue eliminada: no se puede abonar sin descuadrar los saldos.
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {!pagada && (
                            <button type="button" className="btn-primary" onClick={() => onAbonar(deuda)} disabled={cajaFalta || ocupado}>
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
                                Eliminar préstamo
                            </button>
                        )}
                    </div>
                    {pagos.length > 0 && (
                        <p className="text-[12px] text-ink-3">Para eliminar el préstamo, primero anula sus abonos.</p>
                    )}
                </div>
            )}
        </li>
    );
}

/** Saldo de la caja que paga y cómo queda, mientras se escribe el monto. */
function NotaSaldo({ caja, monto, verbo }) {
    if (!caja) return null;
    const saldo = aMonto(caja.saldo_actual);
    const valor = aMonto(monto);
    if (!(valor > 0)) return <span>{caja.nombre} tiene {formatoMoneda(saldo)}.</span>;
    const despues = restarMontos(saldo, valor);
    return (
        <span className={despues < 0 ? 'text-warn' : undefined}>
            {verbo} {caja.nombre}: tiene {formatoMoneda(saldo)} y quedará con {formatoMoneda(despues)}.
        </span>
    );
}

function ConfirmacionSaldo({ saldoBajo, ocupado, onConfirmar, onCancelar }) {
    return (
        <ConfirmModal
            isOpen={!!saldoBajo}
            title="La caja quedará en negativo"
            message={saldoBajo ? `${saldoBajo.caja} no tiene saldo suficiente. ¿Registrar de todas formas?` : ''}
            details={saldoBajo ? [
                { label: 'Saldo actual', value: formatoMoneda(saldoBajo.saldo) },
                { label: 'Sale', value: formatoMoneda(saldoBajo.monto) },
                { label: 'Saldo después', value: formatoMoneda(saldoBajo.despues), highlight: true },
            ] : undefined}
            confirmText="Registrar de todas formas"
            textoProcesando="Guardando..."
            cancelText="Revisar"
            type="default"
            procesando={ocupado}
            onConfirm={onConfirmar}
            onCancel={() => { if (!ocupado) onCancelar(); }}
        />
    );
}

function ConfirmacionAccion({ accion, ocupado, nombreCaja, onConfirmar, onCancelar }) {
    if (!accion) return null;
    const { tipo, analisis } = accion;
    const { deuda } = analisis;

    if (tipo === 'anular') {
        const monto = aMonto(analisis.pago.monto);
        return (
            <ConfirmModal
                isOpen
                title="Anular último abono"
                message="Se borra el abono y su transferencia. El préstamo vuelve a quedar con ese monto pendiente."
                details={[
                    { label: `Vuelve a ${nombreCaja(deuda.caja_deudora_id)}`, value: formatoMoneda(monto) },
                    { label: `Sale de ${nombreCaja(deuda.caja_acreedora_id)}`, value: formatoMoneda(monto) },
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

    const revertible = analisis.movimiento && analisis.cajasFaltantes.length === 0;
    const monto = aMonto(deuda.monto_original);
    return (
        <ConfirmModal
            isOpen
            title="Eliminar préstamo"
            message={revertible
                ? 'Se elimina el préstamo y se revierte su transferencia: el dinero vuelve a la caja que prestó.'
                : 'No se encontró la transferencia de este préstamo (o una de sus cajas ya no existe). Solo se borra el registro: los saldos de las cajas no cambian.'}
            details={revertible ? [
                { label: `Vuelve a ${nombreCaja(deuda.caja_acreedora_id)}`, value: formatoMoneda(monto) },
                { label: `Sale de ${nombreCaja(deuda.caja_deudora_id)}`, value: formatoMoneda(monto) },
            ] : [
                { label: 'Préstamo', value: formatoMoneda(monto) },
            ]}
            confirmText="Eliminar préstamo"
            textoProcesando="Eliminando..."
            cancelText="Cancelar"
            type="danger"
            procesando={ocupado}
            onConfirm={onConfirmar}
            onCancel={onCancelar}
        />
    );
}
