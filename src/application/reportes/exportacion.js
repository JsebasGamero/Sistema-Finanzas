// Exportación del explorador: arma la tabla que se exporta y la convierte a
// celdas de Excel y a texto CSV. La descarga (xlsx, jsPDF, Blob) vive en
// src/presentation/reportes/tabla/exportar.js.
//
// Lo que se rompía antes (REP-2): el Excel llamaba a una función de AG-Grid
// que no existe en la v35 y no descargaba nada; y aunque funcionara, escribía
// los montos como texto ("$ 1.500.000"), así que en Excel no se podían sumar,
// y las fechas con un día menos. Aquí cada celda sale con su tipo: números
// como números con formato de miles, fechas como fechas de Excel calculadas
// sin pasar por UTC.
//
// Puro: sin React, sin Dexie, sin xlsx. Se prueba en exportacion.test.js.
import { aMonto, redondearMonto } from '../../domain/value-objects/dinero';
import { claveDia } from '../../domain/value-objects/fecha';
import { dimensionPorId } from './dimensiones';

/**
 * @typedef {{ etiqueta: string, tipo: 'texto'|'dinero'|'numero'|'porcentaje'|'fecha'|'fechaHora'|'booleano', total?: 'suma'|null }} ColumnaExportable
 * @typedef {{ columnas: ColumnaExportable[], filas: any[][], totales: any[]|null,
 *   filasDestacadas?: boolean[], formulasEnTotales?: boolean }} TablaExportable
 */

const MS_DIA = 86400000;
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

const FORMATO_EXCEL = Object.freeze({
    dinero: '"$" #,##0',
    numero: '#,##0',
    porcentaje: '0.0%',
    fecha: 'dd/mm/yyyy',
    fechaHora: 'dd/mm/yyyy hh:mm',
});

function vacio(valor) {
    return valor === null || valor === undefined || valor === '' || (typeof valor === 'number' && !Number.isFinite(valor));
}

/**
 * Columna donde va el rótulo "Total (N)": la primera de texto, o si no hay,
 * la primera que no lleva suma. -1 si todas suman.
 */
export function indiceRotuloTotal(columnas) {
    const texto = columnas.findIndex((c) => c.tipo === 'texto' && c.total !== 'suma');
    if (texto >= 0) return texto;
    return columnas.findIndex((c) => c.total !== 'suma');
}

/** Suma las columnas con total 'suma' y rotula la primera columna de texto. */
export function tablaDesdeDetalle({ columnas, filas, etiquetaTotal = 'Total' }) {
    const lista = Array.isArray(filas) ? filas.filter(Boolean) : [];
    const matriz = lista.map((fila) => columnas.map((c) => fila[c.campo] ?? null));
    const totales = columnas.map((c) => {
        if (c.total !== 'suma') return null;
        let suma = 0;
        for (const fila of lista) suma += aMonto(fila[c.campo]);
        return c.tipo === 'dinero' ? redondearMonto(suma) : suma;
    });
    const indiceRotulo = indiceRotuloTotal(columnas);
    if (indiceRotulo >= 0) totales[indiceRotulo] = `${etiquetaTotal} (${lista.length})`;
    return {
        columnas: columnas.map((c) => ({ etiqueta: c.etiqueta, tipo: c.tipo, total: c.total ?? null })),
        filas: matriz,
        totales,
        filasDestacadas: matriz.map(() => false),
        formulasEnTotales: true,
    };
}

/**
 * Tabla exportable a partir del resultado de construirResumen(), igual a lo
 * que muestra la grilla: columnas de grupo, una por clave de columna, Total,
 * subtotales en su lugar y fila de total al final.
 */
