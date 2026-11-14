import { describe, it, expect } from 'vitest';
import { resumenDeudas, estadoDe, pagosDe } from './calculos';

const deudas = [
    { id: 'a', monto_original: 1000, monto_pendiente: 1000, fecha_deuda: '2026-10-01', descripcion: 'Arena' },
    { id: 'b', monto_original: 1000, monto_pendiente: '400', fecha_deuda: '2026-11-01' },
    // Residuo de coma flotante: el estado guardado decía PARCIAL para siempre.
    { id: 'c', monto_original: 100000.1, monto_pendiente: 0.000001, estado: 'PARCIAL', fecha_deuda: '2026-09-01' },
];

describe('estadoDe', () => {
    it('calcula el estado con la regla de dinero, no el guardado', () => {
        expect(deudas.map(estadoDe)).toEqual(['PENDIENTE', 'PARCIAL', 'PAGADA']);
    });
});

describe('resumenDeudas', () => {
    it('por defecto muestra solo las abiertas, agrupadas por estado con totales', () => {
        const r = resumenDeudas(deudas);
        expect(r.grupos.map((g) => [g.id, g.filas.length, g.pendiente])).toEqual([['PENDIENTE', 1, 1000], ['PARCIAL', 1, 400]]);
        expect(r.totales).toEqual({ original: 2000, pendiente: 1400, abonado: 600, cantidad: 2 });
        expect(r.grupos[1].filas[0].fraccionAbonada).toBeCloseTo(0.6);
    });
    it('filtra pagadas y busca por texto', () => {
        expect(resumenDeudas(deudas, { estado: 'PAGADA' }).totales.cantidad).toBe(1);
        expect(resumenDeudas(deudas, { estado: 'todas', busqueda: 'arena' }).totales.cantidad).toBe(1);
        expect(resumenDeudas(deudas, { estado: 'todas', busqueda: 'ferre', textoDe: (d) => (d.id === 'b' ? 'Ferretería' : '') }).grupos[0].filas[0].deuda.id).toBe('b');
    });
});

describe('pagosDe', () => {
    it('acepta arreglo, JSON en texto o nada', () => {
        expect(pagosDe({ pagos: [{ monto: 1 }] })).toHaveLength(1);
        expect(pagosDe({ pagos: '[{"monto":1},{"monto":2}]' })).toHaveLength(2);
        expect(pagosDe({ pagos: 'no es json' })).toEqual([]);
        expect(pagosDe({})).toEqual([]);
    });
});
