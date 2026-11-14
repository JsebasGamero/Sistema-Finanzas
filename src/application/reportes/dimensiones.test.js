import { describe, it, expect } from 'vitest';
import { conjuntoPorId } from './conjuntos';
import { dimensionesDe, dimensionPorId, SIN_DATO } from './dimensiones';

const movimientos = conjuntoPorId('movimientos');

describe('dimensionesDe', () => {
    const ids = dimensionesDe(movimientos).map((d) => d.id);

    it('incluye columnas de texto y sí/no, y las derivadas de la fecha', () => {
        expect(ids).toEqual(expect.arrayContaining([
            'tipo', 'categoria', 'obra', 'caja', 'proveedor', 'usuario', 'es_deuda', 'soporte',
            'fecha:anio', 'fecha:trimestre', 'fecha:mes', 'fecha:semana', 'fecha:dia', 'fecha:dia_semana',
        ]));
    });

    it('no incluye cifras ni columnas marcadas como no agrupables', () => {
        expect(ids).not.toContain('monto');
        expect(ids).not.toContain('creado');
        const idsCajas = dimensionesDe(conjuntoPorId('cajas')).map((d) => d.id);
        expect(idsCajas).not.toContain('numero_cuenta');
        expect(idsCajas.some((id) => id.includes(':'))).toBe(false);
    });

    it('devuelve el mismo arreglo para el mismo conjunto', () => {
        expect(dimensionesDe(movimientos)).toBe(dimensionesDe(movimientos));
    });
});

describe('valores y rótulos', () => {
    it('los vacíos se agrupan como "(sin dato)"', () => {
        const obra = dimensionPorId(movimientos, 'obra');
        expect(obra.valor({ obra: '' })).toBe(SIN_DATO);
        expect(obra.valor({ obra: null })).toBe(SIN_DATO);
        expect(obra.valor({ obra: '  Edificio  ' })).toBe('Edificio');
        expect(dimensionPorId(movimientos, 'fecha:mes').valor({ fecha: null })).toBe(SIN_DATO);
    });

    it('sí/no', () => {
        const deuda = dimensionPorId(movimientos, 'es_deuda');
        expect(deuda.valor({ es_deuda: true })).toBe('Sí');
        expect(deuda.valor({ es_deuda: false })).toBe('No');
    });

    it('mes: clave YYYY-MM y rótulo del mismo mes (no el anterior)', () => {
        const mes = dimensionPorId(movimientos, 'fecha:mes');
        expect(mes.valor({ fecha: '2026-03-01' })).toBe('2026-03');
        expect(mes.etiquetaDe('2026-03')).toBe('mar 2026');
    });

    it('año, trimestre, semana, día y día de la semana', () => {
        const fila = { fecha: '2026-03-02' }; // lunes
        expect(dimensionPorId(movimientos, 'fecha:anio').valor(fila)).toBe('2026');
        const trimestre = dimensionPorId(movimientos, 'fecha:trimestre');
        expect(trimestre.valor(fila)).toBe('2026-T1');
        expect(trimestre.etiquetaDe('2026-T1')).toBe('T1 2026');
        const semana = dimensionPorId(movimientos, 'fecha:semana');
        expect(semana.valor(fila)).toBe('2026-S10');
        expect(semana.etiquetaDe('2026-S10')).toBe('Sem 10 · 2026');
        const dia = dimensionPorId(movimientos, 'fecha:dia');
        expect(dia.valor(fila)).toBe('2026-03-02');
        expect(dia.etiquetaDe('2026-03-02')).toBe('02 mar 2026');
        const diaSemana = dimensionPorId(movimientos, 'fecha:dia_semana');
        expect(diaSemana.valor(fila)).toBe('1');
        expect(diaSemana.etiquetaDe('1')).toBe('Lunes');
        expect(diaSemana.etiquetaDe('7')).toBe('Domingo');
    });
});

describe('orden', () => {
    it('cronológico para fechas, con los vacíos al final', () => {
        const mes = dimensionPorId(movimientos, 'fecha:mes');
        expect(['2026-10', SIN_DATO, '2025-12', '2026-02'].sort(mes.comparar))
            .toEqual(['2025-12', '2026-02', '2026-10', SIN_DATO]);
        const diaSemana = dimensionPorId(movimientos, 'fecha:dia_semana');
        expect(['7', '1', '3'].sort(diaSemana.comparar)).toEqual(['1', '3', '7']);
    });

    it('alfabético sin distinguir tildes para texto', () => {
        const categoria = dimensionPorId(movimientos, 'categoria');
        expect(['Nómina', SIN_DATO, 'Arena', 'nomina 2'].sort(categoria.comparar))
            .toEqual(['Arena', 'Nómina', 'nomina 2', SIN_DATO]);
    });
});
