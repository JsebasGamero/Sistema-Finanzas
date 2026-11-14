// Cajas: el saldo de cada caja, agrupado por empresa, como un libro de saldos.
import { useEffect, useId, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/db';
import { aMonto, redondearMonto } from '../domain/value-objects/dinero';
import { formatoMoneda } from '../presentation/formato';

const FILTROS = [
    { id: 'todas', etiqueta: 'Todas' },
    { id: 'Efectivo', etiqueta: 'Efectivo' },
    { id: 'Banco', etiqueta: 'Bancos' },
    { id: 'Tarjeta', etiqueta: 'Tarjetas' },
];

const SIN_EMPRESA = '';

function compararTexto(a, b) {
    return String(a ?? '').localeCompare(String(b ?? ''), 'es', { sensitivity: 'base' });
}

// Se redondea la suma: con residuos de coma flotante un total de -0,000001
// se pintaba "-$ 0" en rojo.
function sumarSaldos(cajas) {
    return redondearMonto(cajas.reduce((total, caja) => total + aMonto(caja.saldo_actual), 0));
}

function Kpi({ etiqueta, valor, meta }) {
    const negativo = valor < 0;
    return (
        <div className="kpi">
            <div className="kpi-label">{etiqueta}</div>
            <div
                className="kpi-value amount"
                title={formatoMoneda(valor)}
                // `.kpi-value` fija el color de tinta; el negativo se pisa en línea.
                style={negativo ? { color: 'var(--neg)' } : undefined}
            >
                {formatoMoneda(valor)}
            </div>
            <div className="kpi-meta">{meta}</div>
        </div>
    );
}

function contar(n, singular, plural) {
    return `${n} ${n === 1 ? singular : plural}`;
}

function FilaCaja({ caja }) {
    const saldo = redondearMonto(aMonto(caja.saldo_actual));
    const detalle = [caja.banco_nombre, caja.numero_cuenta].filter(Boolean).join(' · ');
    return (
        <div className="ledger-row">
            <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{caja.nombre}</p>
                <p className="mt-1 flex min-w-0 items-center gap-2 text-xs">
                    <span className="chip">{caja.tipo || 'Sin tipo'}</span>
                    {detalle && <span className="mono truncate text-ink-3">{detalle}</span>}
                </p>
            </div>
            <span className={`amount shrink-0 text-right text-[15px] ${saldo < 0 ? 'text-neg' : 'text-ink'}`}>
                {formatoMoneda(saldo)}
            </span>
        </div>
    );
}

function GrupoEmpresa({ nombre, cajas }) {
    const idTitulo = useId();
    const subtotal = sumarSaldos(cajas);
    return (
        <section aria-labelledby={idTitulo}>
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h3 id={idTitulo} className="panel-title min-w-0 truncate">
                    {nombre}
                    <span className="ml-2 text-xs font-normal text-ink-3">{contar(cajas.length, 'caja', 'cajas')}</span>
                </h3>
                <p className="shrink-0 text-sm">
                    <span className="sr-only">Subtotal: </span>
                    <span className={`amount ${subtotal < 0 ? 'text-neg' : 'text-ink-2'}`}>{formatoMoneda(subtotal)}</span>
                </p>
            </div>
            <div className="ledger">
                {cajas.map((caja) => <FilaCaja key={caja.id} caja={caja} />)}
            </div>
        </section>
    );
}

function Esqueleto() {
    return (
        <div aria-busy="true" aria-label="Cargando cajas" className="space-y-6">
            <div className="skeleton h-16 w-48" />
            <div className="skeleton h-24 w-full" />
            <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
            </div>
        </div>
    );
}

export default function CajaList() {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');
    const [filtro, setFiltro] = useState('todas');

    // En vivo: los saldos cambian al registrar un movimiento o al sincronizar,
    // y antes esta pantalla seguía mostrando los de cuando se abrió.
    useEffect(() => {
        const suscripcion = liveQuery(() => Promise.all([db.cajas.toArray(), db.empresas.toArray()])).subscribe({
            next: ([cajas, empresas]) => {
                setDatos({ cajas, empresas });
                setError('');
            },
            error: (err) => {
                console.error('No se pudieron leer las cajas:', err);
                setError('No se pudieron leer las cajas guardadas en este dispositivo.');
                setDatos((d) => d ?? { cajas: [], empresas: [] });
            },
        });
        return () => suscripcion.unsubscribe();
    }, []);

    if (!datos) return <Esqueleto />;

    const { cajas, empresas } = datos;
    const porTipo = (tipo) => cajas.filter((c) => c.tipo === tipo);
    const bancos = porTipo('Banco');
    const efectivo = porTipo('Efectivo');
    const tarjetas = porTipo('Tarjeta');

    const visibles = filtro === 'todas' ? cajas : cajas.filter((c) => c.tipo === filtro);
    const nombresEmpresa = new Map(empresas.map((e) => [e.id, e.nombre]));
    const grupos = new Map();
    for (const caja of visibles) {
        const clave = nombresEmpresa.has(caja.empresa_id) ? caja.empresa_id : SIN_EMPRESA;
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(caja);
    }
    const gruposOrdenados = [...grupos.entries()]
        .map(([clave, lista]) => ({
            clave,
            nombre: clave === SIN_EMPRESA ? 'Sin empresa' : nombresEmpresa.get(clave),
            cajas: [...lista].sort((a, b) => compararTexto(a.nombre, b.nombre)),
        }))
        // "Sin empresa" siempre al final.
        .sort((a, b) => (a.clave === SIN_EMPRESA) - (b.clave === SIN_EMPRESA) || compararTexto(a.nombre, b.nombre));

    return (
        <div className="space-y-6">
            <header className="section-header" style={{ marginBottom: 0 }}>
                <div>
                    <h2 className="section-title">Cajas</h2>
                    <p className="section-subtitle">Saldo de cada caja, por empresa.</p>
                </div>
                {cajas.length > 0 && (
                    // A 320 px las cuatro opciones no caben en una fila (la última
                    // quedaba oculta): 2x2 hasta 400 px, igual que en Inicio. grid! e
                    // inline-flex! le ganan al display de .segmented (CSS sin capa).
                    <div className="segmented grid! w-full grid-cols-2 self-start min-[400px]:inline-flex! min-[400px]:w-auto sm:self-auto" role="group" aria-label="Filtrar por tipo de caja">
                        {FILTROS.map((f) => {
                            const cantidad = f.id === 'todas' ? cajas.length : porTipo(f.id).length;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    aria-pressed={filtro === f.id}
                                    onClick={() => setFiltro(f.id)}
                                >
                                    {f.etiqueta}
                                    <span className="num font-normal text-ink-3">{cantidad}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </header>

            {error && (
                <p role="alert" className="rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-sm text-neg">
                    {error}
                </p>
            )}

            {cajas.length === 0 ? (
                <p className="empty-state">Todavía no hay cajas. Créalas en Configuración.</p>
            ) : (
                <>
                    <div
                        className="kpi-strip [--columnas:1fr] sm:[--columnas:repeat(2,1fr)] xl:[--columnas:repeat(4,1fr)]"
                        // Una columna en el celular, 2x2 en tableta y 4 en
                        // escritorio: los saldos de cientos de millones no
                        // caben en cuatro columnas angostas y se cortaban.
                        style={{ gridTemplateColumns: 'var(--columnas)' }}
                    >
                        <Kpi etiqueta="Saldo total" valor={sumarSaldos(cajas)} meta={contar(cajas.length, 'caja', 'cajas')} />
                        <Kpi etiqueta="En bancos" valor={sumarSaldos(bancos)} meta={contar(bancos.length, 'cuenta', 'cuentas')} />
                        <Kpi etiqueta="En efectivo" valor={sumarSaldos(efectivo)} meta={contar(efectivo.length, 'caja', 'cajas')} />
                        <Kpi etiqueta="En tarjetas" valor={sumarSaldos(tarjetas)} meta={contar(tarjetas.length, 'tarjeta', 'tarjetas')} />
                    </div>

                    {gruposOrdenados.length === 0 ? (
                        <p className="empty-state">
                            No hay cajas de tipo {FILTROS.find((f) => f.id === filtro)?.etiqueta.toLowerCase()}.
                        </p>
                    ) : (
                        <div className="space-y-6">
                            {gruposOrdenados.map((grupo) => (
                                <GrupoEmpresa key={grupo.clave || 'sin-empresa'} nombre={grupo.nombre} cajas={grupo.cajas} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
