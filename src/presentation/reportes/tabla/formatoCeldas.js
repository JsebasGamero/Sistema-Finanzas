// Formato de valores del explorador según el tipo de columna. Todo sale de
// src/presentation/formato.js: nada de new Date('YYYY-MM-DD') (REP-3: la
// tabla anterior mostraba y exportaba cada fecha con un día menos).
import {
    formatoMoneda, formatoNumero, formatoPorcentaje, formatoFecha, formatoFechaHora, formatoCompacto,
} from '../../formato';

function vacio(valor) {
    return valor === null || valor === undefined || valor === '' || (typeof valor === 'number' && !Number.isFinite(valor));
}

/** Texto de un valor para pantalla y PDF. */
export function formatearValor(valor, tipo) {
    if (vacio(valor)) return '';
    switch (tipo) {
        case 'dinero': return formatoMoneda(valor);
        case 'numero': return formatoNumero(valor);
        case 'porcentaje': return formatoPorcentaje(Number(valor));
        // dd/mm/aaaa: cabe en la columna y es como se lee en Colombia.
        case 'fecha': return formatoFecha(valor, 'numerica');
        case 'fechaHora': return formatoFechaHora(valor);
        case 'booleano': return valor ? 'Sí' : 'No';
        default: return String(valor);
    }
}

/** Forma corta para ejes de gráficas. */
export function formatearCompacto(valor, tipo) {
    if (vacio(valor)) return '';
    if (tipo === 'porcentaje') return formatoPorcentaje(Number(valor));
    if (tipo === 'numero') return Math.abs(Number(valor)) >= 10000 ? formatoCompacto(valor) : formatoNumero(valor);
    return formatoCompacto(valor);
}

export function esNumerico(tipo) {
    return tipo === 'dinero' || tipo === 'numero' || tipo === 'porcentaje';
}
