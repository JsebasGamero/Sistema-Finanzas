// Motor de tabla dinámica (modo resumen del explorador).
//
// AG-Grid Community no trae agrupación, pivote ni agregaciones (son de la
// edición Enterprise), así que se calculan aquí y la grilla solo pinta el
// resultado. Reglas:
// - Todo se calcula sobre los datos crudos: un promedio de grupo no es el
//   promedio de los promedios de sus subgrupos, y un porcentaje se divide con
//   los totales sin redondear.
// - Con dos dimensiones de fila, cada grupo sale como una fila de subtotal
//   (nivel 0) seguida de sus subgrupos (nivel 1).
// - Las columnas de fecha van en orden cronológico; las demás, de mayor a
//   menor total.
// - "top" deja los N grupos de mayor magnitud y junta el resto en "Otros",
//   recalculado desde las filas (no sumando resultados).
//
// Puro: sin React ni Dexie. Se prueba en resumen.test.js.
import { aMonto, redondearMonto, esCero } from '../../domain/value-objects/dinero';
import { columnaDe, esTipoNumerico } from './conjuntos';
import { dimensionesDe, SIN_DATO } from './dimensiones';

export const CAMPO_CONTEO = '__conteo';
export const CLAVE_OTROS = '__otros';
export const ETIQUETA_OTROS = 'Otros';
const SEPARADOR = '\u0001';

export const AGREGACIONES = Object.freeze([
    { id: 'suma', etiqueta: 'Suma', aditiva: true },
    { id: 'promedio', etiqueta: 'Promedio', aditiva: false },
    { id: 'minimo', etiqueta: 'Mínimo', aditiva: false },
    { id: 'maximo', etiqueta: 'Máximo', aditiva: false },
    { id: 'conteo', etiqueta: 'Conteo', aditiva: true },
    { id: 'distintos', etiqueta: 'Valores distintos', aditiva: false },
]);

export const MOSTRAR_COMO = Object.freeze([
    { id: 'valor', etiqueta: 'Valor' },
    { id: 'pct_total', etiqueta: '% del total' },
    { id: 'pct_fila', etiqueta: '% de la fila' },
    { id: 'pct_columna', etiqueta: '% de la columna' },
]);

export const ORDENES = Object.freeze([
    { id: 'valor_desc', etiqueta: 'Mayor a menor' },
    { id: 'valor_asc', etiqueta: 'Menor a mayor' },
    { id: 'etiqueta', etiqueta: 'Por nombre o fecha' },
]);

const IDS_AGREGACION = new Set(AGREGACIONES.map((a) => a.id));
const IDS_MOSTRAR = new Set(MOSTRAR_COMO.map((m) => m.id));
const IDS_ORDEN = new Set(ORDENES.map((o) => o.id));

/** ¿Tiene sentido sumar los resultados de esta agregación (y verlos como %)? */
export function esAgregacionAditiva(valor) {
    if (!valor) return false;
    if (valor.campo === CAMPO_CONTEO) return true;
    return valor.agregacion === 'suma' || valor.agregacion === 'conteo';
}

/** Campos que se pueden usar como valor con una agregación dada. */
export function camposDeValor(conjunto, agregacion) {
    if (agregacion === 'distintos') {
        return conjunto.columnas.filter((c) => c.tipo !== 'fechaHora');
    }
    return conjunto.columnas.filter((c) => esTipoNumerico(c.tipo));
}

/**
 * Configuración por defecto del resumen de un conjunto.
 */
export function configResumenPorDefecto(conjunto) {
    return normalizarConfigResumen(conjunto?.resumenPorDefecto ?? {}, conjunto);
}

