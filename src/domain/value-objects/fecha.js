// Fechas de calendario.
//
// La app trabaja con fechas de calendario de Colombia (America/Bogota,
// UTC-5), guardadas como 'YYYY-MM-DD' (columna DATE en Supabase). Dos errores
// se repetían por todo el código:
//
// 1. `new Date().toISOString().split('T')[0]` da la fecha en UTC. Después de
//    las 7 p. m. en Colombia ya es "mañana" en UTC, así que un gasto
//    registrado de noche quedaba con la fecha del día siguiente.
// 2. `new Date('2026-03-01')` se interpreta como medianoche UTC, que en
//    Colombia es el 28 de febrero a las 7 p. m.: las gráficas rotulaban cada
//    mes con el nombre del mes anterior.
//
// Este módulo trabaja siempre con la hora local del dispositivo. Es puro: no
// depende de React ni de Dexie, y se prueba en fecha.test.js.

const DOS = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de un Date, en hora local. */
export function claveDiaDeDate(fecha) {
    return `${fecha.getFullYear()}-${DOS(fecha.getMonth() + 1)}-${DOS(fecha.getDate())}`;
}

/** Fecha de hoy en hora local, como 'YYYY-MM-DD'. Usar en vez de toISOString(). */
export function hoyLocal(ahora = new Date()) {
    return claveDiaDeDate(ahora);
}

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const CON_ZONA = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Normaliza cualquier representación de fecha a 'YYYY-MM-DD' local.
 * - 'YYYY-MM-DD' se devuelve tal cual (es una fecha de calendario).
 * - Un timestamp con zona ('...Z', '...-05:00') se convierte a la fecha local.
 * - Un timestamp sin zona ('2026-03-01T10:00') se toma por su parte de fecha.
 * - Un Date se convierte con la hora local.
 * @returns {string|null}
 */
export function claveDia(valor) {
    if (!valor) return null;
    if (valor instanceof Date) {
        return Number.isNaN(valor.getTime()) ? null : claveDiaDeDate(valor);
    }
    const texto = String(valor).trim();
    if (SOLO_FECHA.test(texto)) return texto;
    if (texto.length >= 10 && texto[10] === 'T' && CON_ZONA.test(texto)) {
        const d = new Date(texto);
        return Number.isNaN(d.getTime()) ? null : claveDiaDeDate(d);
    }
    const prefijo = texto.slice(0, 10);
    return SOLO_FECHA.test(prefijo) ? prefijo : null;
}

/** Date a medianoche local del día indicado, o null. */
export function fechaLocal(valor) {
    const clave = claveDia(valor);
    if (!clave) return null;
    const [, a, m, d] = clave.match(SOLO_FECHA);
    return new Date(Number(a), Number(m) - 1, Number(d));
}

/** 'YYYY-MM' */
export function claveMes(valor) {
    const clave = claveDia(valor);
    return clave ? clave.slice(0, 7) : null;
}

/** 'YYYY' */
export function claveAnio(valor) {
    const clave = claveDia(valor);
    return clave ? clave.slice(0, 4) : null;
}

/** 'YYYY-T1'..'YYYY-T4' */
export function claveTrimestre(valor) {
    const clave = claveDia(valor);
    if (!clave) return null;
    const mes = Number(clave.slice(5, 7));
    return `${clave.slice(0, 4)}-T${Math.floor((mes - 1) / 3) + 1}`;
}

