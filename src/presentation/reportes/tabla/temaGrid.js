// Tema de AG-Grid para el explorador.
//
// Los parámetros apuntan a las variables CSS del sistema "Libro de obra"
// (docs/DISENO.md), no a colores fijos: al pasar de tema día a noche la
// grilla cambia sola, sin recrearse. La tabla anterior tenía un tema oscuro
// con hex sueltos que no seguía el tema de la app.
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';

// Registro idempotente: lo necesitan las dos grillas (detalle y resumen).
ModuleRegistry.registerModules([AllCommunityModule]);

export const MEDIDAS_DENSIDAD = Object.freeze({
    compacta: { rowHeight: 32, headerHeight: 36, fontSize: 13, spacing: 6 },
    normal: { rowHeight: 40, headerHeight: 42, fontSize: 14, spacing: 8 },
    amplia: { rowHeight: 48, headerHeight: 48, fontSize: 15, spacing: 9 },
});

const cache = new Map();

/** Tema de la grilla para una densidad (memorizado: AG-Grid compara por referencia). */
export function temaGrid(densidad = 'normal') {
    const clave = MEDIDAS_DENSIDAD[densidad] ? densidad : 'normal';
    if (cache.has(clave)) return cache.get(clave);
    const medidas = MEDIDAS_DENSIDAD[clave];
    const tema = themeQuartz.withParams({
        browserColorScheme: 'inherit',
        fontFamily: 'inherit',
        backgroundColor: 'var(--surface)',
        foregroundColor: 'var(--ink)',
        chromeBackgroundColor: 'var(--surface-2)',
        headerBackgroundColor: 'var(--surface-2)',
        headerTextColor: 'var(--ink-2)',
        headerFontWeight: 600,
        headerFontSize: 12,
        borderColor: 'var(--line)',
        rowHoverColor: 'var(--surface-2)',
        selectedRowBackgroundColor: 'var(--accent-soft)',
        accentColor: 'var(--accent)',
        menuBackgroundColor: 'var(--surface)',
        inputBackgroundColor: 'var(--surface)',
        pinnedRowBackgroundColor: 'var(--surface-2)',
        pinnedRowFontWeight: 700,
        checkboxCheckedBackgroundColor: 'var(--accent)',
        wrapperBorderRadius: 10,
        borderRadius: 6,
        fontSize: medidas.fontSize,
        rowHeight: medidas.rowHeight,
        headerHeight: medidas.headerHeight,
        spacing: medidas.spacing,
    });
    cache.set(clave, tema);
    return tema;
}
