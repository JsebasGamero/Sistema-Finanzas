// Sync service - handles offline/online synchronization
import { db, generateUUID } from './db';
import { supabase, isSupabaseConfigured } from './supabase';

// Add operation to sync queue (for offline mode)
export async function addToSyncQueue(tabla, operacion, datos) {
    await db.sync_queue.add({
        tabla,
        operacion, // 'INSERT', 'UPDATE', 'DELETE'
        datos: JSON.stringify(datos),
        timestamp: new Date().toISOString()
    });
}


// Process pending sync operations
export async function processSyncQueue() {
    if (!isSupabaseConfigured()) {
        console.log('⚠️ Supabase not configured, skipping sync');
        return { success: false, message: 'Supabase not configured' };
    }

    const pendingOperations = await db.sync_queue.toArray();

    if (pendingOperations.length === 0) {
        return { success: true, synced: 0 };
    }

    let syncedCount = 0;
    const errors = [];

    for (const operation of pendingOperations) {
        try {
            const datos = JSON.parse(operation.datos);
            let result;

            // Prepare data for Supabase - remove local-only fields
            const supabaseData = prepareForSupabase(datos, operation.tabla);

            console.log(`🔄 Syncing ${operation.operacion} to ${operation.tabla}:`, supabaseData);

            switch (operation.operacion) {
                case 'INSERT':
                    result = await supabase.from(operation.tabla).insert(supabaseData);
                    break;
                case 'UPDATE':
                    result = await supabase.from(operation.tabla).update(supabaseData).eq('id', supabaseData.id);
                    break;
                case 'DELETE':
                    result = await supabase.from(operation.tabla).delete().eq('id', supabaseData.id);
                    break;
            }

            console.log(`📤 Supabase response:`, result);

            if (result.error) {
                // Handle specific error codes
                const errorCode = result.error.code;
                const errorStatus = result.status;

                // 409 Conflict or 23505 = Record already exists, consider it synced
                if (errorStatus === 409 || errorCode === '23505') {
                    console.log('⚠️ Record already exists in Supabase, removing from queue');
                    await db.sync_queue.delete(operation.id);
                    if (operation.tabla === 'transacciones') {
                        await db.transacciones.update(datos.id, { sincronizado: true });
                    }
                    syncedCount++;
                    continue;
                }

                // 23503 = Foreign key violation (proyecto_id, tercero_id, etc. doesn't exist)
                // Try inserting with null foreign keys
                if (errorCode === '23503') {
                    console.log('⚠️ Foreign key error, retrying with null foreign keys...');
                    const cleanData = { ...supabaseData };
                    // Set potentially invalid foreign keys to null
                    if (cleanData.proyecto_id) cleanData.proyecto_id = null;
                    if (cleanData.tercero_id) cleanData.tercero_id = null;

                    const retryResult = await supabase.from(operation.tabla).insert(cleanData);

                    if (!retryResult.error || retryResult.status === 409) {
                        console.log('✅ Synced with null foreign keys');
                        await db.sync_queue.delete(operation.id);
                        if (operation.tabla === 'transacciones') {
                            await db.transacciones.update(datos.id, { sincronizado: true });
                        }
                        syncedCount++;
                        continue;
                    }
                }

                console.error('❌ Sync error:', result.error);
                errors.push({ operation, error: result.error });
            } else {
                console.log('✅ Sync successful');
                // Remove from queue after successful sync
                await db.sync_queue.delete(operation.id);

                // Mark as synced in local DB
                if (operation.tabla === 'transacciones' && operation.operacion !== 'DELETE') {
                    await db.transacciones.update(datos.id, { sincronizado: true });
                }

                syncedCount++;
            }
        } catch (error) {
            console.error('❌ Sync exception:', error);
            errors.push({ operation, error: error.message });
        }
    }

    return {
        success: errors.length === 0,
        synced: syncedCount,
        errors
    };
}

