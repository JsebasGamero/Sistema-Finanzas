import { describe, it, expect } from 'vitest';
import { empresaDeMovimiento } from './empresaDeMovimiento';

const indices = {
    proyectosPorId: new Map([['p1', { id: 'p1', empresa_id: 'eObra' }], ['p2', { id: 'p2' }]]),
    cajasPorId: new Map([['c1', { id: 'c1', empresa_id: 'eCaja' }]]),
};

describe('empresaDeMovimiento', () => {
    it('manda la empresa de la obra aunque la caja sea de otra empresa', () => {
        expect(empresaDeMovimiento({ proyecto_id: 'p1', caja_origen_id: 'c1' }, indices)).toBe('eObra');
    });

    it('sin obra (o con obra sin empresa) usa la caja de origen', () => {
        expect(empresaDeMovimiento({ caja_origen_id: 'c1' }, indices)).toBe('eCaja');
        expect(empresaDeMovimiento({ proyecto_id: 'p2', caja_origen_id: 'c1' }, indices)).toBe('eCaja');
    });

    it('null si no hay de dónde sacarla', () => {
        expect(empresaDeMovimiento({ caja_origen_id: 'otra' }, indices)).toBeNull();
        expect(empresaDeMovimiento(null, indices)).toBeNull();
        expect(empresaDeMovimiento({ proyecto_id: 'p1' }, {})).toBeNull();
    });
});
