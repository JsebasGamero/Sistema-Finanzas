// Dimensiones: por qué se puede agrupar un conjunto en el modo resumen.
//
// Una dimensión convierte una fila en una clave de texto (la caja, el mes, el
// tipo...). Son de dos clases:
// - Columnas de texto o sí/no del conjunto.
// - Derivadas de la fecha del conjunto: año, trimestre, mes, semana, día y
//   día de la semana. Sus claves ('2026-03', '2026-T1', '2026-S09'...) se
//   ordenan cronológicamente y se rotulan con etiquetaMes(), nunca con
//   new Date('YYYY-MM'), que en Colombia rotula cada mes con el anterior.
//
// Puro: sin React ni Dexie. Se prueba en dimensiones.test.js.
import {
    claveDia, claveMes, claveAnio, claveTrimestre, claveSemana, indiceDiaSemana, etiquetaMes,
} from '../../domain/value-objects/fecha';

/** Rótulo de los valores vacíos en cualquier dimensión. */
export const SIN_DATO = '(sin dato)';

const COMPARADOR_TEXTO = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Los vacíos siempre al final, sea cual sea el orden. */
function conVaciosAlFinal(comparar) {
    return (a, b) => {
        if (a === b) return 0;
        if (a === SIN_DATO) return 1;
        if (b === SIN_DATO) return -1;
        return comparar(a, b);
    };
}

const compararTexto = conVaciosAlFinal((a, b) => COMPARADOR_TEXTO.compare(String(a), String(b)));
// Las claves de fecha ('YYYY-MM', 'YYYY-T1'...) ordenan bien como texto.
const compararCronologico = conVaciosAlFinal((a, b) => (a < b ? -1 : 1));
const compararNumerico = conVaciosAlFinal((a, b) => Number(a) - Number(b));

function textoODato(valor) {
    if (valor === null || valor === undefined) return SIN_DATO;
    const texto = String(valor).trim();
    return texto === '' ? SIN_DATO : texto;
}

const identidad = (clave) => clave;

const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function etiquetaDia(clave) {
    if (clave === SIN_DATO) return clave;
    return `${clave.slice(8, 10)} ${etiquetaMes(clave.slice(0, 7), { conAnio: false })} ${clave.slice(0, 4)}`;
}

function etiquetaTrimestre(clave) {
    if (clave === SIN_DATO) return clave;
    const [anio, trimestre] = clave.split('-');
    return `${trimestre} ${anio}`;
}

function etiquetaSemana(clave) {
    if (clave === SIN_DATO) return clave;
    const [anio, semana] = clave.split('-');
    return `Sem ${Number(semana.slice(1))} · ${anio}`;
}

function derivadaDeFecha(campo, sufijo, etiqueta, calcular, etiquetaDe, comparar = compararCronologico) {
    return Object.freeze({
        id: `${campo}:${sufijo}`,
        etiqueta,
        cronologica: true,
        valor: (fila) => {
            const clave = calcular(fila?.[campo]);
            return clave === null || clave === undefined ? SIN_DATO : String(clave);
        },
        etiquetaDe: (clave) => (clave === SIN_DATO ? SIN_DATO : etiquetaDe(clave)),
        comparar,
    });
}

function derivadasDeFecha(campo) {
    return [
        derivadaDeFecha(campo, 'anio', 'Año', claveAnio, identidad),
        derivadaDeFecha(campo, 'trimestre', 'Trimestre', claveTrimestre, etiquetaTrimestre),
        derivadaDeFecha(campo, 'mes', 'Mes', claveMes, (clave) => etiquetaMes(clave)),
        derivadaDeFecha(campo, 'semana', 'Semana', claveSemana, etiquetaSemana),
        derivadaDeFecha(campo, 'dia', 'Día', claveDia, etiquetaDia),
        derivadaDeFecha(
            campo, 'dia_semana', 'Día de la semana', indiceDiaSemana,
            (clave) => NOMBRES_DIA[Number(clave) - 1] ?? clave,
            compararNumerico
        ),
    ];
}

function dimensionDeColumna(columna) {
    if (columna.tipo === 'booleano') {
        return Object.freeze({
            id: columna.campo,
            etiqueta: columna.etiqueta,
            cronologica: false,
            valor: (fila) => {
                const v = fila?.[columna.campo];
                if (v === null || v === undefined) return SIN_DATO;
                return v ? 'Sí' : 'No';
            },
            etiquetaDe: identidad,
            comparar: compararTexto,
        });
    }
    return Object.freeze({
        id: columna.campo,
        etiqueta: columna.etiqueta,
        cronologica: false,
        valor: (fila) => textoODato(fila?.[columna.campo]),
        etiquetaDe: identidad,
        comparar: compararTexto,
    });
}

const cache = new WeakMap();

/**
 * Dimensiones de un conjunto: columnas agrupables y derivadas de su fecha.
 * Devuelve siempre el mismo arreglo para el mismo conjunto (sirve de
 * dependencia estable en useMemo).
 * @returns {Array<{ id, etiqueta, cronologica, valor(fila): string, etiquetaDe(clave): string, comparar(a, b): number }>}
 */
export function dimensionesDe(conjunto) {
    if (!conjunto) return [];
    if (cache.has(conjunto)) return cache.get(conjunto);
    const dimensiones = [];
    for (const columna of conjunto.columnas) {
        if (!columna.agrupable) continue;
        if (columna.tipo !== 'texto' && columna.tipo !== 'booleano') continue;
        dimensiones.push(dimensionDeColumna(columna));
    }
    if (conjunto.campoFecha) dimensiones.push(...derivadasDeFecha(conjunto.campoFecha));
    const congeladas = Object.freeze(dimensiones);
    cache.set(conjunto, congeladas);
    return congeladas;
}

/** Dimensión por id dentro de un conjunto, o null. */
export function dimensionPorId(conjunto, id) {
    if (!id) return null;
    return dimensionesDe(conjunto).find((d) => d.id === id) ?? null;
}
