// Estilo común de las gráficas (docs/DISENO.md, "Gráficas"): ejes en ink3 a
// 12 px, solo rejilla horizontal en color line y sin punteados. Los colores
// llegan resueltos de useColoresTema() porque Recharts no lee variables CSS
// en atributos SVG de forma fiable.

/** Props para XAxis / YAxis. */
export function propsEje(colores) {
    return {
        tick: { fill: colores.ink3, fontSize: 12 },
        axisLine: { stroke: colores.line },
        tickLine: false,
    };
}

/** Props para CartesianGrid. */
export function propsRejilla(colores) {
    return { vertical: false, stroke: colores.line };
}

/** Recorta nombres largos para el eje (el tooltip muestra el nombre completo). */
export function recortar(texto, maximo = 14) {
    const t = String(texto ?? '');
    return t.length > maximo ? `${t.slice(0, maximo - 1).trimEnd()}…` : t;
}

/** Alto de una gráfica de barras horizontales según cuántas filas tiene. */
export function altoBarrasHorizontales(filas, porFila = 34, minimo = 140) {
    return Math.max(minimo, filas * porFila + 16);
}
