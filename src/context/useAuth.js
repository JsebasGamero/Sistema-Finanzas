import { useContext } from 'react';
import { AuthContext } from './authContextObjeto';

/**
 * Sesión actual.
 * {
 *   currentUser: { id, email, nombre, modoLocal? } | null,
 *   loading, login, logout, resetPassword, updatePassword, updateNombre,
 *   getPendingChangesCount,
 *   modoLocalDisponible: boolean,   // true solo fuera de producción y sin Supabase
 *   entrarModoLocal: () => void,
 * }
 */
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de <AuthProvider>');
    }
    return context;
}
