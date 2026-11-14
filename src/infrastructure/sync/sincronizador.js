// Adaptador de infraestructura: decide si intentar sincronizar según el
// estado de conexión. No sabe nada de Dexie ni de Supabase: recibe las
// dependencias inyectadas para poder testearse sin navegador.
export function crearSincronizador({ procesarCola, estaEnLinea }) {
    return {
        async sincronizarAhora() {
            if (!estaEnLinea()) return null;
            return await procesarCola();
        }
    };
}
