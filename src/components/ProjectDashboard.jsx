// Inicio: saldos, movimiento del mes, obras, deudas abiertas y últimos
// movimientos.
//
// Lee todo con useDatosReportes (liveQuery): después de editar o borrar, o
// cuando la sincronización trae datos nuevos, la pantalla se actualiza sola.
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ArrowRight, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react';
import { editarMovimiento, borrarMovimiento } from '../app/contenedor';
import { useAuth } from '../context/useAuth';
import { MovimientoInvalidoError } from '../domain/errores';
import { useDatosReportes } from '../presentation/reportes/useDatosReportes';
import { formatoFecha, formatoMoneda, formatoPorcentaje, formatoMes } from '../presentation/formato';
import { claveDia, claveDiaDeDate, claveMes, enRango, fechaLocal, hoyLocal, sumarDias } from '../domain/value-objects/fecha';
import { aMonto, estadoDeuda, restarMontos } from '../domain/value-objects/dinero';
import { esMovimientoDeDeuda } from '../domain/rules/movimientoDeDeuda';
import { TIPO_MOVIMIENTO } from '../domain/value-objects/tipoMovimiento';
import ConfirmModal from './ConfirmModal';
import TransactionEditModal from './TransactionEditModal';
import ImagePreviewModal from './ImagePreviewModal';

const MOVIMIENTOS_INICIALES = 12;
const PAGINA_MOVIMIENTOS = 60;
const OBRAS_INICIALES = 6;

const TIPOS = {
    [TIPO_MOVIMIENTO.INGRESO]: { clase: 'ingreso', letra: 'I', texto: 'Ingreso', plural: 'Ingresos' },
    [TIPO_MOVIMIENTO.EGRESO]: { clase: 'egreso', letra: 'E', texto: 'Egreso', plural: 'Egresos' },
    [TIPO_MOVIMIENTO.TRANSFERENCIA]: { clase: 'transferencia', letra: 'T', texto: 'Transferencia', plural: 'Transferencias' },
};

const FILTROS = [
    { id: 'todos', texto: 'Todos' },
    { id: TIPO_MOVIMIENTO.INGRESO, texto: 'Ingresos' },
    { id: TIPO_MOVIMIENTO.EGRESO, texto: 'Egresos' },
    { id: TIPO_MOVIMIENTO.TRANSFERENCIA, texto: 'Transferencias' },
];

const ORDEN_ESTADO_OBRA = { activo: 0, pausado: 1, finalizado: 2 };

function instante(valor) {
    const n = Date.parse(valor ?? '');
    return Number.isFinite(n) ? n : 0;
}

/** Color del relleno según el % ejecutado del presupuesto. */
function colorEjecucion(fraccion) {
    if (fraccion > 1) return 'var(--neg)';
    if (fraccion >= 0.8) return 'var(--warn)';
    return 'var(--ink-2)';
}

function claseEjecucion(fraccion) {
    if (fraccion > 1) return 'text-neg';
    if (fraccion >= 0.8) return 'text-warn';
    return 'text-ink-3';
}

/** Primer y último día del mes calendario de `hoy`. */
function rangoDelMes(hoy) {
    const fecha = fechaLocal(hoy);
    return {
        desde: `${claveMes(hoy)}-01`,
        hasta: claveDiaDeDate(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0)),
    };
}

/**
 * Vista de cada movimiento, calculada una vez por versión de los datos. Las
 * filas reciben objetos estables y no se vuelven a pintar cuando cambia un
 * estado de la pantalla (abrir un modal, por ejemplo): antes cada cambio
 * desmontaba y montaba todas las filas del historial (DEU-14).
 *
 * En modo local no hay nube: nada se sube nunca y `sincronizado` se queda en
 * false, así que el chip "Pendiente" salía en todas las filas y contradecía
 * a la barra superior, que en ese modo no muestra pendientes.
 */
