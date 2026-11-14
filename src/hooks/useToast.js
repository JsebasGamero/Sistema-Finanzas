// Avisos breves (toasts). API: { toasts, addToast, removeToast, success,
// error, warning, info }. Cada función devuelve el id del aviso.
import { useCallback, useEffect, useRef, useState } from 'react';

let ultimoId = 0;

// Un error necesita más tiempo de lectura que un "Guardado": se lee con el
// celular en la mano y a veces hay que releerlo para saber qué hacer.
const DURACION_POR_TIPO = {
    success: 4000,
    info: 5000,
    warning: 7000,
    error: 9000,
};

// Con señal intermitente pueden llegar muchos avisos seguidos; más de 4
// apilados tapan la pantalla del celular.
const MAXIMO_VISIBLES = 4;

// La interfaz no lleva emojis (docs/DISENO.md). Algunos llamadores todavía
// los mandaban ('Sincronizado', 'Sin conexión'...): se quitan aquí para que
// ningún aviso los muestre aunque alguien los vuelva a escribir.
// Alternación y no clase de caracteres: el selector de variante (FE0F) y el
// unidor (200D) son caracteres combinantes y no van dentro de [...].
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}|\u{20E3}/gu;

function limpiarMensaje(mensaje) {
    if (typeof mensaje !== 'string') return mensaje;
    return mensaje.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
}

export default function useToast() {
    const [toasts, setToasts] = useState([]);
    const refTemporizadores = useRef(new Map());

    const removeToast = useCallback((id) => {
        const temporizador = refTemporizadores.current.get(id);
        if (temporizador) {
            clearTimeout(temporizador);
            refTemporizadores.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'info', duration) => {
        const id = ++ultimoId;
        const toast = { id, message: limpiarMensaje(message), type };

        setToasts((prev) => [...prev, toast].slice(-MAXIMO_VISIBLES));

        // duration explícito en 0: el aviso se queda hasta que lo cierren.
        const duracion = duration ?? DURACION_POR_TIPO[type] ?? DURACION_POR_TIPO.info;
        if (duracion > 0) {
            refTemporizadores.current.set(id, setTimeout(() => removeToast(id), duracion));
        }

        return id;
    }, [removeToast]);

    useEffect(() => {
        const temporizadores = refTemporizadores.current;
        return () => {
            temporizadores.forEach(clearTimeout);
            temporizadores.clear();
        };
    }, []);

    const success = useCallback((message, duration) => addToast(message, 'success', duration), [addToast]);
    const error = useCallback((message, duration) => addToast(message, 'error', duration), [addToast]);
    const warning = useCallback((message, duration) => addToast(message, 'warning', duration), [addToast]);
    const info = useCallback((message, duration) => addToast(message, 'info', duration), [addToast]);

    return {
        toasts,
        addToast,
        removeToast,
        success,
        error,
        warning,
        info,
    };
}
