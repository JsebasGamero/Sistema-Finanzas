// Ejecución de obras: presupuesto contra lo gastado. Puro (calculos.test.js).
import { aMonto, esCero, redondearMonto, restarMontos } from '../../../domain/value-objects/dinero';
import { claveDia, enRango } from '../../../domain/value-objects/fecha';
import { TIPO_MOVIMIENTO } from '../../../domain/value-objects/tipoMovimiento';
import { compararTexto, crearComparador } from '../comunes/calculosComunes';

const recientesPrimero = crearComparador('fecha_desc');

/**
 * Resumen por obra.
 *
 * El presupuesto es de toda la obra, no de un periodo: comparar el gasto de
 * "este mes" contra el presupuesto total diría que la obra va al 3 % cuando
 * va al 90 %. Por eso `ejecutado` es el egreso acumulado hasta el fin del
 * periodo, y el periodo se reporta aparte (`egresosPeriodo`, categorías y
 * movimientos).
 *
 * @param {{ transacciones: object[], proyectos: object[], cajasPorId?: Map }} datos
 * @param {{ desde?: string, hasta?: string, empresaId?: string, proyectoId?: string, estado?: string }} filtro
 * @param {(valor: string) => string} nombreCategoria resolutor (invariante 5)
 */
export function resumenObras(datos, filtro = {}, nombreCategoria = (v) => v || 'Sin categoría') {
    const { desde = '', hasta = '', empresaId = '', proyectoId = '', estado = '' } = filtro;
    const filas = new Map();

    for (const p of datos.proyectos) {
        if (empresaId && p.empresa_id !== empresaId) continue;
        if (proyectoId && p.id !== proyectoId) continue;
        if (estado && p.estado !== estado) continue;
        filas.set(p.id, {
            id: p.id,
            nombre: p.nombre || 'Obra sin nombre',
            estado: p.estado || '',
            empresaId: p.empresa_id || '',
            presupuesto: aMonto(p.presupuesto_estimado),
            ejecutado: 0,
            egresosPeriodo: 0,
            ingresosPeriodo: 0,
            porCategoria: new Map(),
            movimientos: [],
        });
    }

    // Egresos sin obra: gastos generales que no caen en ninguna fila. Solo
    // tienen sentido cuando no se está mirando una obra o un estado concreto.
    const contarSinObra = !proyectoId && !estado;
    let sinObra = 0;

    for (const tx of datos.transacciones) {
        const tipo = tx.tipo_movimiento;
        if (tipo !== TIPO_MOVIMIENTO.INGRESO && tipo !== TIPO_MOVIMIENTO.EGRESO) continue;
        const dia = claveDia(tx.fecha);
        const enPeriodo = enRango(dia, desde, hasta);
        const monto = aMonto(tx.monto);

        if (!tx.proyecto_id) {
            if (contarSinObra && enPeriodo && tipo === TIPO_MOVIMIENTO.EGRESO) {
                const empresaCaja = datos.cajasPorId?.get(tx.caja_origen_id)?.empresa_id;
                if (!empresaId || empresaCaja === empresaId) sinObra += monto;
            }
            continue;
        }

        const fila = filas.get(tx.proyecto_id);
        if (!fila) continue;

        if (tipo === TIPO_MOVIMIENTO.EGRESO) {
            if (enRango(dia, '', hasta)) fila.ejecutado += monto;
            if (enPeriodo) {
                fila.egresosPeriodo += monto;
                const categoria = nombreCategoria(tx.categoria);
                fila.porCategoria.set(categoria, (fila.porCategoria.get(categoria) ?? 0) + monto);
            }
        } else if (enPeriodo) {
            fila.ingresosPeriodo += monto;
        }
        if (enPeriodo) fila.movimientos.push(tx);
    }

    const resultado = [...filas.values()].map(({ porCategoria, ...fila }) => {
        const tienePresupuesto = fila.presupuesto > 0 && !esCero(fila.presupuesto);
        const disponible = restarMontos(fila.presupuesto, fila.ejecutado);
        return {
            ...fila,
            fraccion: tienePresupuesto ? fila.ejecutado / fila.presupuesto : null,
            disponible,
            excedida: tienePresupuesto && disponible < 0,
            categorias: [...porCategoria]
                .map(([nombre, monto]) => ({
                    nombre,
                    monto,
                    fraccion: fila.egresosPeriodo > 0 ? monto / fila.egresosPeriodo : 0,
                }))
                .sort((a, b) => b.monto - a.monto || compararTexto(a.nombre, b.nombre)),
            movimientos: fila.movimientos.sort(recientesPrimero),
        };
    });

    const totales = { presupuesto: 0, ejecutado: 0, egresosPeriodo: 0, ingresosPeriodo: 0, disponible: 0, conPresupuesto: 0 };
    for (const f of resultado) {
        totales.presupuesto += f.presupuesto;
        totales.ejecutado += f.ejecutado;
        totales.egresosPeriodo += f.egresosPeriodo;
        totales.ingresosPeriodo += f.ingresosPeriodo;
        // El disponible se suma solo con las obras que tienen presupuesto: el
        // gasto de una obra sin presupuesto no consume el de las demás, y
        // restarlo del total daba un disponible negativo que no existe. Así
        // cuadra con el explorador (application/reportes/indicadores.js).
        if (f.fraccion !== null) {
            totales.disponible += f.disponible;
            totales.conPresupuesto += 1;
        }
    }
    totales.disponible = redondearMonto(totales.disponible);

    return { filas: resultado, sinObra, totales };
}

/**
 * Orden por % de ejecución: primero las obras con presupuesto (las más
 * ejecutadas arriba), después las que no tienen presupuesto, por gasto.
 */
export function ordenarPorEjecucion(filas) {
    return [...filas].sort((a, b) => {
        const aTiene = a.fraccion !== null;
        const bTiene = b.fraccion !== null;
        if (aTiene !== bTiene) return aTiene ? -1 : 1;
        if (aTiene && b.fraccion !== a.fraccion) return b.fraccion - a.fraccion;
        if (b.ejecutado !== a.ejecutado) return b.ejecutado - a.ejecutado;
        return compararTexto(a.nombre, b.nombre);
    });
}
