import { describe, it, expect } from 'vitest';
import { resumenObras, ordenarPorEjecucion } from './calculos';

const datos = {
    proyectos: [
        { id: 'tarra', nombre: 'Vías El Tarra', estado: 'Activo', empresa_id: 'm', presupuesto_estimado: '1000' },
        { id: 'hosp', nombre: 'Hospital', estado: 'Activo', empresa_id: 'm', presupuesto_estimado: 100 },
        { id: 'casa', nombre: 'Casa', estado: 'Finalizado', empresa_id: 'o', presupuesto_estimado: 0 },
    ],
    cajasPorId: new Map([['banco', { id: 'banco', empresa_id: 'm' }]]),
    transacciones: [
        { id: '1', fecha: '2026-10-15', tipo_movimiento: 'EGRESO', monto: 600, proyecto_id: 'tarra', categoria: 'Materiales' },
        { id: '2', fecha: '2026-11-03', tipo_movimiento: 'EGRESO', monto: '200', proyecto_id: 'tarra', categoria: 'Nómina' },
        { id: '3', fecha: '2026-11-04', tipo_movimiento: 'INGRESO', monto: 5000, proyecto_id: 'tarra' },
        { id: '4', fecha: '2026-12-01', tipo_movimiento: 'EGRESO', monto: 900, proyecto_id: 'tarra' },
        { id: '5', fecha: '2026-11-05', tipo_movimiento: 'EGRESO', monto: 150, proyecto_id: 'hosp', categoria: 'Materiales' },
        { id: '6', fecha: '2026-11-06', tipo_movimiento: 'EGRESO', monto: 70, caja_origen_id: 'banco' },
        { id: '7', fecha: '2026-11-06', tipo_movimiento: 'TRANSFERENCIA', monto: 70, proyecto_id: 'tarra' },
    ],
};
const nombreCategoria = (v) => v || 'Sin categoría';

describe('resumenObras', () => {
    const r = resumenObras(datos, { desde: '2026-11-01', hasta: '2026-11-30' }, nombreCategoria);
    const tarra = r.filas.find((f) => f.id === 'tarra');

    it('ejecutado es acumulado hasta el fin del periodo; el periodo va aparte', () => {
        expect(tarra).toMatchObject({ presupuesto: 1000, ejecutado: 800, egresosPeriodo: 200, ingresosPeriodo: 5000, disponible: 200, excedida: false });
        expect(tarra.fraccion).toBeCloseTo(0.8);
        expect(tarra.movimientos.map((t) => t.id)).toEqual(['3', '2']);
    });
    it('desglosa por categoría el egreso del periodo', () => {
        expect(tarra.categorias).toEqual([{ nombre: 'Nómina', monto: 200, fraccion: 1 }]);
    });
    it('marca la obra excedida y cuenta egresos sin obra', () => {
        const hosp = r.filas.find((f) => f.id === 'hosp');
        expect(hosp).toMatchObject({ ejecutado: 150, disponible: -50, excedida: true });
        expect(r.sinObra).toBe(70);
    });
    it('una obra sin presupuesto no tiene % de ejecución', () => {
        expect(r.filas.find((f) => f.id === 'casa').fraccion).toBeNull();
    });
    it('ordena por % de ejecución y deja al final las que no tienen presupuesto', () => {
        expect(ordenarPorEjecucion(r.filas).map((f) => f.id)).toEqual(['hosp', 'tarra', 'casa']);
    });
    it('el disponible total solo cuenta las obras con presupuesto', () => {
        const r2 = resumenObras({
            proyectos: [
                { id: 'a', nombre: 'A', presupuesto_estimado: 100 },
                { id: 'b', nombre: 'B', presupuesto_estimado: 0 },
            ],
            transacciones: [
                { id: '1', fecha: '2026-11-01', tipo_movimiento: 'EGRESO', monto: 50, proyecto_id: 'a' },
                { id: '2', fecha: '2026-11-01', tipo_movimiento: 'EGRESO', monto: 80, proyecto_id: 'b' },
            ],
        });
        expect(r2.totales).toMatchObject({ presupuesto: 100, ejecutado: 130, disponible: 50, conPresupuesto: 1 });
    });
    it('el disponible total suma también las obras excedidas', () => {
        // tarra 1000 - 800 = 200; hosp 100 - 150 = -50; casa no tiene presupuesto.
        expect(r.totales).toMatchObject({ disponible: 150, conPresupuesto: 2 });
    });
    it('filtra por empresa y estado', () => {
        expect(resumenObras(datos, { empresaId: 'o' }).filas.map((f) => f.id)).toEqual(['casa']);
        expect(resumenObras(datos, { estado: 'Activo' }).sinObra).toBe(0);
    });
});
