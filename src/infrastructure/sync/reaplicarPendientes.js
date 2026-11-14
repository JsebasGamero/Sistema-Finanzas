// Re-aplica sobre la base local las operaciones que siguen en sync_queue.
//
// Por qué existe: el pull reemplaza las tablas locales con lo que hay en la
// nube. Lo que todavía no subió (sin señal, error pasajero) desaparecería de
// la pantalla aunque siga vivo en la cola. Re-aplicándolo encima, el estado
// local es "lo que hay en la nube + lo mío que aún no subió".
//
// Es idempotente y respeta el orden de la cola: lo pendiente es siempre el
// final de la historia de escrituras, así que aplicarlo en orden deja cada
// fila con su último valor.
//
// No importa db.js: recibe la base por parámetro para poder correr dentro de
// la transacción del pull y para probarse con dobles en memoria.

// Campos sin los cuales una fila no se puede mostrar. Un UPDATE parcial como
// `{ id, saldo_actual }` sobre una fila que el pull ya no trae (la borraron en
// otro dispositivo) creaba una caja fantasma sin nombre ni tipo (SYNC-19).
export const CAMPOS_MINIMOS = Object.freeze({
    empresas: ['nombre'],
    cajas: ['nombre', 'tipo'],
    proyectos: ['nombre'],
    terceros: ['nombre'],
    categorias: ['nombre'],
    transacciones: ['monto', 'tipo_movimiento'],
    deudas_cajas: ['monto_original'],
    deudas_terceros: ['monto_original'],
});

/** ¿El payload trae lo necesario para existir como fila completa? */
export function esFilaCompleta(tabla, datos) {
    const campos = CAMPOS_MINIMOS[tabla];
    if (!campos) return false;
    return campos.every((campo) => datos?.[campo] !== undefined && datos?.[campo] !== null && datos?.[campo] !== '');
}

/**
 * @param {{ table: (nombre: string) => any }} db base Dexie (o doble con la misma forma)
 * @param {Array<{ id: number, tabla: string, operacion: string, datos: string }>} operaciones en orden de la cola
 * @param {{ tablasPermitidas?: Iterable<string> }} [opciones] dentro de una transacción
 *   Dexie, tocar una tabla fuera de su alcance la abortaría entera: se omiten.
 * @returns {Promise<{ reaplicadas: number, omitidas: number, fallidas: number }>}
 */
export async function reaplicarPendientes(db, operaciones, { tablasPermitidas } = {}) {
    const permitidas = new Set(tablasPermitidas ?? Object.keys(CAMPOS_MINIMOS));
    let reaplicadas = 0;
    let omitidas = 0;
    let fallidas = 0;

    for (const operacion of operaciones) {
        if (!permitidas.has(operacion.tabla)) {
            omitidas++;
            continue;
        }

        try {
            const datos = JSON.parse(operacion.datos);
            const tabla = db.table(operacion.tabla);

            switch (operacion.operacion) {
                case 'INSERT':
                    await tabla.put(datos); // el payload de un INSERT es la fila completa
                    reaplicadas++;
                    break;
                case 'UPDATE': {
                    // update() fusiona: algunos UPDATE encolan payloads
                    // parciales y un put() borraría nombre, tipo y empresa.
                    const fusionadas = await tabla.update(datos.id, datos);
                    if (fusionadas > 0) {
                        reaplicadas++;
                    } else if (esFilaCompleta(operacion.tabla, datos)) {
                        await tabla.put(datos);
                        reaplicadas++;
                    } else {
                        omitidas++;
                    }
                    break;
                }
                case 'DELETE':
                    await tabla.delete(datos.id);
                    reaplicadas++;
                    break;
                default:
                    omitidas++;
            }
        } catch (error) {
            // Se atrapa cada operación por separado: dentro de la transacción
            // del pull, un error sin atrapar la abortaría y el pull completo
            // se perdería por una sola operación dañada.
            fallidas++;
            console.error('No se pudo re-aplicar una operación pendiente:', operacion.tabla, operacion.operacion, error);
        }
    }

    return { reaplicadas, omitidas, fallidas };
}
