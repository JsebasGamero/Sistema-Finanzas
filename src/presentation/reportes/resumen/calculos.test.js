import { describe, it, expect } from 'vitest';
import {
    filtrarParaTablero, flujoMensual, egresosPorCategoria, saldosPorCaja, netoAcumulado,
    proveedoresMasPagados, indicadoresTablero, siguienteMes, lunesDe,
} from './calculos';

let secuencia = 0;
const tx = (props) => ({ id: `t${secuencia++}`, monto: 100, tipo_movimiento: 'EGRESO', fecha: '2026-11-10', ...props });

const indices = {
    proyectosPorId: new Map([
        ['tarra', { id: 'tarra', empresa_id: 'mavicol' }],
        ['hospital', { id: 'hospital', empresa_id: 'otra' }],
    ]),
    cajasPorId: new Map([
        ['banco', { id: 'banco', empresa_id: 'mavicol' }],
        ['menor', { id: 'menor', empresa_id: 'otra' }],
    ]),
};

describe('filtrarParaTablero (REP-5)', () => {
    const movimientos = [
        tx({ fecha: '2026-11-05', proyecto_id: 'tarra' }),
        tx({ fecha: '2026-10-31', proyecto_id: 'tarra' }),
        tx({ fecha: '2026-11-20', proyecto_id: 'hospital' }),
        tx({ fecha: '2026-11-21T22:00:00-05:00', caja_origen_id: 'banco' }),
    ];
    it('aplica periodo y obra', () => {
        const r = filtrarParaTablero(movimientos, { desde: '2026-11-01', hasta: '2026-11-30', proyectoId: 'tarra' }, indices);
        expect(r).toHaveLength(1);
        expect(r[0].fecha).toBe('2026-11-05');
    });
    it('filtra por empresa deducida de la obra o de la caja', () => {
        const r = filtrarParaTablero(movimientos, { desde: '2026-11-01', hasta: '2026-11-30', empresaId: 'mavicol' }, indices);
        expect(r.map((t) => t.fecha)).toEqual(['2026-11-05', '2026-11-21T22:00:00-05:00']);
    });
});

