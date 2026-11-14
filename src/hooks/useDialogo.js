// Comportamiento común de los modales (ConfirmModal, cambiar contraseña,
// errores de sincronización, vista previa de soportes):
// - Escape cierra, salvo mientras se guarda (`bloqueado`).
// - Al abrir, el foco entra al diálogo; Tab no se escapa a la página de
//   atrás; al cerrar, vuelve al elemento que lo abrió.
// - Tocar el velo cierra solo si el toque EMPEZÓ y terminó en el velo.
//
// Antes los modales no tenían nada de esto (DEU-19): con teclado, Tab
// recorría la página detrás del velo y Escape no hacía nada. Y un arrastre
// que empezaba seleccionando texto dentro del modal y soltaba fuera cerraba
// el modal, porque el click se dispara en el ancestro común (el velo).
//
// Con modales anidados (confirmar dentro de un panel) solo el de encima
// responde a Escape y a Tab; si no, un Escape cerraba los dos a la vez.
import { useEffect, useRef } from 'react';

const pilaDeDialogos = [];

const SELECTOR_ENFOCABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function enfocablesDentro(contenedor) {
    return Array.from(contenedor.querySelectorAll(SELECTOR_ENFOCABLE))
        .filter((el) => el.getClientRects().length > 0);
}

/**
 * @param {{ abierto: boolean, onCerrar?: () => void, bloqueado?: boolean,
 *           refFocoInicial?: { current: HTMLElement | null } }} opciones
 * @returns {{ refDialogo: { current: HTMLElement | null },
 *             propsVelo: { onPointerDown: Function, onClick: Function } }}
 *   refDialogo va en el elemento con role="dialog" (con tabIndex={-1});
 *   propsVelo se esparcen en el velo (.modal-backdrop) si tocarlo debe cerrar.
 */
export default function useDialogo({ abierto, onCerrar, bloqueado = false, refFocoInicial }) {
    const refDialogo = useRef(null);
    const refOnCerrar = useRef(onCerrar);
    const refBloqueado = useRef(bloqueado);
    const refToqueEnVelo = useRef(false);

    // Las funciones del padre cambian en cada render; se leen desde aquí para
    // no reinstalar los oyentes (y no robar el foco) en cada tecla.
    useEffect(() => {
        refOnCerrar.current = onCerrar;
        refBloqueado.current = bloqueado;
    });

    useEffect(() => {
        if (!abierto) return undefined;

        const marca = {};
        pilaDeDialogos.push(marca);
        const enfocadoAntes = document.activeElement;
        const dialogo = refDialogo.current;

        const inicial = refFocoInicial?.current
            || (dialogo && enfocablesDentro(dialogo)[0])
            || dialogo;
        inicial?.focus?.({ preventScroll: true });

        // En captura: marca el Escape como atendido antes de que corran los
        // oyentes de burbuja en document registrados ANTES que este diálogo
        // (la pantalla completa de la tabla dinámica, que mira
        // defaultPrevented). El stopPropagation de alTeclear llega tarde
        // para ellos: Escape cerraba la foto del soporte o el "Borrar vista"
        // y además sacaba de pantalla completa. Aquí no se detiene la
        // propagación: un control de adentro que usa Escape (la lista de
        // AutocompleteInput) tiene que recibirlo primero y poder quedárselo.
        function alTeclearEnCaptura(e) {
            if (e.key !== 'Escape') return;
            if (pilaDeDialogos[pilaDeDialogos.length - 1] !== marca) return;
            e.preventDefault();
        }

        function alTeclear(e) {
            if (pilaDeDialogos[pilaDeDialogos.length - 1] !== marca) return;

            if (e.key === 'Escape') {
                if (refBloqueado.current) return;
                e.stopPropagation();
                refOnCerrar.current?.();
                return;
            }

            if (e.key !== 'Tab' || !dialogo) return;
            const lista = enfocablesDentro(dialogo);
            if (lista.length === 0) {
                e.preventDefault();
                dialogo.focus();
                return;
            }
            const primero = lista[0];
            const ultimo = lista[lista.length - 1];
            const activo = document.activeElement;
            const fuera = !dialogo.contains(activo);
            if (e.shiftKey && (activo === primero || fuera)) {
                e.preventDefault();
                ultimo.focus();
            } else if (!e.shiftKey && (activo === ultimo || fuera)) {
                e.preventDefault();
                primero.focus();
            }
        }

        document.addEventListener('keydown', alTeclearEnCaptura, true);
        document.addEventListener('keydown', alTeclear);
        return () => {
            document.removeEventListener('keydown', alTeclearEnCaptura, true);
            document.removeEventListener('keydown', alTeclear);
            const i = pilaDeDialogos.indexOf(marca);
            if (i >= 0) pilaDeDialogos.splice(i, 1);
            if (enfocadoAntes && document.contains(enfocadoAntes) && typeof enfocadoAntes.focus === 'function') {
                enfocadoAntes.focus({ preventScroll: true });
            }
        };
    }, [abierto, refFocoInicial]);

    const propsVelo = {
        onPointerDown: (e) => {
            refToqueEnVelo.current = e.target === e.currentTarget;
        },
        onClick: (e) => {
            const empezoEnVelo = refToqueEnVelo.current;
            refToqueEnVelo.current = false;
            if (!empezoEnVelo || e.target !== e.currentTarget) return;
            if (refBloqueado.current) return;
            refOnCerrar.current?.();
        },
    };

    return { refDialogo, propsVelo };
}
