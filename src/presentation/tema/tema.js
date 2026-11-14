// Tema visual: 'dia' (claro, alto contraste, por defecto), 'noche' (oscuro) o
// 'sistema' (sigue al sistema operativo).
//
// El día es el predeterminado porque la app se usa en obra, al sol: el tema
// oscuro anterior era ilegible con brillo de pantalla alto y luz directa.
//
// index.html aplica el tema guardado antes de que cargue React (si no, la
// pantalla parpadea en claro y luego cambia). Mantén la clave y los valores
// en sincronía con ese script.

export const CLAVE_TEMA = 'finanzasobra.tema';
export const TEMAS = ['dia', 'noche', 'sistema'];

export function leerPreferenciaTema() {
    try {
        const valor = localStorage.getItem(CLAVE_TEMA);
        return TEMAS.includes(valor) ? valor : 'dia';
    } catch {
        return 'dia';
    }
}

export function guardarPreferenciaTema(preferencia) {
    try {
        localStorage.setItem(CLAVE_TEMA, preferencia);
    } catch {
        // Almacenamiento bloqueado (modo privado): el tema dura la sesión.
    }
}

export function resolverTema(preferencia) {
    if (preferencia === 'sistema') {
        const oscuro = typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        return oscuro ? 'noche' : 'dia';
    }
    return preferencia === 'noche' ? 'noche' : 'dia';
}

export function aplicarTema(temaResuelto) {
    const raiz = document.documentElement;
    raiz.dataset.tema = temaResuelto;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute('content', leerVariable('--paper') || (temaResuelto === 'noche' ? '#121110' : '#f4f2ed'));
    }
}

function leerVariable(nombre) {
    if (typeof document === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

/**
 * Colores resueltos del tema activo, para librerías que no entienden
 * variables CSS (Recharts en atributos SVG, jsPDF, canvas).
 * Llamar de nuevo cuando cambie el tema (useTema() expone `tema` para eso).
 */
export function coloresDelTema() {
    const v = (n, respaldo) => leerVariable(n) || respaldo;
    return {
        paper: v('--paper', '#f4f2ed'),
        surface: v('--surface', '#ffffff'),
        surface2: v('--surface-2', '#f9f8f5'),
        surface3: v('--surface-3', '#edeae3'),
        line: v('--line', '#e2ded5'),
        lineStrong: v('--line-strong', '#c9c3b6'),
        ink: v('--ink', '#1a1916'),
        ink2: v('--ink-2', '#4f4b43'),
        ink3: v('--ink-3', '#7e786d'),
        accent: v('--accent', '#c2410c'),
        accentSoft: v('--accent-soft', '#fbeadf'),
        pos: v('--pos', '#157a3c'),
        posSoft: v('--pos-soft', '#e4f3e8'),
        neg: v('--neg', '#b42318'),
        negSoft: v('--neg-soft', '#fbe9e7'),
        info: v('--info', '#1f4fd1'),
        infoSoft: v('--info-soft', '#e7edfb'),
        warn: v('--warn', '#9a6100'),
        warnSoft: v('--warn-soft', '#fbf0d6'),
    };
}

/**
 * Paleta categórica para series sin significado propio (categorías,
 * proyectos, proveedores). Tonos terrosos y de señalización de obra, con
 * suficiente separación entre vecinos; distinta en cada tema para mantener
 * contraste. El orden importa: los primeros son los más distinguibles.
 */
export function paletaCategorica(temaResuelto) {
    return temaResuelto === 'noche'
        ? ['#f0782f', '#8fb0ff', '#5fd08b', '#e9b949', '#d49bf0', '#5cc8c8', '#f4847a', '#b8a58c', '#9fb86a', '#e48fb6']
        : ['#c2410c', '#1f4fd1', '#157a3c', '#9a6100', '#7c3aad', '#0f7a7a', '#b42318', '#6b5b45', '#56701f', '#b0336e'];
}
