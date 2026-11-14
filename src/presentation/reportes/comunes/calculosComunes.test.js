import { describe, it, expect } from 'vitest';
import {
    sumarMontos, empresaDeMovimiento, totalesIngresosEgresos, efectoEnCaja, valorConSigno,
    crearComparador, normalizarTexto,
} from './calculosComunes';
import { crearPeriodo, rangoDePeriodo, cambiarPreset, describirPeriodo, PERIODO_PERSONALIZADO } from './periodo';

const tx = (props) => ({ id: props.id ?? 'x', monto: 100, tipo_movimiento: 'EGRESO', fecha: '2026-11-10', ...props });

describe('sumarMontos', () => {
    it('suma montos guardados como texto sin concatenar', () => {
        expect(sumarMontos([{ monto: '1000' }, { monto: 500 }, { monto: null }])).toBe(1500);
    });
});

describe('empresaDeMovimiento', () => {
    const indices = {
        proyectosPorId: new Map([['p1', { id: 'p1', empresa_id: 'eObra' }]]),
        cajasPorId: new Map([['c1', { id: 'c1', empresa_id: 'eCaja' }]]),
    };
    it('prefiere la empresa de la obra', () => {
        expect(empresaDeMovimiento(tx({ proyecto_id: 'p1', caja_origen_id: 'c1' }), indices)).toBe('eObra');
    });
    it('sin obra usa la empresa de la caja de origen', () => {
        expect(empresaDeMovimiento(tx({ caja_origen_id: 'c1' }), indices)).toBe('eCaja');
    });
    it('sin obra ni caja conocida devuelve null', () => {
        expect(empresaDeMovimiento(tx({ caja_origen_id: 'otra' }), indices)).toBeNull();
    });
});

describe('totalesIngresosEgresos', () => {
    it('las transferencias no son ingreso ni egreso', () => {
        const r = totalesIngresosEgresos([
            tx({ tipo_movimiento: 'INGRESO', monto: '5000' }),
            tx({ tipo_movimiento: 'EGRESO', monto: 1200 }),
            tx({ tipo_movimiento: 'TRANSFERENCIA', monto: 9999 }),
        ]);
        expect(r).toEqual({ ingresos: 5000, egresos: 1200, neto: 3800, transferencias: 9999, cantidad: 3 });
    });
});

describe('efectoEnCaja y valorConSigno', () => {
    const transferencia = tx({ tipo_movimiento: 'TRANSFERENCIA', monto: 5000, caja_origen_id: 'banco', caja_destino_id: 'menor' });
    it('una transferencia entra a destino y sale de origen', () => {
        expect(efectoEnCaja(transferencia, 'menor')).toBe(5000);
        expect(efectoEnCaja(transferencia, 'banco')).toBe(-5000);
        expect(efectoEnCaja(transferencia, 'otra')).toBe(0);
    });
    it('sin caja, la transferencia vale 0 y el egreso es negativo', () => {
        expect(valorConSigno(transferencia)).toBe(0);
        expect(valorConSigno(tx({ monto: '300' }))).toBe(-300);
        expect(valorConSigno(tx({ tipo_movimiento: 'INGRESO', monto: 300 }))).toBe(300);
    });
});

describe('crearComparador (REP-20)', () => {
    const a = tx({ id: 'a', fecha: '2026-11-10', created_at: '2026-11-10T13:00:00Z', monto: 10 });
    const b = tx({ id: 'b', fecha: '2026-11-10', created_at: '2026-11-10T20:00:00Z', monto: 10 });
    const c = tx({ id: 'c', fecha: '2026-11-09', created_at: '2026-11-09T08:00:00Z', monto: 50 });

    it('devuelve 0 solo para el mismo movimiento y es antisimétrico', () => {
        const cmp = crearComparador('fecha_desc');
        expect(cmp(a, a)).toBe(0);
        expect(Math.sign(cmp(a, b))).toBe(-Math.sign(cmp(b, a)));
    });
    it('dentro del mismo día desempata por hora de registro', () => {
        expect([a, c, b].sort(crearComparador('fecha_desc')).map((t) => t.id)).toEqual(['b', 'a', 'c']);
        expect([b, c, a].sort(crearComparador('fecha_asc')).map((t) => t.id)).toEqual(['c', 'a', 'b']);
    });
    it('ordena por monto y desempata por fecha', () => {
        expect([a, c, b].sort(crearComparador('monto_desc')).map((t) => t.id)).toEqual(['c', 'b', 'a']);
    });
});

describe('normalizarTexto', () => {
    it('quita tildes y mayúsculas', () => {
        expect(normalizarTexto('Crédito Ñandú')).toBe('credito nandu');
    });
});

describe('periodo', () => {
    const hoy = '2026-11-13';
    it('un preset se resuelve con la fecha de hoy', () => {
        expect(rangoDePeriodo(crearPeriodo('anio'), hoy)).toEqual({ desde: '2026-01-01', hasta: '2026-11-13' });
    });
    it('el rango manual al revés se endereza', () => {
        expect(rangoDePeriodo({ preset: PERIODO_PERSONALIZADO, desde: '2026-11-30', hasta: '2026-11-01' }))
            .toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
    });
    it('al pasar a personalizado conserva las fechas del preset anterior', () => {
        expect(cambiarPreset(crearPeriodo('mes'), PERIODO_PERSONALIZADO, hoy))
            .toEqual({ preset: PERIODO_PERSONALIZADO, desde: '2026-11-01', hasta: '2026-11-13' });
    });
    it('describe el periodo con fechas legibles', () => {
        expect(describirPeriodo(crearPeriodo('todo'), hoy)).toBe('Todo el histórico');
        // El texto exacto del mes depende de la versión de ICU ("01 nov" o
        // "01 de nov"): se comprueba la estructura, no el formato de Intl.
        expect(describirPeriodo(crearPeriodo('hoy'), hoy)).toMatch(/^Hoy: 13\D/);
        expect(describirPeriodo(crearPeriodo('mes'), hoy)).toMatch(/^Este mes: 01\D.*nov.* a 13\D.*nov/);
        expect(describirPeriodo({ preset: 'personalizado', desde: '', hasta: '2026-11-13' }, hoy)).toMatch(/^Rango personalizado: el inicio a 13/);
    });
});
