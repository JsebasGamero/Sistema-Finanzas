import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatoCompacto } from '../../formato';
import TooltipGrafica from './TooltipGrafica';
import { altoBarrasHorizontales, propsEje, recortar } from './estiloGrafica';

const ANCHO_ETIQUETAS = 116;

/**
 * Rótulo de categoría en una sola línea. El tick por defecto de Recharts
 * parte el texto por palabras cuando no cabe ("Alquiler / Maqu…") y las
 * barras quedan con rótulos de dos pisos desalineados. El nombre completo
 * queda en <title> y en el tooltip.
 */
function TickCategoria({ x, y, payload, colorTexto }) {
    const nombre = String(payload?.value ?? '');
    return (
        <text x={x} y={y} dy={4} textAnchor="end" fill={colorTexto} fontSize={12}>
            <title>{nombre}</title>
            {recortar(nombre, 17)}
        </text>
    );
}

/**
 * Cifra al final de la barra, en una línea. LabelList por defecto parte
 * "139,5 M" en dos renglones cuando la barra es larga. El color va en
 * `colorTexto` porque Recharts le pasa al contenido el `fill` de la barra y
 * pisaría un `fill` propio (la cifra salía roja como la barra).
 */
function EtiquetaBarra({ x, y, width, height, value, colorTexto }) {
    if (value === undefined || value === null || value === '') return null;
    return (
        <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2} dy={4} fill={colorTexto} fontSize={12}>
            {value}
        </text>
    );
}

/**
 * Barras horizontales ordenadas (categorías, proveedores, cajas). Se prefieren
 * a una torta cuando hay más de 6 porciones (docs/DISENO.md).
 *
 * @param {{
 *   filas: Array<{ nombre: string, monto: number, color: string, etiqueta?: string }>,
 *   colores: object,            resultado de useColoresTema()
 *   nombreSerie: string,        nombre en el tooltip
 *   conEtiquetas?: boolean,     pinta `fila.etiqueta` al final de cada barra
 *   conEjeValores?: boolean,    eje de montos y línea en cero (para negativos)
 * }} props
 */
export default function BarrasHorizontales({ filas, colores, nombreSerie, conEtiquetas = false, conEjeValores = false }) {
    return (
        <ResponsiveContainer width="100%" height={altoBarrasHorizontales(filas.length) + (conEjeValores ? 24 : 0)}>
            <BarChart
                data={filas}
                layout="vertical"
                margin={{ top: 4, right: conEtiquetas ? 64 : 16, bottom: 4, left: 0 }}
                barCategoryGap="24%"
            >
                <XAxis type="number" hide={!conEjeValores} {...propsEje(colores)} tickFormatter={formatoCompacto} />
                <YAxis
                    type="category"
                    dataKey="nombre"
                    width={ANCHO_ETIQUETAS}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={<TickCategoria colorTexto={colores.ink2} />}
                />
                {conEjeValores && <ReferenceLine x={0} stroke={colores.lineStrong} />}
                <Tooltip content={<TooltipGrafica />} cursor={{ fill: colores.surface3 }} />
                <Bar dataKey="monto" name={nombreSerie} radius={2} maxBarSize={22} isAnimationActive={false}>
                    {filas.map((fila) => (
                        <Cell key={fila.id ?? fila.nombre} fill={fila.color} />
                    ))}
                    {conEtiquetas && (
                        <LabelList dataKey="etiqueta" content={<EtiquetaBarra colorTexto={colores.ink2} />} />
                    )}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
