// LoginScreen - Email/Password login with Supabase Auth
import { useState } from 'react';
import { Coins, Mail, Lock, Eye, EyeOff, LogIn, KeyRound, ArrowLeft, Loader2 } from 'lucide-react';

export default function LoginScreen({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mode, setMode] = useState('login'); // 'login' | 'forgot'
    const [resetSent, setResetSent] = useState(false);

    async function handleLogin(e) {
        e.preventDefault();
        if (!email || !password) return;

        setLoading(true);
        setError('');

        try {
            await onLogin(email, password);
        } catch (err) {
            console.error('Login error:', err);
            if (err.message?.includes('Invalid login credentials')) {
                setError('Correo o contraseña incorrectos');
            } else if (err.message?.includes('Email not confirmed')) {
                setError('Debes confirmar tu correo electrónico');
            } else if (!navigator.onLine) {
                setError('Sin conexión a internet');
            } else {
                setError('Error al iniciar sesión. Intenta de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleForgotPassword(e) {
        e.preventDefault();
        if (!email) {
            setError('Ingresa tu correo electrónico');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { supabase } = await import('../services/supabase');
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin
            });
            if (error) throw error;
            setResetSent(true);
        } catch (err) {
            setError('Error al enviar el correo de recuperación');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-primary flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/25 mb-4">
                        <Coins size={40} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-gold">FinanzasObra</h1>
                    <p className="text-gray-400 text-sm mt-1">Sistema de Gestión Financiera</p>
                </div>

                {/* Login Card */}
                <div className="card" style={{ borderRadius: '24px' }}>
                    {mode === 'login' ? (
                        <>
                            <h2 className="text-xl font-bold text-white text-center mb-6">
                                Iniciar Sesión
                            </h2>

                            <form onSubmit={handleLogin} className="space-y-4">
                                {/* Email */}
                                <div>
                                    <label className="label">Correo electrónico</label>
                                    <div className="relative">
                                        <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                            className="input-field"
                                            style={{ paddingLeft: '44px' }}
                                            placeholder="tu@correo.com"
                                            required
                                            autoComplete="email"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="label">Contraseña</label>
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                            className="input-field"
                                            style={{ paddingLeft: '44px', paddingRight: '48px' }}
                                            placeholder="••••••••"
                                            required
                                            autoComplete="current-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Error message */}
                                {error && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
                                        {error}
                                    </div>
                                )}

                                {/* Submit button */}
                                <button
                                    type="submit"
                                    disabled={loading || !email || !password}
                                    className="btn-primary w-full flex items-center justify-center gap-2 text-lg"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Ingresando...
                                        </>
                                    ) : (
                                        <>
                                            <LogIn size={20} />
                                            Iniciar Sesión
                                        </>
                                    )}
                                </button>

                                {/* Forgot password link */}
                                <button
                                    type="button"
                                    onClick={() => { setMode('forgot'); setError(''); setResetSent(false); }}
                                    className="w-full text-center text-sm text-gray-400 hover:text-gold transition-colors py-2"
                                >
                                    <KeyRound size={14} className="inline mr-1" />
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            {/* Forgot Password Mode */}
                            <button
                                onClick={() => { setMode('login'); setError(''); setResetSent(false); }}
                                className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors mb-4 text-sm"
                            >
                                <ArrowLeft size={16} />
                                Volver al login
                            </button>

                            <h2 className="text-xl font-bold text-white text-center mb-2">
                                Recuperar Contraseña
                            </h2>
                            <p className="text-gray-400 text-sm text-center mb-6">
                                Te enviaremos un enlace para restablecer tu contraseña
                            </p>

                            {resetSent ? (
                                <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-6 text-center">
                                    <div className="text-green-400 text-lg mb-2">✅ Correo enviado</div>
                                    <p className="text-gray-400 text-sm">
                                        Revisa tu bandeja de entrada en <strong className="text-white">{email}</strong> y sigue las instrucciones para restablecer tu contraseña.
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleForgotPassword} className="space-y-4">
                                    <div>
                                        <label className="label">Correo electrónico</label>
                                        <div className="relative">
                                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                                className="input-field"
                                                style={{ paddingLeft: '44px' }}
                                                placeholder="tu@correo.com"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
                                            {error}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading || !email}
                                        className="btn-primary w-full flex items-center justify-center gap-2"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 size={20} className="animate-spin" />
                                                Enviando...
                                            </>
                                        ) : (
                                            <>
                                                <Mail size={20} />
                                                Enviar enlace de recuperación
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-gray-600 mt-6">
                    FinanzasObra © {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
