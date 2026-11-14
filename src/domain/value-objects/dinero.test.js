import { describe, it, expect } from 'vitest';
import { redondearMonto, esCero, restarMontos, estadoDeuda, aMonto } from './dinero';

describe('redondearMonto', () => {
    it('elimina el ruido de coma flotante a 2 decimales', () => {
        expect(redondearMonto(100000.1 - 100000)).not.toBe(0);
        expect(redondearMonto(1500.005)).toBeCloseTo(1500.01, 2);
    });

    it('trata valores no numéricos como 0', () => {
        expect(redondearMonto(null)).toBe(0);
        expect(redondearMonto('abc')).toBe(0);
    });
});

describe('esCero', () => {
    it('considera cero un residuo de coma flotante', () => {
        expect(esCero(1e-8)).toBe(true);
    });

    it('no considera cero un monto real', () => {
        expect(esCero(1)).toBe(false);
    });
});

describe('restarMontos', () => {
    it('colapsa un residuo de 1e-8 a 0', () => {
        expect(restarMontos(100000.1, 100000.1 + 1e-8)).toBe(0);
    });

    it('resta montos normales', () => {
        expect(restarMontos(1500, 500)).toBe(1000);
    });
});

describe('estadoDeuda', () => {
    it('PENDIENTE cuando lo pendiente es igual al original', () => {
        expect(estadoDeuda(1000, 1000)).toBe('PENDIENTE');
    });

    it('PARCIAL cuando queda algo pero no todo', () => {
        expect(estadoDeuda(500, 1000)).toBe('PARCIAL');
    });

    it('PAGADA cuando lo pendiente es cero', () => {
        expect(estadoDeuda(0, 1000)).toBe('PAGADA');
    });

    it('PAGADA con residuo de coma flotante', () => {
        expect(estadoDeuda(1e-8, 1000)).toBe('PAGADA');
    });
});

describe('aMonto', () => {
    it('normaliza null a 0', () => {
        expect(aMonto(null)).toBe(0);
    });

    it('normaliza undefined a 0', () => {
        expect(aMonto(undefined)).toBe(0);
    });

    it('normaliza NaN a 0', () => {
        expect(aMonto(NaN)).toBe(0);
    });

    it('normaliza una cadena no numérica a 0', () => {
        expect(aMonto('abc')).toBe(0);
    });

    it('parsea una cadena numérica', () => {
        expect(aMonto('12.5')).toBe(12.5);
    });

    it('deja pasar un número', () => {
        expect(aMonto(1500)).toBe(1500);
    });
});
