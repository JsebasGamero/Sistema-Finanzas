import { describe, it, expect } from 'vitest';
import { conjuntoPorId } from './conjuntos';
import { construirResumen } from './resumen';
import {
    tablaDesdeDetalle, tablaDesdeResumen, serialExcel, serialExcelConHora, celdaExcel, letraColumna, hojaExcel,
    valorCsv, escaparCsv, textoCsv, nombreArchivo, indiceRotuloTotal, BOM,
} from './exportacion';
import { datosDeEjemplo } from './datosDeEjemplo';

const movimientos = conjuntoPorId('movimientos');
const datos = datosDeEjemplo();
const filas = movimientos.construirFilas(datos, datos);
const columna = (campo) => movimientos.columnas.find((c) => c.campo === campo);

describe('fechas para Excel', () => {
    it('número de serie sin pasar por UTC', () => {
        expect(serialExcel('2026-11-13')).toBe(46339);
        expect(serialExcel('1900-03-01')).toBe(61);
        expect(serialExcel('2026-11-13T22:00:00')).toBe(46339);
        expect(serialExcel(null)).toBeNull();
    });

    it('con hora local para timestamps', () => {
        const d = new Date(2026, 10, 13, 18, 0, 0);
        expect(serialExcelConHora(d.toISOString())).toBeCloseTo(46339.75);
    });
});

describe('celdas de Excel', () => {
    it('números como números con formato de miles, no como texto', () => {
        expect(celdaExcel(1500000, 'dinero')).toEqual({ t: 'n', v: 1500000, z: '"$" #,##0' });
        expect(celdaExcel('1500000', 'numero')).toEqual({ t: 'n', v: 1500000, z: '#,##0' });
        expect(celdaExcel(0.25, 'porcentaje')).toEqual({ t: 'n', v: 0.25, z: '0.0%' });
    });

    it('fechas como fechas y vacíos como celda vacía', () => {
        expect(celdaExcel('2026-11-01', 'fecha')).toEqual({ t: 'n', v: serialExcel('2026-11-01'), z: 'dd/mm/yyyy' });
        expect(celdaExcel(null, 'dinero')).toBeUndefined();
        expect(celdaExcel('', 'texto')).toBeUndefined();
        expect(celdaExcel(true, 'booleano')).toEqual({ t: 's', v: 'Sí' });
    });

    it('letras de columna', () => {
        expect(letraColumna(0)).toBe('A');
        expect(letraColumna(25)).toBe('Z');
        expect(letraColumna(26)).toBe('AA');
        expect(letraColumna(701)).toBe('ZZ');
        expect(letraColumna(702)).toBe('AAA');
    });
});

describe('tabla de detalle', () => {
    const columnas = [columna('fecha'), columna('tipo'), columna('descripcion'), columna('monto')];
    const egresos = filas.filter((f) => f.tipo === 'Egreso');
    const tabla = tablaDesdeDetalle({ columnas, filas: egresos });

    it('exporta las columnas pedidas, en su orden, con valores crudos', () => {
        expect(tabla.columnas.map((c) => c.etiqueta)).toEqual(['Fecha', 'Tipo', 'Descripción', 'Monto']);
        expect(tabla.filas).toHaveLength(4);
        expect(tabla.filas[0]).toEqual(['2026-03-05', 'Egreso', 'Cemento y varilla', 1200000]);
    });

    it('fila de totales con suma y rótulo en la primera columna de texto', () => {
        expect(tabla.totales).toEqual([null, 'Total (4)', null, 2400000]);
    });

    it('la hoja de Excel suma con SUM() en la fila de totales', () => {
        const hoja = hojaExcel(tabla);
        expect(hoja.aoa).toHaveLength(6);
        expect(hoja.aoa[0][0]).toEqual({ t: 's', v: 'Fecha' });
        expect(hoja.aoa[5][3]).toMatchObject({ t: 'n', v: 2400000, f: 'SUM(D2:D5)' });
        expect(hoja.aoa[5][1]).toEqual({ t: 's', v: 'Total (4)' });
        expect(hoja.autofiltro).toBe('A1:D5');
        expect(hoja.anchos).toHaveLength(4);
    });

    it('rótulo del total cuando no hay columnas de texto', () => {
        expect(indiceRotuloTotal([{ tipo: 'dinero', total: 'suma' }, { tipo: 'fecha', total: null }])).toBe(1);
        expect(indiceRotuloTotal([{ tipo: 'dinero', total: 'suma' }])).toBe(-1);
    });
});

