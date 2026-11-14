import { describe, it, expect } from 'vitest';
import { validarMovimiento } from './validarMovimiento';

const FECHA = '2026-03-15';

describe('validarMovimiento', () => {
    it('un INGRESO válido no produce errores', () => {
        const mov = { tipo_movimiento: 'INGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
        expect(validarMovimiento(mov)).toEqual([]);
    });

    it('un EGRESO válido no produce errores', () => {
        const mov = { tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
        expect(validarMovimiento(mov)).toEqual([]);
    });

    it('una TRANSFERENCIA válida no produce errores', () => {
        const mov = {
            tipo_movimiento: 'TRANSFERENCIA',
            fecha: FECHA,
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };
        expect(validarMovimiento(mov)).toEqual([]);
    });

    it('TIPO_INVALIDO cuando el tipo no existe', () => {
        const mov = { tipo_movimiento: 'OTRO', monto: 1000, caja_origen_id: 'A' };
        const errores = validarMovimiento(mov);
        expect(errores).toContainEqual({
            campo: 'tipo_movimiento',
            codigo: 'TIPO_INVALIDO',
            mensaje: 'Tipo de movimiento no válido.',
        });
    });

    it('MONTO_INVALIDO cuando el monto es 0 (bug C18)', () => {
        const mov = { tipo_movimiento: 'INGRESO', monto: 0, caja_origen_id: 'A' };
        const errores = validarMovimiento(mov);
        expect(errores).toContainEqual({
            campo: 'monto',
            codigo: 'MONTO_INVALIDO',
            mensaje: 'El monto debe ser mayor a 0.',
        });
    });

    it('MONTO_INVALIDO cuando el monto es negativo', () => {
        const mov = { tipo_movimiento: 'INGRESO', monto: -100, caja_origen_id: 'A' };
        const errores = validarMovimiento(mov);
        expect(errores.some((e) => e.codigo === 'MONTO_INVALIDO')).toBe(true);
    });

    it('MONTO_INVALIDO cuando el monto no es finito', () => {
        const mov = { tipo_movimiento: 'INGRESO', monto: NaN, caja_origen_id: 'A' };
        const errores = validarMovimiento(mov);
        expect(errores.some((e) => e.codigo === 'MONTO_INVALIDO')).toBe(true);
    });

    it('acepta el monto como string numérico', () => {
        const mov = { tipo_movimiento: 'INGRESO', fecha: FECHA, monto: '1500', caja_origen_id: 'A' };
        expect(validarMovimiento(mov)).toEqual([]);
    });

    it('CAJA_ORIGEN_REQUERIDA cuando falta la caja origen', () => {
        const mov = { tipo_movimiento: 'INGRESO', monto: 1000 };
        const errores = validarMovimiento(mov);
        expect(errores).toContainEqual({
            campo: 'caja_origen_id',
            codigo: 'CAJA_ORIGEN_REQUERIDA',
            mensaje: 'Elige la caja del movimiento.',
        });
    });

    it('CAJA_DESTINO_REQUERIDA cuando una transferencia no tiene destino', () => {
        const mov = { tipo_movimiento: 'TRANSFERENCIA', monto: 1000, caja_origen_id: 'A' };
        const errores = validarMovimiento(mov);
        expect(errores).toContainEqual({
            campo: 'caja_destino_id',
            codigo: 'CAJA_DESTINO_REQUERIDA',
            mensaje: 'Una transferencia necesita caja destino. Elige a dónde va el dinero.',
        });
    });

    it('CAJAS_IGUALES cuando origen y destino son la misma caja', () => {
        const mov = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'A',
        };
        const errores = validarMovimiento(mov);
        expect(errores).toContainEqual({
            campo: 'caja_destino_id',
            codigo: 'CAJAS_IGUALES',
            mensaje: 'La caja origen y la caja destino deben ser diferentes.',
        });
    });

    it('no exige caja_destino_id en un INGRESO', () => {
        const mov = { tipo_movimiento: 'INGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
        const errores = validarMovimiento(mov);
        expect(errores.some((e) => e.campo === 'caja_destino_id')).toBe(false);
    });

    it('no exige caja_destino_id en un EGRESO', () => {
        const mov = { tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
        const errores = validarMovimiento(mov);
        expect(errores.some((e) => e.campo === 'caja_destino_id')).toBe(false);
    });

    it('acumula varios errores a la vez', () => {
        const mov = { tipo_movimiento: 'OTRO', monto: 0 };
        const errores = validarMovimiento(mov);
        expect(errores.length).toBeGreaterThanOrEqual(3);
    });

    describe('fecha (bug MOV-2)', () => {
        const base = { tipo_movimiento: 'EGRESO', monto: 1000, caja_origen_id: 'A' };
        const codigosDeFecha = (mov) => validarMovimiento(mov)
            .filter((e) => e.campo === 'fecha')
            .map((e) => e.codigo);

        it('FECHA_REQUERIDA cuando la fecha está vacía (selector borrado)', () => {
            expect(codigosDeFecha({ ...base, fecha: '' })).toEqual(['FECHA_REQUERIDA']);
        });

        it('FECHA_REQUERIDA cuando falta la fecha', () => {
            expect(codigosDeFecha(base)).toEqual(['FECHA_REQUERIDA']);
            expect(codigosDeFecha({ ...base, fecha: null })).toEqual(['FECHA_REQUERIDA']);
        });

        it('FECHA_INVALIDA cuando el día no existe', () => {
            expect(codigosDeFecha({ ...base, fecha: '2026-02-30' })).toEqual(['FECHA_INVALIDA']);
            expect(codigosDeFecha({ ...base, fecha: '2026-13-01' })).toEqual(['FECHA_INVALIDA']);
        });

        it('FECHA_INVALIDA cuando no es YYYY-MM-DD', () => {
            expect(codigosDeFecha({ ...base, fecha: '15/03/2026' })).toEqual(['FECHA_INVALIDA']);
            expect(codigosDeFecha({ ...base, fecha: '2026-03-15T10:00:00.000Z' })).toEqual(['FECHA_INVALIDA']);
            expect(codigosDeFecha({ ...base, fecha: 20260315 })).toEqual(['FECHA_INVALIDA']);
        });

        it('acepta un día real, incluido el 29 de febrero de un año bisiesto', () => {
            expect(codigosDeFecha({ ...base, fecha: '2026-03-15' })).toEqual([]);
            expect(codigosDeFecha({ ...base, fecha: '2028-02-29' })).toEqual([]);
            expect(codigosDeFecha({ ...base, fecha: '2027-02-29' })).toEqual(['FECHA_INVALIDA']);
        });
    });
});
