// Database configuration using Dexie.js (IndexedDB wrapper)
import Dexie from 'dexie';
import { supabase, isSupabaseConfigured } from './supabase';

export const db = new Dexie('FinanzasConstructora');

// Define the database schema matching the SQL structure
db.version(1).stores({
    // Empresas table
    empresas: 'id, nombre, nit, created_at',

    // Proyectos table (linked to empresas)
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',

    // Cajas table (Bancos, Caja Menor, Tarjetas)
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',

    // Terceros table (Proveedores y Empleados)
    terceros: 'id, nombre, tipo, created_at',

    // Transacciones table (main table)
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, created_at',

    // Sync queue for offline operations
    sync_queue: '++id, tabla, operacion, datos, timestamp'
});

// Generate UUID v4
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Fetch data from Supabase and sync to local DB
export async function syncFromSupabase() {
    if (!isSupabaseConfigured()) {
        console.log('⚠️ Supabase not configured, using local data only');
        return false;
    }

    try {
        console.log('🔄 Syncing data from Supabase...');

        // Fetch empresas
        const { data: empresas, error: empresasError } = await supabase.from('empresas').select('*');
        if (empresasError) throw empresasError;

        // Fetch cajas
        const { data: cajas, error: cajasError } = await supabase.from('cajas').select('*');
        if (cajasError) throw cajasError;

        // Fetch proyectos
        const { data: proyectos, error: proyectosError } = await supabase.from('proyectos').select('*');
        if (proyectosError) throw proyectosError;

        // Fetch terceros
        const { data: terceros, error: tercerosError } = await supabase.from('terceros').select('*');
        if (tercerosError) throw tercerosError;

        // Fetch transacciones (existing transactions from cloud)
        const { data: transacciones, error: transaccionesError } = await supabase.from('transacciones').select('*');
        if (transaccionesError) throw transaccionesError;

        // Clear and update local DB with Supabase data
        await db.empresas.clear();
        await db.cajas.clear();
        await db.proyectos.clear();
        await db.terceros.clear();
        await db.transacciones.clear();

        if (empresas && empresas.length > 0) {
            await db.empresas.bulkAdd(empresas);
            console.log(`✅ Synced ${empresas.length} empresas`);
        }

        if (cajas && cajas.length > 0) {
            await db.cajas.bulkAdd(cajas);
            console.log(`✅ Synced ${cajas.length} cajas`);
        }

        if (proyectos && proyectos.length > 0) {
            await db.proyectos.bulkAdd(proyectos);
            console.log(`✅ Synced ${proyectos.length} proyectos`);
        }

        if (terceros && terceros.length > 0) {
            await db.terceros.bulkAdd(terceros);
            console.log(`✅ Synced ${terceros.length} terceros`);
        }

        if (transacciones && transacciones.length > 0) {
            await db.transacciones.bulkAdd(transacciones);
            console.log(`✅ Synced ${transacciones.length} transacciones`);

            // Recalculate caja balances from transactions
            await recalculateCajaBalances();
        }

        console.log('✅ Data sync from Supabase complete!');
        return true;
    } catch (error) {
        console.error('❌ Error syncing from Supabase:', error);
        return false;
    }
}

// Recalculate all caja balances from transactions
async function recalculateCajaBalances() {
    console.log('🔄 Recalculating caja balances...');

    const transacciones = await db.transacciones.toArray();
    const cajas = await db.cajas.toArray();

    // Initialize balances to 0
    const balances = {};
    cajas.forEach(c => balances[c.id] = 0);

    // Calculate from transactions
    transacciones.forEach(t => {
        if (t.tipo_movimiento === 'INGRESO' && t.caja_origen_id) {
            balances[t.caja_origen_id] = (balances[t.caja_origen_id] || 0) + t.monto;
        } else if (t.tipo_movimiento === 'EGRESO' && t.caja_origen_id) {
            balances[t.caja_origen_id] = (balances[t.caja_origen_id] || 0) - t.monto;
        } else if (t.tipo_movimiento === 'TRANSFERENCIA') {
            if (t.caja_origen_id) {
                balances[t.caja_origen_id] = (balances[t.caja_origen_id] || 0) - t.monto;
            }
            if (t.caja_destino_id) {
                balances[t.caja_destino_id] = (balances[t.caja_destino_id] || 0) + t.monto;
            }
        }
    });

    // Update each caja with calculated balance
    for (const caja of cajas) {
        const newBalance = balances[caja.id] || 0;
        await db.cajas.update(caja.id, { saldo_actual: newBalance });

        // Also update Supabase
        if (isSupabaseConfigured()) {
            await supabase.from('cajas').update({ saldo_actual: newBalance }).eq('id', caja.id);
        }
    }

    console.log('✅ Caja balances recalculated!');
}

// Initialize data - fetch from Supabase or use local fallback
export async function seedInitialData() {
    const empresasCount = await db.empresas.count();

    // Try to sync from Supabase first
    if (navigator.onLine && isSupabaseConfigured()) {
        const synced = await syncFromSupabase();
        if (synced) return;
    }

    // If no data and couldn't sync, create local fallback data
    if (empresasCount === 0) {
        console.log('⚠️ No data available, creating local fallback data...');
        const empresas = [
            { id: generateUUID(), nombre: 'MAVICOL SAS', nit: '', created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'PROEXI SAS', nit: '', created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'CONSTRUCTORA 360 SAS', nit: '', created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'UT MEDICINA INTERNA', nit: '', created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'UT ORU 2020', nit: '', created_at: new Date().toISOString() },
        ];

        await db.empresas.bulkAdd(empresas);

        // Create sample cajas
        const cajas = [
            { id: generateUUID(), nombre: 'Caja Rubén', tipo: 'Efectivo', empresa_id: empresas[0].id, saldo_actual: 0, created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Caja 24/7', tipo: 'Efectivo', empresa_id: empresas[0].id, saldo_actual: 0, created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Banco MAVICOL', tipo: 'Banco', empresa_id: empresas[0].id, saldo_actual: 0, created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Caja PROEXI', tipo: 'Efectivo', empresa_id: empresas[1].id, saldo_actual: 0, created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Caja 360 SAS', tipo: 'Efectivo', empresa_id: empresas[2].id, saldo_actual: 0, created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Caja Hospital', tipo: 'Efectivo', empresa_id: empresas[3].id, saldo_actual: 0, created_at: new Date().toISOString() },
        ];

        await db.cajas.bulkAdd(cajas);

        // Create sample projects
        const proyectos = [
            { id: generateUUID(), nombre: 'Proyecto Educación', empresa_id: empresas[0].id, presupuesto_estimado: 0, estado: 'Activo', created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Obra Pavimentación', empresa_id: empresas[0].id, presupuesto_estimado: 0, estado: 'Activo', created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Vías Terciarias', empresa_id: empresas[4].id, presupuesto_estimado: 0, estado: 'Activo', created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Universidad Catatumbo', empresa_id: empresas[0].id, presupuesto_estimado: 0, estado: 'Activo', created_at: new Date().toISOString() },
            { id: generateUUID(), nombre: 'Hospital 24/7', empresa_id: empresas[3].id, presupuesto_estimado: 0, estado: 'Activo', created_at: new Date().toISOString() },
        ];

        await db.proyectos.bulkAdd(proyectos);

        console.log('✅ Local fallback data seeded successfully');
    }
}

export default db;
