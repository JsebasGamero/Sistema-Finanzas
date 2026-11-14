// Filtros del explorador de reportes.
//
// - aplicarFiltros: periodo sobre la fecha del conjunto y búsqueda libre.
//   El periodo usa enRango(), que compara claves de calendario: incluye el
//   primer y el último día aunque la fecha traiga hora. La tabla anterior
//   dejaba afuera los extremos del rango (REP-6) y corría las fechas un día
//   (REP-3) por parsearlas como UTC.
// - aplicarModeloFiltros: evalúa el modelo de filtros de columna de AG-Grid
//   (getFilterModel()) sobre filas planas. Así el modo resumen respeta los
//   mismos filtros que el usuario armó en el modo detalle.
//
// Puro: sin React ni Dexie. Se prueba en filtros.test.js.
import { aMonto, esCero } from '../../domain/value-objects/dinero';
import { claveDia, enRango } from '../../domain/value-objects/fecha';

/** Minúsculas y sin tildes: "Crédito" y "credito" son lo mismo al buscar. */
export function normalizarTexto(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

function fechaNumerica(clave) {
    return clave ? `${clave.slice(8, 10)}/${clave.slice(5, 7)}/${clave.slice(0, 4)}` : '';
}

/** Texto en el que se busca para un valor según el tipo de su columna. */
function textoBuscable(valor, tipo) {
    if (valor === null || valor === undefined || valor === '') return '';
    switch (tipo) {
        case 'dinero':
        case 'numero':
            return String(Math.round(aMonto(valor)));
        case 'fecha':
        case 'fechaHora': {
            const clave = claveDia(valor);
            return clave ? `${clave} ${fechaNumerica(clave)}` : '';
        }
        // Buscar "si" encontraría todas las filas con alguna casilla marcada.
        case 'booleano':
        case 'porcentaje':
            return '';
        default:
            return normalizarTexto(valor);
    }
}

/**
 * Términos de búsqueda. Un término que parece cifra ("1.500.000", "$250")
 * se reduce a sus dígitos para que coincida con el monto crudo.
 */
export function terminosDeBusqueda(busqueda) {
    return normalizarTexto(busqueda)
        .split(/\s+/)
        .filter(Boolean)
        .map((termino) => (/^[$\d.,]+$/.test(termino) && /\d/.test(termino) ? termino.replace(/\D/g, '') : termino))
        .filter(Boolean);
}

function columnasDeFila(fila) {
    return Object.keys(fila)
        .filter((campo) => campo !== 'id' && !campo.startsWith('_'))
        .map((campo) => {
            const valor = fila[campo];
            if (typeof valor === 'number') return { campo, tipo: 'numero' };
            if (typeof valor === 'boolean') return { campo, tipo: 'booleano' };
            return { campo, tipo: 'texto' };
        });
}

/**
 * Filtra por periodo y búsqueda libre.
 * @param {Array<object>} filas
 * @param {{ busqueda?: string, desde?: string, hasta?: string, campoFecha?: string|null,
 *   columnasBusqueda?: Array<{ campo: string, tipo: string }|string>|null }} opciones
 *   columnasBusqueda: dónde buscar (las columnas visibles). Sin ellas, en
 *   todos los campos de la fila.
 */
export function aplicarFiltros(filas, opciones = {}) {
    const { busqueda = '', desde = '', hasta = '', campoFecha = null, columnasBusqueda = null } = opciones;
    const lista = Array.isArray(filas) ? filas : [];
    const porFecha = Boolean(campoFecha && (desde || hasta));
    const terminos = terminosDeBusqueda(busqueda);
    if (!porFecha && terminos.length === 0) return lista;

    const columnas = Array.isArray(columnasBusqueda)
        ? columnasBusqueda.map((c) => (typeof c === 'string' ? { campo: c, tipo: 'texto' } : c))
        : null;

    return lista.filter((fila) => {
        if (!fila) return false;
        if (porFecha && !enRango(fila[campoFecha], desde, hasta)) return false;
        if (terminos.length === 0) return true;
        const texto = (columnas ?? columnasDeFila(fila))
            .map((c) => textoBuscable(fila[c.campo], c.tipo))
            .join(' \u0001 ');
        return terminos.every((termino) => texto.includes(termino));
    });
}

// ---------------------------------------------------------------------------
// Modelo de filtros de AG-Grid
// ---------------------------------------------------------------------------

function vacio(valor) {
    return valor === null || valor === undefined || valor === '';
}

/** Texto de una celda tal como lo compara el filtro de texto de la grilla. */
export function textoParaFiltro(valor, tipo) {
    if (vacio(valor)) return '';
    if (tipo === 'booleano') return valor ? 'Sí' : 'No';
    return String(valor);
}

function predicadoTexto(modelo, columna) {
    const buscado = normalizarTexto(modelo.filter);
    return (fila) => {
        const crudo = textoParaFiltro(fila[columna.campo], columna.tipo);
        const texto = normalizarTexto(crudo);
        switch (modelo.type) {
            case 'blank': return texto === '';
            case 'notBlank': return texto !== '';
            // Como en AG-Grid: una celda vacía pasa "no contiene" y "distinto de".
            case 'notContains': return texto === '' || !texto.includes(buscado);
            case 'notEqual': return texto === '' || texto !== buscado;
            case 'equals': return texto === buscado;
            case 'startsWith': return texto.startsWith(buscado);
            case 'endsWith': return texto.endsWith(buscado);
            case 'contains': return texto.includes(buscado);
            default: return true;
        }
    };
}

/**
 * Valor con el que se filtra una celda de porcentaje: el que se ve (90 para
 * "90 %"), redondeado a un decimal como formatoPorcentaje(). Las columnas
 * guardan la fracción (0,9) y el filtro comparaba contra ella: "mayor que 90"
 * dejaba la grilla vacía. La grilla lo usa como filterValueGetter y el modo
 * resumen en predicadoNumero, para que los dos modos cuadren.
 */
export function valorPorcentajeParaFiltro(valor) {
    if (vacio(valor)) return null;
    const n = Number(valor);
    return Number.isFinite(n) ? Math.round(n * 1000) / 10 : null;
}

function valorNumericoParaFiltro(valor) {
    return vacio(valor) ? null : aMonto(valor);
}

function predicadoNumero(modelo, columna) {
    const desde = vacio(modelo.filter) ? null : aMonto(modelo.filter);
    const hasta = vacio(modelo.filterTo) ? null : aMonto(modelo.filterTo);
    const valorDe = columna.tipo === 'porcentaje' ? valorPorcentajeParaFiltro : valorNumericoParaFiltro;
    return (fila) => {
        const v = valorDe(fila[columna.campo]);
        if (modelo.type === 'blank') return v === null;
        if (modelo.type === 'notBlank') return v !== null;
        // Como en la grilla: una celda vacía solo pasa "vacío".
        if (v === null) return false;
        if (desde === null) return true;
        switch (modelo.type) {
            case 'equals': return esCero(v - desde);
            case 'notEqual': return !esCero(v - desde);
            case 'lessThan': return v < desde && !esCero(v - desde);
            case 'lessThanOrEqual': return v <= desde || esCero(v - desde);
            case 'greaterThan': return v > desde && !esCero(v - desde);
            case 'greaterThanOrEqual': return v >= desde || esCero(v - desde);
            // La grilla usa inRangeInclusive: los extremos cuentan (REP-6).
            case 'inRange': return hasta === null ? v >= desde : (v >= desde || esCero(v - desde)) && (v <= hasta || esCero(v - hasta));
            default: return true;
        }
    };
}

function predicadoFecha(modelo, columna) {
    const desde = claveDia(modelo.dateFrom);
    const hasta = claveDia(modelo.dateTo);
    return (fila) => {
        const clave = claveDia(fila[columna.campo]);
        if (modelo.type === 'blank') return !clave;
        if (modelo.type === 'notBlank') return Boolean(clave);
        if (!clave) return false;
        if (!desde) return true;
        switch (modelo.type) {
            case 'equals': return clave === desde;
            case 'notEqual': return clave !== desde;
            case 'lessThan': return clave < desde;
            case 'greaterThan': return clave > desde;
            case 'inRange': return enRango(clave, desde, hasta || '');
            default: return true;
        }
    };
}

function crearPredicado(modelo, columna) {
    if (!modelo || typeof modelo !== 'object') return () => true;
    if (Array.isArray(modelo.conditions) && modelo.conditions.length) {
        const predicados = modelo.conditions.map((c) => crearPredicado({ filterType: modelo.filterType, ...c }, columna));
        return modelo.operator === 'OR'
            ? (fila) => predicados.some((p) => p(fila))
            : (fila) => predicados.every((p) => p(fila));
    }
    switch (modelo.filterType) {
        case 'text': return predicadoTexto(modelo, columna);
        case 'number': return predicadoNumero(modelo, columna);
        case 'date': return predicadoFecha(modelo, columna);
        default: return () => true;
    }
}

/**
 * Aplica un modelo de filtros de AG-Grid ({ [campo]: modelo }) a filas planas.
 * Los campos que el conjunto no tiene se ignoran.
 * @param {Array<object>} filas
 * @param {object|null} modelo  resultado de api.getFilterModel()
 * @param {Array<{ campo: string, tipo: string }>} columnas  columnas del conjunto
 */
export function aplicarModeloFiltros(filas, modelo, columnas) {
    const lista = Array.isArray(filas) ? filas : [];
    if (!modelo || typeof modelo !== 'object') return lista;
    const porCampo = new Map((columnas ?? []).map((c) => [c.campo, c]));
    const predicados = Object.entries(modelo)
        .filter(([campo, m]) => m && typeof m === 'object' && porCampo.has(campo))
        .map(([campo, m]) => crearPredicado(m, porCampo.get(campo)));
    if (predicados.length === 0) return lista;
    return lista.filter((fila) => fila && predicados.every((p) => p(fila)));
}

/** Cantidad de filtros de columna activos (para avisar en la barra). */
export function contarFiltrosActivos(modelo, columnas) {
    if (!modelo || typeof modelo !== 'object') return 0;
    const campos = new Set((columnas ?? []).map((c) => c.campo));
    return Object.entries(modelo).filter(([campo, m]) => m && typeof m === 'object' && campos.has(campo)).length;
}

const OPERADORES = Object.freeze({
    contains: 'contiene',
    notContains: 'no contiene',
    equals: 'igual a',
    notEqual: 'distinto de',
    startsWith: 'empieza por',
    endsWith: 'termina en',
    blank: 'vacío',
    notBlank: 'no vacío',
    lessThan: 'menor que',
    lessThanOrEqual: 'menor o igual a',
    greaterThan: 'mayor que',
    greaterThanOrEqual: 'mayor o igual a',
    inRange: 'entre',
});

function describirCondicion(modelo, formatear, columna) {
    const operador = modelo.filterType === 'date'
        ? ({ lessThan: 'antes de', greaterThan: 'después de' }[modelo.type] ?? OPERADORES[modelo.type])
        : OPERADORES[modelo.type];
    if (!operador) return '';
    if (modelo.type === 'blank' || modelo.type === 'notBlank') return operador;
    const valor = modelo.filterType === 'date' ? claveDia(modelo.dateFrom) : modelo.filter;
    const valorHasta = modelo.filterType === 'date' ? claveDia(modelo.dateTo) : modelo.filterTo;
    const escribir = (v) => formatear(v, modelo.filterType, columna);
    if (modelo.type === 'inRange') return `${operador} ${escribir(valor)} y ${escribir(valorHasta)}`;
    return `${operador} ${escribir(valor)}`;
}

/**
 * Descripción legible de los filtros de columna ("Tipo: igual a Egreso").
 * @param {(valor, filterType, columna) => string} formatear  cómo escribir
 *   cada valor; recibe la columna para escribir "90 %" en las de porcentaje.
 */
export function describirModeloFiltros(modelo, columnas, formatear = (v) => String(v ?? '')) {
    if (!modelo || typeof modelo !== 'object') return [];
    const porCampo = new Map((columnas ?? []).map((c) => [c.campo, c]));
    const descripciones = [];
    for (const [campo, m] of Object.entries(modelo)) {
        const columna = porCampo.get(campo);
        if (!columna || !m || typeof m !== 'object') continue;
        const condiciones = Array.isArray(m.conditions) && m.conditions.length
            ? m.conditions.map((c) => describirCondicion({ filterType: m.filterType, ...c }, formatear, columna)).filter(Boolean)
            : [describirCondicion(m, formatear, columna)].filter(Boolean);
        if (!condiciones.length) continue;
        const union = m.operator === 'OR' ? ' o ' : ' y ';
        descripciones.push(`${columna.etiqueta}: ${condiciones.join(union)}`);
    }
    return descripciones;
}
