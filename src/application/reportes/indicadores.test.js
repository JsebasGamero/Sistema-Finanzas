import { describe, it, expect } from 'vitest';
import { CONJUNTOS, conjuntoPorId } from './conjuntos';
import { indicadoresDe } from './indicadores';
import { datosDeEjemplo } from './datosDeEjemplo';

const datos = datosDeEjemplo();
const filasDe = (id) => conjuntoPorId(id).construirFilas(datos, datos, { hoy: '2026-05-10' });
const porId = (indicadores) => Object.fromEntries(indicadores.map((i) => [i.id, i]));

describe('indicadoresDe', () => {
    it('movimientos: registros, ingresos, egresos, neto sin transferencias y promedio por egreso', () => {
        const ind = porId(indicadoresDe('movimientos', filasDe('movimientos')));
        expect(ind.registros.valor).toBe(7);
        expect(ind.registros.meta).toBe('1 pendiente de sincronizar');
        expect(ind.ingresos).toMatchObject({ valor: 3000000, formato: 'dinero', tono: 'pos' });
        expect(ind.egresos).toMatchObject({ valor: 2400000, tono: 'neg' });
        expect(ind.neto).toMatchObject({ valor: 600000, tono: 'pos' });
        expect(ind.promedio_egreso).toMatchObject({ valor: 600000, meta: '4 egresos' });
    });

    it('movimientos: se calcula sobre las filas que se le pasan (las filtradas)', () => {
        const soloEgresos = filasDe('movimientos').filter((f) => f.tipo === 'Egreso');
        const ind = porId(indicadoresDe('movimientos', soloEgresos));
        expect(ind.registros.valor).toBe(4);
        expect(ind.ingresos.valor).toBe(0);
        expect(ind.neto).toMatchObject({ valor: -2400000, tono: 'neg' });
    });

    it('cajas: saldo total y cajas en negativo', () => {
        const ind = porId(indicadoresDe('cajas', filasDe('cajas')));
        expect(ind.saldo_total.valor).toBe(2350000);
        expect(ind.cajas_negativas).toMatchObject({ valor: 1, tono: 'neg', meta: 'de 3 cajas' });
    });

    it('obras: ejecución solo con las obras que tienen presupuesto', () => {
        const ind = porId(indicadoresDe('obras', filasDe('obras')));
        expect(ind.presupuesto.valor).toBe(10000000);
        expect(ind.gastado.valor).toBe(2300000);
        expect(ind.ejecucion.valor).toBeCloseTo(0.23);
        expect(ind.ejecucion.formato).toBe('porcentaje');
    });

    it('proveedores y deudas', () => {
        const prov = porId(indicadoresDe('proveedores', filasDe('proveedores')));
        expect(prov.pagado.valor).toBe(2300000);
        expect(prov.pendiente.valor).toBe(700000);
        expect(prov.deudas_abiertas.valor).toBe(1);
        const deudas = porId(indicadoresDe('deudas_terceros', filasDe('deudas_terceros')));
        expect(deudas.original.valor).toBe(1500000);
        expect(deudas.abonado.valor).toBe(800000);
        expect(deudas.pendiente.valor).toBe(700000);
        expect(deudas.abiertas.valor).toBe(1);
    });

    it('todos los conjuntos tienen indicadores y aguantan listas vacías', () => {
        for (const conjunto of CONJUNTOS) {
            const lista = indicadoresDe(conjunto.id, []);
            expect(lista.length).toBeGreaterThan(0);
            for (const i of lista) {
                expect(['dinero', 'numero', 'porcentaje']).toContain(i.formato);
                expect(Number.isNaN(i.valor)).toBe(false);
            }
        }
    });
});
