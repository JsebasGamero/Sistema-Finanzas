// Resolución de categorías.
//
// Contexto: `transacciones.categoria` es una columna TEXT. Históricamente la
// app guardaba ahí el UUID de la fila de `categorias`, lo que trajo dos
// problemas:
//
//  1. `categorias.nombre` es UNIQUE en Supabase. Si dos dispositivos creaban
//     "Materiales" con UUIDs distintos, el segundo chocaba y su categoría
//     nunca subía. Al siguiente pull la tabla local se reemplazaba por la de
//     la nube y ese UUID quedaba huérfano.
//  2. Un UUID huérfano se mostraba tal cual en pantalla: el usuario veía
//     "a3f1c8e2-..." donde debía decir "Materiales".
//
// Desde ahora se guarda el NOMBRE, que es justamente lo que la columna es y lo
// que hace UNIQUE al registro. Estas funciones siguen resolviendo los UUID
// antiguos para no romper el histórico.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUUID(valor) {
    return typeof valor === 'string' && UUID_RE.test(valor);
}

/**
 * Devuelve el nombre legible de una categoría.
 *
 * @param {string} valor       Lo guardado en transacciones.categoria (nombre o UUID legacy)
 * @param {Array}  categorias  Filas de la tabla categorias
 * @param {string} vacio       Qué mostrar cuando no hay categoría o no se puede resolver
 */
export function resolverNombreCategoria(valor, categorias = [], vacio = 'Sin categoría') {
    if (!valor) return vacio;

    // Caso normal: ya es el nombre.
    if (!esUUID(valor)) return valor;

    // Caso legacy: es un UUID. Se busca en la tabla.
    const encontrada = categorias.find(c => c.id === valor);
    if (encontrada?.nombre) return encontrada.nombre;

    // UUID huérfano (la categoría se perdió en un sync roto). Antes esto
    // pintaba el UUID crudo en pantalla; mejor decir que no hay categoría.
    return vacio;
}

/** Categorías por defecto, usadas solo si la tabla está vacía y no hay nube. */
export const CATEGORIAS_POR_DEFECTO = [
    'Nómina', 'Materiales', 'Viáticos', 'Combustible (ACPM)', 'Transporte',
    'Alquiler Maquinaria', 'Préstamo', 'Pago Préstamo', 'Servicios',
    'Seguridad Social', 'Otros'
];

// `categorias.tipo` tiene CHECK (tipo IN ('INGRESO','EGRESO','AMBOS')).
// La app insertaba 'general', que violaba la restricción; el error 23514 se
// clasificaba como permanente y la categoría se descartaba en silencio.
export const TIPO_CATEGORIA_POR_DEFECTO = 'AMBOS';

