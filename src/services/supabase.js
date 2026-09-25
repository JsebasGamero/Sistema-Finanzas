// Supabase client configuration
// Las credenciales se leen de .env.<modo>.local (ver docs/ENTORNOS.md).
// Nunca las escribas aquí.
import { createClient } from '@supabase/supabase-js';
import { ENTORNO_COHERENTE, describirProblemaDeEntorno } from './entorno';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Placeholders conocidos de .env.example: si alguien no copió el archivo,
// queremos detectarlo en vez de arrancar contra un proyecto inexistente.
const PLACEHOLDERS = [
    'https://tu-proyecto.supabase.co',
    'https://your-project.supabase.co',
    'tu-anon-key',
    'your-anon-key'
];

const credencialesPresentes = Boolean(supabaseUrl) && Boolean(supabaseAnonKey) &&
    !PLACEHOLDERS.includes(supabaseUrl) && !PLACEHOLDERS.includes(supabaseAnonKey);

// Solo se conecta si hay credenciales Y pertenecen al entorno en que corre la
// app. Esto es lo que impide que `npm run dev` escriba en producción.
const configured = credencialesPresentes && ENTORNO_COHERENTE;

if (!credencialesPresentes) {
    console.error(
        'Supabase no está configurado para este entorno. Crea el archivo ' +
        `.env.${import.meta.env.MODE}.local a partir de .env.example. ` +
        'La app funcionará solo en modo local.'
    );
} else if (!ENTORNO_COHERENTE) {
    console.error(describirProblemaDeEntorno());
}

// Se crea el cliente igual (con valores inertes si falta config) para que los
// imports no exploten; isSupabaseConfigured() decide si se intenta sincronizar.
export const supabase = createClient(
    configured ? supabaseUrl : 'https://placeholder.supabase.co',
    configured ? supabaseAnonKey : 'placeholder'
);

// Check if Supabase is properly configured
export function isSupabaseConfigured() {
    return configured;
}

export default supabase;
