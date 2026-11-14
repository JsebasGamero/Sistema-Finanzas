// Definir la contraseña nueva después de abrir el enlace de recuperación
// (ADM-5). Antes el enlace solo iniciaba sesión: la persona entraba a la app
// sin cambiar nada y, como "Cambiar contraseña" pide la actual (la que
// olvidó), quedaba atrapada. Aquí no se pide la actual: el enlace ya probó
// que el correo es suyo.
//
// Contrato (C5): onGuardar(nueva) => Promise; lanza Error con un mensaje
// para mostrar. onCancelar() abandona la recuperación.
//
// Aquí no hay estado "Contraseña guardada": completarRecuperacion apaga la
// recuperación antes de resolver y App desmonta esta pantalla en ese mismo
// render, así que nunca se veía. La confirmación le toca a quien pasa
// onGuardar (un aviso en App).
import { useId, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import CampoContrasena from './CampoContrasena';
import PantallaAcceso from './PantallaAcceso';
import { MINIMO_CONTRASENA } from '../context/reglasContrasena';

// Mismo mínimo que completarRecuperacion y "Cambiar contraseña".
const MINIMO = MINIMO_CONTRASENA;

export default function NuevaContrasenaScreen({ onGuardar, onCancelar }) {
    const idTitulo = useId();
    const idNueva = useId();
    const idConfirmar = useId();
    const [nueva, setNueva] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [cancelando, setCancelando] = useState(false);
    const refGuardando = useRef(false);
    const refCancelando = useRef(false);

    async function guardar(e) {
        e.preventDefault();
        if (refGuardando.current) return;

        if (nueva.length < MINIMO) {
            setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
            return;
        }
        if (nueva !== confirmar) {
            setError('Las dos contraseñas no coinciden.');
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setError('Necesitas conexión a internet para guardar la contraseña.');
            return;
        }

        refGuardando.current = true;
        setGuardando(true);
        setError('');
        try {
            await onGuardar(nueva);
        } catch (err) {
            console.error('Error al guardar la contraseña nueva:', err);
            setError(err?.message || 'No se pudo guardar la contraseña. Intenta de nuevo.');
        } finally {
            refGuardando.current = false;
            setGuardando(false);
        }
    }

    // onCancelar suele ser el logout (async): un doble toque lo lanzaba dos veces.
    async function cancelar() {
        if (refCancelando.current || refGuardando.current) return;
        refCancelando.current = true;
        setCancelando(true);
        try {
            await onCancelar?.();
        } catch (err) {
            console.error('Error al cancelar la recuperación de contraseña:', err);
        } finally {
            refCancelando.current = false;
            setCancelando(false);
        }
    }

    function limpiarError(setter) {
        return (e) => {
            setter(e.target.value);
            setError('');
        };
    }

    return (
        <PantallaAcceso>
            <section aria-labelledby={idTitulo} className="rounded-[10px] border border-line bg-surface p-5 sm:p-6">
                <header>
                    <h1 id={idTitulo} className="text-2xl font-bold leading-tight tracking-[-0.02em] text-ink">
                        Define tu nueva contraseña
                    </h1>
                    <p className="mt-1 text-sm text-ink-2">
                        Abriste el enlace de recuperación. Escribe la contraseña con la que vas a entrar
                        de ahora en adelante.
                    </p>
                </header>

                <form onSubmit={guardar} noValidate className="mt-6 space-y-4">
                    <CampoContrasena
                        id={idNueva}
                        etiqueta="Contraseña nueva"
                        value={nueva}
                        onChange={limpiarError(setNueva)}
                        autoComplete="new-password"
                        minLength={MINIMO}
                        ayuda={`Mínimo ${MINIMO} caracteres.`}
                        invalido={Boolean(error) && nueva.length < MINIMO}
                        autoFocus
                        disabled={guardando}
                    />
                    <CampoContrasena
                        id={idConfirmar}
                        etiqueta="Repite la contraseña"
                        value={confirmar}
                        onChange={limpiarError(setConfirmar)}
                        autoComplete="new-password"
                        invalido={Boolean(error) && nueva !== confirmar}
                        disabled={guardando}
                    />

                    {error && (
                        <div role="alert" className="flex items-start gap-2 rounded-md bg-neg-soft px-3 py-2.5 text-sm font-medium text-neg">
                            <CircleAlert size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-1">
                        <button type="submit" disabled={guardando || cancelando} className="btn-primary w-full">
                            {guardando ? (
                                <>
                                    <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                                    Guardando...
                                </>
                            ) : 'Guardar contraseña'}
                        </button>
                        <button type="button" onClick={cancelar} disabled={guardando || cancelando} className="btn-secondary w-full">
                            {cancelando ? 'Saliendo...' : 'Cancelar'}
                        </button>
                    </div>
                </form>
            </section>
        </PantallaAcceso>
    );
}
