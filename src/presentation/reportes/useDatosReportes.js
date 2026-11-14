// Datos para todos los reportes, leídos una sola vez de la base local.
//
// Antes cada pestaña de reportes cargaba sus tablas por su cuenta y buscaba
// nombres con `.find()` dentro de bucles (bug Q4: O(n·m) en cada render).
// Aquí se cargan todas las tablas con liveQuery (se actualizan solas cuando
// la sincronización trae datos nuevos) y se construyen índices por id.
import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../../services/db';
import { resolverNombreCategoria } from '../../services/categorias';

const VACIO = Object.freeze({
    transacciones: [],
    cajas: [],
    proyectos: [],
    terceros: [],
    empresas: [],
    categorias: [],
    deudasTerceros: [],
    deudasCajas: [],
});

async function leerTabla(tabla) {
    try {
        return tabla ? await tabla.toArray() : [];
    } catch (error) {
        console.error(`No se pudo leer ${tabla?.name}:`, error);
        return [];
    }
}

async function leerTodo() {
    const [transacciones, cajas, proyectos, terceros, empresas, categorias, deudasTerceros, deudasCajas] =
        await Promise.all([
            leerTabla(db.transacciones),
            leerTabla(db.cajas),
            leerTabla(db.proyectos),
            leerTabla(db.terceros),
            leerTabla(db.empresas),
            leerTabla(db.categorias),
            leerTabla(db.deudas_terceros),
            leerTabla(db.deudas_cajas),
        ]);
    return { transacciones, cajas, proyectos, terceros, empresas, categorias, deudasTerceros, deudasCajas };
}

function porId(filas) {
    const mapa = new Map();
    for (const fila of filas) mapa.set(fila.id, fila);
    return mapa;
}

/**
 * Índices y resolutores de nombres. Puro: se puede usar fuera de React.
 * @param {typeof VACIO} datos
 */
export function construirIndices(datos) {
    const cajasPorId = porId(datos.cajas);
    const proyectosPorId = porId(datos.proyectos);
    const tercerosPorId = porId(datos.terceros);
    const empresasPorId = porId(datos.empresas);

    return {
        cajasPorId,
        proyectosPorId,
        tercerosPorId,
        empresasPorId,
        nombreCaja: (id, vacio = '') => cajasPorId.get(id)?.nombre ?? vacio,
        nombreProyecto: (id, vacio = '') => proyectosPorId.get(id)?.nombre ?? vacio,
        nombreTercero: (id, vacio = '') => tercerosPorId.get(id)?.nombre ?? vacio,
        nombreEmpresa: (id, vacio = '') => empresasPorId.get(id)?.nombre ?? vacio,
        // Invariante 5: transacciones.categoria guarda el nombre (o un UUID
        // legacy). Nunca pintar el valor crudo.
        nombreCategoria: (valor, vacio = 'Sin categoría') => resolverNombreCategoria(valor, datos.categorias, vacio),
    };
}

/**
 * Hook de datos de reportes.
 * Devuelve las tablas, los índices de construirIndices() y { cargando, error }.
 */
export function useDatosReportes() {
    const [estado, setEstado] = useState({ cargando: true, error: null, datos: VACIO });

    useEffect(() => {
        const suscripcion = liveQuery(leerTodo).subscribe({
            next: (datos) => setEstado({ cargando: false, error: null, datos }),
            error: (error) => {
                console.error('Error leyendo datos de reportes:', error);
                setEstado((previo) => ({ ...previo, cargando: false, error }));
            },
        });
        return () => suscripcion.unsubscribe();
    }, []);

    const indices = useMemo(() => construirIndices(estado.datos), [estado.datos]);

    return useMemo(
        () => ({ ...estado.datos, ...indices, cargando: estado.cargando, error: estado.error }),
        [estado, indices]
    );
}
