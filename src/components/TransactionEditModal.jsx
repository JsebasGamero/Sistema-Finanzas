// Edición de un movimiento existente. Usa los mismos controles y la misma
// validación que el alta (CamposMovimiento) para que las reglas no diverjan.
import { useEffect, useId, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { Loader2, Lock, Save, X } from 'lucide-react';
import { db } from '../services/db';
import { resolverNombreCategoria } from '../services/categorias';
import { useAuth } from '../context/useAuth';
import { MovimientoInvalidoError } from '../domain/errores';
import { esMovimientoDeDeuda } from '../domain/rules/movimientoDeDeuda';
import { TIPO_MOVIMIENTO } from '../domain/value-objects/tipoMovimiento';
import { aMonto } from '../domain/value-objects/dinero';
import { claveDia, hoyLocal } from '../domain/value-objects/fecha';
import { formatoFecha, formatoMoneda } from '../presentation/formato';
import ConfirmModal from './ConfirmModal';
import { CamposMovimiento, ResumenErrores } from './TransactionForm';

const TIPOS = {
    INGRESO: { etiqueta: 'Ingreso', marca: 'I', clase: 'ingreso' },
    EGRESO: { etiqueta: 'Egreso', marca: 'E', clase: 'egreso' },
    TRANSFERENCIA: { etiqueta: 'Transferencia', marca: 'T', clase: 'transferencia' },
};

const CAMPOS_EDITABLES = [
    'monto', 'fecha', 'caja_origen_id', 'caja_destino_id', 'categoria',
    'proyecto_id', 'tercero_id', 'descripcion', 'soporte_url',
];

const SIN_SENAL_EDICION = 'Sin señal no se puede subir la foto. Vuelve a intentarlo cuando tengas conexión.';

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]):not([type=file]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ordenarPorNombre(lista) {
    return [...lista].sort((a, b) =>
        String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es', { sensitivity: 'base' }));
}

function valoresDe(tx) {
    const hayMonto = tx.monto !== null && tx.monto !== undefined && tx.monto !== '';
    return {
        tipo_movimiento: tx.tipo_movimiento || TIPO_MOVIMIENTO.EGRESO,
        // Pesos enteros en el campo. Antes 1500.5 se mostraba como "15.005"
        // y, si se tocaba el campo, se guardaba multiplicado (bug MOV-3).
        monto: hayMonto ? String(Math.round(aMonto(tx.monto))) : '',
        // Bug MOV-1: el respaldo usaba la fecha UTC (de noche, "mañana").
        fecha: claveDia(tx.fecha) || hoyLocal(),
        caja_origen_id: tx.caja_origen_id || '',
        caja_destino_id: tx.caja_destino_id || '',
        categoria: tx.categoria || '',
        proyecto_id: tx.proyecto_id || '',
        tercero_id: tx.tercero_id || '',
        descripcion: tx.descripcion || '',
        soporte_url: tx.soporte_url || null,
    };
}

function valorParaGuardar(campo, valor) {
    if (campo === 'monto') return Number(valor || 0);
    if (['proyecto_id', 'tercero_id', 'caja_destino_id', 'soporte_url'].includes(campo)) return valor || null;
    return valor;
}

function quitarClaves(objeto, claves) {
    if (!claves.some((clave) => clave in objeto)) return objeto;
    const copia = { ...objeto };
    for (const clave of claves) delete copia[clave];
    return copia;
}

export default function TransactionEditModal({ isOpen, transaction, onSave, onClose }) {
    if (!isOpen || !transaction) return null;
    // Montar de cero en cada apertura: el error del movimiento anterior ya no
    // aparece al abrir otro (bug MOV-10).
    return <HojaEdicion key={transaction.id} transaction={transaction} onSave={onSave} onClose={onClose} />;
}

function HojaEdicion({ transaction, onSave, onClose }) {
    const { currentUser } = useAuth();
    const idBase = useId();
    const idTitulo = `${idBase}-titulo`;
    const esDeDeuda = esMovimientoDeDeuda(transaction);
    const tipo = TIPOS[transaction.tipo_movimiento] ?? TIPOS.EGRESO;

    const [inicial] = useState(() => valoresDe(transaction));
    const [valores, setValores] = useState(inicial);
    const [errores, setErrores] = useState({});
    const [errorGeneral, setErrorGeneral] = useState('');
    const [catalogos, setCatalogos] = useState({ cajas: [], proyectos: [], terceros: [], categorias: [] });
    const [subiendo, setSubiendo] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

    const hojaRef = useRef(null);
    const camposRef = useRef(null);
    const guardandoRef = useRef(false);
    const toqueEnFondoRef = useRef(false);

    const sucio = !esDeDeuda && CAMPOS_EDITABLES.some((campo) => valores[campo] !== inicial[campo]);

    useEffect(() => {
        if (esDeDeuda) return undefined;
        const suscripcion = liveQuery(() => Promise.all([
            db.cajas.toArray(),
            db.proyectos.toArray(),
            db.terceros.toArray(),
            db.categorias.toArray(),
        ])).subscribe({
            next: ([cajas, proyectos, terceros, categorias]) => setCatalogos({
                cajas: ordenarPorNombre(cajas),
                proyectos: ordenarPorNombre(proyectos),
                terceros: ordenarPorNombre(terceros),
                categorias: ordenarPorNombre(categorias),
            }),
            error: (error) => console.error('No se pudieron leer los catálogos:', error),
        });
        return () => suscripcion.unsubscribe();
    }, [esDeDeuda]);

    // El foco entra al diálogo (sin abrir el teclado del celular) y vuelve a
    // donde estaba al cerrar.
    useEffect(() => {
        const previo = document.activeElement;
        hojaRef.current?.focus();
        return () => {
            if (previo && typeof previo.focus === 'function' && document.contains(previo)) previo.focus();
        };
    }, []);

    function pedirCierre() {
        if (guardandoRef.current) return;
        // Bug MOV-18: un toque fuera del modal descartaba la edición sin
        // preguntar.
        if (sucio) setConfirmandoDescarte(true);
        else onClose();
    }

    useEffect(() => {
        function alTeclear(e) {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            if (confirmandoDescarte) {
                setConfirmandoDescarte(false);
                return;
            }
            // Si hay otro diálogo encima (la vista previa del soporte), el
            // Escape es para él, no para cerrar la edición.
            const dialogos = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
            if (dialogos.length > 0 && dialogos[dialogos.length - 1] !== hojaRef.current) return;
            if (guardandoRef.current) return;
            if (sucio) setConfirmandoDescarte(true);
            else onClose();
        }
        document.addEventListener('keydown', alTeclear);
        return () => document.removeEventListener('keydown', alTeclear);
    }, [confirmandoDescarte, sucio, onClose]);

    function atraparFoco(e) {
        if (e.key !== 'Tab' || !hojaRef.current) return;
        const enfocables = Array.from(hojaRef.current.querySelectorAll(ENFOCABLES))
            .filter((el) => el.offsetParent !== null);
        if (enfocables.length === 0) return;
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        const actual = document.activeElement;
        if (e.shiftKey && (actual === primero || actual === hojaRef.current)) {
            e.preventDefault();
            ultimo.focus();
        } else if (!e.shiftKey && actual === ultimo) {
            e.preventDefault();
            primero.focus();
        }
    }

    function alCambiar(parcial) {
        setValores((v) => {
            const nuevo = { ...v, ...parcial };
            // Bug MOV-13: el destino no puede ser el nuevo origen.
            if ('caja_origen_id' in parcial && parcial.caja_origen_id && parcial.caja_origen_id === v.caja_destino_id) {
                nuevo.caja_destino_id = '';
            }
            return nuevo;
        });
        setErrores((e) => quitarClaves(e, Object.keys(parcial)));
        setErrorGeneral('');
    }

    function alErrorCampo(campo, mensaje) {
        setErrores((e) => (mensaje ? { ...e, [campo]: mensaje } : quitarClaves(e, [campo])));
    }

    function alCrearCatalogo(tabla, fila) {
        setCatalogos((c) => (c[tabla].some((f) => f.id === fila.id) ? c : { ...c, [tabla]: [...c[tabla], fila] }));
    }

    function construirDatos() {
        // Solo se escribe lo que el usuario cambió: un monto viejo con
        // decimales o una categoría guardada como UUID se conservan tal cual
        // si no se tocaron.
        const datos = { ...transaction, editado_por: currentUser?.nombre || 'Desconocido' };
        for (const campo of CAMPOS_EDITABLES) {
            if (valores[campo] !== inicial[campo]) datos[campo] = valorParaGuardar(campo, valores[campo]);
        }
        return datos;
    }

    async function guardar(e) {
        e.preventDefault();
        if (guardandoRef.current || subiendo) return;
        const datos = construirDatos();
        const encontrados = camposRef.current?.validar(datos) ?? {};
        if (Object.keys(encontrados).length > 0) {
            setErrores(encontrados);
            camposRef.current?.enfocarPrimero(encontrados);
            return;
        }
        guardandoRef.current = true;
        setGuardando(true);
        setErrores({});
        setErrorGeneral('');
        try {
            await onSave(datos);
            onClose();
        } catch (error) {
            if (error instanceof MovimientoInvalidoError) {
                const porCampo = {};
                for (const err of error.errores ?? []) {
                    if (!porCampo[err.campo]) porCampo[err.campo] = err.mensaje;
                }
                setErrores(porCampo);
                camposRef.current?.enfocarPrimero(porCampo);
            } else {
                console.error('No se pudo guardar la edición:', error);
                setErrorGeneral('No se pudo guardar el cambio. Intenta de nuevo.');
            }
        } finally {
            guardandoRef.current = false;
            setGuardando(false);
        }
    }

    const pieConSafeArea = { paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' };

    return (
        <div
            className="modal-backdrop"
            // Solo cuenta un toque que empieza y termina en el fondo: arrastrar
            // desde un campo hasta afuera no debe cerrar.
            onPointerDown={(e) => { toqueEnFondoRef.current = e.target === e.currentTarget; }}
            onClick={(e) => {
                if (e.target === e.currentTarget && toqueEnFondoRef.current) pedirCierre();
            }}
        >
            <div
                ref={hojaRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                tabIndex={-1}
                onKeyDown={atraparFoco}
                className="modal-sheet"
                // Encabezado y pie fijos; solo el cuerpo hace scroll, así el
                // botón de guardar sigue a la vista con el teclado abierto.
                style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none' }}
            >
                <header className="panel-head">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`tipo-mark ${tipo.clase}`} aria-hidden="true">{tipo.marca}</span>
                        <div className="min-w-0">
                            <h2 id={idTitulo} className="panel-title">
                                {esDeDeuda ? tipo.etiqueta : `Editar ${tipo.etiqueta.toLowerCase()}`}
                            </h2>
                            {transaction.usuario_nombre && (
                                <p className="truncate text-xs text-ink-3">Registrado por {transaction.usuario_nombre}</p>
                            )}
                        </div>
                    </div>
                    <button type="button" className="btn-icon shrink-0" aria-label="Cerrar" onClick={pedirCierre} disabled={guardando}>
                        <X size={20} aria-hidden="true" />
                    </button>
                </header>

                {esDeDeuda ? (
                    <>
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
                            <div className="flex items-start gap-3 rounded-md border border-line bg-surface-2 p-3">
                                <Lock size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
                                <p className="text-sm text-ink-2">
                                    Este movimiento pertenece a una deuda. Adminístralo desde Deudas.
                                </p>
                            </div>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                                <dt className="text-ink-3">Monto</dt>
                                <dd className="amount text-right">{formatoMoneda(transaction.monto)}</dd>
                                <dt className="text-ink-3">Fecha</dt>
                                <dd className="text-right">{formatoFecha(transaction.fecha)}</dd>
                                <dt className="text-ink-3">Categoría</dt>
                                <dd className="text-right">{resolverNombreCategoria(transaction.categoria)}</dd>
                            </dl>
                        </div>
                        <footer className="border-t border-line px-4 pt-3 sm:px-5" style={pieConSafeArea}>
                            <button type="button" className="btn-secondary w-full" onClick={onClose}>
                                Cerrar
                            </button>
                        </footer>
                    </>
                ) : (
                    <form onSubmit={guardar} noValidate className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                            <CamposMovimiento
                                ref={camposRef}
                                idBase={idBase}
                                valores={valores}
                                onCambio={alCambiar}
                                errores={errores}
                                onErrorCampo={alErrorCampo}
                                onSubiendo={setSubiendo}
                                catalogos={catalogos}
                                onCatalogoCreado={alCrearCatalogo}
                                usuarioId={currentUser?.id}
                                mensajeSinSenalSoporte={SIN_SENAL_EDICION}
                            />
                        </div>
                        <footer className="border-t border-line bg-surface px-4 pt-3 sm:px-5" style={pieConSafeArea}>
                            <ResumenErrores idBase={idBase} errores={errores} errorGeneral={errorGeneral} />
                            <div className="flex gap-2">
                                <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={guardando}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary flex-1" disabled={guardando || subiendo}>
                                    {guardando || subiendo ? (
                                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                                    ) : (
                                        <Save size={18} aria-hidden="true" />
                                    )}
                                    {guardando ? 'Guardando...' : subiendo ? 'Esperando la foto...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </footer>
                    </form>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmandoDescarte}
                title="Descartar cambios"
                message="Los cambios que hiciste en este movimiento no se guardarán."
                confirmText="Descartar"
                cancelText="Seguir editando"
                type="danger"
                onConfirm={onClose}
                onCancel={() => setConfirmandoDescarte(false)}
            />
        </div>
    );
}
