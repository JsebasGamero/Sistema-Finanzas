// Panel de reportes: lee los datos UNA vez (useDatosReportes) y los pasa a
// cada pestaña. Antes cada pestaña cargaba sus tablas y buscaba nombres con
// .find() en bucles, y los filtros vivían arriba aunque solo Movimientos los
// aplicaba (REP-5). Ahora cada pestaña tiene sus filtros y su exportación
// (REP-9: "Exportar PDF" sacaba Movimientos desde cualquier pestaña).
import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CircleAlert, HandCoins, HardHat, LayoutDashboard, ListOrdered, RefreshCw, Table2, Users, Wallet } from 'lucide-react';
import { useDatosReportes } from './useDatosReportes';
import { guardarPreferencia, leerPreferencia } from './comunes/preferencias';
import ReporteMovimientos from './movimientos/ReporteMovimientos';
import ReporteObras from './obras/ReporteObras';
import ReporteProveedores from './proveedores/ReporteProveedores';
import ReporteCajas from './cajas/ReporteCajas';
import ReporteDeudas from './deudas/ReporteDeudas';

// Las dos pestañas pesadas (Recharts y AG-Grid) se cargan al abrirlas.
//
// App precarga este módulo, pero no estos dos chunks: en la versión web,
// abrir Resumen sin señal hace fallar el import. React.lazy recuerda ese
// fallo para siempre, y como el módulo de este panel ya quedó evaluado, el
// "Reintentar" de App recibía el mismo lazy rechazado: Reportes quedaba
// inservible hasta recargar la app. Por eso cada pestaña diferida guarda su
// lazy en un objeto que se puede reiniciar (igual que cargaDiferida en
// App.jsx), y el panel tiene su propio límite de error (LimitePestana).
function pestanaDiferida(importar) {
    const diferida = {
        Componente: lazy(importar),
        reiniciar() {
            diferida.Componente = lazy(importar);
        },
    };
    return diferida;
}

const RESUMEN_TABLERO = pestanaDiferida(() => import('./resumen/ResumenTablero'));
const EXPLORADOR_TABLA = pestanaDiferida(() => import('./tabla/ExploradorTabla'));

const PESTANAS = [
    { id: 'resumen', nombre: 'Resumen', icono: LayoutDashboard, diferida: RESUMEN_TABLERO },
    { id: 'tabla', nombre: 'Tabla dinámica', icono: Table2, diferida: EXPLORADOR_TABLA },
    { id: 'movimientos', nombre: 'Movimientos', icono: ListOrdered, Componente: ReporteMovimientos },
    { id: 'obras', nombre: 'Obras', icono: HardHat, Componente: ReporteObras },
    { id: 'proveedores', nombre: 'Proveedores', icono: Users, Componente: ReporteProveedores },
    { id: 'cajas', nombre: 'Cajas', icono: Wallet, Componente: ReporteCajas },
    { id: 'deudas', nombre: 'Deudas', icono: HandCoins, Componente: ReporteDeudas },
];

const CLAVE_PESTANA = 'finanzasobra.reportes.pestana';

function pestanaGuardada() {
    const id = leerPreferencia(CLAVE_PESTANA, PESTANAS[0].id);
    return PESTANAS.some((p) => p.id === id) ? id : PESTANAS[0].id;
}

function Cargando() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando reporte">
            <div className="skeleton h-20" />
            <div className="skeleton h-24" />
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="skeleton h-64" />
                <div className="skeleton h-64" />
            </div>
        </div>
    );
}

/**
 * Límite de error de la pestaña activa. Deja visible la tira de pestañas:
 * si Resumen no se pudo descargar, el usuario todavía puede ir a
 * Movimientos. Sin él, el error subía al LimiteDeCarga de App, que
 * reemplazaba el panel entero. Se monta con key `${pestana}-${intento}`, así
 * que cambiar de pestaña o reintentar empieza sin el error anterior.
 */
class LimitePestana extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        console.error('No se pudo abrir la pestaña de reportes:', error);
    }

    render() {
        if (!this.state.error) return this.props.children;
        const sinSenal = typeof navigator !== 'undefined' && !navigator.onLine;
        return (
            <div className="card flex items-start gap-3" role="alert">
                <CircleAlert size={20} className="text-neg shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="font-semibold text-ink">No se pudo abrir la pestaña {this.props.nombre}.</p>
                    <p className="text-sm text-ink-2 mt-1">
                        {sinSenal
                            ? 'Sin conexión: esta pestaña se descarga la primera vez que se abre. Intenta de nuevo cuando tengas señal; las demás pestañas siguen disponibles.'
                            : 'Ocurrió un error al cargarla. Intenta de nuevo.'}
                    </p>
                    <button type="button" className="btn-secondary mt-3" onClick={this.props.onReintentar}>
                        <RefreshCw size={16} aria-hidden="true" />
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }
}