// Prepare data for Supabase (remove/convert local-only fields)
function prepareForSupabase(data, tabla = 'transacciones') {
    const prepared = { ...data };

    // Convert date format if needed
    if (prepared.fecha && typeof prepared.fecha === 'string') {
        prepared.fecha = prepared.fecha.split('T')[0];
    }
    if (prepared.fecha_prestamo && typeof prepared.fecha_prestamo === 'string') {
        prepared.fecha_prestamo = prepared.fecha_prestamo.split('T')[0];
    }
    if (prepared.fecha_deuda && typeof prepared.fecha_deuda === 'string') {
        prepared.fecha_deuda = prepared.fecha_deuda.split('T')[0];
    }

    // Fields allowed per table
    const tableFields = {
        transacciones: [
            'id', 'fecha', 'descripcion', 'monto', 'tipo_movimiento', 'categoria',
            'proyecto_id', 'caja_origen_id', 'caja_destino_id', 'tercero_id',
            'soporte_url', 'sincronizado', 'device_id', 'created_at'
        ],
        empresas: [
            'id', 'nombre', 'nit', 'direccion', 'telefono', 'created_at', 'updated_at'
        ],
        cajas: [
            'id', 'nombre', 'tipo', 'empresa_id', 'saldo_actual',
            'banco_nombre', 'numero_cuenta', 'created_at', 'updated_at'
        ],
        proyectos: [
            'id', 'nombre', 'empresa_id', 'presupuesto_estimado', 'estado',
            'fecha_inicio', 'fecha_fin', 'descripcion', 'created_at', 'updated_at'
        ],
        terceros: [
            'id', 'nombre', 'tipo', 'nit_cedula', 'telefono', 'email',
            'direccion', 'created_at', 'updated_at'
        ],
        deudas_cajas: [
            'id', 'caja_deudora_id', 'caja_acreedora_id', 'monto_original',
            'monto_pendiente', 'fecha_prestamo', 'estado', 'pagos', 'created_at'
        ],
        deudas_terceros: [
            'id', 'tercero_id', 'proyecto_id', 'empresa_id', 'monto_original',
            'monto_pendiente', 'fecha_deuda', 'estado', 'descripcion', 'pagos', 'created_at'
        ]
    };

    const allowedFields = tableFields[tabla] || tableFields.transacciones;

    const result = {};
    for (const field of allowedFields) {
        if (prepared[field] !== undefined) {
            result[field] = prepared[field];
        }
    }

    // Set sincronizado to true for transacciones
    if (tabla === 'transacciones') {
        result.sincronizado = true;
    }

    return result;
}

// Create transaction with offline support
export async function createTransaction(transactionData) {
    const id = generateUUID();
    const now = new Date().toISOString();

    const transaction = {
        id,
        ...transactionData,
        sincronizado: false,
        created_at: now
    };

    // Save to local IndexedDB
    await db.transacciones.add(transaction);

    // Update caja balances locally
    if (transactionData.tipo_movimiento === 'INGRESO' && transactionData.caja_origen_id) {
        await updateCajaBalance(transactionData.caja_origen_id, transactionData.monto);
    } else if (transactionData.tipo_movimiento === 'EGRESO' && transactionData.caja_origen_id) {
        await updateCajaBalance(transactionData.caja_origen_id, -transactionData.monto);
    } else if (transactionData.tipo_movimiento === 'TRANSFERENCIA') {
        if (transactionData.caja_origen_id) {
            await updateCajaBalance(transactionData.caja_origen_id, -transactionData.monto);
        }
        if (transactionData.caja_destino_id) {
            await updateCajaBalance(transactionData.caja_destino_id, transactionData.monto);
        }
    }

    // Add to sync queue
    await addToSyncQueue('transacciones', 'INSERT', transaction);

    // Try to sync immediately if online
    if (navigator.onLine) {
        console.log('🌐 Online - attempting immediate sync...');
        const result = await processSyncQueue();
        console.log('📊 Sync result:', result);
    }

    return transaction;
}

// Update caja balance locally
async function updateCajaBalance(cajaId, amount) {
    const caja = await db.cajas.get(cajaId);
    if (caja) {
        const newBalance = (caja.saldo_actual || 0) + amount;
        await db.cajas.update(cajaId, { saldo_actual: newBalance });
    }
}

// Get pending sync count
export async function getPendingSyncCount() {
    return await db.sync_queue.count();
}

