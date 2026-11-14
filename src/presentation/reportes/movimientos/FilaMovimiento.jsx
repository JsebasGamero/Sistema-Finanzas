import { memo } from 'react';
import { ArrowRight, ChevronDown, ImageIcon } from 'lucide-react';
import { TIPO_MOVIMIENTO } from '../../../domain/value-objects/tipoMovimiento';
import { esMovimientoDeDeuda } from '../../../domain/rules/movimientoDeDeuda';
import { formatoFecha, formatoFechaHora, formatoMoneda } from '../../formato';
import { empresaDeMovimiento, valorConSigno } from '../comunes/calculosComunes';
import MarcaTipo from '../comunes/MarcaTipo';

const NOMBRE_TIPO = {
    [TIPO_MOVIMIENTO.INGRESO]: 'Ingreso',
    [TIPO_MOVIMIENTO.EGRESO]: 'Egreso',
    [TIPO_MOVIMIENTO.TRANSFERENCIA]: 'Transferencia',
};

function Dato({ etiqueta, children, ancho = false }) {
    return (
        <div className={ancho ? 'min-[420px]:col-span-2' : ''}>
            <dt className="eyebrow">{etiqueta}</dt>
            <dd className="mt-0.5 text-ink break-words">{children}</dd>
        </div>
    );
}

function Cajas({ tx, datos }) {
    const origen = datos.nombreCaja(tx.caja_origen_id, 'Sin caja');
    if (tx.tipo_movimiento !== TIPO_MOVIMIENTO.TRANSFERENCIA) return origen;
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            {origen}
            <ArrowRight size={13} className="text-ink-3" aria-hidden="true" />
            <span className="sr-only">a</span>
            {datos.nombreCaja(tx.caja_destino_id, 'Sin caja')}
        </span>
    );
}

/**
 * Una fila del libro de movimientos; al tocarla se abre el detalle completo.
 * `cajaId`: si hay filtro de caja, el monto se muestra con el signo de lo
 * que entró o salió de esa caja (una transferencia es + en destino).
 */
function FilaMovimiento({ tx, datos, cajaId, abierta, onAlternar, onVerSoporte }) {
    const categoria = datos.nombreCategoria(tx.categoria);
    const esTransferencia = tx.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA;
    const valor = valorConSigno(tx, cajaId);
    const neutro = esTransferencia && !cajaId;
    const colorMonto = neutro ? 'text-info' : valor < 0 ? 'text-neg' : 'text-pos';
    const textoMonto = neutro ? formatoMoneda(tx.monto) : formatoMoneda(valor, { signo: true });
    const titulo = tx.descripcion || categoria;
    const meta = [
        tx.descripcion ? categoria : null,
        esTransferencia
            ? `${datos.nombreCaja(tx.caja_origen_id, 'Sin caja')} a ${datos.nombreCaja(tx.caja_destino_id, 'Sin caja')}`
            : datos.nombreCaja(tx.caja_origen_id),
        datos.nombreProyecto(tx.proyecto_id),
    ].filter(Boolean).join(' · ');
    const idDetalle = `mov-detalle-${tx.id}`;
    const empresa = datos.nombreEmpresa(empresaDeMovimiento(tx, datos));

    return (
        <div>
            <button
                type="button"
                className="ledger-row"
                aria-expanded={abierta}
                aria-controls={idDetalle}
                onClick={() => onAlternar(tx.id)}
            >
                <MarcaTipo tipo={tx.tipo_movimiento} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{titulo}</span>
                    <span className="block truncate text-xs text-ink-3">{meta}</span>
                </span>
                {tx.soporte_url && <ImageIcon size={15} className="shrink-0 text-ink-3" aria-label="Tiene soporte" />}
                <span className={`amount text-sm ${colorMonto}`}>{textoMonto}</span>
                <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`shrink-0 text-ink-3 transition-transform ${abierta ? 'rotate-180' : ''}`}
                />
            </button>

            {abierta && (
                <div id={idDetalle} className="bg-surface-2 px-4 pb-4 pt-3">
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[420px]:grid-cols-2">
                        <Dato etiqueta="Tipo">{NOMBRE_TIPO[tx.tipo_movimiento] ?? tx.tipo_movimiento}</Dato>
                        <Dato etiqueta="Monto"><span className="amount">{formatoMoneda(tx.monto)}</span></Dato>
                        <Dato etiqueta="Fecha">{formatoFecha(tx.fecha, 'larga')}</Dato>
                        <Dato etiqueta="Categoría">{categoria}</Dato>
                        <Dato etiqueta={esTransferencia ? 'Cajas' : 'Caja'}><Cajas tx={tx} datos={datos} /></Dato>
                        {tx.tercero_id && <Dato etiqueta="Proveedor / beneficiario">{datos.nombreTercero(tx.tercero_id, 'Tercero sin registro')}</Dato>}
                        {tx.proyecto_id && <Dato etiqueta="Obra">{datos.nombreProyecto(tx.proyecto_id, 'Obra sin registro')}</Dato>}
                        {empresa && <Dato etiqueta="Empresa">{empresa}</Dato>}
                        {tx.descripcion && <Dato etiqueta="Descripción" ancho>{tx.descripcion}</Dato>}
                        {tx.usuario_nombre && (
                            <Dato etiqueta="Registrado por">
                                {tx.usuario_nombre}
                                {tx.created_at && <span className="text-ink-3"> · {formatoFechaHora(tx.created_at)}</span>}
                            </Dato>
                        )}
                        {tx.editado_por && <Dato etiqueta="Editado por">{tx.editado_por}</Dato>}
                    </dl>
                    {(tx.soporte_url || esMovimientoDeDeuda(tx)) && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {tx.soporte_url && (
                                <button type="button" className="btn-secondary btn-sm" onClick={() => onVerSoporte(tx)}>
                                    <ImageIcon size={15} aria-hidden="true" />
                                    Ver soporte
                                </button>
                            )}
                            {esMovimientoDeDeuda(tx) && <span className="chip chip-warn">Se administra desde Deudas</span>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default memo(FilaMovimiento);
