import { describe, it, expect } from 'vitest';
import { esContrasenaDebil, mensajeContrasenaDebil, minimoDelServidor, MINIMO_CONTRASENA } from './reglasContrasena';

describe('reglas de contraseña', () => {
    it('el mínimo del cliente no es menor que el recomendado en SEGURIDAD.md', () => {
        expect(MINIMO_CONTRASENA).toBeGreaterThanOrEqual(10);
    });

    it('reconoce el rechazo por débil de Supabase', () => {
        expect(esContrasenaDebil({ code: 'weak_password', message: 'x' })).toBe(true);
        expect(esContrasenaDebil({ name: 'AuthWeakPasswordError' })).toBe(true);
        expect(esContrasenaDebil({ message: 'Password should be at least 10 characters.' })).toBe(true);
        expect(esContrasenaDebil({ message: 'Invalid login credentials' })).toBe(false);
        expect(esContrasenaDebil({ message: 'New password should be different from the old password.' })).toBe(false);
        expect(esContrasenaDebil(null)).toBe(false);
    });

    it('muestra el mínimo que exige el servidor, no una cifra fija (seguridad-entornos-6)', () => {
        const error = { code: 'weak_password', reasons: ['length'], message: 'Password should be at least 12 characters.' };
        expect(minimoDelServidor(error)).toBe(12);
        expect(mensajeContrasenaDebil(error)).toBe('La contraseña es muy corta. Usa al menos 12 caracteres.');
    });

    it('sin cifra en el mensaje no inventa una', () => {
        const mensaje = mensajeContrasenaDebil({ reasons: ['length'], message: 'too short' });
        expect(mensaje).not.toMatch(/\d/);
    });

    it('distingue contraseña filtrada y falta de tipos de caracteres', () => {
        expect(mensajeContrasenaDebil({ reasons: ['pwned'], message: 'Password is known to be weak' }))
            .toMatch(/filtraciones/);
        expect(mensajeContrasenaDebil({ reasons: ['characters'], message: 'Password should contain at least one character of each' }))
            .toMatch(/combinar letras y números/);
    });

    it('si es corta y además filtrada, primero pide la longitud', () => {
        const error = { reasons: ['pwned', 'length'], message: 'Password should be at least 10 characters.' };
        expect(mensajeContrasenaDebil(error)).toMatch(/al menos 10/);
    });
});