function vistaDeMovimiento(t, indices, modoLocal) {
    const tipo = TIPOS[t.tipo_movimiento] ?? { clase: '', letra: '?', texto: 'Movimiento' };
    const categoria = indices.nombreCategoria(t.categoria, '');
    const esTransferencia = t.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA;
    return {
        id: t.id,
        tx: t,
        dia: claveDia(t.fecha) || claveDia(t.created_at) || '',
        creado: instante(t.created_at),
        tipo: t.tipo_movimiento,
        claseTipo: tipo.clase,
        letra: tipo.letra,
        tipoTexto: tipo.texto,
        descripcion: t.descripcion?.trim() || categoria || tipo.texto,
        categoria,
        cajaOrigen: indices.nombreCaja(t.caja_origen_id, t.caja_origen_id ? 'Caja eliminada' : ''),
        cajaDestino: esTransferencia ? indices.nombreCaja(t.caja_destino_id, t.caja_destino_id ? 'Caja eliminada' : '') : '',
        obra: indices.nombreProyecto(t.proyecto_id, ''),
        monto: aMonto(t.monto),
        pendiente: !modoLocal && !t.sincronizado,
        deDeuda: esMovimientoDeDeuda(t),
        soporte: t.soporte_url || null,
    };
}

function etiquetaDia(dia, hoy) {
    if (!dia) return 'Sin fecha';
    if (dia === hoy) return 'Hoy';
    if (dia === sumarDias(hoy, -1)) return 'Ayer';
    return formatoFecha(dia, 'larga');
}

