// Pantalla de acceso: entrar con correo y contraseña, pedir el enlace de
// recuperación o, en un entorno sin base de datos, entrar en modo local.
import { useId, useRef, useState } from 'react';
import { ArrowLeft, CircleAlert, CircleCheck, FlaskConical, LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { SUPABASE_HABILITADO } from '../services/entorno';
import CampoContrasena from './CampoContrasena';
import PantallaAcceso from './PantallaAcceso';

const SIN_CONFIGURACION =
    'Esta instalación no tiene conexión configurada con el servidor. Avisa al administrador.';

function sinRed() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Mensajes para la persona, no códigos: qué pasó y qué hacer.
function mensajeErrorAlEntrar(error) {
    const texto = error?.message || '';
    if (!SUPABASE_HABILITADO) return SIN_CONFIGURACION;
    if (sinRed()) return 'Sin conexión a internet. Conéctate para entrar.';
    if (/invalid login credentials/i.test(texto)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/i.test(texto)) {
        return 'Tu correo todavía no está confirmado. Busca el mensaje de confirmación en tu bandeja de entrada.';
    }
    if (error?.status === 429 || /rate limit|too many/i.test(texto)) {
        return 'Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.';
    }
    if (/failed to fetch|network/i.test(texto)) {
        return 'No se pudo conectar con el servidor. Revisa la conexión e intenta de nuevo.';
    }
    return 'No se pudo iniciar sesión. Intenta de nuevo.';
}

function mensajeErrorAlRecuperar(error) {
    const texto = error?.message || '';
    if (!SUPABASE_HABILITADO) return SIN_CONFIGURACION;
    if (sinRed()) return 'Sin conexión a internet. Conéctate para pedir el enlace.';
    if (error?.status === 429 || /rate limit|too many|seconds/i.test(texto)) {
        return 'Ya se pidió un enlace hace poco. Espera un minuto antes de pedir otro.';
    }
    return 'No se pudo enviar el correo de recuperación. Intenta de nuevo.';
}

function ErrorEnLinea({ children }) {
    if (!children) return null;
    return (
        <div role="alert" className="flex items-start gap-2 rounded-md bg-neg-soft px-3 py-2.5 text-sm font-medium text-neg">
            <CircleAlert size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{children}</span>
        </div>
    );
}

function Encabezado({ id, titulo, subtitulo }) {
    return (
        <header>
            <h1 id={id} className="text-2xl font-bold leading-tight tracking-[-0.02em] text-ink">{titulo}</h1>
            {subtitulo && <p className="mt-1 text-sm text-ink-2">{subtitulo}</p>}
        </header>
    );
}

function FormularioEntrar({ correo, setCorreo, onLogin, onOlvide }) {
    const idCorreo = useId();
    const idContrasena = useId();
    const [contrasena, setContrasena] = useState('');
    const [entrando, setEntrando] = useState(false);
    const [error, setError] = useState('');
    const refEntrando = useRef(false);

    async function entrar(e) {
        e.preventDefault();
        if (refEntrando.current) return;
        if (!correo.trim() || !contrasena) {
            setError('Escribe tu correo y tu contraseña.');
            return;
        }

        refEntrando.current = true;
        setEntrando(true);
        setError('');
        try {
            await onLogin(correo.trim(), contrasena);
            // Si entra, App deja de mostrar esta pantalla.
        } catch (err) {
            console.error('Error al iniciar sesión:', err);
            setError(mensajeErrorAlEntrar(err));
        } finally {
            refEntrando.current = false;
            setEntrando(false);
        }
    }

    return (
        <form onSubmit={entrar} noValidate className="mt-6 space-y-4">
            {!SUPABASE_HABILITADO && <ErrorEnLinea>{SIN_CONFIGURACION}</ErrorEnLinea>}

            <div>
                <label htmlFor={idCorreo} className="label">Correo electrónico</label>
                <input
                    id={idCorreo}
                    type="email"
                    inputMode="email"
                    value={correo}
                    onChange={(e) => { setCorreo(e.target.value); setError(''); }}
                    className="input-field"
                    placeholder="nombre@empresa.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                    required
                />
            </div>

            <CampoContrasena
                id={idContrasena}
                etiqueta="Contraseña"
                value={contrasena}
                onChange={(e) => { setContrasena(e.target.value); setError(''); }}
                autoComplete="current-password"
            />

            <ErrorEnLinea>{error}</ErrorEnLinea>

            <button
                type="submit"
                disabled={entrando || !SUPABASE_HABILITADO}
                className="btn-primary w-full"
            >
                {entrando ? (
                    <>
                        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                        Entrando...
                    </>
                ) : 'Entrar'}
            </button>

            <div className="flex justify-center">
                <button
                    type="button"
                    onClick={onOlvide}
                    className="min-h-11 px-2 text-sm font-semibold text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
                >
                    Olvidé mi contraseña
                </button>
            </div>
        </form>
    );
}

function FormularioRecuperar({ correo, setCorreo, onVolver }) {
    const { resetPassword } = useAuth();
    const idCorreo = useId();
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState(false);
    const [error, setError] = useState('');
    const refEnviando = useRef(false);

    async function enviar(e) {
        e.preventDefault();
        if (refEnviando.current) return;
        if (!correo.trim()) {
            setError('Escribe el correo con el que entras a la app.');
            return;
        }

        refEnviando.current = true;
        setEnviando(true);
        setError('');
        try {
            await resetPassword(correo.trim());
            setEnviado(true);
        } catch (err) {
            console.error('Error al pedir el enlace de recuperación:', err);
            setError(mensajeErrorAlRecuperar(err));
        } finally {
            refEnviando.current = false;
            setEnviando(false);
        }
    }

    if (enviado) {
        return (
            <div className="mt-6 space-y-4">
                <div role="status" className="rounded-md border border-line bg-surface-2 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-pos">
                        <CircleCheck size={16} aria-hidden="true" />
                        Enlace enviado
                    </p>
                    <p className="mt-1.5 text-sm text-ink-2">
                        Revisa la bandeja de entrada de <strong className="break-all font-semibold text-ink">{correo.trim()}</strong> y
                        abre el enlace para definir una contraseña nueva. Si no llega en unos minutos, revisa el correo no deseado.
                    </p>
                </div>
                <button type="button" onClick={onVolver} className="btn-secondary w-full">
                    Volver a entrar
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={enviar} noValidate className="mt-6 space-y-4">
            <div>
                <label htmlFor={idCorreo} className="label">Correo electrónico</label>
                <input
                    id={idCorreo}
                    type="email"
                    inputMode="email"
                    value={correo}
                    onChange={(e) => { setCorreo(e.target.value); setError(''); }}
                    className="input-field"
                    placeholder="nombre@empresa.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                    required
                />
            </div>

            <ErrorEnLinea>{error}</ErrorEnLinea>

            <button type="submit" disabled={enviando || !SUPABASE_HABILITADO} className="btn-primary w-full">
                {enviando ? (
                    <>
                        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                        Enviando...
                    </>
                ) : 'Enviar enlace'}
            </button>
        </form>
    );
}

function PanelModoLocal() {
    const { entrarModoLocal } = useAuth();
    const [error, setError] = useState('');

    function entrar() {
        try {
            entrarModoLocal();
        } catch (err) {
            setError(err?.message || 'No se pudo entrar en modo local.');
        }
    }

    return (
        <div className="mt-6 space-y-4">
            <div className="rounded-md border border-line bg-surface-2 p-4">
                <p className="flex items-start gap-2 text-sm font-semibold text-ink">
                    <FlaskConical size={16} className="mt-0.5 flex-shrink-0 text-info" aria-hidden="true" />
                    Este entorno no tiene base de datos configurada
                </p>
                <p className="mt-1.5 text-sm text-ink-2">
                    Puedes probar la app con un usuario de prueba. Lo que registres se guarda solo en este
                    navegador y no llega a ninguna base de datos.
                </p>
            </div>

            <ErrorEnLinea>{error}</ErrorEnLinea>

            <button type="button" onClick={entrar} className="btn-primary w-full">
                Entrar en modo local de pruebas
            </button>

            <p className="text-xs leading-relaxed text-ink-3">
                Para usar tu proyecto de pruebas en Supabase:{' '}
                <code className="mono whitespace-nowrap text-ink-2">npm run configurar:pruebas</code>{' '}
                (ver docs/ENTORNOS.md).
            </p>
        </div>
    );
}

export default function LoginScreen({ onLogin }) {
    const { modoLocalDisponible } = useAuth();
    const idTitulo = useId();
    const [modo, setModo] = useState('entrar'); // 'entrar' | 'recuperar'
    const [correo, setCorreo] = useState('');

    const recuperando = modo === 'recuperar' && !modoLocalDisponible;

    return (
        <PantallaAcceso>
            <section aria-labelledby={idTitulo} className="rounded-[10px] border border-line bg-surface p-5 sm:p-6">
                {recuperando ? (
                    <>
                        <button
                            type="button"
                            onClick={() => setModo('entrar')}
                            className="btn-ghost -ml-4 mb-2"
                        >
                            <ArrowLeft size={16} aria-hidden="true" />
                            Volver
                        </button>
                        <Encabezado
                            id={idTitulo}
                            titulo="Recuperar contraseña"
                            subtitulo="Te enviaremos un enlace para definir una contraseña nueva."
                        />
                        <FormularioRecuperar
                            correo={correo}
                            setCorreo={setCorreo}
                            onVolver={() => setModo('entrar')}
                        />
                    </>
                ) : (
                    <>
                        <Encabezado
                            id={idTitulo}
                            titulo="Entrar"
                            subtitulo="Caja, gastos y deudas de obra, con o sin señal."
                        />
                        {modoLocalDisponible ? (
                            <PanelModoLocal />
                        ) : (
                            <FormularioEntrar
                                correo={correo}
                                setCorreo={setCorreo}
                                onLogin={onLogin}
                                onOlvide={() => setModo('recuperar')}
                            />
                        )}
                    </>
                )}
            </section>
        </PantallaAcceso>
    );
}
