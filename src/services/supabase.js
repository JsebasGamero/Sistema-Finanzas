// Supabase client configuration
// Las credenciales se leen de .env (ver .env.example). Nunca las escribas aquí.
import { createClient } from '@supabase/supabase-js';

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

const configured = Boolean(supabaseUrl) && Boolean(supabaseAnonKey) &&
    !PLACEHOLDERS.includes(supabaseUrl) && !PLACEHOLDERS.includes(supabaseAnonKey);

if (!configured) {
    console.error(
        'Supabase no está configurado. Copia .env.example a .env y completa ' +
        'VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. La app funcionará solo en modo local.'
    );
}

// Se crea el cliente igual (con valores inertes si falta config) para que los
// imports no exploten; isSupabaseConfigured() decide si se intenta sincronizar.
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
);

// Check if Supabase is properly configured
export function isSupabaseConfigured() {
    return configured;
}

export default supabase;
