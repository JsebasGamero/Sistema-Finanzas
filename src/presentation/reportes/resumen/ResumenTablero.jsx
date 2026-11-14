import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useColoresTema } from '../../tema/useTema';
import { formatoMoneda } from '../../formato';
import { compararTexto } from '../comunes/calculosComunes';
import { crearPeriodo, describirPeriodo, rangoDePeriodo } from '../comunes/periodo';
import { useHoyLocal } from '../comunes/useHoyLocal';
import { plural } from '../comunes/texto';
import FiltroPeriodo from '../comunes/FiltroPeriodo';
import CampoSelect from '../comunes/CampoSelect';
import Kpi from '../comunes/Kpi';
import { ordenarPorEjecucion, resumenObras } from '../obras/calculos';
import {
    egresosPorCategoria, filtrarParaTablero, flujoMensual, indicadoresTablero,
    netoAcumulado, proveedoresMasPagados, saldosPorCaja,
} from './calculos';
import GraficaFlujoMensual from './graficas/GraficaFlujoMensual';
import GraficaCategorias from './graficas/GraficaCategorias';
import GraficaObras from './graficas/GraficaObras';
import GraficaSaldoCajas from './graficas/GraficaSaldoCajas';
import GraficaSaldoAcumulado from './graficas/GraficaSaldoAcumulado';
import GraficaProveedores from './graficas/GraficaProveedores';

const PERIODO_INICIAL = 'anio';

/**
 * Tablero de resumen. Un solo filtro (periodo, empresa, obra) gobierna los
 * indicadores y todas las gráficas (REP-5). Lo que no tiene historia por
 * fecha (saldo de cajas, deudas) se rotula como "actual".
 */
