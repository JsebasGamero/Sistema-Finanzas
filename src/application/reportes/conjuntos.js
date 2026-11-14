// Conjuntos de datos del explorador de reportes.
//
// Cada conjunto convierte las tablas crudas de la base local en filas planas,
// listas para mostrar, filtrar, agrupar y exportar: nombres ya resueltos por
// id, montos ya pasados por aMonto() y fechas de calendario como 'YYYY-MM-DD'.
// La grilla y el motor de resumen trabajan siempre sobre valores, sin buscar
// nada fila por fila.
//
// Antes, la tabla copiaba los nombres a cada fila dentro de un efecto
// asíncrono que dependía de los mapas de nombres; al cambiar de fuente podía
// ganar la carga vieja y la grilla quedaba con filas de otra fuente (REP-12).
// Aquí construir las filas es una función pura de los datos: la UI la llama
// dentro de un useMemo y no hay carrera posible.
//
// Puro: sin React ni Dexie. Se prueba en conjuntos.test.js.
import { aMonto, redondearMonto, restarMontos, esCero, estadoDeuda } from '../../domain/value-objects/dinero';
import { claveDia, hoyLocal } from '../../domain/value-objects/fecha';
import { TIPO_MOVIMIENTO } from '../../domain/value-objects/tipoMovimiento';
import { esMovimientoDeDeuda, tipoDeMovimientoDeDeuda } from '../../domain/rules/movimientoDeDeuda';
import { resolverNombreCategoria } from '../../services/categorias';
// La misma regla que el tablero Resumen: primero la obra, después la caja.
// Antes aquí mandaba la caja y los totales por empresa no cuadraban entre
// pestañas.
import { empresaDeMovimiento } from './empresaDeMovimiento';

export const TIPOS_COLUMNA = ['texto', 'dinero', 'numero', 'porcentaje', 'fecha', 'fechaHora', 'booleano'];

/** ¿La columna guarda una cifra que se puede sumar, promediar o graficar? */
export function esTipoNumerico(tipo) {
    return tipo === 'dinero' || tipo === 'numero' || tipo === 'porcentaje';
}

export const ETIQUETA_TIPO_MOVIMIENTO = Object.freeze({
    [TIPO_MOVIMIENTO.INGRESO]: 'Ingreso',
    [TIPO_MOVIMIENTO.EGRESO]: 'Egreso',
    [TIPO_MOVIMIENTO.TRANSFERENCIA]: 'Transferencia',
});

const ETIQUETA_ESTADO_DEUDA = Object.freeze({
    PENDIENTE: 'Pendiente',
    PARCIAL: 'Parcial',
    PAGADA: 'Pagada',
});

const ETIQUETA_TIPO_CATEGORIA = Object.freeze({
    INGRESO: 'Ingreso',
    EGRESO: 'Egreso',
    AMBOS: 'Ambos',
});

/**
 * Definición de una columna.
 * - total: cómo se resume en la fila de totales ('suma' o null). Por defecto
 *   suman las columnas de dinero y número; los porcentajes y los días no.
 * - agrupable: si sirve como dimensión del resumen (texto y booleano).
 * - orden: orden inicial de la grilla ('asc' | 'desc').
 */
