// Bandeja de cambios que la nube rechazó (C7, invariante 2 de CLAUDE.md).
//
// Antes un error permanente de Supabase (un CHECK, una columna que no
// existe) se descartaba con un console.warn: la persona creía que su gasto
// estaba guardado y nunca llegaba a la nube. Ahora queda aquí hasta que
// alguien lo reintente o lo descarte a conciencia.
import { useEffect, useId, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react';
import useDialogo from '../hooks/useDialogo';
import ConfirmModal from './ConfirmModal';
import {
    ajustesQueQuedanAlDescartar,
    descartarErrorSync,
    listarErroresSync,
    reintentarErrorSync,
    suscribirCambiosCola,
} from '../services/syncService';
import { formatoFecha, formatoFechaHora, formatoMoneda } from '../presentation/formato';

const NOMBRE_TABLA = {
    transacciones: 'Movimiento',
    cajas: 'Caja',
    proyectos: 'Proyecto',
    empresas: 'Empresa',
    terceros: 'Tercero',
    categorias: 'Categoría',
    deudas_cajas: 'Préstamo entre cajas',
    deudas_terceros: 'Cuenta por pagar',
};

const NOMBRE_OPERACION = {
    INSERT: 'Crear',
    UPDATE: 'Editar',
    DELETE: 'Borrar',
};

// Respaldo por si una fila vieja no trae `mensaje`: el código de Postgres en
// palabras de quien usa la app.
const MOTIVO_POR_CODIGO = {
    23514: 'Un valor no cumple las reglas de la base de datos.',
    23502: 'Falta un dato obligatorio.',
    23503: 'Depende de un registro que no está en la nube.',
    23505: 'Ya existe un registro igual en la nube.',
    42501: 'Tu usuario no tiene permiso para guardar este cambio.',
    42703: 'La nube no reconoce uno de los campos. Hay que actualizar la base de datos.',
    PGRST204: 'La nube no reconoce uno de los campos. Hay que actualizar la base de datos.',
};

const TONO_AVISO = {
    pos: { icono: CircleCheck, clase: 'bg-pos-soft text-pos' },
    warn: { icono: Info, clase: 'bg-warn-soft text-warn' },
    neg: { icono: CircleAlert, clase: 'bg-neg-soft text-neg' },
};

function etiquetaDe(error) {
    const operacion = NOMBRE_OPERACION[error.operacion] || error.operacion;
    const tabla = NOMBRE_TABLA[error.tabla] || error.tabla;
    return `${operacion} · ${tabla}`;
}

function motivoLegible(error) {
    const mensaje = typeof error.mensaje === 'string' ? error.mensaje.trim() : '';
    return mensaje || MOTIVO_POR_CODIGO[error.codigo] || 'La nube rechazó este cambio.';
}

/** Lo que identifica al registro para una persona: tipo, concepto, monto, fecha. */
function resumenDeDatos(datos) {
    if (!datos || typeof datos !== 'object') return [];
    const partes = [];
    if (datos.tipo_movimiento) partes.push(String(datos.tipo_movimiento).toLowerCase());
    const texto = datos.descripcion || datos.nombre || datos.concepto;
    if (texto) partes.push(String(texto));
    const monto = datos.monto ?? datos.monto_original;
    if (monto !== undefined && monto !== null && monto !== '') partes.push(formatoMoneda(monto));
    if (datos.fecha) {
        const fecha = formatoFecha(datos.fecha);
        if (fecha) partes.push(fecha);
    }
    return partes;
}

function leerDatos(crudo) {
    if (crudo && typeof crudo === 'object') return crudo;
    try {
        return JSON.parse(crudo);
    } catch {
        return null;
    }
}

/**
 * Qué decirle a la persona después de reintentar. reintentarErrorSync no
 * lanza si la nube vuelve a rechazar: la operación vuelve a la bandeja con
 * otro id, así que hay que mirar el resultado de la corrida.
 */
function avisoDeReintento(error, { reencolada, resultado }) {
    if (!reencolada) return null;
    if (!resultado) {
        return { tono: 'warn', texto: 'Sin conexión: el cambio volvió a la cola y se subirá cuando haya señal.' };
    }
    const idRegistro = error.datos?.id;
    const rechazadaOtraVez = (resultado.errors || []).some((fallo) =>
        fallo.permanent &&
        fallo.operation?.tabla === error.tabla &&
        fallo.operation?.operacion === error.operacion &&
        (idRegistro === undefined || leerDatos(fallo.operation?.datos)?.id === idRegistro));
    if (rechazadaOtraVez) {
        return { tono: 'neg', texto: `${etiquetaDe(error)}: la nube lo volvió a rechazar.` };
    }
    if (resultado.detenido) {
        return {
            tono: 'warn',
            texto: `${resultado.detenido.mensaje || 'No se pudo subir todavía.'} El cambio quedó en la cola y se reintentará.`,
        };
    }
    return { tono: 'pos', texto: `${etiquetaDe(error)}: guardado en la nube.` };
}

function FilaError({ error, ocupado, mensajeFila, onReintentar, onDescartar }) {
    const resumen = resumenDeDatos(error.datos);
    const detalleTecnico = [error.codigo, error.detalle].filter(Boolean).join(' · ');

    return (
        <li className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-semibold text-ink">{etiquetaDe(error)}</p>
                {error.fecha && <p className="text-xs text-ink-3">{formatoFechaHora(error.fecha)}</p>}
            </div>
            {resumen.length > 0 && (
                <p className="num mt-0.5 break-words text-sm text-ink-2">{resumen.join(' · ')}</p>
            )}
            <p className="mt-1.5 text-sm font-medium text-neg">{motivoLegible(error)}</p>
            {detalleTecnico && (
                <details className="mt-1 text-xs text-ink-3">
                    <summary className="cursor-pointer select-none py-1">Detalle para soporte</summary>
                    <p className="mono break-words pb-1">{detalleTecnico}</p>
                </details>
            )}
            {mensajeFila && (
                <p role="alert" className="mt-1.5 text-sm font-medium text-neg">{mensajeFila}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => onReintentar(error)}
                    disabled={Boolean(ocupado)}
                    className="btn-secondary"
                >
                    {ocupado === 'reintentando'
                        ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                        : <RotateCcw size={16} aria-hidden="true" />}
                    {ocupado === 'reintentando' ? 'Reintentando...' : 'Reintentar'}
                </button>
                <button
                    type="button"
                    onClick={() => onDescartar(error)}
                    disabled={Boolean(ocupado)}
                    className="btn-ghost"
                >
                    <Trash2 size={16} aria-hidden="true" />
                    Descartar
                </button>
            </div>
        </li>
    );
}

function Panel({ onCerrar }) {
    const idTitulo = useId();
    const idDescripcion = useId();
    const [errores, setErrores] = useState(null); // null = cargando
    const [falloCarga, setFalloCarga] = useState(false);
    const [ocupados, setOcupados] = useState({}); // id -> 'reintentando' | 'descartando'
    const [mensajes, setMensajes] = useState({}); // id -> error de la acción sobre esa fila
    const [aviso, setAviso] = useState(null); // { tono, texto } del último reintento
    const [porDescartar, setPorDescartar] = useState(null);

    // Antes de pedir confirmación se averigua si el movimiento rechazado ya
    // movió saldos en la nube (datos-5): esos ajustes NO se deshacen al
    // descartar, y la persona tiene que saberlo para registrar un ajuste.
    async function pedirDescarte(error) {
        let ajustes = [];
        try {
            ajustes = await ajustesQueQuedanAlDescartar(error.id);
        } catch (err) {
            console.error('No se pudo revisar el efecto en saldos del cambio rechazado:', err);
        }
        setPorDescartar({ ...error, ajustesQuedan: ajustes });
    }
    const refEnCurso = useRef(new Set());

    const { refDialogo, propsVelo } = useDialogo({
        abierto: true,
        onCerrar,
        bloqueado: Boolean(porDescartar),
    });

    // suscribirCambiosCola llama una vez al suscribirse y luego en cada
    // cambio de la cola o de la bandeja: un reintento automático al volver
    // la señal, o un error nuevo, se ven sin cerrar el panel.
    useEffect(() => {
        let activo = true;
        function cargar() {
            listarErroresSync()
                .then((lista) => {
                    if (!activo) return;
                    setErrores(Array.isArray(lista) ? lista : []);
                    setFalloCarga(false);
                })
                .catch((err) => {
                    console.error('No se pudo leer la bandeja de errores de sincronización:', err);
                    if (activo) setFalloCarga(true);
                });
        }
        // Carga directa además de la suscripción: si liveQuery fallara, la
        // lista igual aparece (en vez de quedarse en el esqueleto).
        cargar();
        const desuscribir = suscribirCambiosCola(cargar);
        return () => {
            activo = false;
            if (typeof desuscribir === 'function') desuscribir();
        };
    }, []);

    function cambiarEn(setter, id, valor) {
        setter((prev) => {
            const siguiente = { ...prev };
            if (valor) siguiente[id] = valor;
            else delete siguiente[id];
            return siguiente;
        });
    }

    async function reintentar(error) {
        if (refEnCurso.current.has(error.id)) return;
        refEnCurso.current.add(error.id);
        cambiarEn(setOcupados, error.id, 'reintentando');
        cambiarEn(setMensajes, error.id, null);
        setAviso(null);
        try {
            const resultado = await reintentarErrorSync(error.id);
            setAviso(avisoDeReintento(error, resultado || {}));
        } catch (err) {
            console.error('El reintento de sincronización falló:', err);
            cambiarEn(setMensajes, error.id, 'No se pudo reintentar. Intenta de nuevo en un momento.');
        } finally {
            refEnCurso.current.delete(error.id);
            cambiarEn(setOcupados, error.id, null);
        }
    }

    async function descartar() {
        const error = porDescartar;
        if (!error || refEnCurso.current.has(error.id)) return;
        refEnCurso.current.add(error.id);
        cambiarEn(setOcupados, error.id, 'descartando');
        try {
            await descartarErrorSync(error.id);
            setErrores((prev) => (prev ? prev.filter((e) => e.id !== error.id) : prev));
        } catch (err) {
            console.error('No se pudo descartar el error de sincronización:', err);
            cambiarEn(setMensajes, error.id, 'No se pudo descartar. Intenta de nuevo.');
        } finally {
            refEnCurso.current.delete(error.id);
            cambiarEn(setOcupados, error.id, null);
            setPorDescartar(null);
        }
    }

    const cuantos = errores?.length ?? 0;
    const Aviso = aviso ? TONO_AVISO[aviso.tono] : null;

    let cuerpo;
    if (errores === null && falloCarga) {
        cuerpo = <p className="empty-state">No se pudo leer la lista de cambios rechazados.</p>;
    } else if (errores === null) {
        cuerpo = (
            <div className="space-y-3 p-4 sm:p-5" aria-busy="true">
                <div className="skeleton h-16" />
                <div className="skeleton h-16" />
            </div>
        );
    } else if (cuantos === 0) {
        cuerpo = (
            <div className="empty-state">
                <CircleCheck size={28} className="mx-auto mb-2 text-pos" aria-hidden="true" />
                <p className="font-semibold text-ink">No hay cambios rechazados</p>
                <p className="mt-1">Todo lo que se intentó subir quedó guardado o sigue en la cola.</p>
            </div>
        );
    } else {
        cuerpo = (
            <>
                <p className="eyebrow px-4 pt-3 sm:px-5">
                    {cuantos === 1 ? '1 cambio rechazado' : `${cuantos} cambios rechazados`}
                </p>
                <ul className="divide-y divide-line">
                    {errores.map((error) => (
                        <FilaError
                            key={error.id}
                            error={error}
                            ocupado={ocupados[error.id]}
                            mensajeFila={mensajes[error.id]}
                            onReintentar={reintentar}
                            onDescartar={pedirDescarte}
                        />
                    ))}
                </ul>
            </>
        );
    }

    return (
        <div className="modal-backdrop" {...propsVelo}>
            <div
                ref={refDialogo}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                aria-describedby={idDescripcion}
                tabIndex={-1}
                className="modal-sheet flex flex-col outline-none animate-fade-in"
                style={{ maxWidth: 640 }}
            >
                <div className="flex flex-shrink-0 items-start gap-3 border-b border-line py-3 pl-4 pr-2 sm:pl-5">
                    <div className="min-w-0 flex-1">
                        <h2 id={idTitulo} className="text-[17px] font-semibold leading-snug text-ink">
                            Cambios sin guardar en la nube
                        </h2>
                        <p id={idDescripcion} className="mt-0.5 text-sm text-ink-2">
                            La nube rechazó estos cambios. Reintenta cuando se corrija la causa, o
                            descártalos si ya no hacen falta.
                        </p>
                    </div>
                    <button type="button" onClick={onCerrar} className="btn-icon flex-shrink-0" aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div role="status" aria-live="polite">
                        {aviso && Aviso && (
                            <p className={`mx-4 mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-sm font-medium sm:mx-5 ${Aviso.clase}`}>
                                <Aviso.icono size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                                <span>{aviso.texto}</span>
                            </p>
                        )}
                    </div>
                    {cuerpo}
                </div>

                <div className="flex flex-shrink-0 justify-end border-t border-line bg-surface-2 px-4 py-3 sm:px-5">
                    <button type="button" onClick={onCerrar} className="btn-secondary w-full sm:w-auto">
                        Cerrar
                    </button>
                </div>
                <div aria-hidden="true" className="flex-shrink-0 bg-surface-2" style={{ height: 'env(safe-area-inset-bottom)' }} />
            </div>

            <ConfirmModal
                isOpen={Boolean(porDescartar)}
                title="Descartar este cambio"
                message={porDescartar?.ajustesQuedan?.length
                    ? 'Se perderá este movimiento, pero el cambio de saldo que ya subió a la nube se queda: la caja quedará descuadrada en ese monto. Después de descartarlo, registra un movimiento de ajuste. No se puede deshacer.'
                    : 'Se perderá este cambio: no se volverá a intentar subir y, al sincronizar, este dispositivo quedará igual que la nube, sin él. No se puede deshacer.'}
                details={porDescartar ? [
                    {
                        label: etiquetaDe(porDescartar),
                        value: resumenDeDatos(porDescartar.datos).join(' · ') || 'Sin detalle',
                    },
                    ...(porDescartar.ajustesQuedan || []).map((ajuste) => ({
                        label: `Saldo que queda aplicado en ${ajuste.cajaNombre || 'una caja'}`,
                        value: formatoMoneda(ajuste.delta, { signo: true }),
                    })),
                ] : undefined}
                confirmText="Descartar cambio"
                cancelText="Conservar"
                type="danger"
                procesando={Boolean(porDescartar && ocupados[porDescartar.id])}
                textoProcesando="Descartando..."
                onConfirm={descartar}
                onCancel={() => setPorDescartar(null)}
            />
        </div>
    );
}

/** Contrato C7: ErroresSyncPanel({ abierto, onCerrar }). */
export default function ErroresSyncPanel({ abierto, onCerrar }) {
    // Se monta de cero en cada apertura: la lista siempre se lee fresca y no
    // queda a la vista, ni un instante, la de la vez anterior.
    if (!abierto) return null;
    return <Panel onCerrar={onCerrar} />;
}
