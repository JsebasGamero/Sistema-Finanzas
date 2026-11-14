// Marco común de las pantallas sin sesión (entrar, definir contraseña nueva):
// hoja centrada sobre papel cuadriculado de plano, marca arriba y, fuera de
// producción, una etiqueta con el entorno y la base a la que se conecta.
import Marca from './Marca';
import { ES_PRODUCCION, ETIQUETA_ENTORNO, hostSupabase } from '../services/entorno';

const ANIO_ACTUAL = new Date().getFullYear();

export default function PantallaAcceso({ children }) {
    const host = hostSupabase();

    return (
        <div className="fondo-plano h-full overflow-y-auto">
            <div className="flex min-h-full flex-col items-center px-4 py-8 sm:py-12">
                <div className="my-auto w-full max-w-[400px]">
                    <div className="mb-5">
                        <Marca tam={32} tamTexto={18} />
                        {!ES_PRODUCCION && ETIQUETA_ENTORNO && (
                            <p className="mt-3 flex">
                                <span className="chip chip-info max-w-full overflow-hidden" title={host || undefined}>
                                    <span className="flex-shrink-0">{ETIQUETA_ENTORNO}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className={`min-w-0 truncate ${host ? 'mono' : ''}`}>
                                        {host || 'sin base de datos'}
                                    </span>
                                </span>
                            </p>
                        )}
                    </div>

                    {children}
                </div>

                <footer className="mt-8 text-xs text-ink-3">
                    FinanzasObra · {ANIO_ACTUAL}
                </footer>
            </div>
        </div>
    );
}
