import { formatoMoneda, formatoNumero, formatoPorcentaje } from '../../formato';

const COLOR_TONO = {
    pos: 'var(--pos)',
    neg: 'var(--neg)',
    info: 'var(--info)',
    warn: 'var(--warn)',
};

const CLASE_VALOR = {
    pos: 'text-pos',
    neg: 'text-neg',
};

function formatear(indicador) {
    if (indicador.valor === null || indicador.valor === undefined) return '–';
    if (indicador.formato === 'dinero') return formatoMoneda(indicador.valor);
    if (indicador.formato === 'porcentaje') return formatoPorcentaje(indicador.valor);
    return formatoNumero(indicador.valor);
}

/** Franja de cifras del conjunto, sobre las filas que se están viendo. */
export default function FranjaIndicadores({ indicadores }) {
    return (
        <div className="kpi-strip" aria-label="Indicadores de lo que se ve en la tabla">
            {indicadores.map((indicador) => (
                <div key={indicador.id} className="kpi">
                    <p className="kpi-label">
                        <span
                            className="stat-mark"
                            style={{ '--stat-color': COLOR_TONO[indicador.tono] ?? 'var(--ink-3)' }}
                            aria-hidden="true"
                        />
                        {indicador.etiqueta}
                    </p>
                    <p className={`kpi-value amount ${CLASE_VALOR[indicador.tono] ?? ''}`} title={formatear(indicador)}>
                        {formatear(indicador)}
                    </p>
                    {indicador.meta && <p className="kpi-meta">{indicador.meta}</p>}
                </div>
            ))}
        </div>
    );
}
