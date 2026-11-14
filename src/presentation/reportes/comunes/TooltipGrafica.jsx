import { formatoMoneda } from '../../formato';

/**
 * Contenido del tooltip de Recharts con los tokens del tema (fondo surface,
 * borde line-strong) y montos completos. Se pasa como
 * `<Tooltip content={<TooltipGrafica />} />`; Recharts le inyecta
 * active/payload/label.
 *
 * `campoEtiqueta`: campo del dato con el título largo ("nov 2026") cuando el
 * eje muestra uno corto ("nov 26").
 */
export default function TooltipGrafica({ active, payload, label, campoEtiqueta, formatoValor = formatoMoneda }) {
    if (!active || !payload?.length) return null;
    const dato = payload[0]?.payload ?? {};
    const titulo = (campoEtiqueta && dato[campoEtiqueta]) || label;

    return (
        <div className="popover px-3 py-2 text-sm min-w-40">
            {titulo != null && titulo !== '' && <p className="font-semibold text-ink mb-1">{titulo}</p>}
            <ul className="space-y-0.5">
                {payload.map((item) => (
                    <li key={`${item.dataKey}-${item.name}`} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-ink-2">
                            <span className="stat-mark" style={{ '--stat-color': dato.color ?? item.color }} aria-hidden="true" />
                            {item.name}
                        </span>
                        <span className="amount text-ink">{formatoValor(item.value)}</span>
                    </li>
                ))}
            </ul>
            {dato.nota && <p className="text-xs text-ink-3 mt-1">{dato.nota}</p>}
        </div>
    );
}
