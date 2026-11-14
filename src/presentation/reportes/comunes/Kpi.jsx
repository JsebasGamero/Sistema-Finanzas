/**
 * Un indicador de la franja `.kpi-strip`.
 * `tono` ('pos' | 'neg' | 'info' | 'warn' | 'accent') colorea la marca; con
 * `colorearValor` también la cifra. El color va por estilo porque `.kpi-value`
 * fija `color` fuera de las capas de Tailwind y una utilidad no lo pisa.
 */
export default function Kpi({ etiqueta, valor, meta, tono, colorearValor = false }) {
    const color = tono ? `var(--${tono})` : undefined;
    return (
        <div className="kpi">
            <p className="kpi-label">
                {color && <span className="stat-mark" style={{ '--stat-color': color }} aria-hidden="true" />}
                {etiqueta}
            </p>
            <p className="kpi-value amount" style={colorearValor && color ? { color } : undefined}>{valor}</p>
            {meta && <p className="kpi-meta">{meta}</p>}
        </div>
    );
}
