// Hooks compartidos por los paneles de deudas.
import { useCallback, useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';

/**
 * Consulta a Dexie que se actualiza sola cuando cambian las tablas que lee
 * (al abonar, al anular o cuando la sincronización trae datos nuevos). Antes
 * los paneles cargaban una vez y mantenían copias a mano con
 * `setDeudas([...deudas, nueva])`, que con un doble envío usaban la lista
 * vieja del closure y escondían el duplicado hasta recargar (DEU-2).
 *
 * @param {() => Promise<T>} consulta función estable (declarada fuera del componente)
 * @param {T} inicial
 * @template T
 */
export function useConsultaViva(consulta, inicial) {
    const [estado, setEstado] = useState({ cargando: true, error: null, datos: inicial });

    useEffect(() => {
        const suscripcion = liveQuery(consulta).subscribe({
            next: (datos) => setEstado({ cargando: false, error: null, datos }),
            error: (error) => {
                console.error('No se pudieron leer las deudas:', error);
                setEstado((previo) => ({ ...previo, cargando: false, error }));
            },
        });
        return () => suscripcion.unsubscribe();
    }, [consulta]);

    return estado;
}

/**
 * Ejecuta una sola escritura a la vez. La guarda es un ref porque el estado
 * de React no se ve en el closure hasta el siguiente render: con solo
 * `useState`, dos toques seguidos entraban los dos (DEU-1, DEU-2).
 * @returns {[boolean, (fn: () => Promise<any>) => Promise<any>]}
 */
export function useAccionUnica() {
    const enCurso = useRef(false);
    const [ocupado, setOcupado] = useState(false);

    const ejecutar = useCallback(async (fn) => {
        if (enCurso.current) return undefined;
        enCurso.current = true;
        setOcupado(true);
        try {
            return await fn();
        } finally {
            enCurso.current = false;
            setOcupado(false);
        }
    }, []);

    return [ocupado, ejecutar];
}

/**
 * Aviso en línea que se oculta solo. Los paneles no reciben el toast de App
 * (se montan dentro de TransactionForm), así que confirman aquí.
 * @returns {[{ tipo: 'ok'|'error', texto: string }|null, (tipo: 'ok'|'error', texto: string) => void, () => void]}
 */
export function useAviso(duracionMs = 6000) {
    const [aviso, setAviso] = useState(null);
    const temporizador = useRef(null);

    const limpiar = useCallback(() => {
        clearTimeout(temporizador.current);
        setAviso(null);
    }, []);

    const mostrar = useCallback((tipo, texto) => {
        clearTimeout(temporizador.current);
        setAviso({ tipo, texto });
        // Los errores se quedan hasta que el usuario actúe: hay que leerlos.
        if (tipo === 'ok') temporizador.current = setTimeout(() => setAviso(null), duracionMs);
    }, [duracionMs]);

    useEffect(() => () => clearTimeout(temporizador.current), []);

    return [aviso, mostrar, limpiar];
}
