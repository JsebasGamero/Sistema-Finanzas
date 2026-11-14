// Dobles en memoria para los tests de los casos de uso de movimientos.
// Solo los importan los *.test.js de esta carpeta; la app nunca.
//
// Además de registrar cada llamada en `log`, mantienen un estado (filas,
// saldos y cola) para poder comprobar el resultado final, y la unidad de
// trabajo imita lo que garantiza IndexedDB con `db.transaction('rw', ...)`:
//   - si el trabajo lanza, se deshace todo lo que escribió;
//   - dos unidades sobre las mismas tablas no se intercalan: la segunda
//     empieza cuando la primera terminó.

const clonar = (valor) => JSON.parse(JSON.stringify(valor));

/**
 * @param {object} [opciones]
 * @param {object[]} [opciones.transacciones] filas iniciales
 * @param {Record<string, number>} [opciones.saldos] saldo inicial por caja
 */
export function crearDobles({ transacciones: filas = [], saldos = {} } = {}) {
    const log = [];
    let estado = {
        transacciones: Object.fromEntries(filas.map((t) => [t.id, clonar(t)])),
        saldos: { ...saldos },
        cola: [],
    };
    const fallos = {};

    const registrar = (metodo, args) => log.push(args === undefined ? { metodo } : { metodo, args });
    const fallarSiToca = (metodo) => {
        if (fallos[metodo]) throw fallos[metodo];
    };

    const transacciones = {
        async obtener(id) {
            registrar('transacciones.obtener', { id });
            const fila = estado.transacciones[id];
            return fila ? clonar(fila) : undefined;
        },
        async agregar(tx) {
            registrar('transacciones.agregar', tx);
            fallarSiToca('transacciones.agregar');
            if (estado.transacciones[tx.id]) throw new Error(`ConstraintError: ${tx.id} ya existe`);
            estado.transacciones[tx.id] = clonar(tx);
            return tx.id;
        },
        async actualizar(id, cambios) {
            registrar('transacciones.actualizar', { id, cambios });
            fallarSiToca('transacciones.actualizar');
            if (!estado.transacciones[id]) return 0;
            estado.transacciones[id] = { ...estado.transacciones[id], ...clonar(cambios) };
            return 1;
        },
        async eliminar(id) {
            registrar('transacciones.eliminar', { id });
            fallarSiToca('transacciones.eliminar');
            delete estado.transacciones[id];
        },
    };

    const aplicadorDeAjustes = {
        async aplicar(ajustes, opciones) {
            registrar('aplicadorDeAjustes.aplicar', { ajustes, opciones });
            for (const { cajaId, delta } of ajustes) {
                if (!(cajaId in estado.saldos)) continue;
                estado.saldos[cajaId] += delta;
                estado.cola.push({ tabla: 'cajas', operacion: 'UPDATE', datos: { id: cajaId, saldo_actual: estado.saldos[cajaId] } });
                fallarSiToca('aplicadorDeAjustes.aplicar');
            }
            return [];
        },
    };

    const outbox = {
        async encolar(tabla, operacion, datos) {
            registrar('outbox.encolar', { tabla, operacion, datos });
            fallarSiToca('outbox.encolar');
            estado.cola.push({ tabla, operacion, datos: clonar(datos) });
        },
    };

    const sincronizador = {
        async sincronizarAhora() {
            registrar('sincronizador.sincronizarAhora');
        },
    };

    let cadena = Promise.resolve();
    const unidadDeTrabajo = {
        ejecutar(trabajo) {
            const turno = cadena.then(async () => {
                const copia = clonar(estado);
                registrar('unidadDeTrabajo.inicio');
                try {
                    const resultado = await trabajo();
                    registrar('unidadDeTrabajo.commit');
                    return resultado;
                } catch (error) {
                    estado = copia;
                    registrar('unidadDeTrabajo.rollback');
                    throw error;
                }
            });
            cadena = turno.catch(() => {});
            return turno;
        },
    };

    return {
        log,
        /** Lo que quedó guardado (después de commits y rollbacks). */
        get estado() {
            return estado;
        },
        /** Hace que `metodo` lance `error` a partir de ahora. */
        fallarEn(metodo, error = new Error(`fallo simulado en ${metodo}`)) {
            fallos[metodo] = error;
        },
        metodos: () => log.map((l) => l.metodo),
        dependencias: { transacciones, aplicadorDeAjustes, outbox, sincronizador, unidadDeTrabajo },
    };
}
