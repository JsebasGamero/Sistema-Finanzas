import { describe, it, expect } from 'vitest';
import { resumenCajas, movimientosDeCaja } from './calculos';

const datos = {
    cajas: [
        { id: 'banco', nombre: 'Banco', tipo: 'Banco', empresa_id: 'm', saldo_actual: '10000' },
        { id: 'menor', nombre: 'Caja menor', tipo: 'Efectivo', empresa_id: 'm', saldo_actual: -500 },
        { id: 'suelta', nombre: 'Tarjeta', tipo: 'Tarjeta', saldo_actual: 0 },
    ],
    empresasPorId: new Map([['m', { id: 'm', nombre: 'MAVICOL' }]]),
    transacciones: [
        { id: '1', fecha: '2026-11-02', tipo_movimiento: 'TRANSFERENCIA', monto: 3000, caja_origen_id: 'banco', caja_destino_id: 'menor' },
        { id: '2', fecha: '2026-11-03', tipo_movimiento: 'EGRESO', monto: '700', caja_origen_id: 'menor' },
        { id: '3', fecha: '2026-11-04', tipo_movimiento: 'INGRESO', monto: 2000, caja_origen_id: 'banco' },
        { id: '4', fecha: '2026-10-01', tipo_movimiento: 'INGRESO', monto: 99, caja_origen_id: 'banco' },
    ],
};

describe('resumenCajas', () => {
    it('agrupa por empresa, con "Sin empresa" al final, y cuenta transferencias en las dos cajas', () => {
        const r = resumenCajas(datos, { desde: '2026-11-01', hasta: '2026-11-30' });
        expect(r.grupos.map((g) => g.nombre)).toEqual(['MAVICOL', 'Sin empresa']);
        const [banco, menor] = r.grupos[0].cajas;
        expect(banco).toMatchObject({ nombre: 'Banco', entradas: 2000, salidas: 3000, neto: -1000, cantidad: 2 });
        expect(menor).toMatchObject({ nombre: 'Caja menor', entradas: 3000, salidas: 700, neto: 2300, saldo: -500 });
        expect(r.totales).toMatchObject({ saldo: 9500, negativas: 1, saldoNegativo: -500, cantidad: 3 });
    });
    it('filtra por empresa', () => {
        expect(resumenCajas(datos, { empresaId: 'm' }).totales.cantidad).toBe(2);
    });
    it('lista los movimientos de una caja en el periodo', () => {
        expect(movimientosDeCaja(datos.transacciones, 'menor', { desde: '2026-11-01' }).map((t) => t.id)).toEqual(['2', '1']);
    });
});
