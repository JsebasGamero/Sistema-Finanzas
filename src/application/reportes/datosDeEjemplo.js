// Datos de ejemplo para las pruebas del motor de reportes. Solo los importan
// los *.test.js de esta carpeta; la app no los usa.
//
// Incluye a propósito los casos que ya rompieron reportes: un monto guardado
// como string, una categoría guardada como UUID viejo, un movimiento sin
// sincronizar, transferencias y movimientos de deudas.

export const UUID_NOMINA = '0b8e7a52-1c3d-4e5f-8a9b-0c1d2e3f4a5b';

export function datosDeEjemplo() {
    return {
        empresas: [
            { id: 'e1', nombre: 'Constructora Uno', nit: '900.111.222-3', telefono: '3001234567', direccion: 'Calle 1' },
            { id: 'e2', nombre: 'Inversiones Dos', nit: '900.333.444-5' },
        ],
        cajas: [
            { id: 'c1', nombre: 'Caja menor', tipo: 'Efectivo', empresa_id: 'e1', saldo_actual: 500000 },
            { id: 'c2', nombre: 'Bancolombia', tipo: 'Banco', empresa_id: 'e1', saldo_actual: '2000000', banco_nombre: 'Bancolombia', numero_cuenta: '123-456' },
            { id: 'c3', nombre: 'Tarjeta', tipo: 'Tarjeta', empresa_id: 'e2', saldo_actual: -150000 },
        ],
        proyectos: [
            { id: 'p1', nombre: 'Edificio Norte', empresa_id: 'e1', presupuesto_estimado: 10000000, estado: 'Activo', fecha_inicio: '2026-01-15' },
            { id: 'p2', nombre: 'Casa Sur', empresa_id: 'e2', presupuesto_estimado: 0, estado: 'Pausado' },
        ],
        terceros: [
            { id: 't1', nombre: 'Ferretería El Clavo', tipo: 'Proveedor', nit_cedula: '800.1' },
            { id: 't2', nombre: 'Juan Pérez', tipo: 'Empleado' },
        ],
        categorias: [
            { id: 'k1', nombre: 'Materiales', tipo: 'EGRESO' },
            { id: UUID_NOMINA, nombre: 'Nómina', tipo: 'EGRESO' },
            { id: 'k3', nombre: 'Anticipo', tipo: 'INGRESO' },
        ],
        transacciones: [
            { id: 'm1', fecha: '2026-03-01', tipo_movimiento: 'INGRESO', monto: 3000000, categoria: 'Anticipo', proyecto_id: 'p1', caja_origen_id: 'c2', usuario_nombre: 'Ana', sincronizado: true, descripcion: 'Anticipo del cliente' },
            { id: 'm2', fecha: '2026-03-05', tipo_movimiento: 'EGRESO', monto: '1200000', categoria: 'Materiales', proyecto_id: 'p1', caja_origen_id: 'c2', tercero_id: 't1', usuario_nombre: 'Ana', sincronizado: true, soporte_url: 'https://ejemplo/soporte.jpg', descripcion: 'Cemento y varilla' },
            { id: 'm3', fecha: '2026-03-31', tipo_movimiento: 'EGRESO', monto: 800000, categoria: UUID_NOMINA, proyecto_id: 'p1', caja_origen_id: 'c1', tercero_id: 't2', usuario_nombre: 'Luis', sincronizado: false, descripcion: 'Quincena' },
            { id: 'm4', fecha: '2026-04-02', tipo_movimiento: 'TRANSFERENCIA', monto: 500000, categoria: 'Traslado', caja_origen_id: 'c2', caja_destino_id: 'c1', usuario_nombre: 'Ana', sincronizado: true },
            { id: 'm5', fecha: '2026-04-10', tipo_movimiento: 'EGRESO', monto: 300000, categoria: 'Pago Deuda', proyecto_id: 'p1', caja_origen_id: 'c2', tercero_id: 't1', usuario_nombre: 'Luis', sincronizado: true, descripcion: 'Abono deuda' },
            { id: 'm6', fecha: '2026-04-15', tipo_movimiento: 'TRANSFERENCIA', monto: 200000, categoria: 'Préstamo entre Cajas', caja_origen_id: 'c2', caja_destino_id: 'c3', usuario_nombre: 'Ana', sincronizado: true },
            { id: 'm7', fecha: '2026-04-20', tipo_movimiento: 'EGRESO', monto: 100000, categoria: '', caja_origen_id: 'c3', usuario_nombre: 'Luis', sincronizado: true },
        ],
        deudasTerceros: [
            {
                id: 'd1', tercero_id: 't1', proyecto_id: 'p1', empresa_id: 'e1', monto_original: 1000000, monto_pendiente: 700000,
                fecha_deuda: '2026-03-10', estado: 'PARCIAL', descripcion: 'Material a crédito', usuario_nombre: 'Ana',
                pagos: [{ monto: 300000, fecha: '2026-04-10T15:00:00Z' }],
            },
            {
                id: 'd2', tercero_id: 't1', proyecto_id: 'p1', empresa_id: 'e1', monto_original: 500000, monto_pendiente: 0,
                fecha_deuda: '2026-02-01', estado: 'PAGADA', descripcion: 'Arena', pagos: [],
            },
        ],
        deudasCajas: [
            {
                id: 'dc1', caja_deudora_id: 'c3', caja_acreedora_id: 'c2', monto_original: 200000, monto_pendiente: 200000,
                fecha_prestamo: '2026-04-15', estado: 'PENDIENTE', descripcion: 'Préstamo para combustible', pagos: [],
            },
        ],
    };
}
