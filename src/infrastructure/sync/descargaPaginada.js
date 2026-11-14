// Descarga completa de una tabla de Supabase, por páginas.
//
// Por qué existe (REP-1, SYNC-2): PostgREST recorta en silencio cada respuesta
// al `max-rows` del proyecto (1000 por defecto en Supabase), sin error ni
// aviso. El pull hacía `select('*')` sin paginar y después vaciaba la tabla
// local, así que desde el movimiento 1001 el celular se quedaba con una copia
// truncada y arbitraria, y los reportes sumaban sobre ella.
//
// No se usa "la página trajo menos de N" como condición de fin: si el
// `max-rows` del proyecto es menor que el tamaño de página, la primera página
// ya viene corta y el bucle se cortaría antes de tiempo. Se pide el total
// exacto en la primera consulta y se sigue hasta tenerlo o hasta una página
// vacía. Si al final faltan filas, se lanza un error: el pull aborta sin
// tocar la base local.

export const TAMANO_PAGINA = 1000;

/**
 * @typedef {{ data: Array<{ id: any }> | null, error: any, count?: number | null, status?: number }} RespuestaPagina
 */

/**
 * @param {(desde: number, hasta: number, conConteo: boolean) => Promise<RespuestaPagina>} consultarPagina
 *   Debe ordenar por una clave única y estable (id): con un orden no único las
 *   filas que empatan pueden saltarse o repetirse entre páginas.
 * @param {{ tamanoPagina?: number, maxPaginas?: number }} [opciones]
 * @returns {Promise<Array<object>>} todas las filas, sin repetidos por id
 */
export async function descargarTodo(consultarPagina, { tamanoPagina = TAMANO_PAGINA, maxPaginas = 100000 } = {}) {
    const porId = new Map();
    let recibidas = 0;
    let total = null;

    for (let pagina = 0; ; pagina++) {
        if (pagina >= maxPaginas) {
            throw crearErrorDeDescarga('La descarga superó el número máximo de páginas', null);
        }

        const conConteo = total === null;
        const respuesta = await consultarPagina(recibidas, recibidas + tamanoPagina - 1, conConteo);
        if (respuesta?.error) {
            throw crearErrorDeDescarga(respuesta.error.message || 'Error al descargar una página', respuesta.error, respuesta.status);
        }

        if (conConteo) {
            if (typeof respuesta.count !== 'number') {
                throw crearErrorDeDescarga('La nube no devolvió el total de filas', null, respuesta.status);
            }
            total = respuesta.count;
        }

        const filas = Array.isArray(respuesta.data) ? respuesta.data : [];
        for (const fila of filas) porId.set(fila.id, fila);
        // El desplazamiento cuenta filas recibidas, no páginas: así funciona
        // aunque el servidor devuelva páginas más cortas que las pedidas.
        recibidas += filas.length;

        if (filas.length === 0 || porId.size >= total) break;
    }

    // Una fila borrada en la nube mientras se descargaba desplaza las demás y
    // puede hacer que otra se salte. Mejor abortar y reintentar en el próximo
    // pull que reemplazar la base local con una copia incompleta.
    if (porId.size < total) {
        throw crearErrorDeDescarga(`Descarga incompleta: ${porId.size} de ${total} filas`, null);
    }

    return [...porId.values()];
}

function crearErrorDeDescarga(mensaje, causa, status) {
    const error = new Error(mensaje);
    error.name = 'ErrorDeDescarga';
    error.causa = causa ?? null;
    error.code = causa?.code ?? '';
    error.status = status ?? causa?.status ?? null;
    return error;
}