// Get all transactions
export async function getTransactions(filters = {}) {
    let query = db.transacciones.orderBy('created_at').reverse();

    if (filters.proyecto_id) {
        query = query.filter(t => t.proyecto_id === filters.proyecto_id);
    }

    if (filters.caja_id) {
        query = query.filter(t =>
            t.caja_origen_id === filters.caja_id || t.caja_destino_id === filters.caja_id
        );
    }

    return await query.toArray();
}

// Get inter-caja debts (préstamos pendientes)
export async function getIntercajaDebts() {
    const transferencias = await db.transacciones
        .where('tipo_movimiento')
        .equals('TRANSFERENCIA')
        .toArray();

    const cajas = await db.cajas.toArray();
    const cajaMap = Object.fromEntries(cajas.map(c => [c.id, c]));

    // Group by caja pairs
    const debts = {};

    for (const t of transferencias) {
        if (t.categoria === 'Prestamo' && t.caja_origen_id && t.caja_destino_id) {
            const key = `${t.caja_origen_id}-${t.caja_destino_id}`;
            const reverseKey = `${t.caja_destino_id}-${t.caja_origen_id}`;

            if (debts[reverseKey]) {
                debts[reverseKey].monto -= t.monto;
            } else if (debts[key]) {
                debts[key].monto += t.monto;
            } else {
                debts[key] = {
                    caja_origen: cajaMap[t.caja_origen_id]?.nombre || 'Desconocida',
                    caja_destino: cajaMap[t.caja_destino_id]?.nombre || 'Desconocida',
                    monto: t.monto
                };
            }
        }
    }

    // Filter out settled debts
    return Object.values(debts).filter(d => d.monto !== 0);
}

// Force sync all pending operations
export async function forceSync() {
    console.log('🔄 Force sync initiated...');
    return await processSyncQueue();
}

// ============== DEUDAS CAJAS (Inter-box debts) ==============

// Create inter-box debt with sync support
export async function createDeudaCajas(deudaData) {
    const id = generateUUID();
    const now = new Date().toISOString();

    const deuda = {
        id,
        ...deudaData,
        pagos: deudaData.pagos || [],
        created_at: now
    };

    // Save locally
    await db.deudas_cajas.add(deuda);

    // Add to sync queue
    await addToSyncQueue('deudas_cajas', 'INSERT', deuda);

    // Try to sync immediately if online
    if (navigator.onLine) {
        await processSyncQueue();
    }

    return deuda;
}

// Update inter-box debt with sync support
export async function updateDeudaCajas(id, updateData) {
    const deuda = await db.deudas_cajas.get(id);
    if (!deuda) return null;

    const updatedDeuda = { ...deuda, ...updateData };
    await db.deudas_cajas.update(id, updateData);

    // Add to sync queue
    await addToSyncQueue('deudas_cajas', 'UPDATE', updatedDeuda);

    if (navigator.onLine) {
        await processSyncQueue();
    }

    return updatedDeuda;
}

// ============== DEUDAS TERCEROS (Supplier debts) ==============

// Create supplier debt with sync support
export async function createDeudaTerceros(deudaData) {
    const id = generateUUID();
    const now = new Date().toISOString();

    const deuda = {
        id,
        ...deudaData,
        pagos: deudaData.pagos || [],
        created_at: now
    };

    // Save locally
    await db.deudas_terceros.add(deuda);

    // Add to sync queue
    await addToSyncQueue('deudas_terceros', 'INSERT', deuda);

    // Try to sync immediately if online
    if (navigator.onLine) {
        await processSyncQueue();
    }

    return deuda;
}

// Update supplier debt with sync support
export async function updateDeudaTerceros(id, updateData) {
    const deuda = await db.deudas_terceros.get(id);
    if (!deuda) return null;

    const updatedDeuda = { ...deuda, ...updateData };
    await db.deudas_terceros.update(id, updateData);

    // Add to sync queue
    await addToSyncQueue('deudas_terceros', 'UPDATE', updatedDeuda);

    if (navigator.onLine) {
        await processSyncQueue();
    }

    return updatedDeuda;
}

export default {
    createTransaction,
    getTransactions,
    getPendingSyncCount,
    processSyncQueue,
    getIntercajaDebts,
    forceSync,
    createDeudaCajas,
    updateDeudaCajas,
    createDeudaTerceros,
    updateDeudaTerceros
};
