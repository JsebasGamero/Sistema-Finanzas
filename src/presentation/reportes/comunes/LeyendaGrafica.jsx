const FORMAS = {
    cuadro: { width: 8, height: 8, borderRadius: 1 },
    linea: { width: 12, height: 2 },
    marca: { width: 2, height: 10 },
};

/**
 * Leyenda en HTML (la de Recharts no sigue el tema ni la tipografía).
 * @param {{ items: Array<{ nombre: string, color: string, forma?: 'cuadro'|'linea'|'marca' }> }} props
 */
export default function LeyendaGrafica({ items }) {
    return (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
            {items.map((item) => (
                <li key={item.nombre} className="flex items-center gap-1.5">
                    <span
                        aria-hidden="true"
                        className="inline-block shrink-0"
                        style={{ ...FORMAS[item.forma ?? 'cuadro'], background: item.color }}
                    />
                    {item.nombre}
                </li>
            ))}
        </ul>
    );
}
