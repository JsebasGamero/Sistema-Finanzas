import { describe, it, expect } from 'vitest';
import {
    construirTextosBusqueda, filtrarMovimientos, ordenarMovimientos, resumenFiltrado,
    subtotalesPorDia, agruparPorDia, valoresDistintos, describirFiltros,
} from './calculos';

const UUID_MATERIALES = 'a3f1c8e2-4b5d-4c6e-8f90-123456789abc';
const nombres = {
    caja: { banco: 'Banco MAVICOL', ruben: 'Caja Rubén' },
    tercero: { f: 'Ferretería X' },
    proyecto: { tarra: 'Vías El Tarra' },
};
const datos = {
    nombreCaja: (id, vacio = '') => nombres.caja[id] ?? vacio,
    nombreTercero: (id, vacio = '') => nombres.tercero[id] ?? vacio,
    nombreProyecto: (id, vacio = '') => nombres.proyecto[id] ?? vacio,
    nombreCategoria: (valor, vacio = 'Sin categoría') => {
        if (!valor) return vacio;
        return valor === UUID_MATERIALES ? 'Materiales' : valor;
    },
};

const movimientos = [
    { id: '1', fecha: '2026-11-03', created_at: '2026-11-03T10:00:00Z', tipo_movimiento: 'TRANSFERENCIA', monto: 5000000, caja_origen_id: 'banco', caja_destino_id: 'ruben', categoria: 'Préstamo entre Cajas' },
    { id: '2', fecha: '2026-11-04', created_at: '2026-11-04T10:00:00Z', tipo_movimiento: 'EGRESO', monto: '3000000', caja_origen_id: 'ruben', categoria: UUID_MATERIALES, descripcion: 'Cemento', tercero_id: 'f', proyecto_id: 'tarra', usuario_nombre: 'Ana' },
    { id: '3', fecha: '2026-11-04', created_at: '2026-11-04T15:00:00Z', tipo_movimiento: 'EGRESO', monto: 1200000, caja_origen_id: 'ruben', categoria: 'Nómina', usuario_nombre: 'Luis' },
    { id: '4', fecha: '2026-11-05', created_at: '2026-11-05T09:00:00Z', tipo_movimiento: 'INGRESO', monto: 9000000, caja_origen_id: 'banco', categoria: 'Anticipo' },
    { id: '5', fecha: '2026-10-28', created_at: '2026-10-28T09:00:00Z', tipo_movimiento: 'EGRESO', monto: 100, caja_origen_id: 'banco', categoria: 'Otros' },
];
const textos = construirTextosBusqueda(movimientos, datos);
const filtrar = (filtros) => filtrarMovimientos(movimientos, filtros, { textos, nombreCategoria: datos.nombreCategoria });

describe('filtrarMovimientos', () => {
    it('la búsqueda encuentra la categoría resuelta de un UUID legacy (REP-7)', () => {
        expect(filtrar({ busqueda: 'materiales' }).map((t) => t.id)).toEqual(['2']);
    });
    it('busca sin tildes, por varias palabras y por monto', () => {
        expect(filtrar({ busqueda: 'ferreteria tarra' }).map((t) => t.id)).toEqual(['2']);
        expect(filtrar({ busqueda: 'caja ruben' }).map((t) => t.id)).toEqual(['1', '2', '3']);
        expect(filtrar({ busqueda: '1200000' }).map((t) => t.id)).toEqual(['3']);
    });
    it('encuentra un monto escrito con puntos de miles o con signo de pesos', () => {
        const lista = [
            { id: 'a', fecha: '2026-11-07', tipo_movimiento: 'EGRESO', monto: 1500000, caja_origen_id: 'banco', categoria: 'Otros' },
            { id: 'b', fecha: '2026-11-07', tipo_movimiento: 'EGRESO', monto: 250000, caja_origen_id: 'banco', categoria: 'Otros' },
        ];
        const apoyo = { textos: construirTextosBusqueda(lista, datos), nombreCategoria: datos.nombreCategoria };
        const buscar = (busqueda) => filtrarMovimientos(lista, { busqueda }, apoyo).map((t) => t.id);
        expect(buscar('1.500.000')).toEqual(['a']);
        expect(buscar('$1.500.000')).toEqual(['a']);
        expect(buscar('$250.000 banco')).toEqual(['b']);
    });
    it('el filtro de caja incluye transferencias donde la caja es destino', () => {
        expect(filtrar({ cajaId: 'ruben' }).map((t) => t.id)).toEqual(['1', '2', '3']);
    });
    it('filtra por periodo, tipo, usuario y categoría resuelta', () => {
        expect(filtrar({ desde: '2026-11-01', hasta: '2026-11-30' })).toHaveLength(4);
        expect(filtrar({ tipo: 'EGRESO', usuario: 'Luis' }).map((t) => t.id)).toEqual(['3']);
        expect(filtrar({ categoria: 'Materiales' }).map((t) => t.id)).toEqual(['2']);
    });
});

describe('resumenFiltrado (REP-10)', () => {
    it('sin caja: ingresos menos egresos, sin transferencias', () => {
        const r = resumenFiltrado(filtrar({ desde: '2026-11-01' }));
        expect(r).toMatchObject({ ingresos: 9000000, egresos: 4200000, neto: 4800000, caja: null });
    });
    it('con caja: el neto incluye la transferencia que la fondeó', () => {
        const r = resumenFiltrado(filtrar({ cajaId: 'ruben' }), 'ruben');
        expect(r.caja).toEqual({ entradas: 5000000, salidas: 4200000, neto: 800000 });
        expect(r.ingresos).toBe(0);
    });
});

describe('orden y agrupación por día', () => {
    it('desempata el mismo día por hora de registro', () => {
        expect(ordenarMovimientos(movimientos, 'fecha_desc').map((t) => t.id)).toEqual(['4', '3', '2', '1', '5']);
    });
    it('agrupa días consecutivos y calcula subtotales con o sin caja', () => {
        const ordenados = ordenarMovimientos(filtrar({ cajaId: 'ruben' }), 'fecha_desc');
        expect(agruparPorDia(ordenados).map((g) => [g.dia, g.filas.length])).toEqual([['2026-11-04', 2], ['2026-11-03', 1]]);
        const conCaja = subtotalesPorDia(ordenados, 'ruben');
        expect(conCaja.get('2026-11-03')).toBe(5000000);
        expect(conCaja.get('2026-11-04')).toBe(-4200000);
        expect(subtotalesPorDia(ordenados).get('2026-11-03')).toBe(0);
    });
});

describe('opciones y descripción de filtros', () => {
    it('valores distintos ordenados en español', () => {
        expect(valoresDistintos(movimientos, (t) => datos.nombreCategoria(t.categoria)))
            .toEqual(['Anticipo', 'Materiales', 'Nómina', 'Otros', 'Préstamo entre Cajas']);
    });
    it('describe los filtros activos con nombres, no ids', () => {
        expect(describirFiltros({ tipo: 'EGRESO', cajaId: 'ruben', categoria: 'Materiales' }, datos).map((f) => f.texto))
            .toEqual(['Tipo: Egresos', 'Caja: Caja Rubén', 'Categoría: Materiales']);
    });
});
