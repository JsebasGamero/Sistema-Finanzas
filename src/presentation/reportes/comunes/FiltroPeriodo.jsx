import { PRESETS_RANGO } from '../../../domain/value-objects/fecha';
import { PERIODO_PERSONALIZADO, cambiarPreset } from './periodo';

/**
 * Selector de periodo: presets o rango manual. Devuelve sus campos sueltos
 * (fragmento) para que se acomoden en la fila o rejilla de filtros del padre.
 * `enRejilla`: sin ancho fijo, cada campo ocupa su celda.
 * @param {{ id: string, valor: import('./periodo').Periodo, onCambiar: Function, etiqueta?: string, enRejilla?: boolean }} props
 */
export default function FiltroPeriodo({ id, valor, onCambiar, etiqueta = 'Periodo', enRejilla = false }) {
    const personalizado = valor.preset === PERIODO_PERSONALIZADO;
    const anchoPreset = enRejilla ? '' : 'sm:w-48';
    const anchoFecha = enRejilla ? '' : 'sm:w-44';

    return (
        <>
            <div className={`min-w-0 ${anchoPreset}`}>
                <label className="label" htmlFor={id}>{etiqueta}</label>
                <select
                    id={id}
                    className="input-field"
                    value={valor.preset}
                    onChange={(e) => onCambiar(cambiarPreset(valor, e.target.value))}
                >
                    {PRESETS_RANGO.map((p) => (
                        <option key={p.id} value={p.id}>{p.etiqueta}</option>
                    ))}
                    <option value={PERIODO_PERSONALIZADO}>Rango personalizado</option>
                </select>
            </div>
            {personalizado && (
                <>
                    <div className={`min-w-0 ${anchoFecha}`}>
                        <label className="label" htmlFor={`${id}-desde`}>Desde</label>
                        <input
                            id={`${id}-desde`}
                            type="date"
                            className="input-field"
                            value={valor.desde}
                            onChange={(e) => onCambiar({ ...valor, desde: e.target.value })}
                        />
                    </div>
                    <div className={`min-w-0 ${anchoFecha}`}>
                        <label className="label" htmlFor={`${id}-hasta`}>Hasta</label>
                        <input
                            id={`${id}-hasta`}
                            type="date"
                            className="input-field"
                            value={valor.hasta}
                            onChange={(e) => onCambiar({ ...valor, hasta: e.target.value })}
                        />
                    </div>
                </>
            )}
        </>
    );
}
