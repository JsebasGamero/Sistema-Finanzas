import { describe, it, expect } from 'vitest';
import { conjuntoPorId } from './conjuntos';
import {
    normalizarTexto, terminosDeBusqueda, aplicarFiltros, aplicarModeloFiltros, contarFiltrosActivos, describirModeloFiltros,
    valorPorcentajeParaFiltro,
} from './filtros';
import { datosDeEjemplo } from './datosDeEjemplo';

const movimientos = conjuntoPorId('movimientos');
const datos = datosDeEjemplo();
const filas = movimientos.construirFilas(datos, datos);
const ids = (lista) => lista.map((f) => f.id).sort();

describe('normalizarTexto y términos', () => {
    it('quita tildes y mayúsculas', () => {
        expect(normalizarTexto('  Crédito NÓMINA ')).toBe('credito nomina');
        expect(normalizarTexto(null)).toBe('');
    });

    it('un término con forma de cifra se reduce a dígitos', () => {
        expect(terminosDeBusqueda('$1.200.000 Cemento')).toEqual(['1200000', 'cemento']);
        expect(terminosDeBusqueda('2026-03')).toEqual(['2026-03']);
    });
});

describe('aplicarFiltros: periodo', () => {
    it('incluye el primer y el último día del rango (REP-6)', () => {
        const marzo = aplicarFiltros(filas, { desde: '2026-03-01', hasta: '2026-03-31', campoFecha: 'fecha' });
        expect(ids(marzo)).toEqual(['m1', 'm2', 'm3']);
    });

    it('incluye el último día aunque la fecha traiga hora', () => {
        const conHora = [{ id: 'x', fecha: '2026-03-31T23:30:00' }, { id: 'y', fecha: '2026-04-01T00:10:00' }];
        expect(ids(aplicarFiltros(conHora, { desde: '2026-03-01', hasta: '2026-03-31', campoFecha: 'fecha' }))).toEqual(['x']);
    });

    it('sin campo de fecha el periodo no filtra', () => {
        expect(aplicarFiltros(filas, { desde: '2026-03-01', hasta: '2026-03-01', campoFecha: null })).toHaveLength(7);
    });

    it('un rango abierto filtra solo por el extremo dado', () => {
        expect(ids(aplicarFiltros(filas, { desde: '2026-04-15', campoFecha: 'fecha' }))).toEqual(['m6', 'm7']);
    });
});

describe('aplicarFiltros: búsqueda', () => {
    const columnasBusqueda = movimientos.columnas.filter((c) => c.visible);

    it('sin tildes ni mayúsculas', () => {
        expect(ids(aplicarFiltros(filas, { busqueda: 'NOMINA', columnasBusqueda }))).toEqual(['m3']);
    });

    it('todos los términos deben aparecer', () => {
        expect(ids(aplicarFiltros(filas, { busqueda: 'ana materiales', columnasBusqueda }))).toEqual(['m2']);
    });

    it('encuentra montos escritos con puntos y fechas dd/mm', () => {
        expect(ids(aplicarFiltros(filas, { busqueda: '1.200.000', columnasBusqueda }))).toEqual(['m2']);
        expect(ids(aplicarFiltros(filas, { busqueda: '31/03', columnasBusqueda }))).toEqual(['m3']);
    });

    it('solo busca en las columnas indicadas', () => {
        const soloObra = [{ campo: 'obra', tipo: 'texto' }];
        expect(aplicarFiltros(filas, { busqueda: 'cemento', columnasBusqueda: soloObra })).toHaveLength(0);
    });

    it('sin columnas indicadas busca en toda la fila salvo campos internos', () => {
        expect(ids(aplicarFiltros(filas, { busqueda: 'cemento' }))).toEqual(['m2']);
        expect(aplicarFiltros(filas, { busqueda: 'ejemplo/soporte' })).toHaveLength(0);
    });
});

