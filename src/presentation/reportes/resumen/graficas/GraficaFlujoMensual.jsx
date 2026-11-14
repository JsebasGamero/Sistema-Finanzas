import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatoCompacto } from '../../../formato';
import TarjetaGrafica from '../../comunes/TarjetaGrafica';
import TooltipGrafica from '../../comunes/TooltipGrafica';
import LeyendaGrafica from '../../comunes/LeyendaGrafica';
import { propsEje, propsRejilla } from '../../comunes/estiloGrafica';

/** Ingresos y egresos por mes (barras) y neto (línea). */
export default function GraficaFlujoMensual({ meses, colores, subtitulo, className }) {
    const leyenda = (
        <LeyendaGrafica
            items={[
                { nombre: 'Ingresos', color: colores.pos },
                { nombre: 'Egresos', color: colores.neg },
                { nombre: 'Neto', color: colores.ink, forma: 'linea' },
            ]}
        />
    );
    const eje = propsEje(colores);

    return (
        <TarjetaGrafica
            titulo="Flujo mensual"
            subtitulo={subtitulo}
            vacia={meses.length === 0}
            mensajeVacio="No hay ingresos ni egresos en este periodo."
            leyenda={leyenda}
            className={className}
        >
            <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={meses} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
                    <CartesianGrid {...propsRejilla(colores)} />
                    <XAxis dataKey="corta" {...eje} minTickGap={8} />
                    <YAxis {...eje} axisLine={false} tickFormatter={formatoCompacto} width={64} />
                    <ReferenceLine y={0} stroke={colores.lineStrong} />
                    <Tooltip content={<TooltipGrafica campoEtiqueta="etiqueta" />} cursor={{ fill: colores.surface3 }} />
                    <Bar dataKey="ingresos" name="Ingresos" fill={colores.pos} radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    <Bar dataKey="egresos" name="Egresos" fill={colores.neg} radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    <Line
                        dataKey="neto"
                        name="Neto"
                        type="linear"
                        stroke={colores.ink}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: colores.ink, stroke: colores.ink }}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </TarjetaGrafica>
    );
}
