import { describe, it, expect } from 'vitest';
import { resumenProveedores } from './calculos';

const tercerosPorId = new Map([
    ['ferre', { id: 'ferre', nombre: 'Ferretería X', tipo: 'Proveedor', nit_cedula: '900123' }],
    ['juan', { id: 'juan', nombre: 'Juan Pérez', tipo: 'Empleado' }],
]);

const deuda = { id: 'd1', tercero_id: 'ferre', monto_original: 5000000, monto_pendiente: 3000000, fecha_deuda: '2026-10-01' };
const abono = { id: 'a1', fecha: '2026-11-02', tipo_movimiento: 'EGRESO', categoria: 'Pago Deuda', tercero_id: 'ferre', monto: 2000000 };
const compra = { id: 'c1', fecha: '2026-11-05', tipo_movimiento: 'EGRESO', categoria: 'Materiales', tercero_id: 'ferre', monto: '800000' };

describe('resumenProveedores (REP-11)', () => {
    it('cuenta el abono una sola vez y lo desglosa', () => {
        const r = resumenProveedores({ transacciones: [abono, compra], deudasTerceros: [deuda], tercerosPorId });
        expect(r.filas[0]).toMatchObject({ nombre: 'Ferretería X', pagado: 2800000, abonos: 2000000, deudaPendiente: 3000000, cantidadPagos: 2 });
    });
    it('un abono recategorizado sigue contando una vez (antes sumaba dos veces)', () => {
        const recategorizado = { ...abono, categoria: 'Materiales' };
        const r = resumenProveedores({ transacciones: [recategorizado, compra], deudasTerceros: [deuda], tercerosPorId });
        expect(r.filas[0].pagado).toBe(2800000);
        expect(r.filas[0].abonos).toBe(0);
    });
    it('un abono borrado ya no suma aunque la deuda no se haya revertido', () => {
        const r = resumenProveedores({ transacciones: [compra], deudasTerceros: [deuda], tercerosPorId });
        expect(r.filas[0].pagado).toBe(800000);
        expect(r.totales).toMatchObject({ pagado: 800000, deudaPendiente: 3000000, conDeuda: 1 });
    });
    it('aplica periodo, tipo de tercero y búsqueda por nombre o documento', () => {
        const pagoJuan = { id: 'p2', fecha: '2026-11-06', tipo_movimiento: 'EGRESO', tercero_id: 'juan', monto: 100 };
        const datos = { transacciones: [abono, compra, pagoJuan], deudasTerceros: [], tercerosPorId };
        expect(resumenProveedores(datos, { desde: '2026-11-03' }).filas.map((f) => [f.id, f.pagado]))
            .toEqual([['ferre', 800000], ['juan', 100]]);
        expect(resumenProveedores(datos, { tipo: 'Empleado' }).filas.map((f) => f.id)).toEqual(['juan']);
        expect(resumenProveedores(datos, { busqueda: '900123' }).filas.map((f) => f.id)).toEqual(['ferre']);
    });
    it('ordena por deuda y deja los últimos pagos más recientes primero', () => {
        const datos = {
            transacciones: [compra, abono, { id: 'p', fecha: '2026-11-06', tipo_movimiento: 'EGRESO', tercero_id: 'juan', monto: 9e9 }],
            deudasTerceros: [deuda, { tercero_id: 'juan', monto_original: 10, monto_pendiente: 0 }],
            tercerosPorId,
        };
        const r = resumenProveedores(datos, { orden: 'deuda' });
        expect(r.filas.map((f) => f.id)).toEqual(['ferre', 'juan']);
        expect(r.filas[0].ultimosPagos.map((t) => t.id)).toEqual(['c1', 'a1']);
        expect(r.filas[1].deudaPendiente).toBe(0);
    });
});
