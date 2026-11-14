// Gráfica del resultado del modo resumen (docs/DISENO.md, "Gráficas").
// - Sin columnas: barras horizontales de los grupos, ordenadas.
// - Hasta 8 columnas: barras por grupo, agrupadas o apiladas.
// - Más columnas (p. ej. meses): una línea por grupo, los 6 de mayor total.
// Colores de useColoresTema(): Recharts no lee variables CSS en SVG.
// Las series usan claves s0, s1...: Recharts lee dataKey como ruta, y un
// nombre con punto ("Cra. 7") se rompería.
import { useState } from 'react';
import {
    Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useColoresTema } from '../../tema/useTema';
import { CLAVE_OTROS, etiquetaDeValor } from '../../../application/reportes/resumen';
import { formatearValor, formatearCompacto } from './formatoCeldas';
import { useAnchoMinimo } from './useAnchoMinimo';

const MAX_BARRAS = 20;
const MAX_GRUPOS_BARRAS = 12;
const MAX_LINEAS = 6;
const MAX_COLUMNAS_BARRAS = 8;

// Las series con significado propio conservan su color semántico.
const SEMANTICA = {
    Ingreso: 'pos',
    Egreso: 'neg',
    Transferencia: 'info',
    Pagada: 'pos',
    Parcial: 'warn',
    Pendiente: 'neg',
};

// Campos donde el signo importa: barras verdes si es a favor, rojas si no.
const CAMPOS_CON_SIGNO = new Set(['neto', 'saldo_actual', 'saldo_total', 'saldo_movimientos', 'diferencia', 'disponible']);

function recortar(texto, maximo) {
    const t = String(texto ?? '');
    return t.length > maximo ? `${t.slice(0, maximo - 1).trimEnd()}…` : t;
}