/** Semana ISO 8601: 'YYYY-Sww' (la semana empieza el lunes). */
export function claveSemana(valor) {
    const fecha = fechaLocal(valor);
    if (!fecha) return null;
    // El jueves de la misma semana decide a qué año ISO pertenece, y como el
    // jueves de la semana 1 siempre cae entre el 1 y el 7 de enero, el número
    // de semana es simplemente cuántas semanas completas lleva ese jueves.
    const jueves = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    const diaIso = (fecha.getDay() + 6) % 7; // lunes = 0
    jueves.setDate(jueves.getDate() - diaIso + 3);
    const primeroDeEnero = new Date(jueves.getFullYear(), 0, 1);
    const dias = Math.round((jueves - primeroDeEnero) / 86400000);
    const semana = Math.floor(dias / 7) + 1;
    return `${jueves.getFullYear()}-S${DOS(semana)}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Nombre del día de la semana ('lunes'...). */
export function nombreDiaSemana(valor) {
    const fecha = fechaLocal(valor);
    return fecha ? DIAS[fecha.getDay()] : null;
}

/** Índice del día con lunes = 1 ... domingo = 7 (para ordenar). */
export function indiceDiaSemana(valor) {
    const fecha = fechaLocal(valor);
    return fecha ? ((fecha.getDay() + 6) % 7) + 1 : null;
}

/** 'YYYY-MM' -> 'mar 2026' (o 'marzo de 2026' con largo=true). */
export function etiquetaMes(claveMesTexto, { largo = false, conAnio = true } = {}) {
    if (!claveMesTexto) return '';
    const [a, m] = String(claveMesTexto).split('-');
    const idx = Number(m) - 1;
    if (!(idx >= 0 && idx < 12)) return String(claveMesTexto);
    const nombre = largo ? MESES_LARGOS[idx] : MESES_CORTOS[idx];
    if (!conAnio) return nombre;
    return largo ? `${nombre} de ${a}` : `${nombre} ${a}`;
}

/** Suma días a una clave 'YYYY-MM-DD'. */
export function sumarDias(clave, dias) {
    const fecha = fechaLocal(clave);
    fecha.setDate(fecha.getDate() + dias);
    return claveDiaDeDate(fecha);
}

/** ¿La fecha cae entre desde y hasta (ambos incluidos)? Límites vacíos = abierto. */
export function enRango(valor, desde, hasta) {
    const clave = claveDia(valor);
    if (!clave) return !desde && !hasta;
    if (desde && clave < desde) return false;
    if (hasta && clave > hasta) return false;
    return true;
}

/** Rangos predefinidos para los filtros de reportes. */
export const PRESETS_RANGO = [
    { id: 'todo', etiqueta: 'Todo' },
    { id: 'hoy', etiqueta: 'Hoy' },
    { id: 'semana', etiqueta: 'Esta semana' },
    { id: 'mes', etiqueta: 'Este mes' },
    { id: 'mes_anterior', etiqueta: 'Mes anterior' },
    { id: 'ultimos_30', etiqueta: 'Últimos 30 días' },
    { id: 'ultimos_90', etiqueta: 'Últimos 90 días' },
    { id: 'trimestre', etiqueta: 'Este trimestre' },
    { id: 'anio', etiqueta: 'Este año' },
    { id: 'anio_anterior', etiqueta: 'Año anterior' },
];

/**
 * Convierte un preset en un rango { desde, hasta } de claves 'YYYY-MM-DD'.
 * 'todo' (o un id desconocido) devuelve { desde: '', hasta: '' }.
 */
export function rangoDePreset(preset, hoy = hoyLocal()) {
    const fecha = fechaLocal(hoy);
    const a = fecha.getFullYear();
    const m = fecha.getMonth();
    const clave = (d) => claveDiaDeDate(d);
    switch (preset) {
        case 'hoy':
            return { desde: hoy, hasta: hoy };
        case 'semana': {
            const diaIso = (fecha.getDay() + 6) % 7;
            return { desde: sumarDias(hoy, -diaIso), hasta: hoy };
        }
        case 'mes':
            return { desde: clave(new Date(a, m, 1)), hasta: hoy };
        case 'mes_anterior':
            return { desde: clave(new Date(a, m - 1, 1)), hasta: clave(new Date(a, m, 0)) };
        case 'ultimos_30':
            return { desde: sumarDias(hoy, -29), hasta: hoy };
        case 'ultimos_90':
            return { desde: sumarDias(hoy, -89), hasta: hoy };
        case 'trimestre': {
            const inicio = Math.floor(m / 3) * 3;
            return { desde: clave(new Date(a, inicio, 1)), hasta: hoy };
        }
        case 'anio':
            return { desde: clave(new Date(a, 0, 1)), hasta: hoy };
        case 'anio_anterior':
            return { desde: clave(new Date(a - 1, 0, 1)), hasta: clave(new Date(a - 1, 11, 31)) };
        default:
            return { desde: '', hasta: '' };
    }
}