function enteroPositivo(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Valida y completa una configuración de resumen contra un conjunto. Nunca
 * lanza: lo que no sirve se reemplaza por el valor por defecto. Se usa con
 * vistas guardadas que pueden ser de una versión vieja o estar corruptas.
 */
export function normalizarConfigResumen(config, conjunto) {
    const entrada = config && typeof config === 'object' ? config : {};
    const dimensiones = dimensionesDe(conjunto);
    const ids = new Set(dimensiones.map((d) => d.id));
    const base = conjunto?.resumenPorDefecto ?? {};

    let filas = (Array.isArray(entrada.filas) ? entrada.filas : [])
        .filter((id) => typeof id === 'string' && ids.has(id));
    filas = [...new Set(filas)].slice(0, 2);
    if (filas.length === 0) {
        const porDefecto = (base.filas ?? []).filter((id) => ids.has(id));
        filas = porDefecto.length ? porDefecto.slice(0, 2) : (dimensiones[0] ? [dimensiones[0].id] : []);
    }

    let columnas = typeof entrada.columnas === 'string' && ids.has(entrada.columnas) ? entrada.columnas : null;
    if (entrada.columnas === undefined && typeof base.columnas === 'string' && ids.has(base.columnas)) {
        columnas = base.columnas;
    }
    if (columnas && filas.includes(columnas)) columnas = null;

    const valorEntrada = entrada.valor && typeof entrada.valor === 'object' ? entrada.valor : {};
    let agregacion = IDS_AGREGACION.has(valorEntrada.agregacion) ? valorEntrada.agregacion : null;
    let campo = typeof valorEntrada.campo === 'string' ? valorEntrada.campo : null;
    if (campo === CAMPO_CONTEO) {
        agregacion = 'conteo';
    } else {
        const valido = campo && camposDeValor(conjunto, agregacion ?? 'suma').some((c) => c.campo === campo);
        if (!valido) {
            const valorBase = base.valor ?? {};
            const campoBase = camposDeValor(conjunto, 'suma').find((c) => c.campo === valorBase.campo)
                ?? camposDeValor(conjunto, 'suma')[0];
            campo = campoBase ? campoBase.campo : CAMPO_CONTEO;
            // Solo se cambia el campo: el cálculo que eligió el usuario se
            // respeta. Al pasar de "Valores distintos de proveedor" a
            // "Promedio", antes volvía a "Suma de monto" y la tabla mostraba
            // otra cifra de la pedida.
            let agregacionBase = IDS_AGREGACION.has(valorBase.agregacion) ? valorBase.agregacion : 'suma';
            if (agregacion && agregacion !== 'distintos') agregacionBase = agregacion;
            agregacion = campo === CAMPO_CONTEO ? 'conteo' : agregacionBase;
        }
        if (!agregacion) agregacion = 'suma';
    }
    const valor = { campo, agregacion };

    let mostrarComo = IDS_MOSTRAR.has(entrada.mostrarComo) ? entrada.mostrarComo : 'valor';
    if (!esAgregacionAditiva(valor)) mostrarComo = 'valor';
    // Sin columnas, "% de la fila" daría 100 % en todas y "% de la columna"
    // es lo mismo que "% del total".
    if (!columnas && (mostrarComo === 'pct_fila' || mostrarComo === 'pct_columna')) mostrarComo = 'pct_total';

    const orden = IDS_ORDEN.has(entrada.orden) ? entrada.orden : 'valor_desc';
    const top = enteroPositivo(entrada.top);

    return { filas, columnas, valor, mostrarComo, orden, top };
}

/**
 * Tipo de cifra que resulta del resumen, para formatear y exportar:
 * 'dinero' | 'numero' | 'porcentaje'.
 */
export function tipoDeValorResumen(config, conjunto) {
    if (config.mostrarComo !== 'valor') return 'porcentaje';
    const { campo, agregacion } = config.valor;
    if (campo === CAMPO_CONTEO || agregacion === 'conteo' || agregacion === 'distintos') return 'numero';
    const columna = columnaDe(conjunto, campo);
    return columna && esTipoNumerico(columna.tipo) ? columna.tipo : 'numero';
}

/** Rótulo del valor ("Suma de Monto", "Cantidad de registros"). */
export function etiquetaDeValor(config, conjunto) {
    const { campo, agregacion } = config.valor;
    if (campo === CAMPO_CONTEO) return 'Cantidad de registros';
    const columna = columnaDe(conjunto, campo);
    const nombre = columna?.etiqueta ?? campo;
    const agregado = AGREGACIONES.find((a) => a.id === agregacion)?.etiqueta ?? 'Suma';
    return `${agregado} de ${nombre.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Acumuladores
// ---------------------------------------------------------------------------

function nuevoAcumulador() {
    return { filas: 0, n: 0, suma: 0, min: Infinity, max: -Infinity, distintos: null };
}

function esVacio(valor) {
    return valor === null || valor === undefined || valor === '' || (typeof valor === 'number' && Number.isNaN(valor));
}

function crearAcumular(campo, agregacion) {
    if (campo === CAMPO_CONTEO) {
        return (acc) => { acc.filas += 1; };
    }
    if (agregacion === 'distintos') {
        return (acc, fila) => {
            acc.filas += 1;
            const v = fila[campo];
            if (esVacio(v)) return;
            if (!acc.distintos) acc.distintos = new Set();
            acc.distintos.add(typeof v === 'string' ? v.trim().toLowerCase() : v);
        };
    }
    return (acc, fila) => {
        acc.filas += 1;
        const v = fila[campo];
        if (esVacio(v)) return;
        const n = aMonto(v);
        acc.n += 1;
        acc.suma += n;
        if (n < acc.min) acc.min = n;
        if (n > acc.max) acc.max = n;
    };
}

function crearResultado(campo, agregacion, redondear) {
    if (campo === CAMPO_CONTEO) return (acc) => acc.filas;
    switch (agregacion) {
        case 'conteo': return (acc) => acc.n;
        case 'distintos': return (acc) => (acc.distintos ? acc.distintos.size : 0);
        case 'promedio': return (acc) => (acc.n ? acc.suma / acc.n : null);
        case 'minimo': return (acc) => (acc.n ? acc.min : null);
        case 'maximo': return (acc) => (acc.n ? acc.max : null);
        default: return (acc) => (acc.n ? (redondear ? redondearMonto(acc.suma) : acc.suma) : null);
    }
}

function dividir(parte, todo) {
    if (parte === null || parte === undefined || todo === null || todo === undefined) return null;
    if (esCero(todo)) return null;
    return parte / todo;
}

function nodo() {
    return { acc: nuevoAcumulador(), celdas: new Map(), hijos: null };
}

function celda(mapa, clave) {
    let acc = mapa.get(clave);
    if (!acc) {
        acc = nuevoAcumulador();
        mapa.set(clave, acc);
    }
    return acc;
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

/**
 * Agrupa, pivota y agrega las filas de un conjunto.
 *
 * @param {Array<object>} filas  filas ya filtradas del conjunto
 * @param {object} configEntrada { filas: [dimId, dimId?], columnas: dimId|null,
 *   valor: { campo|'__conteo', agregacion }, mostrarComo, orden, top }
 * @param {object} conjunto
 * @returns {{
 *   config: object,
 *   tipoValor: 'dinero'|'numero'|'porcentaje',
 *   columnas: Array<{ clave: string, etiqueta: string }>,
 *   filas: Array<{ id: string, nivel: 0|1, claves: string[], etiquetas: string[],
 *     valores: Record<string, number|null>, total: number|null, esSubtotal: boolean }>,
 *   totalesColumna: Record<string, number|null>,
 *   granTotal: number|null,
 *   registros: number,
 * }}
 */
export function construirResumen(filas, configEntrada, conjunto) {
    const config = normalizarConfigResumen(configEntrada, conjunto);
    const dimensiones = new Map(dimensionesDe(conjunto).map((d) => [d.id, d]));
    const dimFilas = config.filas.map((id) => dimensiones.get(id)).filter(Boolean);
    const dimColumna = config.columnas ? dimensiones.get(config.columnas) ?? null : null;
    const { campo, agregacion } = config.valor;
    const columnaValor = columnaDe(conjunto, campo);
    const acumular = crearAcumular(campo, agregacion);
    const resultado = crearResultado(campo, agregacion, columnaValor?.tipo === 'dinero');
    const lista = Array.isArray(filas) ? filas.filter(Boolean) : [];

    const dim0 = dimFilas[0] ?? null;
    const dim1 = dimFilas[1] ?? null;
    const claveGrupo = (fila) => (dim0 ? dim0.valor(fila) : '__todo');

    // 1) Top N: se decide con el total de cada grupo y el resto pasa a "Otros".
    let mapearGrupo = (clave) => clave;
    if (config.top && dim0) {
        const totales = new Map();
        for (const fila of lista) acumular(celda(totales, claveGrupo(fila)), fila);
        if (totales.size > config.top) {
            const ranking = [...totales.entries()]
                .map(([clave, acc]) => [clave, Math.abs(resultado(acc) ?? 0)])
                .sort((a, b) => b[1] - a[1] || dim0.comparar(a[0], b[0]));
            const quedan = new Set(ranking.slice(0, config.top).map(([clave]) => clave));
            mapearGrupo = (clave) => (quedan.has(clave) ? clave : CLAVE_OTROS);
        }
    }

    // 2) Acumular una sola vez por fila en todos los niveles.
    const grupos = new Map();
    const porColumna = new Map();
    const gran = nuevoAcumulador();
    for (const fila of lista) {
        const k0 = mapearGrupo(claveGrupo(fila));
        const kc = dimColumna ? dimColumna.valor(fila) : null;
        let grupo = grupos.get(k0);
        if (!grupo) {
            grupo = nodo();
            if (dim1) grupo.hijos = new Map();
            grupos.set(k0, grupo);
        }
        acumular(grupo.acc, fila);
        if (kc !== null) acumular(celda(grupo.celdas, kc), fila);
        if (dim1) {
            const k1 = dim1.valor(fila);
            let hijo = grupo.hijos.get(k1);
            if (!hijo) {
                hijo = nodo();
                grupo.hijos.set(k1, hijo);
            }
            acumular(hijo.acc, fila);
            if (kc !== null) acumular(celda(hijo.celdas, kc), fila);
        }
        if (kc !== null) acumular(celda(porColumna, kc), fila);
        acumular(gran, fila);
    }

    // 3) Columnas.
    const totalesColumnaCrudos = new Map();
    for (const [clave, acc] of porColumna) totalesColumnaCrudos.set(clave, resultado(acc));
    let clavesColumna = [...porColumna.keys()];
    if (dimColumna) {
        if (dimColumna.cronologica) {
            clavesColumna.sort(dimColumna.comparar);
        } else {
            clavesColumna.sort((a, b) =>
                ((totalesColumnaCrudos.get(b) ?? -Infinity) - (totalesColumnaCrudos.get(a) ?? -Infinity))
                || dimColumna.comparar(a, b));
        }
    } else {
        clavesColumna = [];
    }
    const columnas = clavesColumna.map((clave) => ({
        clave,
        etiqueta: dimColumna.etiquetaDe(clave),
    }));

    const granTotalCrudo = resultado(gran);

    // 4) Cómo se muestra cada cifra.
    const { mostrarComo } = config;
    const enCelda = (valor, totalFila, clave) => {
        switch (mostrarComo) {
            case 'pct_total': return dividir(valor, granTotalCrudo);
            case 'pct_fila': return dividir(valor, totalFila);
            case 'pct_columna': return dividir(valor, totalesColumnaCrudos.get(clave));
            default: return valor;
        }
    };
    const enTotalFila = (total) => {
        switch (mostrarComo) {
            case 'pct_total':
            case 'pct_columna': return dividir(total, granTotalCrudo);
            case 'pct_fila': return dividir(total, total);
            default: return total;
        }
    };
    const enTotalColumna = (total) => {
        switch (mostrarComo) {
            case 'pct_total':
            case 'pct_fila': return dividir(total, granTotalCrudo);
            case 'pct_columna': return dividir(total, total);
            default: return total;
        }
    };

    const valoresDe = (n, totalFila) => {
        const valores = {};
        for (const clave of clavesColumna) {
            const acc = n.celdas.get(clave);
            if (!acc) continue;
            valores[clave] = enCelda(resultado(acc), totalFila, clave);
        }
        return valores;
    };

    // 5) Orden de grupos y subgrupos.
    const ordenar = (entradas, dim) => {
        const conTotal = entradas.map(([clave, n]) => ({ clave, n, total: resultado(n.acc) }));
        const porEtiqueta = (a, b) => (dim ? dim.comparar(a.clave, b.clave) : 0);
        const valorDe = (x) => x.total ?? -Infinity;
        conTotal.sort((a, b) => {
            if (a.clave === CLAVE_OTROS) return 1;
            if (b.clave === CLAVE_OTROS) return -1;
            if (config.orden === 'etiqueta') return porEtiqueta(a, b);
            const dif = config.orden === 'valor_asc' ? valorDe(a) - valorDe(b) : valorDe(b) - valorDe(a);
            return dif || porEtiqueta(a, b);
        });
        return conTotal;
    };

    const etiquetaDe = (dim, clave) => {
        if (clave === CLAVE_OTROS) return ETIQUETA_OTROS;
        if (!dim) return 'Total';
        return dim.etiquetaDe(clave);
    };

    // 6) Filas de salida.
    const salida = [];
    for (const g of ordenar([...grupos.entries()], dim0)) {
        const etiqueta0 = etiquetaDe(dim0, g.clave);
        salida.push({
            id: g.clave,
            nivel: 0,
            claves: [g.clave],
            etiquetas: [etiqueta0],
            valores: valoresDe(g.n, g.total),
            total: enTotalFila(g.total),
            esSubtotal: Boolean(dim1),
        });
        if (!dim1) continue;
        for (const h of ordenar([...g.n.hijos.entries()], dim1)) {
            salida.push({
                id: `${g.clave}${SEPARADOR}${h.clave}`,
                nivel: 1,
                claves: [g.clave, h.clave],
                etiquetas: [etiqueta0, etiquetaDe(dim1, h.clave)],
                valores: valoresDe(h.n, h.total),
                total: enTotalFila(h.total),
                esSubtotal: false,
            });
        }
    }

    const totalesColumna = {};
    for (const clave of clavesColumna) totalesColumna[clave] = enTotalColumna(totalesColumnaCrudos.get(clave));

    let granTotal = granTotalCrudo;
    if (mostrarComo !== 'valor') granTotal = dividir(granTotalCrudo, granTotalCrudo);

    return {
        config,
        tipoValor: tipoDeValorResumen(config, conjunto),
        columnas,
        filas: salida,
        totalesColumna,
        granTotal,
        registros: lista.length,
    };
}

export { SIN_DATO };
