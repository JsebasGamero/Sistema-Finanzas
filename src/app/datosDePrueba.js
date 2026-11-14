// Datos de prueba en la base local (Configuración > Entorno de pruebas).
//
// Lo usa AdminPanel con `import()` dinámico, para que nada de esto viaje en
// el bundle inicial. Nunca corre en producción: las dos funciones lanzan si
// la app está en modo producción, además de que la UI ni las ofrece.
//
// Dónde caen los datos:
// - Con Supabase de PRUEBAS configurado (npm run dev con
//   .env.development.local): se escriben en la base local de desarrollo y se
//   encolan para subir a ese proyecto. vite.config.js se niega a arrancar si
//   ese proyecto es el de producción.
// - En modo local (sin Supabase): solo en la base propia del modo local
//   ("FinanzasConstructora-<modo>-local"), que no sincroniza con nada.
import { db, generateUUID } from '../services/db';
import { addToSyncQueue, processSyncQueue } from '../services/syncService';
import { isSupabaseConfigured } from '../services/supabase';
import { ES_PRODUCCION, MODO_LOCAL_DISPONIBLE, NOMBRE_BASE_LOCAL } from '../services/entorno';
import { crearAplicadorDeAjustesDexie } from '../infrastructure/dexie/aplicadorDeAjustesDexie';
import { generarDatosDePrueba as generarFilas } from '../application/pruebas/generarDatosDePrueba';
import { consolidarAjustes, efectoEnSaldos } from '../domain/rules/efectoEnSaldos';
import { hoyLocal } from '../domain/value-objects/fecha';

const normalizarNombre = (nombre) => String(nombre ?? '').trim().toLocaleLowerCase('es');

/**
 * Genera y guarda un lote de datos de prueba. Cada llamada agrega un lote
 * nuevo (ids nuevos); no borra lo que ya había.
 *
 * @param {object} [opciones]
 * @param {number} [opciones.meses=6]
 * @param {number} [opciones.movimientosPorMes=40]
 * @param {number|string} [opciones.semilla] misma semilla = mismo contenido;
 *   sin semilla, uno distinto cada vez
 * @returns {Promise<{ empresas: number, cajas: number, proyectos: number, terceros: number,
 *   categorias: number, transacciones: number, deudasTerceros: number, deudasCajas: number }>}
 *   cuántas filas se agregaron de cada tabla
 */
