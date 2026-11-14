import { describe, it, expect } from 'vitest';
import { conjuntoPorId } from './conjuntos';
import { aplicarModeloFiltros } from './filtros';
import { construirResumen } from './resumen';
import {
    VISTAS_PREDEFINIDAS, normalizarVista, normalizarConfigExplorador, leerVistasGuardadas, configPorDefecto,
    normalizarEstadoColumnas, normalizarFiltrosGrid,
} from './vistas';
import { datosDeEjemplo } from './datosDeEjemplo';

describe('VISTAS_PREDEFINIDAS', () => {
    it('incluye las vistas pedidas, con ids únicos y ya normalizadas', () => {
        const nombres = VISTAS_PREDEFINIDAS.map((v) => v.nombre);
        expect(nombres).toEqual(expect.arrayContaining([
            'Gasto por obra y mes', 'Gasto por categoría', 'Flujo mensual por caja', 'Pagos por proveedor por trimestre',
            'Movimientos por usuario y tipo', 'Pendientes de sincronizar', 'Ejecución de obras', 'Deudas abiertas',
        ]));
        const ids = VISTAS_PREDEFINIDAS.map((v) => v.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const vista of VISTAS_PREDEFINIDAS) {
            expect(normalizarVista(vista)).toMatchObject({ conjuntoId: vista.conjuntoId, modo: vista.modo, preset: vista.preset });
            expect(vista.predefinida).toBe(true);
        }
    });

    it('conservan su configuración de resumen y filtros', () => {
        const gasto = VISTAS_PREDEFINIDAS.find((v) => v.id === 'pre:gasto_obra_mes');
        expect(gasto.configResumen).toMatchObject({ filas: ['obra'], columnas: 'fecha:mes' });
        expect(gasto.filtrosGrid.tipo.filter).toBe('Egreso');
        const categoria = VISTAS_PREDEFINIDAS.find((v) => v.id === 'pre:gasto_categoria');
        expect(categoria.configResumen.mostrarComo).toBe('pct_total');
        const deudas = VISTAS_PREDEFINIDAS.find((v) => v.id === 'pre:deudas_abiertas');
        expect(deudas).toMatchObject({ conjuntoId: 'deudas_terceros', modo: 'detalle', ordenDetalle: { campo: 'antiguedad_dias', direccion: 'desc' } });
    });

    it('"Deudas abiertas" deja afuera las pagadas', () => {
        const datos = datosDeEjemplo();
        const conjunto = conjuntoPorId('deudas_terceros');
        const vista = VISTAS_PREDEFINIDAS.find((v) => v.id === 'pre:deudas_abiertas');
        const filas = aplicarModeloFiltros(conjunto.construirFilas(datos, datos), vista.filtrosGrid, conjunto.columnas);
        expect(filas.map((f) => f.id)).toEqual(['d1']);
    });

    it('"Gasto por categoría" suma solo egresos', () => {
        const datos = datosDeEjemplo();
        const conjunto = conjuntoPorId('movimientos');
        const vista = VISTAS_PREDEFINIDAS.find((v) => v.id === 'pre:gasto_categoria');
        const filas = aplicarModeloFiltros(conjunto.construirFilas(datos, datos), vista.filtrosGrid, conjunto.columnas);
        const resumen = construirResumen(filas, { ...vista.configResumen, mostrarComo: 'valor' }, conjunto);
        expect(resumen.granTotal).toBe(2400000);
    });
});

describe('normalizarVista', () => {
    it('devuelve null si no es un objeto', () => {
        expect(normalizarVista(null)).toBeNull();
        expect(normalizarVista('vista')).toBeNull();
        expect(normalizarVista([1, 2])).toBeNull();
    });

    it('reemplaza los campos corruptos por valores por defecto', () => {
        const vista = normalizarVista({
            id: 'v1',
            nombre: '  Mi vista  ',
            conjuntoId: 'no-existe',
            modo: 'raro',
            preset: 'siglo',
            desde: '2026-02-30',
            busqueda: 42,
            configResumen: 'x',
            estadoColumnas: 'x',
            filtrosGrid: [],
            mapaCalor: 'si',
            densidad: 'enorme',
        });
        expect(vista).toMatchObject({
            id: 'v1',
            nombre: 'Mi vista',
            version: 1,
            conjuntoId: 'movimientos',
            modo: 'detalle',
            preset: 'todo',
            desde: '',
            busqueda: '',
            estadoColumnas: null,
            filtrosGrid: null,
            mapaCalor: false,
            densidad: null,
        });
        expect(vista.configResumen.filas.length).toBe(1);
    });

    it('conserva el rango personalizado válido y lo ordena', () => {
        const vista = normalizarVista({ nombre: 'x', conjuntoId: 'movimientos', preset: 'personalizado', desde: '2026-03-31', hasta: '2026-03-01' });
        expect(vista).toMatchObject({ preset: 'personalizado', desde: '2026-03-01', hasta: '2026-03-31' });
    });

    it('un conjunto sin fecha no guarda periodo', () => {
        const config = normalizarConfigExplorador({ preset: 'mes' }, 'cajas');
        expect(config.preset).toBe('todo');
    });
});

describe('estado de la grilla guardado', () => {
    const conjunto = conjuntoPorId('movimientos');

    it('quita columnas que ya no existen, repetidas y propiedades raras', () => {
        const estado = normalizarEstadoColumnas([
            { colId: 'fecha', hide: false, sort: 'desc', width: 130.6, pinned: 'left', rowGroup: true },
            { colId: 'fecha', hide: true },
            { colId: 'columna_vieja', hide: true },
            { colId: 'monto', width: 99999 },
            'basura',
        ], conjunto);
        expect(estado).toEqual([
            { colId: 'fecha', hide: false, sort: 'desc', width: 131, pinned: 'left' },
            { colId: 'monto' },
        ]);
        expect(normalizarEstadoColumnas([], conjunto)).toBeNull();
    });

    it('quita filtros de campos desconocidos o de tipo desconocido', () => {
        const filtros = normalizarFiltrosGrid({
            tipo: { filterType: 'text', type: 'equals', filter: 'Egreso' },
            viejo: { filterType: 'text', type: 'equals', filter: 'x' },
            monto: { filterType: 'set', values: [] },
        }, conjunto);
        expect(Object.keys(filtros)).toEqual(['tipo']);
    });
});

describe('leerVistasGuardadas', () => {
    it('aguanta JSON roto y estructuras inesperadas', () => {
        expect(leerVistasGuardadas('{roto')).toEqual([]);
        expect(leerVistasGuardadas('{"a":1}')).toEqual([]);
        expect(leerVistasGuardadas(null)).toEqual([]);
    });

    it('descarta vistas sin nombre, sin id, repetidas o que se hacen pasar por predefinidas', () => {
        const texto = JSON.stringify([
            { id: 'v1', nombre: 'Cierre', conjuntoId: 'movimientos' },
            { id: 'v1', nombre: 'Repetida' },
            { id: 'v2', nombre: '' },
            { nombre: 'Sin id' },
            { id: 'pre:gasto_obra_mes', nombre: 'Falsa' },
            null,
        ]);
        const vistas = leerVistasGuardadas(texto);
        expect(vistas.map((v) => v.nombre)).toEqual(['Cierre']);
    });
});

describe('configPorDefecto', () => {
    it('arranca en detalle, sin periodo y con el resumen del conjunto', () => {
        const config = configPorDefecto('obras');
        expect(config).toMatchObject({ modo: 'detalle', preset: 'todo', estadoColumnas: null, filtrosGrid: null });
        expect(config.configResumen.valor.campo).toBe('gastado');
    });
});