describe('flujoMensual (REP-4)', () => {
    it('rotula cada mes con su propio nombre, no con el anterior', () => {
        const r = flujoMensual([tx({ fecha: '2026-11-01', tipo_movimiento: 'INGRESO', monto: 500 })]);
        expect(r).toEqual([{ mes: '2026-11', etiqueta: 'nov 2026', corta: 'nov', ingresos: 500, egresos: 0, neto: 500 }]);
    });
    it('rellena con cero los meses sin movimientos dentro del periodo', () => {
        const r = flujoMensual(
            [tx({ fecha: '2026-03-15', monto: '200' }), tx({ fecha: '2026-05-02', tipo_movimiento: 'INGRESO', monto: 900 })],
            { desde: '2026-01-01', hasta: '2026-05-31' },
        );
        expect(r.map((m) => m.mes)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
        expect(r[2]).toMatchObject({ egresos: 200, neto: -200 });
        expect(r[4]).toMatchObject({ ingresos: 900, neto: 900 });
    });
    it('ignora transferencias y pone el año corto si el rango cruza años', () => {
        const r = flujoMensual([
            tx({ fecha: '2026-12-10' }),
            tx({ fecha: '2027-01-10', tipo_movimiento: 'TRANSFERENCIA', monto: 1e9 }),
            tx({ fecha: '2027-01-11', tipo_movimiento: 'INGRESO' }),
        ]);
        expect(r.map((m) => m.corta)).toEqual(['dic 26', 'ene 27']);
        expect(r[1].egresos).toBe(0);
    });
    it('sin ingresos ni egresos devuelve vacío', () => {
        expect(flujoMensual([tx({ tipo_movimiento: 'TRANSFERENCIA' })])).toEqual([]);
    });
    it('siguienteMes cruza el año sin Date', () => {
        expect(siguienteMes('2026-12')).toBe('2027-01');
        expect(siguienteMes('2026-09')).toBe('2026-10');
    });
});

describe('egresosPorCategoria (REP-7, REP-8)', () => {
    const categorias = [{ id: 'a3f1c8e2-4b5d-4c6e-8f90-123456789abc', nombre: 'Materiales' }];
    const resolver = (valor) => {
        if (!valor) return 'Sin categoría';
        return categorias.find((c) => c.id === valor)?.nombre ?? valor;
    };

    it('el porcentaje es sobre el total de egresos y "Otras" agrupa el resto', () => {
        const montos = { Nomina: 24, Materiales: 15, ACPM: 8, Transporte: 7, Viaticos: 6, A: 5, B: 5, C: 5, D: 5, E: 5, F: 5, G: 5, H: 5 };
        const movimientos = Object.entries(montos).map(([categoria, m]) => tx({ categoria, monto: m * 1e6 }));
        const r = egresosPorCategoria(movimientos, resolver, 8);
        // Escenario del hallazgo: Nómina es el 24 % del gasto, no el 40 % del top 5.
        expect(r.total).toBe(100e6);
        expect(r.filas).toHaveLength(9);
        expect(r.filas[0]).toMatchObject({ nombre: 'Nomina', monto: 24e6 });
        expect(r.filas[0].fraccion).toBeCloseTo(0.24);
        expect(r.filas[8]).toMatchObject({ nombre: 'Otras (5)', monto: 25e6, esOtras: true });
        expect(r.filas.reduce((s, f) => s + f.fraccion, 0)).toBeCloseTo(1);
    });
    it('un UUID legacy se suma a su categoría por nombre', () => {
        const r = egresosPorCategoria([
            tx({ categoria: 'Materiales', monto: 100 }),
            tx({ categoria: 'a3f1c8e2-4b5d-4c6e-8f90-123456789abc', monto: 50 }),
            tx({ categoria: null, monto: 10 }),
        ], resolver);
        expect(r.filas.map((f) => [f.nombre, f.monto])).toEqual([['Materiales', 150], ['Sin categoría', 10]]);
    });
    it('con una sola categoría de sobra no crea "Otras"', () => {
        const movimientos = 'abcdefghi'.split('').map((c) => tx({ categoria: c }));
        expect(egresosPorCategoria(movimientos, resolver, 8).filas.some((f) => f.esOtras)).toBe(false);
    });
});

describe('saldosPorCaja', () => {
    it('ordena de mayor a menor y respeta la empresa', () => {
        const cajas = [
            { id: '1', nombre: 'Menor', saldo_actual: '-200', empresa_id: 'e1' },
            { id: '2', nombre: 'Banco', saldo_actual: 5000, empresa_id: 'e1' },
            { id: '3', nombre: 'Otra', saldo_actual: 10, empresa_id: 'e2' },
        ];
        expect(saldosPorCaja(cajas, { empresaId: 'e1' }).map((c) => [c.nombre, c.saldo])).toEqual([['Banco', 5000], ['Menor', -200]]);
    });
});

describe('netoAcumulado', () => {
    it('acumula por día en periodos cortos', () => {
        const r = netoAcumulado([
            tx({ fecha: '2026-11-02', tipo_movimiento: 'INGRESO', monto: 1000 }),
            tx({ fecha: '2026-11-02', monto: 300 }),
            tx({ fecha: '2026-11-05', monto: 200 }),
            tx({ fecha: '2026-11-04', tipo_movimiento: 'TRANSFERENCIA', monto: 9999 }),
        ], { desde: '2026-11-01', hasta: '2026-11-30' });
        expect(r.granularidad).toBe('dia');
        expect(r.puntos.map((p) => [p.clave, p.acumulado, p.corta])).toEqual([
            ['2026-11-02', 700, '2 nov'],
            ['2026-11-05', 500, '5 nov'],
        ]);
    });
    it('agrupa por semana (lunes) en periodos largos', () => {
        const r = netoAcumulado([
            tx({ fecha: '2026-11-11', tipo_movimiento: 'INGRESO', monto: 100 }),
            tx({ fecha: '2026-11-13', tipo_movimiento: 'INGRESO', monto: 50 }),
            tx({ fecha: '2026-11-16', monto: 30 }),
        ], { desde: '2026-01-01', hasta: '2026-12-31' });
        expect(r.granularidad).toBe('semana');
        expect(r.puntos.map((p) => [p.clave, p.acumulado])).toEqual([['2026-11-09', 150], ['2026-11-16', 120]]);
        expect(r.puntos[0].etiqueta).toMatch(/^Semana del 09\D.*nov/);
    });
    it('lunesDe usa la semana de lunes a domingo', () => {
        expect(lunesDe('2026-11-15')).toBe('2026-11-09');
        expect(lunesDe('2026-11-16')).toBe('2026-11-16');
    });
});

describe('proveedoresMasPagados', () => {
    it('suma egresos por tercero y deja el top', () => {
        const nombre = (id, vacio) => ({ f: 'Ferretería' }[id] ?? vacio);
        const r = proveedoresMasPagados([
            tx({ tercero_id: 'f', monto: 100 }),
            tx({ tercero_id: 'f', monto: '50' }),
            tx({ tercero_id: 'g', monto: 300 }),
            tx({ tercero_id: 'f', tipo_movimiento: 'INGRESO', monto: 999 }),
        ], nombre, 1);
        expect(r.cantidad).toBe(2);
        expect(r.filas).toEqual([{ id: 'g', nombre: 'Tercero sin registro', monto: 300, fraccion: 300 / 450 }]);
    });
});

describe('indicadoresTablero', () => {
    const datos = {
        ...indices,
        cajas: [
            { id: 'banco', saldo_actual: '1000', empresa_id: 'mavicol' },
            { id: 'menor', saldo_actual: 200, empresa_id: 'otra' },
        ],
        deudasTerceros: [
            { tercero_id: 'x', monto_pendiente: 300, proyecto_id: 'tarra' },
            { tercero_id: 'y', monto_pendiente: 0.001, proyecto_id: 'tarra' },
            { tercero_id: 'z', monto_pendiente: 50, empresa_id: 'otra' },
        ],
        deudasCajas: [
            { caja_deudora_id: 'menor', caja_acreedora_id: 'banco', monto_pendiente: 70 },
            { caja_deudora_id: 'menor', caja_acreedora_id: 'menor', monto_pendiente: 0 },
        ],
    };
    it('saldo y deudas son de hoy y respetan la empresa', () => {
        const r = indicadoresTablero(datos, { empresaId: 'mavicol' }, [tx({ tipo_movimiento: 'INGRESO', monto: 10 })]);
        expect(r).toMatchObject({
            ingresos: 10, egresos: 0, neto: 10,
            saldoCajas: 1000, numCajas: 1,
            porPagar: 300, numDeudas: 1,
            prestamosPendientes: 70, numPrestamos: 1,
        });
    });
    it('el filtro de obra limita las deudas a proveedores', () => {
        const r = indicadoresTablero(datos, { proyectoId: 'hospital' }, []);
        expect(r.porPagar).toBe(0);
        expect(r.saldoCajas).toBe(1200);
    });
});
