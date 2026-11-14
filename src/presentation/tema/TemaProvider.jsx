import { useCallback, useEffect, useMemo, useState } from 'react';
import { TemaContext } from './TemaContext';
import { aplicarTema, guardarPreferenciaTema, leerPreferenciaTema, resolverTema } from './tema';

function sistemaEsOscuro() {
    return typeof window !== 'undefined' &&
        Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

function temaPara(preferencia, oscuro) {
    if (preferencia === 'sistema') return oscuro ? 'noche' : 'dia';
    return preferencia === 'noche' ? 'noche' : 'dia';
}

export default function TemaProvider({ children }) {
    const [preferencia, setPreferencia] = useState(leerPreferenciaTema);
    const [oscuro, setOscuro] = useState(sistemaEsOscuro);
    const tema = temaPara(preferencia, oscuro);

    // El atributo data-tema se pone ANTES de actualizar el estado (en el
    // manejador), no en un efecto: así, cuando React vuelve a pintar, las
    // variables CSS ya son las nuevas y useColoresTema() las lee bien.
    useEffect(() => {
        if (!window.matchMedia) return undefined;
        const consulta = window.matchMedia('(prefers-color-scheme: dark)');
        const alCambiar = (e) => {
            if (leerPreferenciaTema() === 'sistema') aplicarTema(e.matches ? 'noche' : 'dia');
            setOscuro(e.matches);
        };
        consulta.addEventListener('change', alCambiar);
        return () => consulta.removeEventListener('change', alCambiar);
    }, []);

    // Red de seguridad: si algo desincroniza el atributo, se corrige.
    useEffect(() => {
        if (document.documentElement.dataset.tema !== tema) aplicarTema(tema);
    }, [tema]);

    const cambiarPreferencia = useCallback((nueva) => {
        guardarPreferenciaTema(nueva);
        aplicarTema(resolverTema(nueva));
        setPreferencia(nueva);
    }, []);

    const valor = useMemo(() => ({ preferencia, tema, cambiarPreferencia }), [preferencia, tema, cambiarPreferencia]);

    return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}
