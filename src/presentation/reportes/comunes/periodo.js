// Periodo de un reporte: un preset de PRESETS_RANGO o un rango manual.
//
// Se guarda el preset y no las fechas: "Este mes" sigue siendo este mes si la
// app queda abierta de un día para otro. Solo el rango personalizado lleva
// sus fechas.
import { PRESETS_RANGO, hoyLocal, rangoDePreset } from '../../../domain/value-objects/fecha';
import { formatoFecha } from '../../formato';

export const PERIODO_PERSONALIZADO = 'personalizado';

/** @typedef {{ preset: string, desde: string, hasta: string }} Periodo */

/** @returns {Periodo} */
export function crearPeriodo(preset = 'anio') {
    return { preset, desde: '', hasta: '' };
}

/**
 * Rango { desde, hasta } ('YYYY-MM-DD' o '') de un periodo.
 * Un rango manual con las fechas al revés se endereza en vez de dejar el
 * reporte vacío sin explicación.
 */
export function rangoDePeriodo(periodo, hoy = hoyLocal()) {
    if (!periodo) return { desde: '', hasta: '' };
    if (periodo.preset === PERIODO_PERSONALIZADO) {
        const desde = periodo.desde || '';
        const hasta = periodo.hasta || '';
        if (desde && hasta && desde > hasta) return { desde: hasta, hasta: desde };
        return { desde, hasta };
    }
    return rangoDePreset(periodo.preset, hoy);
}

/**
 * Cambia el preset. Al pasar a "personalizado" se precargan las fechas del
 * preset anterior para que el usuario ajuste en vez de empezar en blanco.
 */
export function cambiarPreset(periodo, preset, hoy = hoyLocal()) {
    if (preset === PERIODO_PERSONALIZADO) {
        return { preset, ...rangoDePeriodo(periodo, hoy) };
    }
    return crearPeriodo(preset);
}

/** Nombre corto del periodo ("Este año", "Rango personalizado"). */
export function nombrePeriodo(periodo) {
    if (periodo?.preset === PERIODO_PERSONALIZADO) return 'Rango personalizado';
    return PRESETS_RANGO.find((p) => p.id === periodo?.preset)?.etiqueta ?? 'Todo';
}

/**
 * Texto del periodo con sus fechas, para subtítulos y para el PDF:
 * "Este año: 1 ene 2026 a 13 nov 2026".
 */
export function describirPeriodo(periodo, hoy = hoyLocal()) {
    const { desde, hasta } = rangoDePeriodo(periodo, hoy);
    const nombre = nombrePeriodo(periodo);
    if (!desde && !hasta) return 'Todo el histórico';
    if (desde && desde === hasta) return `${nombre}: ${formatoFecha(desde)}`;
    const inicio = desde ? formatoFecha(desde) : 'el inicio';
    const fin = hasta ? formatoFecha(hasta) : 'hoy';
    return `${nombre}: ${inicio} a ${fin}`;
}
