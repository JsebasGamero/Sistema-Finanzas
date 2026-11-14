// Diálogo de confirmación reutilizable (reemplaza a confirm() nativo).
//
// API compatible con la anterior: isOpen, title, message, details,
// confirmText, cancelText, type ('default' | 'danger' | 'success'),
// onConfirm, onCancel. Nuevo y opcional:
// - procesando: deshabilita los dos botones y muestra textoProcesando.
// - textoProcesando: por defecto 'Procesando...'.
// Si onConfirm devuelve una promesa, el modal se pone en "procesando" solo
// mientras se resuelve: un segundo toque sobre "Sí, eliminar" ya no dispara
// el borrado dos veces.
import { useId, useRef, useState } from 'react';
import { X, Check, TriangleAlert, LoaderCircle } from 'lucide-react';
import useDialogo from '../hooks/useDialogo';

const TONOS = {
    default: { icono: TriangleAlert, marca: 'bg-warn-soft text-warn', boton: 'btn-primary' },
    danger: { icono: TriangleAlert, marca: 'bg-neg-soft text-neg', boton: 'btn-danger' },
    success: { icono: Check, marca: 'bg-pos-soft text-pos', boton: 'btn-primary' },
};

export default function ConfirmModal({
    isOpen,
    title,
    message,
    details,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'default',
    onConfirm,
    onCancel,
    procesando = false,
    textoProcesando = 'Procesando...',
}) {
    const idTitulo = useId();
    const idMensaje = useId();
    const refCancelar = useRef(null);
    const refEnCurso = useRef(false);
    const [confirmando, setConfirmando] = useState(false);
    const ocupado = procesando || confirmando;

    // El foco inicial va al botón seguro: un Enter accidental no borra nada.
    const { refDialogo, propsVelo } = useDialogo({
        abierto: Boolean(isOpen),
        onCerrar: onCancel,
        bloqueado: ocupado,
        refFocoInicial: refCancelar,
    });

    if (!isOpen) return null;

    const tono = TONOS[type] || TONOS.default;
    const Icono = tono.icono;

    async function confirmar() {
        if (refEnCurso.current || ocupado) return;
        refEnCurso.current = true;
        try {
            const resultado = onConfirm?.();
            if (resultado && typeof resultado.then === 'function') {
                setConfirmando(true);
                await resultado;
            }
        } catch (error) {
            // Quien abrió el modal es responsable de mostrar su error; aquí
            // solo se evita una promesa rechazada sin manejar.
            console.error('Error al confirmar la acción:', error);
        } finally {
            refEnCurso.current = false;
            setConfirmando(false);
        }
    }

    return (
        <div className="modal-backdrop" {...propsVelo}>
            <div
                ref={refDialogo}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                aria-describedby={message ? idMensaje : undefined}
                tabIndex={-1}
                className="modal-sheet animate-fade-in outline-none"
            >
                <div className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                    <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${tono.marca}`}
                    >
                        <Icono size={18} strokeWidth={2.25} />
                    </span>
                    <h2 id={idTitulo} className="min-w-0 flex-1 pt-1.5 text-[17px] font-semibold leading-snug text-ink">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={ocupado}
                        className="btn-icon -mr-2 -mt-1 flex-shrink-0 disabled:opacity-50"
                        aria-label="Cerrar"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="px-4 pb-4 pt-2 sm:px-5 sm:pl-[68px]">
                    {message && (
                        <div id={idMensaje} className="text-sm leading-relaxed text-ink-2">
                            {message}
                        </div>
                    )}

                    {details?.length > 0 && (
                        <dl className="mt-4 divide-y divide-line rounded-md border border-line">
                            {details.map((detalle, i) => (
                                <div key={i} className="flex items-baseline justify-between gap-4 px-3 py-2 text-sm">
                                    <dt className="text-ink-3">{detalle.label}</dt>
                                    <dd className={`num min-w-0 text-right break-words ${detalle.highlight ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                                        {detalle.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
                    <button
                        ref={refCancelar}
                        type="button"
                        onClick={onCancel}
                        disabled={ocupado}
                        className="btn-secondary w-full sm:w-auto"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={confirmar}
                        disabled={ocupado}
                        aria-busy={ocupado || undefined}
                        className={`${tono.boton} w-full sm:w-auto`}
                    >
                        {ocupado ? (
                            <>
                                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                                {textoProcesando}
                            </>
                        ) : confirmText}
                    </button>
                </div>
                {/* Hoja inferior en móvil: que los botones no queden bajo la barra de gestos. */}
                <div aria-hidden="true" className="bg-surface-2" style={{ height: 'env(safe-area-inset-bottom)' }} />
            </div>
        </div>
    );
}
