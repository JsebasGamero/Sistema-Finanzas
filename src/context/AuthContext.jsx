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

    async function logout() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
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
        updateNombre
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