export default function ReportesPanel() {
    const datos = useDatosReportes();
    const [activa, setActiva] = useState(pestanaGuardada);
    const [intento, setIntento] = useState(0);
    const botones = useRef(new Map());

    const tira = useRef(null);

    // A 320 px la tira de pestañas se desplaza: si se recuerda "Deudas", la
    // pestaña activa quedaría fuera de la pantalla al abrir Reportes. Se mueve
    // solo la tira; scrollIntoView también desplazaba el documento entero.
    useEffect(() => {
        const boton = botones.current.get(activa);
        const lista = tira.current;
        if (!boton || !lista) return;
        const b = boton.getBoundingClientRect();
        const l = lista.getBoundingClientRect();
        if (b.left < l.left) lista.scrollLeft -= l.left - b.left + 16;
        else if (b.right > l.right) lista.scrollLeft += b.right - l.right + 16;
    }, [activa]);

    function elegir(id, enfocar = false) {
        setActiva(id);
        guardarPreferencia(CLAVE_PESTANA, id);
        if (enfocar) botones.current.get(id)?.focus();
    }

    // Flechas, Inicio y Fin entre pestañas (patrón ARIA de tablist).
    function alTeclear(evento) {
        const indice = PESTANAS.findIndex((p) => p.id === activa);
        let destino = null;
        if (evento.key === 'ArrowRight') destino = (indice + 1) % PESTANAS.length;
        else if (evento.key === 'ArrowLeft') destino = (indice - 1 + PESTANAS.length) % PESTANAS.length;
        else if (evento.key === 'Home') destino = 0;
        else if (evento.key === 'End') destino = PESTANAS.length - 1;
        if (destino === null) return;
        evento.preventDefault();
        elegir(PESTANAS[destino].id, true);
    }

    const pestana = PESTANAS.find((p) => p.id === activa) ?? PESTANAS[0];
    // Se lee en cada render: después de reiniciar, la pestaña diferida trae
    // un lazy nuevo que vuelve a intentar la descarga.
    const Componente = pestana.diferida ? pestana.diferida.Componente : pestana.Componente;

    function reintentarPestana() {
        pestana.diferida?.reiniciar();
        setIntento((n) => n + 1);
    }

    return (
        <div className="space-y-4">
            <div className="section-header">
                <div>
                    <h2 className="section-title">Reportes</h2>
                    <p className="section-subtitle">
                        Cifras de este dispositivo; se actualizan solas al sincronizar.
                    </p>
                </div>
            </div>

            <div
                ref={tira}
                role="tablist"
                aria-label="Tipo de reporte"
                className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap"
                onKeyDown={alTeclear}
            >
                {PESTANAS.map(({ id, nombre, icono }) => {
                    const Icono = icono;
                    const seleccionada = id === pestana.id;
                    return (
                        <button
                            key={id}
                            ref={(nodo) => {
                                if (nodo) botones.current.set(id, nodo);
                                else botones.current.delete(id);
                            }}
                            type="button"
                            role="tab"
                            id={`reportes-tab-${id}`}
                            aria-selected={seleccionada}
                            aria-controls="reportes-panel"
                            tabIndex={seleccionada ? 0 : -1}
                            className={`tab-pill shrink-0 ${seleccionada ? 'active' : ''}`}
                            onClick={() => elegir(id)}
                        >
                            <Icono size={15} aria-hidden="true" />
                            {nombre}
                        </button>
                    );
                })}
            </div>

            <div id="reportes-panel" role="tabpanel" aria-labelledby={`reportes-tab-${pestana.id}`}>
                {datos.error ? (
                    <div className="card flex items-start gap-3" role="alert">
                        <CircleAlert size={20} className="text-neg shrink-0 mt-0.5" aria-hidden="true" />
                        <div>
                            <p className="font-semibold text-ink">No se pudieron leer los datos de este dispositivo.</p>
                            <p className="text-sm text-ink-2 mt-1">
                                Cierra y vuelve a abrir la app. Si sigue igual, revisa que el teléfono tenga espacio libre.
                            </p>
                        </div>
                    </div>
                ) : datos.cargando ? (
                    <Cargando />
                ) : (
                    <LimitePestana key={`${pestana.id}-${intento}`} nombre={pestana.nombre} onReintentar={reintentarPestana}>
                        <Suspense fallback={<Cargando />}>
                            <Componente datos={datos} />
                        </Suspense>
                    </LimitePestana>
                )}
            </div>
        </div>
    );
}
