import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatoCompacto } from '../../../formato';
import TarjetaGrafica from '../../comunes/TarjetaGrafica';
import TooltipGrafica from '../../comunes/TooltipGrafica';
import { propsEje, propsRejilla } from '../../comunes/estiloGrafica';

/**
 * Neto acumulado (ingresos - egresos) desde el inicio del periodo. Área de
 * relleno plano con opacidad 0.12: nada de degradados (docs/DISENO.md).
 */
export default function GraficaSaldoAcumulado({ acumulado, colores, subtitulo }) {
    const { puntos, granularidad } = acumulado;
    const eje = propsEje(colores);

    return (
        <TarjetaGrafica
            titulo="Neto acumulado"
            subtitulo={puntos.length ? `${subtitulo} · por ${granularidad === 'semana' ? 'semana' : 'día'}` : subtitulo}
            vacia={puntos.length === 0}
            mensajeVacio="No hay ingresos ni egresos en este periodo."
        >
            <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={puntos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...propsRejilla(colores)} />
                    <XAxis dataKey="corta" {...eje} minTickGap={16} />
                    <YAxis {...eje} axisLine={false} tickFormatter={formatoCompacto} width={64} />
                    <ReferenceLine y={0} stroke={colores.lineStrong} />
                    <Tooltip content={<TooltipGrafica campoEtiqueta="etiqueta" />} cursor={{ stroke: colores.lineStrong }} />
                    <Area
                        dataKey="acumulado"
                        name="Neto acumulado"
                        type="linear"
                        stroke={colores.info}
                        strokeWidth={2}
                        fill={colores.info}
                        fillOpacity={0.12}
                        dot={puntos.length <= 1 ? { r: 3, fill: colores.info } : false}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </TarjetaGrafica>
    );
}
