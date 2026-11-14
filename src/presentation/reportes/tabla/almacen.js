// Preferencias del explorador en localStorage.
//
// Antes la configuración de la tabla (filtros, orden, columnas, fuente) se
// perdía al cambiar de pestaña o de fuente (REP-19). Ahora se recuerda la
// última configuración de cada conjunto y las vistas con nombre.
//
// localStorage puede no existir o lanzar (modo privado, almacenamiento
// lleno, WebView con almacenamiento bloqueado): todo va en try/catch y la
// pantalla funciona igual sin él. Lo que se lee pasa siempre por
// normalizarVista()/normalizarConfigExplorador(): puede venir de una versión
// vieja o estar corrupto.
import { CONJUNTO_POR_DEFECTO, existeConjunto } from '../../../application/reportes/conjuntos';
import {
    normalizarConfigExplorador, leerVistasGuardadas, DENSIDADES, DENSIDAD_POR_DEFECTO,
} from '../../../application/reportes/vistas';

export const CLAVE_EXPLORADOR = 'finanzasobra.reportes.explorador.v1';
export const CLAVE_VISTAS = 'finanzasobra.reportes.vistas.v1';

function leer(clave) {
    try {
        return window.localStorage.getItem(clave);
    } catch {
        return null;
    }
}

function escribir(clave, valor) {
    try {
        window.localStorage.setItem(clave, valor);
        return true;
    } catch {
        return false;
    }
}

/**
 * Estado guardado del explorador:
 * { conjuntoId, densidad, configs: { [conjuntoId]: configExplorador } }
 */
export function leerEstadoExplorador() {
    let guardado = null;
    try {
        guardado = JSON.parse(leer(CLAVE_EXPLORADOR) ?? 'null');
    } catch {
        guardado = null;
    }
    const objeto = guardado && typeof guardado === 'object' && !Array.isArray(guardado) ? guardado : {};
    const configs = {};
    if (objeto.configs && typeof objeto.configs === 'object') {
        for (const [id, config] of Object.entries(objeto.configs)) {
            if (existeConjunto(id)) configs[id] = normalizarConfigExplorador(config, id);
        }
    }
    return {
        conjuntoId: existeConjunto(objeto.conjuntoId) ? objeto.conjuntoId : CONJUNTO_POR_DEFECTO,
        densidad: DENSIDADES.includes(objeto.densidad) ? objeto.densidad : DENSIDAD_POR_DEFECTO,
        configs,
    };
}

export function guardarEstadoExplorador(estado) {
    return escribir(CLAVE_EXPLORADOR, JSON.stringify({
        conjuntoId: estado.conjuntoId,
        densidad: estado.densidad,
        configs: estado.configs,
    }));
}

export function leerVistas() {
    return leerVistasGuardadas(leer(CLAVE_VISTAS));
}

/** @returns {boolean} false si no se pudo guardar (almacenamiento bloqueado o lleno). */
export function guardarVistas(vistas) {
    return escribir(CLAVE_VISTAS, JSON.stringify(vistas));
}
