// Turno de sincronización: push, pull y logout nunca corren a la vez.
//
// SYNC-12: más de diez sitios disparan la subida en segundo plano mientras
// otra corrida puede estar en vuelo. Cada corrida tomaba su propia foto de la
// cola y reenviaba las mismas operaciones; con saldos absolutos, la última
// petición en llegar podía ser la más vieja y dejar un saldo equivocado.
//
// Pull (datos-1): el pull descargaba las tablas sin turno. Si mientras
// descargaba subía un gasto y salía de la cola, el reemplazo escribía la foto
// vieja de la caja y de las transacciones, y el replay ya no lo traía: el
// gasto desaparecía del dispositivo y el siguiente movimiento subía un saldo
// calculado sobre la foto vieja. Por eso push y pull comparten turno.
//
// Logout (datos-1, datos-2): cerrar sesión cancela lo que está en vuelo o
// esperando y toma el turno, para que un pull no vuelva a llenar las tablas
// recién vaciadas y la cola no siga subiendo sin sesión.
//
// Reglas:
// - Nunca corren dos tareas a la vez: se encadenan.
// - Una llamada nueva se une a la corrida DE LA MISMA CLAVE que espera turno
//   (todavía no tomó su foto, así que incluirá lo nuevo). Un pull nunca se une
//   a un push ni al revés: devolvería un resultado que no es el suyo.
// - Un fallo de una corrida no bloquea las siguientes.
// - `cancelarPendientes()` marca como canceladas las corridas encoladas hasta
//   ese momento (en curso o en espera). La tarea lo consulta con
//   `senal.cancelada()` y decide dónde parar: entre operaciones, nunca a
//   mitad de una.

/**
 * @typedef {{ cancelada: () => boolean }} SenalDeTurno
 */

export function crearTurnoSerial() {
    let cadena = Promise.resolve();
    const enEspera = new Map();
    let epoca = 0;
    let salidasDeCola = 0;

    function encolar(clave, tarea) {
        if (clave !== null && enEspera.has(clave)) return enEspera.get(clave);

        const epocaAlEncolar = epoca;
        /** @type {SenalDeTurno} */
        const senal = { cancelada: () => epoca !== epocaAlEncolar };

        const corrida = cadena.then(() => {
            // Desde aquí la corrida ya empezó: una llamada nueva debe esperar
            // a la siguiente para que su operación no quede fuera de la foto.
            if (clave !== null && enEspera.get(clave) === corrida) enEspera.delete(clave);
            return tarea(senal);
        });
        if (clave !== null) enEspera.set(clave, corrida);
        cadena = corrida.then(() => undefined, () => undefined);
        return corrida;
    }

    return {
        /**
         * Encola `tarea` o se une a la corrida de la misma clave que espera turno.
         * @template T
         * @param {string} clave
         * @param {(senal: SenalDeTurno) => Promise<T>} tarea
         * @returns {Promise<T>}
         */
        ejecutar(clave, tarea) {
            return encolar(clave, tarea);
        },

        /**
         * Encola `tarea` sola, sin unirse a nada; corre cuando terminen las anteriores.
         * @template T
         * @param {(senal: SenalDeTurno) => Promise<T>} tarea
         * @returns {Promise<T>}
         */
        exclusivo(tarea) {
            return encolar(null, tarea);
        },

        /** Cancela lo encolado hasta ahora; lo que se encole después corre normal. */
        cancelarPendientes() {
            epoca++;
            enEspera.clear();
        },

        /**
         * Defensa extra del pull (datos-1): cada operación que sale de la
         * cola (subida o movida a la bandeja) incrementa este contador antes
         * de tocar Dexie. Si cambió entre la descarga y el reemplazo, la foto
         * descargada puede no incluirla y el pull la descarta.
         */
        registrarSalidaDeCola() {
            salidasDeCola++;
        },

        salidasDeCola() {
            return salidasDeCola;
        },
    };
}

/**
 * Ejecutor de una sola tarea (forma original de SYNC-12): las llamadas que
 * llegan mientras otra espera turno se unen a ella.
 * @template T
 * @param {() => Promise<T>} tarea
 * @returns {() => Promise<T>}
 */
export function crearEjecutorSerial(tarea) {
    const turno = crearTurnoSerial();
    return () => turno.ejecutar('corrida', () => tarea());
}

/**
 * Entre pestañas del mismo navegador también hay que serializar: comparten la
 * cola y las tablas. Web Locks existe en Chromium 69+ y Safari 15.4+; sin él
 * queda el turno del módulo y la comprobación de cada operación antes de
 * enviarla.
 * @template T
 * @param {string} nombre
 * @param {() => Promise<T>} tarea
 * @param {{ locks?: { request: Function } }} [entorno] para tests
 * @returns {Promise<T>}
 */
export function conCandadoEntrePestanas(nombre, tarea, entorno = typeof navigator !== 'undefined' ? navigator : undefined) {
    if (entorno?.locks?.request) {
        return entorno.locks.request(nombre, () => tarea());
    }
    return tarea();
}