export default function ProjectDashboard() {
    const { currentUser } = useAuth();
    const modoLocal = Boolean(currentUser?.modoLocal);
    const datos = useDatosReportes();
    const {
        transacciones, cajas, proyectos, deudasCajas, deudasTerceros,
        nombreCaja, nombreEmpresa, cargando, error,
    } = datos;

    const [filtro, setFiltro] = useState('todos');
    const [limite, setLimite] = useState(MOVIMIENTOS_INICIALES);
    const [verTodasLasObras, setVerTodasLasObras] = useState(false);

    const [editando, setEditando] = useState(null);
    const [porBorrar, setPorBorrar] = useState(null);
    const [borrando, setBorrando] = useState(false);
    const borrandoRef = useRef(false);
    const [errorAccion, setErrorAccion] = useState('');
    const [soporte, setSoporte] = useState(null);

    // Fecha local (no UTC): de noche en Colombia toISOString() ya es mañana.
    const hoy = hoyLocal();

    // ---------------- Indicadores ----------------
    const resumen = useMemo(() => {
        const { desde, hasta } = rangoDelMes(hoy);
        let ingresosMes = 0;
        let egresosMes = 0;
        const gastadoPorObra = new Map();

        for (const t of transacciones) {
            const monto = aMonto(t.monto);
            if (t.tipo_movimiento === TIPO_MOVIMIENTO.EGRESO && t.proyecto_id) {
                gastadoPorObra.set(t.proyecto_id, (gastadoPorObra.get(t.proyecto_id) ?? 0) + monto);
            }
            // Las transferencias mueven dinero entre cajas propias: no son
            // ingreso ni egreso de la empresa.
            if (!enRango(t.fecha, desde, hasta)) continue;
            if (t.tipo_movimiento === TIPO_MOVIMIENTO.INGRESO) ingresosMes += monto;
            else if (t.tipo_movimiento === TIPO_MOVIMIENTO.EGRESO) egresosMes += monto;
        }

        let saldoCajas = 0;
        const saldoPorEmpresa = new Map();
        for (const caja of cajas) {
            const saldo = aMonto(caja.saldo_actual);
            saldoCajas += saldo;
            const clave = caja.empresa_id || '';
            saldoPorEmpresa.set(clave, (saldoPorEmpresa.get(clave) ?? 0) + saldo);
        }
        const empresasConSaldo = [...saldoPorEmpresa.entries()]
            .map(([id, saldo]) => ({ id, nombre: id ? nombreEmpresa(id, 'Empresa eliminada') : 'Sin empresa', saldo }))
            .filter((e) => Math.abs(e.saldo) >= 0.5)
            .sort((a, b) => b.saldo - a.saldo);

        let porPagar = 0;
        let deudasAbiertas = 0;
        const proveedores = new Set();
        for (const d of deudasTerceros) {
            if (estadoDeuda(aMonto(d.monto_pendiente), aMonto(d.monto_original)) === 'PAGADA') continue;
            porPagar += aMonto(d.monto_pendiente);
            deudasAbiertas += 1;
            proveedores.add(d.tercero_id);
        }

        const prestamos = deudasCajas
            .filter((d) => estadoDeuda(aMonto(d.monto_pendiente), aMonto(d.monto_original)) !== 'PAGADA')
            .sort((a, b) => aMonto(b.monto_pendiente) - aMonto(a.monto_pendiente));

        const obras = proyectos
            .map((p) => {
                const gastado = gastadoPorObra.get(p.id) ?? 0;
                const presupuesto = aMonto(p.presupuesto_estimado);
                const estado = String(p.estado || 'Activo').toLowerCase();
                return {
                    id: p.id,
                    nombre: p.nombre || 'Obra sin nombre',
                    empresa: nombreEmpresa(p.empresa_id, ''),
                    estado,
                    gastado,
                    presupuesto,
                    fraccion: presupuesto > 0 ? gastado / presupuesto : null,
                };
            })
            .sort((a, b) =>
                (ORDEN_ESTADO_OBRA[a.estado] ?? 3) - (ORDEN_ESTADO_OBRA[b.estado] ?? 3) || b.gastado - a.gastado
            );

        return {
            ingresosMes, egresosMes, saldoCajas, empresasConSaldo,
            porPagar, deudasAbiertas, proveedores: proveedores.size, prestamos, obras,
        };
    }, [transacciones, cajas, proyectos, deudasCajas, deudasTerceros, nombreEmpresa, hoy]);

    // ---------------- Movimientos ----------------
    const movimientos = useMemo(() => {
        const vistas = transacciones.map((t) => vistaDeMovimiento(t, datos, modoLocal));
        // Más recientes primero por fecha de calendario; a igual fecha, por
        // hora de registro. Así se agrupan por día sin saltos.
        vistas.sort((a, b) => (a.dia === b.dia ? b.creado - a.creado : a.dia < b.dia ? 1 : -1));
        return vistas;
    }, [transacciones, datos, modoLocal]);

    const filtrados = useMemo(
        () => (filtro === 'todos' ? movimientos : movimientos.filter((m) => m.tipo === filtro)),
        [movimientos, filtro]
    );
    const visibles = filtrados.slice(0, limite);
    const restantes = filtrados.length - visibles.length;

    // ---------------- Acciones ----------------
    const pedirSoporte = useCallback((mov) => setSoporte({ url: mov.soporte, title: mov.descripcion }), []);
    const pedirEdicion = useCallback((mov) => { setErrorAccion(''); setEditando(mov.tx); }, []);
    const pedirBorrado = useCallback((mov) => { setErrorAccion(''); setPorBorrar(mov.tx); }, []);

    // El caso de uso relee la fila guardada, rechaza los movimientos de deuda
    // (con un MovimientoInvalidoError que el modal muestra tal cual) y marca
    // `sincronizado: false`. Aquí se marca también: el modal copia la fila
    // con `sincronizado: true` y, sin esto, un movimiento editado sin señal
    // no mostraba "Pendiente" (DEU-20). processSyncQueue lo vuelve a marcar
    // cuando el UPDATE sube.
    async function guardarEdicion(actualizado) {
        await editarMovimiento(editando, { ...actualizado, sincronizado: false });
    }

    async function confirmarBorrado() {
        if (!porBorrar || borrandoRef.current) return;
        // Guarda síncrona: el estado `borrando` no se ve en este closure
        // hasta el siguiente render, y un segundo toque revertía el saldo dos
        // veces (DEU-15).
        borrandoRef.current = true;
        setBorrando(true);
        try {
            // El caso de uso relee la fila dentro de su transacción: si un
            // toque anterior ya la borró, no revierte nada.
            await borrarMovimiento(porBorrar);
            setPorBorrar(null);
        } catch (err) {
            console.error('No se pudo borrar el movimiento:', err);
            setPorBorrar(null);
            setErrorAccion(err instanceof MovimientoInvalidoError
                ? err.message
                : 'No se pudo borrar el movimiento. No cambió ningún saldo. Intenta de nuevo.');
        } finally {
            borrandoRef.current = false;
            setBorrando(false);
        }
    }

    if (cargando) {
        return (
            <div className="space-y-6" aria-busy="true" aria-label="Cargando inicio">
                <div className="skeleton h-8 w-40" />
                <div className="skeleton h-24" />
                <div className="two-panel-layout">
                    <div className="skeleton h-64" />
                    <div className="skeleton h-64" />
                </div>
            </div>
        );
    }

    const mesActual = formatoMes(claveMes(hoy), { largo: true, conAnio: false });

    return (
        <div className="space-y-8">
            <header className="section-header" style={{ marginBottom: 0 }}>
                <div>
                    <h2 className="section-title">Inicio</h2>
                    <p className="section-subtitle first-letter:uppercase">{formatoFecha(hoy, 'larga')}</p>
                </div>
            </header>

            {error && (
                <p role="alert" className="rounded-md bg-neg-soft px-3 py-2 text-[14px] text-neg">
                    No se pudieron leer los datos guardados en este dispositivo. Cierra y vuelve a abrir la app.
                </p>
            )}

            {/* Indicadores. Mismo aspecto que .kpi-strip; columnas con
                utilidades porque el auto-fit de .kpi-strip dejaba a 768 px
                cuatro columnas tan angostas que cortaba las cifras. */}
            <section
                aria-label="Indicadores"
                className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line min-[480px]:grid-cols-2 xl:grid-cols-4"
            >
                <Indicador
                    etiqueta="Saldo en cajas"
                    marca="var(--info)"
                    valor={formatoMoneda(resumen.saldoCajas)}
                    colorValor={resumen.saldoCajas < 0 ? 'var(--neg)' : undefined}
                    meta={cajas.length === 1 ? '1 caja' : `${cajas.length} cajas`}
                />
                <Indicador
                    etiqueta={`Ingresos de ${mesActual}`}
                    marca="var(--pos)"
                    valor={formatoMoneda(resumen.ingresosMes)}
                    colorValor="var(--pos)"
                    meta="Sin contar transferencias"
                />
                <Indicador
                    etiqueta={`Egresos de ${mesActual}`}
                    marca="var(--neg)"
                    valor={formatoMoneda(resumen.egresosMes)}
                    colorValor="var(--neg)"
                    meta={`Neto ${formatoMoneda(restarMontos(resumen.ingresosMes, resumen.egresosMes), { signo: true })}`}
                />
                <Indicador
                    etiqueta="Por pagar a proveedores"
                    marca="var(--warn)"
                    valor={formatoMoneda(resumen.porPagar)}
                    meta={resumen.deudasAbiertas === 0
                        ? 'Sin deudas abiertas'
                        : `${resumen.deudasAbiertas} ${resumen.deudasAbiertas === 1 ? 'deuda' : 'deudas'} con ${resumen.proveedores} ${resumen.proveedores === 1 ? 'proveedor' : 'proveedores'}`}
                />
            </section>

            <div className="two-panel-layout">
                {/* Obras */}
                <section aria-labelledby="titulo-obras" className="min-w-0">
                    <div className="mb-2 flex items-end justify-between gap-3">
                        <h3 id="titulo-obras" className="panel-title">Obras</h3>
                        <span className="eyebrow">Gastado / presupuesto</span>
                    </div>
                    {resumen.obras.length === 0 ? (
                        <div className="ledger empty-state">Todavía no hay obras. Créalas en Configuración.</div>
                    ) : (
                        <>
                            <ul className="ledger">
                                {(verTodasLasObras ? resumen.obras : resumen.obras.slice(0, OBRAS_INICIALES)).map((obra) => (
                                    <FilaObra key={obra.id} obra={obra} />
                                ))}
                            </ul>
                            {resumen.obras.length > OBRAS_INICIALES && (
                                <button
                                    type="button"
                                    className="btn-ghost mt-1 w-full"
                                    onClick={() => setVerTodasLasObras((v) => !v)}
                                    aria-expanded={verTodasLasObras}
                                >
                                    {verTodasLasObras ? 'Ver menos obras' : `Ver las ${resumen.obras.length} obras`}
                                </button>
                            )}
                        </>
                    )}
                </section>

                <div className="min-w-0 space-y-6">
                    {/* Saldos por empresa */}
                    <section aria-labelledby="titulo-empresas">
                        {/* mb-2 con !: .panel-title { margin: 0 } está fuera de
                            capa en index.css y le gana a cualquier utilidad. */}
                        <h3 id="titulo-empresas" className="panel-title mb-2!">Saldos por empresa</h3>
                        {resumen.empresasConSaldo.length === 0 ? (
                            <div className="ledger empty-state">Las cajas no tienen saldo.</div>
                        ) : (
                            <ul className="ledger">
                                {resumen.empresasConSaldo.map((e) => (
                                    <li key={e.id || 'sin-empresa'} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                                        <span className={`min-w-0 truncate text-[14px] ${e.id ? 'text-ink' : 'text-ink-3'}`}>{e.nombre}</span>
                                        <span className={`amount shrink-0 text-[14px] ${e.saldo < 0 ? 'text-neg' : 'text-ink'}`}>{formatoMoneda(e.saldo)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Préstamos entre cajas */}
                    <section aria-labelledby="titulo-prestamos">
                        <h3 id="titulo-prestamos" className="panel-title mb-2!">Préstamos entre cajas pendientes</h3>
                        {resumen.prestamos.length === 0 ? (
                            <div className="ledger empty-state">Ninguna caja le debe a otra.</div>
                        ) : (
                            <ul className="ledger">
                                {resumen.prestamos.map((d) => (
                                    <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                                        <p className="min-w-0 text-[14px] leading-snug text-ink">
                                            {nombreCaja(d.caja_deudora_id, 'Caja eliminada')}{' '}
                                            <span className="text-ink-3">debe a</span>{' '}
                                            {nombreCaja(d.caja_acreedora_id, 'Caja eliminada')}
                                        </p>
                                        <span className="amount shrink-0 text-[14px] text-neg">{formatoMoneda(d.monto_pendiente)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>

            {/* Últimos movimientos */}
            <section aria-labelledby="titulo-movimientos">
                <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 id="titulo-movimientos" className="panel-title">Últimos movimientos</h3>
                        <p className="text-[13px] text-ink-3">
                            {filtrados.length === 0
                                ? 'Sin movimientos'
                                : `Mostrando ${visibles.length} de ${filtrados.length}`}
                        </p>
                    </div>
                    {/* Bajo 400 px las cuatro opciones no caben en una fila y
                        "Transferencias" quedaba oculta en el scroll de
                        .segmented, sin barra visible en el celular: van en
                        2x2. grid! e inline-flex! llevan ! porque .segmented
                        (fuera de capa) fija display: inline-flex. */}
                    <div
                        className="segmented grid! w-full grid-cols-2 self-start min-[400px]:inline-flex! min-[400px]:w-auto sm:self-auto"
                        role="group"
                        aria-label="Tipo de movimiento"
                    >
                        {FILTROS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                className="justify-center"
                                aria-pressed={filtro === f.id}
                                onClick={() => { setFiltro(f.id); setLimite(MOVIMIENTOS_INICIALES); }}
                            >
                                {f.texto}
                            </button>
                        ))}
                    </div>
                </div>

                {errorAccion && (
                    <p role="alert" className="mb-2 rounded-md bg-neg-soft px-3 py-2 text-[14px] text-neg">{errorAccion}</p>
                )}

                {visibles.length === 0 ? (
                    <div className="ledger empty-state">
                        {movimientos.length === 0 ? 'No hay movimientos registrados.' : 'No hay movimientos de este tipo.'}
                    </div>
                ) : (
                    <ul className="ledger">
                        {visibles.map((mov, indice) => {
                            const nuevoDia = indice === 0 || visibles[indice - 1].dia !== mov.dia;
                            return (
                                <FilaConDia key={mov.id} mostrarDia={nuevoDia} dia={mov.dia} hoy={hoy}>
                                    <FilaMovimiento
                                        mov={mov}
                                        onEditar={pedirEdicion}
                                        onBorrar={pedirBorrado}
                                        onVerSoporte={pedirSoporte}
                                    />
                                </FilaConDia>
                            );
                        })}
                    </ul>
                )}

                {(restantes > 0 || limite > MOVIMIENTOS_INICIALES) && (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        {restantes > 0 && (
                            <button
                                type="button"
                                className="btn-secondary flex-1"
                                onClick={() => setLimite((n) => n + PAGINA_MOVIMIENTOS)}
                            >
                                Ver {Math.min(PAGINA_MOVIMIENTOS, restantes)} más ({restantes} sin mostrar)
                            </button>
                        )}
                        {limite > MOVIMIENTOS_INICIALES && (
                            <button type="button" className="btn-ghost" onClick={() => setLimite(MOVIMIENTOS_INICIALES)}>
                                Mostrar menos
                            </button>
                        )}
                    </div>
                )}
            </section>

            {/* Los tres modales se montan una sola vez, fuera de cualquier
                vista condicional: en el historial completo "Ver soporte" no
                tenía modal y la imagen aparecía de golpe al volver (DEU-13). */}
            <TransactionEditModal
                isOpen={!!editando}
                transaction={editando}
                onSave={guardarEdicion}
                onClose={() => setEditando(null)}
            />

            <ConfirmModal
                isOpen={!!porBorrar}
                title="Borrar movimiento"
                message={porBorrar
                    ? `Se borrará este ${(TIPOS[porBorrar.tipo_movimiento]?.texto ?? 'movimiento').toLowerCase()} de ${formatoMoneda(porBorrar.monto)} y se revertirán los saldos de las cajas afectadas.`
                    : ''}
                details={porBorrar ? [
                    { label: 'Descripción', value: porBorrar.descripcion || datos.nombreCategoria(porBorrar.categoria) },
                    { label: 'Fecha', value: formatoFecha(porBorrar.fecha || porBorrar.created_at) || 'Sin fecha' },
                    { label: 'Caja', value: nombreCaja(porBorrar.caja_origen_id, 'Caja eliminada') },
                ] : undefined}
                confirmText="Borrar movimiento"
                textoProcesando="Borrando..."
                cancelText="Cancelar"
                type="danger"
                procesando={borrando}
                onConfirm={confirmarBorrado}
                onCancel={() => { if (!borrandoRef.current) setPorBorrar(null); }}
            />

            <ImagePreviewModal
                isOpen={!!soporte}
                onClose={() => setSoporte(null)}
                imageUrl={soporte?.url}
                title={soporte?.title}
            />
        </div>
    );
}

function Indicador({ etiqueta, marca, valor, colorValor, meta }) {
    return (
        <div className="kpi">
            <p className="kpi-label">
                <span className="stat-mark" style={{ '--stat-color': marca }} aria-hidden="true" />
                {etiqueta}
            </p>
            <p className="kpi-value amount" style={colorValor ? { color: colorValor } : undefined} title={valor}>{valor}</p>
            {meta && <p className="kpi-meta">{meta}</p>}
        </div>
    );
}

function FilaObra({ obra }) {
    const { fraccion } = obra;
    const pausada = obra.estado === 'pausado';
    const finalizada = obra.estado === 'finalizado';
    return (
        <li className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium leading-snug text-ink">
                        <span className="min-w-0 break-words">{obra.nombre}</span>
                        {pausada && <span className="chip">Pausada</span>}
                        {finalizada && <span className="chip">Finalizada</span>}
                    </p>
                    <p className="truncate text-[13px] text-ink-3">{obra.empresa || 'Sin empresa'}</p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="amount text-[15px] text-ink">{formatoMoneda(obra.gastado)}</p>
                    <p className="num text-[12px] text-ink-3">
                        {obra.presupuesto > 0 ? `de ${formatoMoneda(obra.presupuesto)}` : 'Sin presupuesto'}
                    </p>
                </div>
            </div>
            {fraccion !== null && (
                <div className="mt-2 flex items-center gap-3">
                    <div
                        className="meter flex-1"
                        role="progressbar"
                        aria-label={`Presupuesto ejecutado de ${obra.nombre}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(Math.min(fraccion, 1) * 100)}
                        aria-valuetext={formatoPorcentaje(fraccion)}
                    >
                        <span style={{ width: `${Math.min(fraccion, 1) * 100}%`, background: colorEjecucion(fraccion) }} />
                    </div>
                    <span className={`num w-14 shrink-0 text-right text-[12px] font-semibold ${claseEjecucion(fraccion)}`}>
                        {formatoPorcentaje(fraccion)}
                    </span>
                </div>
            )}
        </li>
    );
}

/** Inserta el rótulo del día antes de la primera fila de cada día. */
function FilaConDia({ mostrarDia, dia, hoy, children }) {
    if (!mostrarDia) return children;
    return (
        <>
            <li className="bg-surface-2 px-4 py-1.5 text-[12px] font-semibold text-ink-3 first-letter:uppercase">
                {etiquetaDia(dia, hoy)}
            </li>
            {children}
        </>
    );
}

const FilaMovimiento = memo(function FilaMovimiento({ mov, onEditar, onBorrar, onVerSoporte }) {
    const signo = mov.tipo === TIPO_MOVIMIENTO.INGRESO ? 1 : mov.tipo === TIPO_MOVIMIENTO.EGRESO ? -1 : 0;
    const colorMonto = signo > 0 ? 'text-pos' : signo < 0 ? 'text-neg' : 'text-info';
    const monto = signo === 0 ? formatoMoneda(mov.monto) : formatoMoneda(signo * mov.monto, { signo: true });
    const tieneAcciones = !mov.deDeuda || mov.soporte;

    return (
        <li className="group flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
            <span className={`tipo-mark ${mov.claseTipo} mt-0.5`} title={mov.tipoTexto} aria-hidden="true">{mov.letra}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-medium text-ink">
                        <span className="sr-only">{mov.tipoTexto}: </span>
                        {mov.descripcion}
                    </p>
                    <p className={`amount shrink-0 text-[15px] ${colorMonto}`}>{monto}</p>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1 truncate text-[13px] text-ink-3">
                        {mov.categoria && <span className="truncate">{mov.categoria}</span>}
                        {mov.categoria && (mov.cajaOrigen || mov.cajaDestino) && <span aria-hidden="true">·</span>}
                        {mov.cajaDestino ? (
                            <span className="inline-flex min-w-0 items-center gap-1 truncate">
                                <span className="truncate">{mov.cajaOrigen || 'Sin caja'}</span>
                                <ArrowRight size={12} className="shrink-0" aria-hidden="true" />
                                <span className="sr-only"> a </span>
                                <span className="truncate">{mov.cajaDestino}</span>
                            </span>
                        ) : mov.cajaOrigen ? (
                            <span className="truncate">{mov.cajaOrigen}</span>
                        ) : null}
                        {mov.obra && <span aria-hidden="true">·</span>}
                        {mov.obra && <span className="truncate">{mov.obra}</span>}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                        {mov.pendiente && (
                            <span className="chip chip-warn" title="Guardado en este dispositivo. Falta subirlo a la nube.">Pendiente</span>
                        )}
                        {mov.deDeuda && (
                            <span className="chip" title="Se administra desde Deudas">
                                Deuda<span className="sr-only">: se administra desde Deudas</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {tieneAcciones && (
                // En táctil (sin hover) las acciones siempre se ven; en
                // escritorio con mouse aparecen al pasar por la fila o al
                // llegar con el teclado.
                <div className="-my-1 ml-auto flex w-full justify-end gap-1 transition-opacity sm:w-auto sm:[@media(hover:hover)]:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    {mov.soporte && (
                        <button
                            type="button"
                            className="btn-icon"
                            onClick={() => onVerSoporte(mov)}
                            aria-label={`Ver soporte de ${mov.descripcion}`}
                            title="Ver soporte"
                        >
                            <ImageIcon size={16} aria-hidden="true" />
                        </button>
                    )}
                    {!mov.deDeuda && (
                        <>
                            <button
                                type="button"
                                className="btn-icon"
                                onClick={() => onEditar(mov)}
                                aria-label={`Editar ${mov.descripcion}`}
                                title="Editar"
                            >
                                <Pencil size={16} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="btn-icon"
                                onClick={() => onBorrar(mov)}
                                aria-label={`Borrar ${mov.descripcion}`}
                                title="Borrar"
                            >
                                <Trash2 size={16} aria-hidden="true" />
                            </button>
                        </>
                    )}
                </div>
            )}
        </li>
    );
});