export async function generarDatosDePrueba({ meses = 6, movimientosPorMes = 40, semilla } = {}) {
    if (ES_PRODUCCION) {
        throw new Error('Los datos de prueba no se pueden generar en producción.');
    }

    const datos = generarFilas({
        hoy: hoyLocal(),
        meses,
        movimientosPorMes,
        semilla: semilla ?? `${Date.now()}-${Math.random()}`,
        // Ids frescos aunque se repita la semilla: con los de la semilla, dos
        // lotes iguales chocarían por clave primaria.
        generarId: generateUUID,
    });

    // En modo local la base no sincroniza con nada: encolar solo dejaría
    // cientos de "pendientes" que nunca van a subir y un contador que no
    // baja. Con Supabase, cada fila se encola como cualquier escritura.
    const sincroniza = isSupabaseConfigured() && !MODO_LOCAL_DISPONIBLE;
    const outbox = {
        encolar: (tabla, operacion, fila) => (sincroniza ? addToSyncQueue(tabla, operacion, fila) : Promise.resolve()),
    };
    // El mismo único escritor de saldos que usan los movimientos (CLAUDE.md,
    // "Deuda conocida"): las cajas nacen en 0 y su saldo sale de los
    // movimientos generados, incluidos los "Saldo inicial".
    const aplicadorDeAjustes = crearAplicadorDeAjustesDexie({ db, outbox });

    const tablas = [
        db.empresas, db.cajas, db.proyectos, db.terceros, db.categorias,
        db.transacciones, db.deudas_terceros, db.deudas_cajas, db.sync_queue,
    ];

    // Todo o nada: si algo falla a mitad, no queda un lote cojo (cajas sin
    // movimientos, o movimientos encolados sin su caja).
    const conteo = await db.transaction('rw', tablas, async () => {
        // `categorias.nombre` es UNIQUE en Supabase: una categoría que ya
        // existe (aunque cambie mayúsculas) se rechazaría al subir. Las
        // transacciones guardan el nombre, así que basta con la existente.
        const existentes = new Set((await db.categorias.toArray()).map((c) => normalizarNombre(c.nombre)));
        const categorias = datos.categorias.filter((c) => !existentes.has(normalizarNombre(c.nombre)));

        // Orden padre -> hijo, el mismo en que se suben (docs/SINCRONIZACION.md).
        async function guardar(tabla, nombreTabla, filas) {
            await tabla.bulkAdd(filas);
            for (const fila of filas) await outbox.encolar(nombreTabla, 'INSERT', fila);
        }
        await guardar(db.empresas, 'empresas', datos.empresas);
        await guardar(db.cajas, 'cajas', datos.cajas);
        // Un `cajas UPDATE` por caja con el saldo final, en vez de uno por
        // cada movimiento: el resultado es el mismo y la cola sube mucho más
        // rápido. Va antes de los INSERT de transacciones, como en los casos
        // de uso.
        await aplicadorDeAjustes.aplicar(
            consolidarAjustes(datos.transacciones.flatMap(efectoEnSaldos)),
            { payload: 'parcial' },
        );
        await guardar(db.proyectos, 'proyectos', datos.proyectos);
        await guardar(db.terceros, 'terceros', datos.terceros);
        await guardar(db.categorias, 'categorias', categorias);
        await guardar(db.transacciones, 'transacciones', datos.transacciones);
        await guardar(db.deudas_terceros, 'deudas_terceros', datos.deudasTerceros);
        await guardar(db.deudas_cajas, 'deudas_cajas', datos.deudasCajas);

        return {
            empresas: datos.empresas.length,
            cajas: datos.cajas.length,
            proyectos: datos.proyectos.length,
            terceros: datos.terceros.length,
            categorias: categorias.length,
            transacciones: datos.transacciones.length,
            deudasTerceros: datos.deudasTerceros.length,
            deudasCajas: datos.deudasCajas.length,
        };
    });

    // Una sola pasada al final, sin esperarla: son cientos de operaciones y
    // el contador de pendientes muestra el avance. Si no hay red, quedan en
    // la cola como cualquier otro cambio.
    if (sincroniza && navigator.onLine) {
        processSyncQueue().catch((error) => console.warn('Los datos de prueba se subirán en la próxima sincronización:', error));
    }

    return conteo;
}

/**
 * Vacía la base del modo local, incluida `sync_queue`.
 *
 * Esto contradice en apariencia la invariante 1 ("nunca vaciar sync_queue a
 * ciegas"), que protege cambios que todavía tienen que llegar a Supabase. La
 * base del modo local no tiene a dónde subir: solo existe cuando no hay
 * Supabase configurado y tiene su propio nombre, así que ninguna build ni
 * entorno con nube la abre. Lo que haya en su cola nunca se va a enviar, y
 * dejarlo solo inflaría el contador de pendientes.
 *
 * @returns {Promise<void>}
 */
export async function borrarDatosModoLocal() {
    // Doble llave: el modo y el nombre real de la base abierta. Si algún día
    // cambia cómo se nombra la base, esto falla cerrado en vez de vaciar una
    // base que sí sincroniza.
    if (ES_PRODUCCION || !MODO_LOCAL_DISPONIBLE || isSupabaseConfigured()) {
        throw new Error('Solo se pueden borrar los datos en el modo local de pruebas.');
    }
    if (db.name !== NOMBRE_BASE_LOCAL || !db.name.endsWith('-local')) {
        throw new Error(`La base abierta (${db.name}) no es la del modo local. No se borró nada.`);
    }

    await db.transaction('rw', db.tables, async () => {
        for (const tabla of db.tables) await tabla.clear();
    });
}
