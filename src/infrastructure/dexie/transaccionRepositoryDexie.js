// Adaptador de infraestructura: acceso a la tabla `transacciones` de Dexie
// detrás del contrato de repositorio que usa la capa de dominio.
export function crearTransaccionRepositoryDexie(db) {
    return {
        obtener: (id) => db.transacciones.get(id),
        agregar: (tx) => db.transacciones.add(tx),
        actualizar: (id, cambios) => db.transacciones.update(id, cambios),
        eliminar: (id) => db.transacciones.delete(id)
    };
}
