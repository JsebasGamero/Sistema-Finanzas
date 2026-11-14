import { createContext } from 'react';

// El objeto de contexto vive aparte del Provider (AuthContext.jsx) y del hook
// (useAuth.js): Fast Refresh solo funciona si un .jsx exporta únicamente
// componentes (era el último error de lint, Q1).
export const AuthContext = createContext(null);