function col(campo, etiqueta, tipo, opciones = {}) {
    const { visible = true, ancho, total, agrupable, orden } = opciones;
    return Object.freeze({
        campo,
        etiqueta,
        tipo,
        visible,
        ...(ancho ? { ancho } : {}),
        total: total !== undefined ? total : (tipo === 'dinero' || tipo === 'numero' ? 'suma' : null),
        agrupable: agrupable !== undefined ? agrupable : (tipo === 'texto' || tipo === 'booleano'),
        ...(orden ? { orden } : {}),
    });
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function porId(filas = []) {
    const mapa = new Map();
    for (const fila of filas) if (fila && fila.id != null) mapa.set(fila.id, fila);
    return mapa;
}

/**
 * Completa los índices que no vengan de useDatosReportes(). Así el módulo
 * funciona igual con el hook (que ya trae los índices) y en las pruebas.
 */
export function prepararIndices(datos = {}, indices = {}) {
    const cajasPorId = indices.cajasPorId ?? porId(datos.cajas);
    const proyectosPorId = indices.proyectosPorId ?? porId(datos.proyectos);
    const tercerosPorId = indices.tercerosPorId ?? porId(datos.terceros);
    const empresasPorId = indices.empresasPorId ?? porId(datos.empresas);
    const categorias = datos.categorias ?? [];
    return {
        cajasPorId,
        proyectosPorId,
        tercerosPorId,
        empresasPorId,
        nombreCaja: indices.nombreCaja ?? ((id, vacio = '') => cajasPorId.get(id)?.nombre ?? vacio),
        nombreProyecto: indices.nombreProyecto ?? ((id, vacio = '') => proyectosPorId.get(id)?.nombre ?? vacio),
        nombreTercero: indices.nombreTercero ?? ((id, vacio = '') => tercerosPorId.get(id)?.nombre ?? vacio),
        nombreEmpresa: indices.nombreEmpresa ?? ((id, vacio = '') => empresasPorId.get(id)?.nombre ?? vacio),
        // Invariante 5: transacciones.categoria guarda el nombre (o un UUID
        // viejo). Nunca se pinta el valor crudo.
        nombreCategoria: indices.nombreCategoria
            ?? ((valor, vacio = 'Sin categoría') => resolverNombreCategoria(valor, categorias, vacio)),
    };
}

function maxClave(a, b) {
    if (!a) return b ?? null;
    if (!b) return a;
    return b > a ? b : a;
}

/** Días de calendario entre dos claves 'YYYY-MM-DD' (sin horario de verano de por medio). */
export function diasEntre(desde, hasta) {
    const a = claveDia(desde);
    const b = claveDia(hasta);
    if (!a || !b) return null;
    const utc = (c) => Date.UTC(Number(c.slice(0, 4)), Number(c.slice(5, 7)) - 1, Number(c.slice(8, 10)));
    return Math.round((utc(b) - utc(a)) / 86400000);
}

function fraccion(parte, todo) {
    const t = aMonto(todo);
    if (esCero(t)) return null;
    return aMonto(parte) / t;
}

/** Estado de una deuda a partir de sus montos (regla única de dominio). */
function estadoDeDeuda(deuda) {
    const original = aMonto(deuda.monto_original);
    const pendiente = aMonto(deuda.monto_pendiente);
    return estadoDeuda(pendiente, original);
}

function estaPendienteDeSync(t) {
    return t.sincronizado === false || t.sincronizado === 0;
}

function nuevoAcumulado() {
    return {
        movimientos: 0,
        ingresos: 0,
        egresos: 0,
        transferenciasEntrada: 0,
        transferenciasSalida: 0,
        abonosDeuda: 0,
        ultimo: null,
        ultimoEgreso: null,
    };
}

function acumuladoDe(mapa, clave) {
    let acumulado = mapa.get(clave);
    if (!acumulado) {
        acumulado = nuevoAcumulado();
        mapa.set(clave, acumulado);
    }
    return acumulado;
}

/**
 * Una sola pasada sobre las transacciones para todos los totales que
 * necesitan los conjuntos agregados (cajas, obras, proveedores...).
 * Las transferencias no son ingreso ni gasto de la empresa (docs/REPORTES.md):
 * solo cuentan para las cajas.
 */
function resumirMovimientos(transacciones = [], idx) {
    const porCaja = new Map();
    const porProyecto = new Map();
    const porTercero = new Map();
    const porCategoria = new Map();
    const porEmpresa = new Map();

    for (const t of transacciones) {
        if (!t) continue;
        const monto = aMonto(t.monto);
        const fecha = claveDia(t.fecha);
        const tipo = t.tipo_movimiento;
        const esIngreso = tipo === TIPO_MOVIMIENTO.INGRESO;
        const esEgreso = tipo === TIPO_MOVIMIENTO.EGRESO;
        const esTransferencia = tipo === TIPO_MOVIMIENTO.TRANSFERENCIA;

        const sumarFlujo = (a) => {
            a.movimientos += 1;
            if (esIngreso) a.ingresos += monto;
            if (esEgreso) {
                a.egresos += monto;
                a.ultimoEgreso = maxClave(a.ultimoEgreso, fecha);
            }
            a.ultimo = maxClave(a.ultimo, fecha);
        };

        if (t.caja_origen_id) {
            const a = acumuladoDe(porCaja, t.caja_origen_id);
            sumarFlujo(a);
            if (esTransferencia) a.transferenciasSalida += monto;
        }
        // Invariante 7: una transferencia con destino igual al origen no
        // debería existir; si llega una, no se cuenta dos veces en la caja.
        if (esTransferencia && t.caja_destino_id && t.caja_destino_id !== t.caja_origen_id) {
            const a = acumuladoDe(porCaja, t.caja_destino_id);
            a.movimientos += 1;
            a.transferenciasEntrada += monto;
            a.ultimo = maxClave(a.ultimo, fecha);
        }
        if (t.proyecto_id) sumarFlujo(acumuladoDe(porProyecto, t.proyecto_id));
        if (t.tercero_id) {
            const a = acumuladoDe(porTercero, t.tercero_id);
            sumarFlujo(a);
            if (esEgreso && tipoDeMovimientoDeDeuda(t) === 'abono_tercero') a.abonosDeuda += monto;
        }
        sumarFlujo(acumuladoDe(porCategoria, idx.nombreCategoria(t.categoria)));
        const empresaId = empresaDeMovimiento(t, idx);
        if (empresaId) sumarFlujo(acumuladoDe(porEmpresa, empresaId));
    }
    return { porCaja, porProyecto, porTercero, porCategoria, porEmpresa };
}

const VACIO = Object.freeze(nuevoAcumulado());

/** Campos comunes de las dos clases de deuda. */
function camposDeDeuda(deuda, fechaCampo, hoy) {
    const original = aMonto(deuda.monto_original);
    const pendiente = aMonto(deuda.monto_pendiente);
    const abonado = restarMontos(original, pendiente);
    const estado = estadoDeDeuda(deuda);
    const fecha = claveDia(deuda[fechaCampo]);
    const pagos = Array.isArray(deuda.pagos) ? deuda.pagos : [];
    let ultimoAbono = null;
    for (const pago of pagos) ultimoAbono = maxClave(ultimoAbono, claveDia(pago?.fecha));
    return {
        fecha,
        monto_original: original,
        abonado,
        monto_pendiente: pendiente,
        avance: fraccion(abonado, original),
        estado: ETIQUETA_ESTADO_DEUDA[estado] ?? estado,
        // La antigüedad solo tiene sentido mientras se debe algo: una deuda
        // pagada no "envejece".
        antiguedad_dias: estado === 'PAGADA' || !fecha ? null : diasEntre(fecha, hoy),
        abonos: pagos.length,
        ultimo_abono: ultimoAbono,
        usuario: deuda.usuario_nombre ?? '',
        creado: deuda.created_at ?? null,
    };
}

// ---------------------------------------------------------------------------
// Conjuntos
// ---------------------------------------------------------------------------

const movimientos = {
    id: 'movimientos',
    etiqueta: 'Movimientos',
    descripcion: 'Cada ingreso, egreso y transferencia, con su caja, obra y proveedor.',
    campoFecha: 'fecha',
    camposSeleccion: ['monto', 'neto'],
    resumenPorDefecto: {
        filas: ['categoria'],
        columnas: 'tipo',
        valor: { campo: 'monto', agregacion: 'suma' },
    },
    columnas: [
        col('fecha', 'Fecha', 'fecha', { ancho: 120, orden: 'desc' }),
        // 160: la marca más «Transferencia» no cabía en 140 y se cortaba.
        col('tipo', 'Tipo', 'texto', { ancho: 160 }),
        col('descripcion', 'Descripción', 'texto', { ancho: 240 }),
        col('monto', 'Monto', 'dinero', { ancho: 140 }),
        col('ingreso', 'Ingreso', 'dinero', { visible: false, ancho: 140 }),
        col('egreso', 'Egreso', 'dinero', { visible: false, ancho: 140 }),
        col('neto', 'Neto', 'dinero', { visible: false, ancho: 140 }),
        col('categoria', 'Categoría', 'texto', { ancho: 160 }),
        col('obra', 'Obra', 'texto', { ancho: 170 }),
        col('empresa', 'Empresa', 'texto', { visible: false, ancho: 160 }),
        col('caja', 'Caja', 'texto', { ancho: 150 }),
        col('caja_destino', 'Caja destino', 'texto', { ancho: 150 }),
        col('proveedor', 'Proveedor', 'texto', { ancho: 170 }),
        col('tipo_tercero', 'Tipo de tercero', 'texto', { visible: false, ancho: 140 }),
        col('usuario', 'Registró', 'texto', { ancho: 140 }),
        col('editado_por', 'Editó', 'texto', { visible: false, ancho: 140 }),
        col('es_deuda', 'De una deuda', 'booleano', { visible: false, ancho: 130 }),
        col('sincronizado', 'Sincronizado', 'texto', { ancho: 130 }),
        col('soporte', 'Soporte', 'booleano', { visible: false, ancho: 110 }),
        col('creado', 'Registrado el', 'fechaHora', { visible: false, ancho: 170 }),
        col('actualizado', 'Modificado el', 'fechaHora', { visible: false, ancho: 170 }),
    ],
    construirFilas(datos = {}, indices = datos) {
        const idx = prepararIndices(datos, indices);
        const cacheCategoria = new Map();
        const categoria = (valor) => {
            if (!cacheCategoria.has(valor)) cacheCategoria.set(valor, idx.nombreCategoria(valor));
            return cacheCategoria.get(valor);
        };
        return (datos.transacciones ?? []).filter(Boolean).map((t) => {
            const monto = aMonto(t.monto);
            const tipo = t.tipo_movimiento;
            // Vacío (null) y no 0 donde el campo no aplica: con 0, el
            // promedio y el mínimo de egreso de la tabla dinámica contaban
            // los ingresos y las transferencias como egresos de $0. Las
            // sumas no cambian (aMonto(null) es 0) y la celda se ve vacía.
            const ingreso = tipo === TIPO_MOVIMIENTO.INGRESO ? monto : null;
            const egreso = tipo === TIPO_MOVIMIENTO.EGRESO ? monto : null;
            // Una transferencia no es ingreso ni egreso de la empresa: su
            // neto queda vacío para no bajar el promedio del neto.
            const neto = ingreso === null && egreso === null ? null : restarMontos(ingreso ?? 0, egreso ?? 0);
            const tercero = idx.tercerosPorId.get(t.tercero_id);
            return {
                id: String(t.id),
                fecha: claveDia(t.fecha),
                tipo: ETIQUETA_TIPO_MOVIMIENTO[tipo] ?? (tipo || ''),
                descripcion: t.descripcion ?? '',
                monto,
                ingreso,
                egreso,
                neto,
                categoria: categoria(t.categoria),
                obra: idx.nombreProyecto(t.proyecto_id),
                empresa: idx.nombreEmpresa(empresaDeMovimiento(t, idx)),
                caja: idx.nombreCaja(t.caja_origen_id),
                caja_destino: tipo === TIPO_MOVIMIENTO.TRANSFERENCIA ? idx.nombreCaja(t.caja_destino_id) : '',
                proveedor: tercero?.nombre ?? '',
                tipo_tercero: tercero?.tipo ?? '',
                usuario: t.usuario_nombre ?? '',
                editado_por: t.editado_por ?? '',
                es_deuda: esMovimientoDeDeuda(t),
                sincronizado: estaPendienteDeSync(t) ? 'Pendiente' : 'Sí',
                soporte: Boolean(t.soporte_url),
                creado: t.created_at ?? null,
                actualizado: t.updated_at ?? null,
                // Fuera de las columnas a propósito: la URL del bucket público
                // no se exporta a CSV/Excel (C16); solo sirve para ver la foto.
                _soporteUrl: t.soporte_url || null,
            };
        });
    },
};

const cajas = {
    id: 'cajas',
    etiqueta: 'Cajas',
    descripcion: 'Saldo de cada caja y lo que entró y salió por ella.',
    campoFecha: null,
    camposSeleccion: ['saldo_actual'],
    resumenPorDefecto: {
        filas: ['empresa'],
        columnas: 'tipo',
        valor: { campo: 'saldo_actual', agregacion: 'suma' },
    },
    columnas: [
        col('nombre', 'Caja', 'texto', { ancho: 180, orden: 'asc' }),
        col('tipo', 'Tipo', 'texto', { ancho: 110 }),
        col('empresa', 'Empresa', 'texto', { ancho: 170 }),
        col('banco', 'Banco', 'texto', { ancho: 140 }),
        col('numero_cuenta', 'Número de cuenta', 'texto', { ancho: 160, agrupable: false }),
        col('saldo_actual', 'Saldo actual', 'dinero', { ancho: 150 }),
        col('ingresos', 'Ingresos', 'dinero', { ancho: 140 }),
        col('egresos', 'Egresos', 'dinero', { ancho: 140 }),
        col('transferencias_entrada', 'Transferencias recibidas', 'dinero', { ancho: 170 }),
        col('transferencias_salida', 'Transferencias enviadas', 'dinero', { ancho: 170 }),
        col('saldo_movimientos', 'Saldo según movimientos', 'dinero', { visible: false, ancho: 180 }),
        col('diferencia', 'Diferencia de saldo', 'dinero', { visible: false, ancho: 160 }),
        col('movimientos', 'Movimientos', 'numero', { ancho: 120 }),
        col('ultimo_movimiento', 'Último movimiento', 'fecha', { ancho: 150 }),
    ],
    construirFilas(datos = {}, indices = datos) {
        const idx = prepararIndices(datos, indices);
        const { porCaja } = resumirMovimientos(datos.transacciones, idx);
        return (datos.cajas ?? []).filter(Boolean).map((c) => {
            const a = porCaja.get(c.id) ?? VACIO;
            const saldo = aMonto(c.saldo_actual);
            // Saldo según docs/DOMINIO.md. Si no coincide con saldo_actual, la
            // caja tiene una apertura escrita a mano o derivó entre
            // dispositivos (deuda conocida, ADR-002): conviene verlo.
            const saldoMovimientos = redondearMonto(
                a.ingresos - a.egresos - a.transferenciasSalida + a.transferenciasEntrada
            );
            return {
                id: String(c.id),
                nombre: c.nombre ?? '',
                tipo: c.tipo ?? '',
                empresa: idx.nombreEmpresa(c.empresa_id),
                banco: c.banco_nombre ?? '',
                numero_cuenta: c.numero_cuenta ?? '',
                saldo_actual: saldo,
                ingresos: redondearMonto(a.ingresos),
                egresos: redondearMonto(a.egresos),
                transferencias_entrada: redondearMonto(a.transferenciasEntrada),
                transferencias_salida: redondearMonto(a.transferenciasSalida),
                saldo_movimientos: saldoMovimientos,
                diferencia: restarMontos(saldo, saldoMovimientos),
                movimientos: a.movimientos,
                ultimo_movimiento: a.ultimo,
            };
        });
    },
};

const obras = {
    id: 'obras',
    etiqueta: 'Obras',
    descripcion: 'Presupuesto contra lo gastado en cada obra.',
    campoFecha: null,
    camposSeleccion: ['gastado'],
    resumenPorDefecto: {
        filas: ['empresa'],
        columnas: 'estado',
        valor: { campo: 'gastado', agregacion: 'suma' },
    },
    columnas: [
        col('nombre', 'Obra', 'texto', { ancho: 200, orden: 'asc' }),
        col('empresa', 'Empresa', 'texto', { ancho: 170 }),
        col('estado', 'Estado', 'texto', { ancho: 120 }),
        col('presupuesto', 'Presupuesto', 'dinero', { ancho: 150 }),
        col('gastado', 'Gastado', 'dinero', { ancho: 150 }),
        col('ingresos', 'Ingresos', 'dinero', { ancho: 140 }),
        col('disponible', 'Disponible', 'dinero', { ancho: 150 }),
        col('ejecucion', 'Ejecución', 'porcentaje', { ancho: 120 }),
        col('por_pagar', 'Por pagar a proveedores', 'dinero', { visible: false, ancho: 180 }),
        col('movimientos', 'Movimientos', 'numero', { ancho: 120 }),
        col('fecha_inicio', 'Inicio', 'fecha', { ancho: 120 }),
        col('fecha_fin', 'Fin', 'fecha', { ancho: 120 }),
        col('ultimo_movimiento', 'Último movimiento', 'fecha', { ancho: 150 }),
        col('descripcion', 'Descripción', 'texto', { visible: false, ancho: 220, agrupable: false }),
    ],
    construirFilas(datos = {}, indices = datos) {
        const idx = prepararIndices(datos, indices);
        const { porProyecto } = resumirMovimientos(datos.transacciones, idx);
        const porPagar = new Map();
        for (const d of datos.deudasTerceros ?? []) {
            if (!d?.proyecto_id) continue;
            porPagar.set(d.proyecto_id, (porPagar.get(d.proyecto_id) ?? 0) + aMonto(d.monto_pendiente));
        }
        return (datos.proyectos ?? []).filter(Boolean).map((p) => {
            const a = porProyecto.get(p.id) ?? VACIO;
            const presupuesto = aMonto(p.presupuesto_estimado);
            const gastado = redondearMonto(a.egresos);
            return {
                id: String(p.id),
                nombre: p.nombre ?? '',
                empresa: idx.nombreEmpresa(p.empresa_id),
                estado: p.estado ?? '',
                presupuesto,
                gastado,
                ingresos: redondearMonto(a.ingresos),
                // Sin presupuesto no hay disponible ni ejecución que medir: un
                // "disponible" negativo igual a todo lo gastado confundía.
                disponible: presupuesto > 0 ? restarMontos(presupuesto, gastado) : null,
                ejecucion: presupuesto > 0 ? gastado / presupuesto : null,
                por_pagar: redondearMonto(porPagar.get(p.id) ?? 0),
                movimientos: a.movimientos,
                fecha_inicio: claveDia(p.fecha_inicio),
                fecha_fin: claveDia(p.fecha_fin),
                ultimo_movimiento: a.ultimo,
                descripcion: p.descripcion ?? '',
            };
        });
    },
};

const proveedores = {
    id: 'proveedores',
    etiqueta: 'Proveedores',
    descripcion: 'Lo pagado a cada proveedor, empleado o contratista y lo que se le debe.',
    campoFecha: null,
    camposSeleccion: ['total_pagado', 'deuda_pendiente'],
    resumenPorDefecto: {
        filas: ['tipo'],
        columnas: null,
        valor: { campo: 'total_pagado', agregacion: 'suma' },
    },
    // total_pagado sale de las transacciones (EGRESO con ese tercero), que es
    // la plata que de verdad salió de una caja. Los abonos a deudas ya son
    // EGRESOS "Pago Deuda" con el tercero, así que NO se suman además los
    // `pagos` guardados en la deuda: cada peso se cuenta una sola vez.
    // pagos_directos y abonos_deuda separan las dos partes de ese total.
    columnas: [
        col('nombre', 'Nombre', 'texto', { ancho: 200, orden: 'asc' }),
        col('tipo', 'Tipo', 'texto', { ancho: 120 }),
        col('nit_cedula', 'NIT / cédula', 'texto', { ancho: 140, agrupable: false }),
        col('telefono', 'Teléfono', 'texto', { ancho: 130, agrupable: false }),
        col('email', 'Correo', 'texto', { visible: false, ancho: 190, agrupable: false }),
        col('direccion', 'Dirección', 'texto', { visible: false, ancho: 200, agrupable: false }),
        col('total_pagado', 'Total pagado', 'dinero', { ancho: 150 }),
        col('pagos_directos', 'Pagos directos', 'dinero', { visible: false, ancho: 150 }),
        col('abonos_deuda', 'Abonos a deudas', 'dinero', { visible: false, ancho: 150 }),
        col('deuda_original', 'Deuda original', 'dinero', { ancho: 150 }),
        col('deuda_pendiente', 'Deuda pendiente', 'dinero', { ancho: 150 }),
        col('compras', 'Compras (contado y crédito)', 'dinero', { visible: false, ancho: 190 }),
        col('deudas_abiertas', 'Deudas abiertas', 'numero', { ancho: 130 }),
        col('movimientos', 'Movimientos', 'numero', { ancho: 120 }),
        col('ultimo_pago', 'Último pago', 'fecha', { ancho: 130 }),
    ],
    construirFilas(datos = {}, indices = datos) {
        const idx = prepararIndices(datos, indices);
        const { porTercero } = resumirMovimientos(datos.transacciones, idx);
        const deudas = new Map();
        for (const d of datos.deudasTerceros ?? []) {
            if (!d?.tercero_id) continue;
            const acumulado = deudas.get(d.tercero_id) ?? { original: 0, pendiente: 0, abiertas: 0 };
            acumulado.original += aMonto(d.monto_original);
            acumulado.pendiente += aMonto(d.monto_pendiente);
            if (estadoDeDeuda(d) !== 'PAGADA') acumulado.abiertas += 1;
            deudas.set(d.tercero_id, acumulado);
        }
        return (datos.terceros ?? []).filter(Boolean).map((t) => {
            const a = porTercero.get(t.id) ?? VACIO;
            const d = deudas.get(t.id) ?? { original: 0, pendiente: 0, abiertas: 0 };
            const totalPagado = redondearMonto(a.egresos);
            const pagosDirectos = restarMontos(a.egresos, a.abonosDeuda);
            return {
                id: String(t.id),
                nombre: t.nombre ?? '',
                tipo: t.tipo ?? '',
                nit_cedula: t.nit_cedula ?? '',
                telefono: t.telefono ?? '',
                email: t.email ?? '',
                direccion: t.direccion ?? '',
                total_pagado: totalPagado,
                pagos_directos: pagosDirectos,
                abonos_deuda: redondearMonto(a.abonosDeuda),
                deuda_original: redondearMonto(d.original),
                deuda_pendiente: redondearMonto(d.pendiente),
                compras: redondearMonto(pagosDirectos + d.original),
                deudas_abiertas: d.abiertas,
                movimientos: a.movimientos,
                ultimo_pago: a.ultimoEgreso,
            };
        });
    },
};

const deudasTerceros = {
    id: 'deudas_terceros',
    etiqueta: 'Deudas a proveedores',
    descripcion: 'Cuentas por pagar: original, abonado, pendiente y antigüedad.',
    campoFecha: 'fecha',
    camposSeleccion: ['monto_pendiente'],
    resumenPorDefecto: {
        filas: ['proveedor'],
        columnas: 'estado',
        valor: { campo: 'monto_pendiente', agregacion: 'suma' },
    },
    columnas: [
        col('proveedor', 'Proveedor', 'texto', { ancho: 190 }),
        col('descripcion', 'Descripción', 'texto', { ancho: 220 }),
        col('obra', 'Obra', 'texto', { ancho: 170 }),
        col('empresa', 'Empresa', 'texto', { ancho: 160 }),
        col('fecha', 'Fecha', 'fecha', { ancho: 120, orden: 'desc' }),
        col('monto_original', 'Monto original', 'dinero', { ancho: 150 }),
        col('abonado', 'Abonado', 'dinero', { ancho: 140 }),
        col('monto_pendiente', 'Pendiente', 'dinero', { ancho: 140 }),
        col('avance', 'Avance', 'porcentaje', { ancho: 110 }),
        col('estado', 'Estado', 'texto', { ancho: 120 }),
        col('antiguedad_dias', 'Antigüedad (días)', 'numero', { ancho: 150, total: null }),
        col('abonos', 'Abonos', 'numero', { visible: false, ancho: 100 }),
        col('ultimo_abono', 'Último abono', 'fecha', { visible: false, ancho: 130 }),
        col('usuario', 'Registró', 'texto', { visible: false, ancho: 140 }),
        col('creado', 'Registrada el', 'fechaHora', { visible: false, ancho: 170 }),
    ],
    construirFilas(datos = {}, indices = datos, { hoy = hoyLocal() } = {}) {
        const idx = prepararIndices(datos, indices);
        return (datos.deudasTerceros ?? []).filter(Boolean).map((d) => ({
            id: String(d.id),
            proveedor: idx.nombreTercero(d.tercero_id),
            descripcion: d.descripcion ?? '',
            obra: idx.nombreProyecto(d.proyecto_id),
            empresa: idx.nombreEmpresa(d.empresa_id),
            ...camposDeDeuda(d, 'fecha_deuda', hoy),
        }));
    },
};

const prestamosCajas = {
    id: 'prestamos_cajas',
    etiqueta: 'Préstamos entre cajas',
    descripcion: 'Lo que una caja le debe a otra y cuánto se ha devuelto.',
    campoFecha: 'fecha',
    camposSeleccion: ['monto_pendiente'],
    resumenPorDefecto: {
        filas: ['caja_deudora'],
        columnas: 'estado',
        valor: { campo: 'monto_pendiente', agregacion: 'suma' },
    },
    columnas: [
        col('caja_deudora', 'Caja que debe', 'texto', { ancho: 170 }),
        col('caja_acreedora', 'Caja que prestó', 'texto', { ancho: 170 }),
        col('descripcion', 'Concepto', 'texto', { ancho: 220 }),
        col('fecha', 'Fecha', 'fecha', { ancho: 120, orden: 'desc' }),
        col('monto_original', 'Monto original', 'dinero', { ancho: 150 }),
        col('abonado', 'Devuelto', 'dinero', { ancho: 140 }),
        col('monto_pendiente', 'Pendiente', 'dinero', { ancho: 140 }),
        col('avance', 'Avance', 'porcentaje', { ancho: 110 }),
        col('estado', 'Estado', 'texto', { ancho: 120 }),
        col('antiguedad_dias', 'Antigüedad (días)', 'numero', { ancho: 150, total: null }),
        col('abonos', 'Abonos', 'numero', { visible: false, ancho: 100 }),
        col('ultimo_abono', 'Último abono', 'fecha', { visible: false, ancho: 130 }),
        col('usuario', 'Registró', 'texto', { visible: false, ancho: 140 }),
        col('creado', 'Registrado el', 'fechaHora', { visible: false, ancho: 170 }),
    ],
    construirFilas(datos = {}, indices = datos, { hoy = hoyLocal() } = {}) {
        const idx = prepararIndices(datos, indices);
        return (datos.deudasCajas ?? []).filter(Boolean).map((d) => ({
            id: String(d.id),
            caja_deudora: idx.nombreCaja(d.caja_deudora_id),
            caja_acreedora: idx.nombreCaja(d.caja_acreedora_id),
            descripcion: d.descripcion ?? '',
            ...camposDeDeuda(d, 'fecha_prestamo', hoy),
        }));
    },
};

const empresas = {
    id: 'empresas',
    etiqueta: 'Empresas',
    descripcion: 'Cajas, saldo y obras de cada empresa.',
    campoFecha: null,
    camposSeleccion: ['saldo_total'],
    resumenPorDefecto: {
        filas: ['nombre'],
        columnas: null,
        valor: { campo: 'saldo_total', agregacion: 'suma' },
    },
    columnas: [
        col('nombre', 'Empresa', 'texto', { ancho: 200, orden: 'asc' }),
        col('nit', 'NIT', 'texto', { ancho: 140, agrupable: false }),
        col('telefono', 'Teléfono', 'texto', { ancho: 130, agrupable: false }),
        col('direccion', 'Dirección', 'texto', { ancho: 200, agrupable: false }),
        col('cajas', 'Cajas', 'numero', { ancho: 100 }),
        col('saldo_total', 'Saldo en cajas', 'dinero', { ancho: 160 }),
        col('obras', 'Obras', 'numero', { ancho: 100 }),
        col('obras_activas', 'Obras activas', 'numero', { visible: false, ancho: 130 }),
        col('ingresos', 'Ingresos', 'dinero', { visible: false, ancho: 150 }),
        col('egresos', 'Egresos', 'dinero', { visible: false, ancho: 150 }),
    ],
    construirFilas(datos = {}, indices = datos) {
        const idx = prepararIndices(datos, indices);
        const { porEmpresa } = resumirMovimientos(datos.transacciones, idx);
        const cajasDe = new Map();
        for (const c of datos.cajas ?? []) {
            if (!c?.empresa_id) continue;
            const a = cajasDe.get(c.empresa_id) ?? { cajas: 0, saldo: 0 };
            a.cajas += 1;
            a.saldo += aMonto(c.saldo_actual);
            cajasDe.set(c.empresa_id, a);
        }
        const obrasDe = new Map();
        for (const p of datos.proyectos ?? []) {
            if (!p?.empresa_id) continue;
            const a = obrasDe.get(p.empresa_id) ?? { obras: 0, activas: 0 };
            a.obras += 1;
            if (p.estado === 'Activo') a.activas += 1;
            obrasDe.set(p.empresa_id, a);
        }
        return (datos.empresas ?? []).filter(Boolean).map((e) => {
            const c = cajasDe.get(e.id) ?? { cajas: 0, saldo: 0 };
            const o = obrasDe.get(e.id) ?? { obras: 0, activas: 0 };
            const m = porEmpresa.get(e.id) ?? VACIO;
            return {
                id: String(e.id),
                nombre: e.nombre ?? '',
                nit: e.nit ?? '',
                telefono: e.telefono ?? '',
                direccion: e.direccion ?? '',
                cajas: c.cajas,
                saldo_total: redondearMonto(c.saldo),
                obras: o.obras,
                obras_activas: o.activas,
                ingresos: redondearMonto(m.ingresos),
                egresos: redondearMonto(m.egresos),
            };
        });
    },
};

const categorias = {
    id: 'categorias',
    etiqueta: 'Categorías',
    descripcion: 'Cuánto entra y sale por cada categoría.',
    campoFecha: null,
    camposSeleccion: ['egresos'],
    resumenPorDefecto: {
        filas: ['tipo'],
        columnas: null,
        valor: { campo: 'egresos', agregacion: 'suma' },
    },
    columnas: [
        col('nombre', 'Categoría', 'texto', { ancho: 200, orden: 'asc' }),
        col('tipo', 'Tipo', 'texto', { ancho: 110 }),
        col('ingresos', 'Ingresos', 'dinero', { ancho: 150 }),
        col('egresos', 'Egresos', 'dinero', { ancho: 150 }),
        col('neto', 'Neto', 'dinero', { ancho: 150 }),
        col('movimientos', 'Movimientos', 'numero', { ancho: 120 }),
        col('ultimo_uso', 'Último uso', 'fecha', { ancho: 130 }),
    ],
    construirFilas(datos = {}, indices = datos) {
        const idx = prepararIndices(datos, indices);
        const { porCategoria } = resumirMovimientos(datos.transacciones, idx);
        const filas = [];
        const vistos = new Set();
        const fila = (id, nombre, tipo) => {
            const a = porCategoria.get(nombre) ?? VACIO;
            vistos.add(nombre);
            return {
                id,
                nombre,
                tipo,
                ingresos: redondearMonto(a.ingresos),
                egresos: redondearMonto(a.egresos),
                neto: restarMontos(a.ingresos, a.egresos),
                movimientos: a.movimientos,
                ultimo_uso: a.ultimo,
            };
        };
        for (const c of datos.categorias ?? []) {
            if (!c?.nombre || vistos.has(c.nombre)) continue;
            filas.push(fila(String(c.id), c.nombre, ETIQUETA_TIPO_CATEGORIA[c.tipo] ?? (c.tipo || '')));
        }
        // Categorías que aparecen en movimientos pero no están en la tabla
        // (las que escriben los paneles de deudas, "Sin categoría"...).
        for (const nombre of porCategoria.keys()) {
            if (vistos.has(nombre)) continue;
            filas.push(fila(`nombre:${nombre}`, nombre, ''));
        }
        return filas;
    },
};

export const CONJUNTOS = Object.freeze([
    movimientos,
    cajas,
    obras,
    proveedores,
    deudasTerceros,
    prestamosCajas,
    empresas,
    categorias,
]);

export const CONJUNTO_POR_DEFECTO = 'movimientos';

const CONJUNTOS_POR_ID = new Map(CONJUNTOS.map((c) => [c.id, c]));

/** Conjunto por id; si no existe, el de movimientos. */
export function conjuntoPorId(id) {
    return CONJUNTOS_POR_ID.get(id) ?? CONJUNTOS_POR_ID.get(CONJUNTO_POR_DEFECTO);
}

export function existeConjunto(id) {
    return CONJUNTOS_POR_ID.has(id);
}

/** Columna del conjunto por campo, o null. */
export function columnaDe(conjunto, campo) {
    return conjunto?.columnas.find((c) => c.campo === campo) ?? null;
}

/** Columnas visibles por defecto, en su orden. */
export function columnasVisiblesPorDefecto(conjunto) {
    return conjunto.columnas.filter((c) => c.visible);
}