function TooltipResumen({ active, payload, label, formatear }) {
    if (!active || !payload?.length) return null;
    const titulo = payload[0]?.payload?.nombreCompleto ?? label;
    return (
        <div className="popover px-3 py-2 text-sm min-w-40">
            {titulo && <p className="font-semibold text-ink mb-1">{titulo}</p>}
            <ul className="space-y-0.5">
                {payload.map((item) => (
                    <li key={`${item.dataKey}`} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-ink-2">
                            <span className="stat-mark" style={{ '--stat-color': item.color }} aria-hidden="true" />
                            {item.name}
                        </span>
                        <span className="amount text-ink">{formatear(item.value)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function GraficaResumen({ resumen, conjunto }) {
    const colores = useColoresTema();
    const ancho = useAnchoMinimo(640);
    const [apiladas, setApiladas] = useState(false);
    const { tipoValor, config } = resumen;
    const formatear = (v) => formatearValor(v, tipoValor);
    const formatearEje = (v) => formatearCompacto(v, tipoValor);
    const etiquetaValor = etiquetaDeValor(config, conjunto);
    const grupos = resumen.filas.filter((f) => f.nivel === 0);
    if (!grupos.length) return null;

    const eje = { tick: { fill: colores.ink3, fontSize: 12 }, axisLine: { stroke: colores.line }, tickLine: false };
    const colorSerie = (etiqueta, i) => colores[SEMANTICA[etiqueta]] ?? colores.categorica[i % colores.categorica.length];
    const tooltip = <Tooltip content={<TooltipResumen formatear={formatear} />} cursor={{ fill: colores.surface3 }} />;
    // itemSorter={null}: Recharts 3 ordena la leyenda alfabéticamente por
    // defecto, y los meses salían "ago, jul, jun..." aunque las series van en
    // orden cronológico.
    const leyenda = <Legend wrapperStyle={{ fontSize: 12, color: colores.ink2 }} iconType="square" iconSize={10} itemSorter={null} />;
    const columnas = resumen.columnas;
    const aditiva = config.valor.agregacion === 'suma' || config.valor.agregacion === 'conteo';

    let modo = 'barras';
    if (columnas.length > 0 && columnas.length <= MAX_COLUMNAS_BARRAS) modo = 'agrupadas';
    else if (columnas.length > MAX_COLUMNAS_BARRAS) modo = 'lineas';

    let grafica;
    let nota = null;
    let alto = 300;

    if (modo === 'barras') {
        const datos = grupos.slice(0, MAX_BARRAS).map((g) => ({
            nombre: recortar(g.etiquetas[0], ancho ? 22 : 14),
            nombreCompleto: g.etiquetas[0],
            valor: g.total ?? 0,
        }));
        if (grupos.length > MAX_BARRAS) nota = `Se muestran ${MAX_BARRAS} de ${grupos.length} grupos. Usa "Mostrar" para agrupar el resto en Otros.`;
        alto = Math.max(160, datos.length * 30 + 40);
        const conSigno = CAMPOS_CON_SIGNO.has(config.valor.campo);
        const colorBase = config.valor.campo === 'egreso' ? colores.neg : config.valor.campo === 'ingreso' ? colores.pos : colores.info;
        grafica = (
            <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid horizontal={false} stroke={colores.line} />
                <XAxis type="number" tickFormatter={formatearEje} {...eje} />
                <YAxis
                    type="category"
                    dataKey="nombre"
                    width={ancho ? 150 : 100}
                    tick={{ fill: colores.ink2, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                />
                {tooltip}
                <Bar dataKey="valor" name={etiquetaValor} fill={colorBase} radius={[0, 2, 2, 0]} maxBarSize={22} isAnimationActive={false}>
                    {datos.map((d, i) => (
                        <Cell key={i} fill={conSigno ? (d.valor < 0 ? colores.neg : colores.pos) : colorBase} />
                    ))}
                </Bar>
            </BarChart>
        );
    } else if (modo === 'agrupadas') {
        const visibles = grupos.slice(0, MAX_GRUPOS_BARRAS);
        if (grupos.length > MAX_GRUPOS_BARRAS) nota = `Se muestran ${MAX_GRUPOS_BARRAS} de ${grupos.length} grupos.`;
        const datos = visibles.map((g) => ({
            nombre: recortar(g.etiquetas[0], ancho ? 16 : 10),
            nombreCompleto: g.etiquetas[0],
            ...Object.fromEntries(columnas.map((c, i) => [`s${i}`, g.valores[c.clave] ?? (aditiva ? 0 : null)])),
        }));
        alto = 320;
        grafica = (
            <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke={colores.line} />
                <XAxis dataKey="nombre" interval={0} {...eje} />
                <YAxis tickFormatter={formatearEje} width={64} {...eje} axisLine={false} />
                {tooltip}
                {leyenda}
                {columnas.map((c, i) => (
                    <Bar
                        key={c.clave}
                        dataKey={`s${i}`}
                        name={c.etiqueta}
                        fill={colorSerie(c.etiqueta, i)}
                        stackId={apiladas ? 'pila' : undefined}
                        radius={apiladas ? 0 : [2, 2, 0, 0]}
                        maxBarSize={28}
                        isAnimationActive={false}
                    />
                ))}
            </BarChart>
        );
    } else {
        const ordenados = [...grupos]
            .filter((g) => g.claves[0] !== CLAVE_OTROS)
            .sort((a, b) => Math.abs(b.total ?? 0) - Math.abs(a.total ?? 0))
            .slice(0, MAX_LINEAS);
        if (grupos.length > MAX_LINEAS) nota = `Se muestran los ${MAX_LINEAS} grupos de mayor total.`;
        const datos = columnas.map((c) => ({
            nombre: c.etiqueta,
            ...Object.fromEntries(ordenados.map((g, i) => [`s${i}`, g.valores[c.clave] ?? (aditiva ? 0 : null)])),
        }));
        alto = 320;
        grafica = (
            <LineChart data={datos} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke={colores.line} />
                <XAxis dataKey="nombre" minTickGap={12} {...eje} />
                <YAxis tickFormatter={formatearEje} width={64} {...eje} axisLine={false} />
                {tooltip}
                {leyenda}
                {ordenados.map((g, i) => (
                    <Line
                        key={g.id}
                        type="linear"
                        dataKey={`s${i}`}
                        name={recortar(g.etiquetas[0], 24)}
                        stroke={colorSerie(g.etiquetas[0], i)}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                ))}
            </LineChart>
        );
    }

    return (
        <section className="card" aria-label={`Gráfica: ${etiquetaValor}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                    <h3 className="panel-title">Gráfica</h3>
                    <p className="text-xs text-ink-3">{etiquetaValor}</p>
                </div>
                {modo === 'agrupadas' && (
                    <div className="segmented" role="group" aria-label="Forma de las barras">
                        <button type="button" aria-pressed={!apiladas} onClick={() => setApiladas(false)}>Agrupadas</button>
                        <button type="button" aria-pressed={apiladas} onClick={() => setApiladas(true)}>Apiladas</button>
                    </div>
                )}
            </div>
            <div style={{ width: '100%', height: alto }}>
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: alto }}>
                    {grafica}
                </ResponsiveContainer>
            </div>
            {nota && <p className="text-xs text-ink-3 mt-2">{nota}</p>}
        </section>
    );
}