export default function ResumenTablero({ datos }) {
    const colores = useColoresTema();
    const [periodo, setPeriodo] = useState(() => crearPeriodo(PERIODO_INICIAL));
    const [empresaId, setEmpresaId] = useState('');
    const [proyectoId, setProyectoId] = useState('');
    const hoy = useHoyLocal();

    const filtro = useMemo(
        () => ({ ...rangoDePeriodo(periodo, hoy), empresaId, proyectoId }),
        [periodo, hoy, empresaId, proyectoId]
    );

    const opcionesEmpresa = useMemo(
        () => datos.empresas
            .map((e) => ({ valor: e.id, texto: e.nombre || 'Empresa sin nombre' }))
            .sort((a, b) => compararTexto(a.texto, b.texto)),
        [datos.empresas]
    );
    const opcionesObra = useMemo(
        () => datos.proyectos
            .filter((p) => !empresaId || p.empresa_id === empresaId)
            .map((p) => ({ valor: p.id, texto: p.nombre || 'Obra sin nombre' }))
            .sort((a, b) => compararTexto(a.texto, b.texto)),
        [datos.proyectos, empresaId]
    );

    const contexto = useMemo(() => {
        const partes = [describirPeriodo(periodo, hoy)];
        if (empresaId) partes.push(datos.nombreEmpresa(empresaId, 'Empresa sin registro'));
        if (proyectoId) partes.push(datos.nombreProyecto(proyectoId, 'Obra sin registro'));
        return partes.join(' · ');
    }, [periodo, hoy, empresaId, proyectoId, datos]);
    const contextoActual = empresaId ? `Actual · ${datos.nombreEmpresa(empresaId, 'Empresa sin registro')}` : 'Actual, no depende del periodo';

    const movimientos = useMemo(() => filtrarParaTablero(datos.transacciones, filtro, datos), [datos, filtro]);
    const kpis = useMemo(() => indicadoresTablero(datos, filtro, movimientos), [datos, filtro, movimientos]);
    const meses = useMemo(() => flujoMensual(movimientos, filtro), [movimientos, filtro]);
    const categorias = useMemo(() => egresosPorCategoria(movimientos, datos.nombreCategoria), [movimientos, datos]);
    const acumulado = useMemo(() => netoAcumulado(movimientos, filtro), [movimientos, filtro]);
    const proveedores = useMemo(() => proveedoresMasPagados(movimientos, datos.nombreTercero), [movimientos, datos]);
    const saldos = useMemo(() => saldosPorCaja(datos.cajas, { empresaId }), [datos.cajas, empresaId]);
    const obras = useMemo(
        () => ordenarPorEjecucion(
            resumenObras(datos, filtro, datos.nombreCategoria).filas.filter((o) => o.presupuesto > 0 || o.ejecutado > 0)
        ),
        [datos, filtro]
    );

    const hayFiltros = periodo.preset !== PERIODO_INICIAL || empresaId || proyectoId;

    function cambiarEmpresa(id) {
        setEmpresaId(id);
        // Una obra de otra empresa dejaría el tablero vacío sin explicación.
        if (id && proyectoId && datos.proyectosPorId.get(proyectoId)?.empresa_id !== id) setProyectoId('');
    }

    function quitarFiltros() {
        setPeriodo(crearPeriodo(PERIODO_INICIAL));
        setEmpresaId('');
        setProyectoId('');
    }

    return (
        <div className="space-y-4">
            <div className="card flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" role="group" aria-label="Filtros del resumen">
                <FiltroPeriodo id="resumen-periodo" valor={periodo} onCambiar={setPeriodo} />
                {opcionesEmpresa.length > 1 && (
                    <CampoSelect id="resumen-empresa" etiqueta="Empresa" valor={empresaId} onCambiar={cambiarEmpresa} opciones={opcionesEmpresa} todos="Todas" />
                )}
                <CampoSelect id="resumen-obra" etiqueta="Obra" valor={proyectoId} onCambiar={setProyectoId} opciones={opcionesObra} todos="Todas" />
                {hayFiltros && (
                    <button type="button" className="btn-ghost btn-sm self-start sm:self-end" onClick={quitarFiltros}>
                        <RotateCcw size={14} aria-hidden="true" />
                        Restablecer
                    </button>
                )}
            </div>

            {/* Dos franjas de tres: lo del periodo y la foto de hoy. Seis cifras en
                una sola franja quedaban a 172 px y cortaban "$ 974.130.000". */}
            <div className="kpi-strip" aria-label="Indicadores del periodo">
                <Kpi etiqueta="Ingresos" tono="pos" valor={formatoMoneda(kpis.ingresos)} meta="Del periodo" />
                <Kpi etiqueta="Egresos" tono="neg" valor={formatoMoneda(kpis.egresos)} meta="Del periodo" />
                <Kpi
                    etiqueta="Neto"
                    tono={kpis.neto < 0 ? 'neg' : 'pos'}
                    colorearValor
                    valor={formatoMoneda(kpis.neto, { signo: true })}
                    meta="Ingresos menos egresos"
                />
            </div>
            <div className="kpi-strip" aria-label="Indicadores a hoy">
                <Kpi
                    etiqueta="Saldo en cajas"
                    tono={kpis.saldoCajas < 0 ? 'neg' : 'info'}
                    colorearValor={kpis.saldoCajas < 0}
                    valor={formatoMoneda(kpis.saldoCajas)}
                    meta={proyectoId ? 'Actual, no se filtra por obra' : `Actual, ${plural(kpis.numCajas, 'caja')}`}
                />
                <Kpi
                    etiqueta="Por pagar a proveedores"
                    tono="warn"
                    valor={formatoMoneda(kpis.porPagar)}
                    meta={`A hoy, ${plural(kpis.numDeudas, 'deuda')}`}
                />
                <Kpi
                    etiqueta="Préstamos entre cajas"
                    tono="warn"
                    valor={formatoMoneda(kpis.prestamosPendientes)}
                    meta={proyectoId ? 'Pendiente a hoy, no se filtra por obra' : `Pendiente a hoy, ${plural(kpis.numPrestamos, 'préstamo')}`}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <GraficaFlujoMensual meses={meses} colores={colores} subtitulo={contexto} className="lg:col-span-2" />
                <GraficaCategorias resumen={categorias} colores={colores} subtitulo={contexto} />
                <GraficaObras obras={obras} subtitulo={`Ejecutado acumulado al cierre del periodo · ${contexto}`} />
                <GraficaSaldoAcumulado acumulado={acumulado} colores={colores} subtitulo={contexto} />
                <GraficaSaldoCajas saldos={saldos} colores={colores} subtitulo={contextoActual} />
                <GraficaProveedores resumen={proveedores} colores={colores} subtitulo={contexto} />
            </div>
            <p className="text-xs text-ink-3">
                Las transferencias entre cajas no cuentan como ingreso ni egreso. Los movimientos sin obra se atribuyen a la empresa de su caja.
            </p>
        </div>
    );
}
