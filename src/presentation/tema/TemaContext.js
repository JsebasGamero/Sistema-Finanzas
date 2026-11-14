import { createContext } from 'react';

// Separado del Provider para que Fast Refresh funcione (un archivo .jsx solo
// debe exportar componentes).
export const TemaContext = createContext({
    preferencia: 'dia',
    tema: 'dia',
    cambiarPreferencia: () => {},
});
