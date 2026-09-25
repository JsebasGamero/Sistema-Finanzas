// AuthContext - Supabase Auth context for user management
import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check current session on mount
        checkSession();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_IN' && session?.user) {
                    setCurrentUser(extractUserInfo(session.user));
                } else if (event === 'SIGNED_OUT') {
                    setCurrentUser(null);
                } else if (event === 'USER_UPDATED' && session?.user) {
                    setCurrentUser(extractUserInfo(session.user));
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    function extractUserInfo(user) {
        return {
            id: user.id,
            email: user.email,
            nombre: user.user_metadata?.nombre || user.email?.split('@')[0] || 'Usuario'
        };
    }

    async function checkSession() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setCurrentUser(extractUserInfo(session.user));
            }
        } catch (error) {
            console.error('Error checking session:', error);
        } finally {
            setLoading(false);
        }
    }

    async function login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    }

    // Cuenta cuántos cambios locales quedan sin subir a la nube.
    // La UI lo usa para avisar antes de cerrar sesión.
    async function getPendingChangesCount() {
        try {
            const { db } = await import('../services/db.js');
            return await db.sync_queue.count();
        } catch {
            return 0;
        }
    }

    async function logout() {
        try {
            // Attempt to sign out from Supabase (may fail if offline or session is already dead)
            await supabase.auth.signOut();
        } catch (error) {
            console.error('Error en signOut de Supabase (se continúa con el logout local):', error);
        }

        // Se limpian las tablas de datos para no dejar información del usuario
        // anterior en el dispositivo.
        //
        // IMPORTANTE: sync_queue NO se toca. Antes se borraba junto con todo lo
        // demás, así que quien trabajaba sin señal en obra y cerraba sesión
        // perdía definitivamente todo lo que había registrado. Los payloads de
        // la cola son autónomos: sobreviven al logout y se suben en el próximo
        // arranque con conexión.
        try {
            const { db } = await import('../services/db.js');
            await Promise.all(
                db.tables
                    .filter(table => table.name !== 'sync_queue')
                    .map(table => table.clear())
            );

            const pendientes = await db.sync_queue.count();
            if (pendientes > 0) {
                console.warn(
                    `Logout con ${pendientes} cambio(s) sin sincronizar. ` +
                    'Se conservan en la cola y se subirán al volver a entrar con conexión.'
                );
            }
        } catch (e) {
            console.error('No se pudo limpiar la base local en el logout:', e);
        }

        // ALWAYS clear the current user state
        setCurrentUser(null);
    }

    async function resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
        });
        if (error) throw error;
    }

    async function updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        if (error) throw error;
    }

    async function updateNombre(nombre) {
        const { error } = await supabase.auth.updateUser({
            data: { nombre }
        });
        if (error) throw error;
        setCurrentUser(prev => prev ? { ...prev, nombre } : null);
    }

    const value = {
        currentUser,
        loading,
        login,
        logout,
        resetPassword,
        updatePassword,
        updateNombre,
        getPendingChangesCount
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