describe('Excel real (ida y vuelta con xlsx)', () => {
    it('los montos quedan como números con formato, las fechas como fechas y el total con SUM()', async () => {
        const XLSX = await import('xlsx');
        const columnas = [columna('fecha'), columna('tipo'), columna('monto')];
        const tabla = tablaDesdeDetalle({ columnas, filas: filas.filter((f) => f.tipo === 'Egreso') });
        const { aoa, anchos, autofiltro } = hojaExcel(tabla);
        const hoja = XLSX.utils.aoa_to_sheet(aoa);
        hoja['!cols'] = anchos;
        hoja['!autofilter'] = { ref: autofiltro };
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos');
        const binario = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });

        const leida = XLSX.read(binario, { type: 'array', cellNF: true, cellFormula: true });
        const h = leida.Sheets.Movimientos;
        expect(h.C2).toMatchObject({ t: 'n', v: 1200000, z: '"$" #,##0' });
        expect(h.A2).toMatchObject({ t: 'n', v: serialExcel('2026-03-05'), z: 'dd/mm/yyyy' });
        expect(XLSX.SSF.format(h.A2.z, h.A2.v)).toBe('05/03/2026');
        expect(h.B6).toMatchObject({ t: 's', v: 'Total (4)' });
        expect(h.C6).toMatchObject({ t: 'n', v: 2400000, f: 'SUM(C2:C5)' });
    });
});

describe('tabla de resumen', () => {
    it('igual a la grilla: grupos, subgrupos, columnas, total y fila de total', () => {
        const resumen = construirResumen(filas, { filas: ['caja', 'tipo'], columnas: 'fecha:mes', valor: { campo: 'monto', agregacion: 'suma' } }, movimientos);
        const tabla = tablaDesdeResumen(resumen, movimientos);
        expect(tabla.columnas.map((c) => c.etiqueta)).toEqual(['Caja', 'Tipo', 'mar 2026', 'abr 2026', 'Total']);
        expect(tabla.filas[0]).toEqual(['Bancolombia', '', 4200000, 1000000, 5200000]);
        expect(tabla.filas[1]).toEqual(['', 'Ingreso', 3000000, null, 3000000]);
        expect(tabla.filasDestacadas[0]).toBe(true);
        expect(tabla.totales).toEqual(['Total', '', 5000000, 1100000, 6100000]);
        expect(tabla.formulasEnTotales).toBe(false);
    });
});

describe('CSV', () => {
    it('números con coma decimal, porcentajes y fechas dd/mm/aaaa', () => {
        expect(valorCsv(1234.5, 'dinero')).toBe('1234,5');
        expect(valorCsv(1500000, 'dinero')).toBe('1500000');
        expect(valorCsv(0.125, 'porcentaje')).toBe('12,5%');
        expect(valorCsv('2026-03-05', 'fecha')).toBe('05/03/2026');
        expect(valorCsv(false, 'booleano')).toBe('No');
        expect(valorCsv(null, 'dinero')).toBe('');
    });

    it('neutraliza textos que Excel ejecutaría como fórmula', () => {
        expect(valorCsv('=HYPERLINK("x")', 'texto')).toBe('\'=HYPERLINK("x")');
        expect(valorCsv('-5 de descuento', 'texto')).toBe('\'-5 de descuento');
        expect(valorCsv(-5000, 'dinero')).toBe('-5000');
    });

    it('escapa separadores, comillas y saltos de línea', () => {
        expect(escaparCsv('a;b')).toBe('"a;b"');
        expect(escaparCsv('di "hola"')).toBe('"di ""hola"""');
        expect(escaparCsv('línea\nnueva')).toBe('"línea\nnueva"');
        expect(escaparCsv('simple')).toBe('simple');
    });

    it('con BOM, separador ; y fila de totales', () => {
        const tabla = tablaDesdeDetalle({ columnas: [columna('tipo'), columna('monto')], filas: filas.slice(0, 2) });
        const texto = textoCsv(tabla);
        expect(texto.startsWith(BOM)).toBe(true);
        expect(BOM.charCodeAt(0)).toBe(0xfeff);
        expect(texto).toBe(BOM + 'Tipo;Monto\r\nIngreso;3000000\r\nEgreso;1200000\r\nTotal (2);4200000\r\n');
    });
});

describe('nombreArchivo', () => {
    it('sin tildes ni espacios, con la fecha local', () => {
        expect(nombreArchivo('Préstamos entre cajas', '2026-11-13', 'csv')).toBe('Prestamos_entre_cajas_2026-11-13.csv');
        expect(nombreArchivo('', '2026-11-13', 'xlsx')).toBe('Reporte_2026-11-13.xlsx');
    });
});