describe('aplicarModeloFiltros (modelo de AG-Grid)', () => {
    const columnas = movimientos.columnas;

    it('texto: igual a, sin distinguir mayúsculas ni tildes', () => {
        const r = aplicarModeloFiltros(filas, { tipo: { filterType: 'text', type: 'equals', filter: 'egreso' } }, columnas);
        expect(ids(r)).toEqual(['m2', 'm3', 'm5', 'm7']);
        const nomina = aplicarModeloFiltros(filas, { categoria: { filterType: 'text', type: 'contains', filter: 'nomina' } }, columnas);
        expect(ids(nomina)).toEqual(['m3']);
    });

    it('texto: distinto de deja pasar las celdas vacías, como la grilla', () => {
        const r = aplicarModeloFiltros(filas, { obra: { filterType: 'text', type: 'notEqual', filter: 'Edificio Norte' } }, columnas);
        expect(ids(r)).toEqual(['m4', 'm6', 'm7']);
    });

    it('número: entre incluye los extremos', () => {
        const r = aplicarModeloFiltros(filas, { monto: { filterType: 'number', type: 'inRange', filter: 300000, filterTo: 800000 } }, columnas);
        expect(ids(r)).toEqual(['m3', 'm4', 'm5']);
    });

    it('fecha: entre incluye los extremos y acepta el formato de la grilla', () => {
        const modelo = { fecha: { filterType: 'date', type: 'inRange', dateFrom: '2026-03-05 00:00:00', dateTo: '2026-04-02 00:00:00' } };
        expect(ids(aplicarModeloFiltros(filas, modelo, columnas))).toEqual(['m2', 'm3', 'm4']);
        const igual = { fecha: { filterType: 'date', type: 'equals', dateFrom: '2026-03-31 00:00:00' } };
        expect(ids(aplicarModeloFiltros(filas, igual, columnas))).toEqual(['m3']);
    });

    it('condiciones combinadas con O', () => {
        const modelo = {
            tipo: {
                filterType: 'text',
                operator: 'OR',
                conditions: [
                    { type: 'equals', filter: 'Ingreso' },
                    { type: 'equals', filter: 'Transferencia' },
                ],
            },
        };
        expect(ids(aplicarModeloFiltros(filas, modelo, columnas))).toEqual(['m1', 'm4', 'm6']);
    });

    it('sí/no y vacíos', () => {
        expect(ids(aplicarModeloFiltros(filas, { soporte: { filterType: 'text', type: 'equals', filter: 'Sí' } }, columnas))).toEqual(['m2']);
        expect(ids(aplicarModeloFiltros(filas, { proveedor: { filterType: 'text', type: 'blank' } }, columnas))).toEqual(['m1', 'm4', 'm6', 'm7']);
    });

    it('ignora campos que el conjunto no tiene y modelos vacíos', () => {
        expect(aplicarModeloFiltros(filas, { inventado: { filterType: 'text', type: 'equals', filter: 'x' } }, columnas)).toHaveLength(7);
        expect(aplicarModeloFiltros(filas, null, columnas)).toHaveLength(7);
    });

    it('porcentaje: compara contra lo que se ve (90 %), no contra la fracción', () => {
        const columnasObra = [{ campo: 'ejecucion', etiqueta: 'Ejecución', tipo: 'porcentaje' }];
        const obras = [{ id: 'a', ejecucion: 0.95 }, { id: 'b', ejecucion: 0.5 }, { id: 'c', ejecucion: null }, { id: 'd', ejecucion: 0.9 }];
        const mayor = { ejecucion: { filterType: 'number', type: 'greaterThan', filter: 90 } };
        expect(ids(aplicarModeloFiltros(obras, mayor, columnasObra))).toEqual(['a']);
        const igual = { ejecucion: { filterType: 'number', type: 'equals', filter: 90 } };
        expect(ids(aplicarModeloFiltros(obras, igual, columnasObra))).toEqual(['d']);
        const vacios = { ejecucion: { filterType: 'number', type: 'blank' } };
        expect(ids(aplicarModeloFiltros(obras, vacios, columnasObra))).toEqual(['c']);
        expect(valorPorcentajeParaFiltro(0.12345)).toBe(12.3);
        expect(valorPorcentajeParaFiltro('')).toBeNull();
    });

    it('describe pasa la columna al formateador', () => {
        const columnasObra = [{ campo: 'ejecucion', etiqueta: 'Ejecución', tipo: 'porcentaje' }];
        const modelo = { ejecucion: { filterType: 'number', type: 'greaterThan', filter: 90 } };
        const formatear = (v, tipoFiltro, columna) => (columna?.tipo === 'porcentaje' ? `${v} %` : String(v));
        expect(describirModeloFiltros(modelo, columnasObra, formatear)).toEqual(['Ejecución: mayor que 90 %']);
    });

    it('cuenta y describe los filtros activos', () => {
        const modelo = {
            tipo: { filterType: 'text', type: 'equals', filter: 'Egreso' },
            monto: { filterType: 'number', type: 'inRange', filter: 1, filterTo: 5 },
            inventado: { filterType: 'text', type: 'equals', filter: 'x' },
        };
        expect(contarFiltrosActivos(modelo, columnas)).toBe(2);
        expect(describirModeloFiltros(modelo, columnas)).toEqual(['Tipo: igual a Egreso', 'Monto: entre 1 y 5']);
    });
});