export function tablaDesdeResumen(resumen, conjunto) {
    const { config, tipoValor } = resumen;
    const dims = config.filas.map((id) => dimensionPorId(conjunto, id)).filter(Boolean);
    const columnas = [
        ...dims.map((d) => ({ etiqueta: d.etiqueta, tipo: 'texto' })),
        ...resumen.columnas.map((c) => ({ etiqueta: c.etiqueta, tipo: tipoValor })),
        { etiqueta: 'Total', tipo: tipoValor },
    ];
    const filas = resumen.filas.map((fila) => {
        const etiquetas = dims.map((_, i) => {
            if (dims.length === 2) return fila.nivel === i ? fila.etiquetas[i] : '';
            return fila.etiquetas[i] ?? '';
        });
        return [...etiquetas, ...resumen.columnas.map((c) => fila.valores[c.clave] ?? null), fila.total];
    });
    const totales = [
        ...dims.map((_, i) => (i === 0 ? 'Total' : '')),
        ...resumen.columnas.map((c) => resumen.totalesColumna[c.clave] ?? null),
        resumen.granTotal,
    ];
    return {
        columnas,
        filas,
        totales: dims.length ? totales : null,
        filasDestacadas: resumen.filas.map((f) => f.esSubtotal),
        // Un promedio o un porcentaje no se recalculan sumando: van como valor.
        formulasEnTotales: false,
    };
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

/** Número de serie de Excel para una fecha de calendario, sin zona horaria. */
export function serialExcel(valor) {
    const clave = claveDia(valor);
    if (!clave) return null;
    const utc = Date.UTC(Number(clave.slice(0, 4)), Number(clave.slice(5, 7)) - 1, Number(clave.slice(8, 10)));
    return Math.round((utc - EPOCA_EXCEL) / MS_DIA);
}

/** Serie de Excel con la hora local de un timestamp (created_at). */
export function serialExcelConHora(valor) {
    if (vacio(valor)) return null;
    const d = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(d.getTime())) return null;
    const dia = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCA_EXCEL) / MS_DIA);
    const segundos = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    return dia + segundos / 86400;
}

/** Celda de SheetJS ({ t, v, z }) para un valor y su tipo; undefined si va vacía. */
export function celdaExcel(valor, tipo) {
    if (vacio(valor)) return undefined;
    switch (tipo) {
        case 'dinero':
        case 'numero':
        case 'porcentaje':
            return { t: 'n', v: aMonto(valor), z: FORMATO_EXCEL[tipo] };
        case 'fecha': {
            const serie = serialExcel(valor);
            return serie === null ? undefined : { t: 'n', v: serie, z: FORMATO_EXCEL.fecha };
        }
        case 'fechaHora': {
            const serie = serialExcelConHora(valor);
            return serie === null ? undefined : { t: 'n', v: serie, z: FORMATO_EXCEL.fechaHora };
        }
        case 'booleano':
            return { t: 's', v: valor ? 'Sí' : 'No' };
        default:
            return { t: 's', v: String(valor) };
    }
}

/** 0 -> 'A', 25 -> 'Z', 26 -> 'AA'. */
export function letraColumna(indice) {
    let n = indice + 1;
    let letras = '';
    while (n > 0) {
        const resto = (n - 1) % 26;
        letras = String.fromCharCode(65 + resto) + letras;
        n = Math.floor((n - 1) / 26);
    }
    return letras;
}

function largoAproximado(valor, tipo) {
    if (vacio(valor)) return 0;
    switch (tipo) {
        case 'dinero': return String(Math.round(Math.abs(aMonto(valor)))).length * 1.34 + 3;
        case 'numero': return String(Math.round(Math.abs(aMonto(valor)))).length * 1.34 + 1;
        case 'porcentaje': return 7;
        case 'fecha': return 10;
        case 'fechaHora': return 16;
        case 'booleano': return 2;
        default: return String(valor).length;
    }
}

/**
 * Hoja de Excel lista para XLSX.utils.aoa_to_sheet(): encabezados, filas
 * tipadas, fila de totales (con SUMA() en detalle, para que el total siga
 * cuadrando si alguien edita una celda), anchos y autofiltro.
 * @param {TablaExportable} tabla
 */
