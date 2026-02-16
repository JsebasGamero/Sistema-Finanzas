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

// Version 2 - Add inter-box debts
db.version(2).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    // Deudas entre cajas
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, created_at'
});

// Version 3 - Add supplier/third-party debts
db.version(3).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, created_at',
    // Deudas a terceros (proveedores, empleados)
    deudas_terceros: 'id, tercero_id, proyecto_id, empresa_id, monto_original, monto_pendiente, fecha_deuda, estado, descripcion, created_at'
});

// Version 4 - Add categories table for dynamic category management
db.version(4).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, created_at',
    deudas_terceros: 'id, tercero_id, proyecto_id, empresa_id, monto_original, monto_pendiente, fecha_deuda, estado, descripcion, created_at',
    // Categorías dinámicas
    categorias: 'id, nombre, tipo, created_at'
});

// Version 5 - Add user tracking (usuario_nombre) to all operational tables
db.version(5).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, usuario_nombre, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, usuario_nombre, created_at',
    deudas_terceros: 'id, tercero_id, proyecto_id, empresa_id, monto_original, monto_pendiente, fecha_deuda, estado, descripcion, usuario_nombre, created_at',
    categorias: 'id, nombre, tipo, created_at'
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
// Strategy: Supabase is the SOURCE OF TRUTH
// 1. Clear local tables
// 2. Replace with fresh Supabase data
// This prevents duplicates when switching devices/accounts
export async function syncFromSupabase() {
    if (!isSupabaseConfigured()) {
        console.log('⚠️ Supabase not configured, using local data only');
        return false;
    }

    try {
        console.log('🔄 Syncing data from Supabase...');

        // Fetch all tables from Supabase
        const { data: empresas, error: empresasError } = await supabase.from('empresas').select('*');
        if (empresasError) throw empresasError;

        const { data: cajas, error: cajasError } = await supabase.from('cajas').select('*');
        if (cajasError) throw cajasError;

        const { data: proyectos, error: proyectosError } = await supabase.from('proyectos').select('*');
        if (proyectosError) throw proyectosError;

        const { data: terceros, error: tercerosError } = await supabase.from('terceros').select('*');
        if (tercerosError) throw tercerosError;

        const { data: transacciones, error: transaccionesError } = await supabase.from('transacciones').select('*');
        if (transaccionesError) throw transaccionesError;

        // Fetch categorias
        let categorias = [];
        try {
            const { data, error } = await supabase.from('categorias').select('*');
            if (!error) categorias = data || [];
        } catch (e) {
            console.log('⚠️ categorias table might not exist in Supabase yet');
        }

        // Fetch deudas_cajas
        let deudasCajas = [];
        try {
            const { data, error } = await supabase.from('deudas_cajas').select('*');
            if (!error) deudasCajas = data || [];
        } catch (e) {
            console.log('⚠️ deudas_cajas table might not exist in Supabase yet');
        }

        // Fetch deudas_terceros
        let deudasTerceros = [];
        try {
            const { data, error } = await supabase.from('deudas_terceros').select('*');
            if (!error) deudasTerceros = data || [];
        } catch (e) {
            console.log('⚠️ deudas_terceros table might not exist in Supabase yet');
        }

        // CLEAR local tables and REPLACE with Supabase data
        // This prevents duplicates from merging different device data
        console.log('🗑️ Clearing local data for fresh sync...');

        await db.empresas.clear();
        if (empresas && empresas.length > 0) {
            await db.empresas.bulkAdd(empresas);
            console.log(`✅ Synced ${empresas.length} empresas`);
        }

        await db.cajas.clear();
        if (cajas && cajas.length > 0) {
            await db.cajas.bulkAdd(cajas);
            console.log(`✅ Synced ${cajas.length} cajas`);
        }

        await db.proyectos.clear();
        if (proyectos && proyectos.length > 0) {
            await db.proyectos.bulkAdd(proyectos);
            console.log(`✅ Synced ${proyectos.length} proyectos`);
        }

        await db.terceros.clear();
        if (terceros && terceros.length > 0) {
            await db.terceros.bulkAdd(terceros);
            console.log(`✅ Synced ${terceros.length} terceros`);
        }

        await db.transacciones.clear();
        if (transacciones && transacciones.length > 0) {
            await db.transacciones.bulkAdd(transacciones);
            console.log(`✅ Synced ${transacciones.length} transacciones`);
        }

        // Sync categorias
        try {
            await db.categorias.clear();
            if (categorias.length > 0) {
                await db.categorias.bulkAdd(categorias);
                console.log(`✅ Synced ${categorias.length} categorias`);
            }
        } catch (e) {
            console.log('⚠️ categorias table might not exist locally yet');
        }

        // Sync deudas_cajas
        try {
            await db.deudas_cajas.clear();
            if (deudasCajas.length > 0) {
                await db.deudas_cajas.bulkAdd(deudasCajas);
                console.log(`✅ Synced ${deudasCajas.length} deudas_cajas`);
            }
        } catch (e) {
            console.log('⚠️ deudas_cajas table might not exist locally yet');
        }

        // Sync deudas_terceros
        try {
            await db.deudas_terceros.clear();
            if (deudasTerceros.length > 0) {
                await db.deudas_terceros.bulkAdd(deudasTerceros);
                console.log(`✅ Synced ${deudasTerceros.length} deudas_terceros`);
            }
        } catch (e) {
            console.log('⚠️ deudas_terceros table might not exist locally yet');
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

// Initialize data - fetch from Supabase (source of truth)
export async function seedInitialData() {
    // Try to sync from Supabase first (this is the source of truth)
    if (navigator.onLine && isSupabaseConfigured()) {
        const synced = await syncFromSupabase();
        if (synced) return;
    }

    // If offline and local DB is empty, show message
    const empresasCount = await db.empresas.count();
    if (empresasCount === 0) {
        console.log('⚠️ No data available. Connect to internet to sync from Supabase, or create entities manually.');
    }
}

export default db;
