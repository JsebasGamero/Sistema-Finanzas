import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatoMoneda } from '../../formato';
import { compararTexto } from '../comunes/calculosComunes';
import { crearPeriodo, describirPeriodo, rangoDePeriodo } from '../comunes/periodo';
import { useHoyLocal } from '../comunes/useHoyLocal';
import { plural } from '../comunes/texto';
import FiltroPeriodo from '../comunes/FiltroPeriodo';
import CampoSelect from '../comunes/CampoSelect';
import Kpi from '../comunes/Kpi';
import ListaMovimientosBreve from '../comunes/ListaMovimientosBreve';
import { movimientosDeCaja, resumenCajas } from './calculos';

function colorSaldo(valor) {
    return valor < 0 ? 'text-neg' : 'text-ink';
}

function FilaCaja({ caja, datos, rango, abierta, onAlternar }) {
    // Los movimientos se calculan solo para la caja abierta.
    const movimientos = useMemo(
        () => (abierta ? movimientosDeCaja(datos.transacciones, caja.id, rango) : []),
        [abierta, datos.transacciones, caja.id, rango]
    );
    return (
        <div>
            <button
                type="button"
                className="ledger-row"
                aria-expanded={abierta}
                aria-controls={`caja-detalle-${caja.id}`}
                onClick={() => onAlternar(caja.id)}
            >
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{caja.nombre}</span>
                        {caja.tipo && <span className="chip">{caja.tipo}</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3 num">
                        <span>Entró <span className="text-pos">{formatoMoneda(caja.entradas)}</span></span>
                        <span>Salió <span className="text-neg">{formatoMoneda(caja.salidas)}</span></span>
                    </span>
                </span>
                <span className="shrink-0 text-right">
                    <span className={`amount block text-sm ${colorSaldo(caja.saldo)}`}>{formatoMoneda(caja.saldo)}</span>
                    <span className="block text-xs text-ink-3">saldo actual</span>
                </span>
                <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-ink-3 transition-transform ${abierta ? 'rotate-180' : ''}`} />
            </button>
            {abierta && (
                <div id={`caja-detalle-${caja.id}`} className="space-y-2 bg-surface-2 px-4 pb-4 pt-3">
                    <p className="text-sm text-ink-2">
                        Neto del periodo:{' '}
                        <span className={`amount ${caja.neto < 0 ? 'text-neg' : 'text-pos'}`}>{formatoMoneda(caja.neto, { signo: true })}</span>
                        {' · '}{plural(caja.cantidad, 'movimiento')}
                    </p>
                    <ListaMovimientosBreve movimientos={movimientos} datos={datos} cajaId={caja.id} ocultar={['caja']} />
                </div>
            )}
        </div>
    );
}

/**
 * Saldo actual de cada caja y lo que entró y salió en el periodo. El saldo
 * es una foto de hoy: el periodo solo afecta entradas, salidas y movimientos.
 */
export default function ReporteCajas({ datos }) {
    const [periodo, setPeriodo] = useState(() => crearPeriodo('mes'));
    const [empresaId, setEmpresaId] = useState('');
    const [abierta, setAbierta] = useState(null);

    const hoy = useHoyLocal();
    const rango = useMemo(() => rangoDePeriodo(periodo, hoy), [periodo, hoy]);
    const periodoTexto = useMemo(() => describirPeriodo(periodo, hoy), [periodo, hoy]);
    const { grupos, totales } = useMemo(() => resumenCajas(datos, { ...rango, empresaId }), [datos, rango, empresaId]);
    const opcionesEmpresa = useMemo(
        () => datos.empresas.map((e) => ({ valor: e.id, texto: e.nombre || 'Empresa sin nombre' })).sort((a, b) => compararTexto(a.texto, b.texto)),
        [datos.empresas]
    );

    function alternar(id) {
        setAbierta((actual) => (actual === id ? null : id));
    }

    return (
        <div className="space-y-4">
            <div className="card flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" role="group" aria-label="Filtros de cajas">
                <FiltroPeriodo id="cajas-periodo" valor={periodo} onCambiar={setPeriodo} />
                {opcionesEmpresa.length > 1 && (
                    <CampoSelect id="cajas-empresa" etiqueta="Empresa" valor={empresaId} onCambiar={setEmpresaId} opciones={opcionesEmpresa} todos="Todas" />
                )}
            </div>

            <div className="kpi-strip" aria-label="Totales de cajas">
                <Kpi
                    etiqueta="Saldo total"
                    tono={totales.saldo < 0 ? 'neg' : 'info'}
                    colorearValor={totales.saldo < 0}
                    valor={formatoMoneda(totales.saldo)}
                    meta={`Actual, ${plural(totales.cantidad, 'caja')}`}
                />
                <Kpi
                    etiqueta="Cajas en negativo"
                    tono="neg"
                    valor={formatoMoneda(totales.saldoNegativo)}
                    meta={totales.negativas ? plural(totales.negativas, 'caja') : 'Ninguna'}
                />
                <Kpi etiqueta="Entradas" tono="pos" valor={formatoMoneda(totales.entradas)} meta={periodoTexto} />
                <Kpi etiqueta="Salidas" tono="neg" valor={formatoMoneda(totales.salidas)} meta={periodoTexto} />
            </div>
            <p className="text-xs text-ink-3">
                Entradas y salidas incluyen las transferencias entre cajas. El saldo actual no depende del periodo.
            </p>

            {grupos.length === 0 ? (
                <div className="card empty-state">No hay cajas registradas.</div>
            ) : (
                grupos.map((grupo) => (
                    <section key={grupo.empresaId || 'sin-empresa'} className="ledger" aria-label={grupo.nombre}>
                        <header className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2">
                            <h3 className="eyebrow">{grupo.nombre}</h3>
                            <span className={`amount text-sm ${colorSaldo(grupo.saldo)}`}>
                                <span className="sr-only">Saldo de la empresa: </span>
                                {formatoMoneda(grupo.saldo)}
                            </span>
                        </header>
                        {grupo.cajas.map((caja) => (
                            <FilaCaja
                                key={caja.id}
                                caja={caja}
                                datos={datos}
                                rango={rango}
                                abierta={abierta === caja.id}
                                onAlternar={alternar}
                            />
                        ))}
                    </section>
                ))
            )}
        </div>
    );
}
