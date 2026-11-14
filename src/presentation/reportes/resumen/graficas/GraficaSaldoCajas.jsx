import { useMemo } from 'react';
import TarjetaGrafica from '../../comunes/TarjetaGrafica';
import BarrasHorizontales from '../../comunes/BarrasHorizontales';
import LeyendaGrafica from '../../comunes/LeyendaGrafica';

/** Saldo actual de cada caja; los negativos en rojo. No depende del periodo. */
export default function GraficaSaldoCajas({ saldos, colores, subtitulo }) {
    const filas = useMemo(
        () => saldos.map((c) => ({ ...c, monto: c.saldo, color: c.saldo < 0 ? colores.neg : colores.pos })),
        [saldos, colores]
    );
    const hayNegativos = filas.some((f) => f.monto < 0);

    return (
        <TarjetaGrafica
            titulo="Saldo por caja"
            subtitulo={subtitulo}
            vacia={filas.length === 0}
            mensajeVacio="No hay cajas registradas."
            leyenda={hayNegativos && (
                <LeyendaGrafica items={[{ nombre: 'A favor', color: colores.pos }, { nombre: 'Negativo', color: colores.neg }]} />
            )}
        >
            <BarrasHorizontales filas={filas} colores={colores} nombreSerie="Saldo" conEjeValores />
        </TarjetaGrafica>
    );
}
