import { describe, it, expect } from 'vitest';
import {
    efectoEnSaldos,
    revertirAjustes,
    efectoDeBorrado,
    efectoDeEdicion,
} from './efectoEnSaldos';

describe('efectoEnSaldos', () => {
    it('INGRESO suma al origen', () => {
        const mov = { tipo_movimiento: 'INGRESO', monto: 1000, caja_origen_id: 'A' };
        expect(efectoEnSaldos(mov)).toEqual([{ cajaId: 'A', delta: 1000 }]);
    });

    it('INGRESO sin caja origen no produce ajustes', () => {
        const mov = { tipo_movimiento: 'INGRESO', monto: 1000 };
        expect(efectoEnSaldos(mov)).toEqual([]);
    });

    it('EGRESO resta del origen', () => {
        const mov = { tipo_movimiento: 'EGRESO', monto: 1000, caja_origen_id: 'A' };
        expect(efectoEnSaldos(mov)).toEqual([{ cajaId: 'A', delta: -1000 }]);
    });

    it('EGRESO sin caja origen no produce ajustes', () => {
        const mov = { tipo_movimiento: 'EGRESO', monto: 1000 };
        expect(efectoEnSaldos(mov)).toEqual([]);
    });

    it('TRANSFERENCIA resta del origen y suma al destino, en ese orden', () => {
        const mov = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };
        expect(efectoEnSaldos(mov)).toEqual([
            { cajaId: 'A', delta: -1000 },
            { cajaId: 'B', delta: 1000 },
        ]);
    });

    it('TRANSFERENCIA suma neta 0 en el sistema', () => {
        const mov = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1500,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };
        const ajustes = efectoEnSaldos(mov);
        const suma = ajustes.reduce((acc, a) => acc + a.delta, 0);
        expect(suma).toBe(0);
    });

    it('TRANSFERENCIA sin destino (legacy) solo afecta el origen', () => {
        const mov = { tipo_movimiento: 'TRANSFERENCIA', monto: 1000, caja_origen_id: 'A' };
        expect(efectoEnSaldos(mov)).toEqual([{ cajaId: 'A', delta: -1000 }]);
    });

    it('TRANSFERENCIA sin origen solo afecta el destino', () => {
        const mov = { tipo_movimiento: 'TRANSFERENCIA', monto: 1000, caja_destino_id: 'B' };
        expect(efectoEnSaldos(mov)).toEqual([{ cajaId: 'B', delta: 1000 }]);
    });

    it('tipo desconocido no produce ajustes', () => {
        const mov = { tipo_movimiento: 'OTRO', monto: 1000, caja_origen_id: 'A' };
        expect(efectoEnSaldos(mov)).toEqual([]);
    });

    it('movimiento null o undefined no produce ajustes', () => {
        expect(efectoEnSaldos(null)).toEqual([]);
        expect(efectoEnSaldos(undefined)).toEqual([]);
    });

    it('acepta el monto como string', () => {
        const mov = { tipo_movimiento: 'INGRESO', monto: '1500', caja_origen_id: 'A' };
        expect(efectoEnSaldos(mov)).toEqual([{ cajaId: 'A', delta: 1500 }]);
    });

    it('normaliza -0 a 0', () => {
        const mov = { tipo_movimiento: 'EGRESO', monto: 0, caja_origen_id: 'A' };
        const [ajuste] = efectoEnSaldos(mov);
        expect(Object.is(ajuste.delta, -0)).toBe(false);
        expect(ajuste.delta).toBe(0);
    });
});

describe('revertirAjustes', () => {
    it('niega cada delta manteniendo el orden', () => {
        const ajustes = [
            { cajaId: 'A', delta: -1000 },
            { cajaId: 'B', delta: 1000 },
        ];
        expect(revertirAjustes(ajustes)).toEqual([
            { cajaId: 'A', delta: 1000 },
            { cajaId: 'B', delta: -1000 },
        ]);
    });

    it('normaliza -0 a 0 al negar', () => {
        const ajustes = [{ cajaId: 'A', delta: 0 }];
        expect(revertirAjustes(ajustes)).toEqual([{ cajaId: 'A', delta: 0 }]);
    });
});

describe('efectoDeBorrado', () => {
    it('revierte el efecto de un ingreso', () => {
        const mov = { tipo_movimiento: 'INGRESO', monto: 1000, caja_origen_id: 'A' };
        expect(efectoDeBorrado(mov)).toEqual([{ cajaId: 'A', delta: -1000 }]);
    });

    it('revierte una transferencia legacy sin destino (solo origen)', () => {
        const mov = { tipo_movimiento: 'TRANSFERENCIA', monto: 1000, caja_origen_id: 'A' };
        expect(efectoDeBorrado(mov)).toEqual([{ cajaId: 'A', delta: 1000 }]);
    });
});

describe('efectoDeEdicion', () => {
    it('produce las 4 entradas en orden: revertir origen, revertir destino, aplicar origen, aplicar destino', () => {
        const original = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };
        const actualizado = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 500,
            caja_origen_id: 'C',
            caja_destino_id: 'D',
        };
        expect(efectoDeEdicion(original, actualizado)).toEqual([
            { cajaId: 'A', delta: 1000 },
            { cajaId: 'B', delta: -1000 },
            { cajaId: 'C', delta: -500 },
            { cajaId: 'D', delta: 500 },
        ]);
    });

    it('EGRESO en caja A editado a INGRESO en caja B', () => {
        const original = { tipo_movimiento: 'EGRESO', monto: 1000, caja_origen_id: 'A' };
        const actualizado = { tipo_movimiento: 'INGRESO', monto: 1000, caja_origen_id: 'B' };
        expect(efectoDeEdicion(original, actualizado)).toEqual([
            { cajaId: 'A', delta: 1000 },
            { cajaId: 'B', delta: 1000 },
        ]);
    });
});