export function hojaExcel(tabla) {
    const { columnas, filas, totales } = tabla;
    const aoa = [columnas.map((c) => ({ t: 's', v: c.etiqueta }))];
    for (const fila of filas) aoa.push(fila.map((valor, i) => celdaExcel(valor, columnas[i].tipo)));
    const ultimaFilaDatos = filas.length + 1;
    if (totales) {
        aoa.push(totales.map((valor, i) => {
            const columna = columnas[i];
            if (typeof valor === 'string') return { t: 's', v: valor };
            const celda = celdaExcel(valor, columna.tipo);
            if (tabla.formulasEnTotales && columna.total === 'suma' && filas.length) {
                const letra = letraColumna(i);
                return { ...(celda ?? { t: 'n', v: 0, z: FORMATO_EXCEL[columna.tipo] }), f: `SUM(${letra}2:${letra}${ultimaFilaDatos})` };
            }
            return celda;
        }));
    }
    const anchos = columnas.map((c, i) => {
        let max = c.etiqueta.length;
        for (const fila of filas) max = Math.max(max, largoAproximado(fila[i], c.tipo));
        if (totales) max = Math.max(max, largoAproximado(totales[i], typeof totales[i] === 'string' ? 'texto' : c.tipo));
        return { wch: Math.min(Math.ceil(max) + 2, 48) };
    });
    const ultimaColumna = letraColumna(Math.max(0, columnas.length - 1));
    return {
        aoa,
        anchos,
        autofiltro: columnas.length ? `A1:${ultimaColumna}${ultimaFilaDatos}` : null,
    };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const DOS = (n) => String(n).padStart(2, '0');
// Marca de orden de bytes UTF-8: sin ella Excel abre el CSV como ANSI y
// rompe las tildes.
export const BOM = String.fromCharCode(0xfeff);

function numeroCsv(n) {
    const redondeado = Math.round(n * 100) / 100;
    // Excel en español toma la coma como separador decimal.
    return String(redondeado).replace('.', ',');
}

/** Texto de una celda CSV (sin comillas todavía). */
export function valorCsv(valor, tipo) {
    if (vacio(valor)) return '';
    switch (tipo) {
        case 'dinero':
        case 'numero':
            return numeroCsv(aMonto(valor));
        case 'porcentaje':
            return `${numeroCsv(Math.round(aMonto(valor) * 1000) / 10)}%`;
        case 'fecha': {
            const clave = claveDia(valor);
            return clave ? `${clave.slice(8, 10)}/${clave.slice(5, 7)}/${clave.slice(0, 4)}` : '';
        }
        case 'fechaHora': {
            const d = new Date(valor);
            if (Number.isNaN(d.getTime())) return '';
            return `${DOS(d.getDate())}/${DOS(d.getMonth() + 1)}/${d.getFullYear()} ${DOS(d.getHours())}:${DOS(d.getMinutes())}`;
        }
        case 'booleano':
            return valor ? 'Sí' : 'No';
        default: {
            const texto = String(valor);
            // Un texto que empieza por = + - @ se ejecuta como fórmula al abrir
            // el CSV en Excel; las descripciones las escribe cualquiera.
            return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
        }
    }
}

/** Comillas solo cuando hacen falta, duplicando las internas. */
export function escaparCsv(texto) {
    const valor = String(texto ?? '');
    if (/[";\r\n]/.test(valor) || /^\s|\s$/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
    return valor;
}

/**
 * CSV con BOM UTF-8 (para que Excel lea las tildes) y separador ';' (el que
 * espera Excel configurado en español).
 * @param {TablaExportable} tabla
 */
export function textoCsv(tabla) {
    const { columnas, filas, totales } = tabla;
    const lineas = [columnas.map((c) => escaparCsv(c.etiqueta)).join(';')];
    for (const fila of filas) {
        lineas.push(fila.map((valor, i) => escaparCsv(valorCsv(valor, columnas[i].tipo))).join(';'));
    }
    if (totales) {
        lineas.push(totales.map((valor, i) => escaparCsv(typeof valor === 'string' ? valor : valorCsv(valor, columnas[i].tipo))).join(';'));
    }
    return `${BOM}${lineas.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Nombre de archivo
// ---------------------------------------------------------------------------

/** 'Movimientos resumen' + '2026-11-13' -> 'Movimientos_resumen_2026-11-13.xlsx' */
export function nombreArchivo(base, hoy, extension) {
    const limpio = String(base ?? 'Reporte')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^A-Za-z0-9-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Reporte';
    return `${limpio}_${hoy}.${extension}`;
}
