import FiltroPeriodo from '../comunes/FiltroPeriodo';
import CampoSelect from '../comunes/CampoSelect';
import { TIPOS } from './calculos';

/**
 * Panel plegable de filtros de Movimientos. Todos los filtros se aplican de
 * verdad a la lista, a los totales y al PDF.
 */
export default function FiltrosMovimientos({ id, periodo, onPeriodo, filtros, onFiltro, opciones, onLimpiar, hayFiltros }) {
    return (
        <div id={id} className="card space-y-4" role="group" aria-label="Filtros de movimientos">
            <div>
                <p className="label" id={`${id}-tipo`}>Tipo</p>
                <div className="segmented" role="group" aria-labelledby={`${id}-tipo`}>
                    <button type="button" aria-pressed={!filtros.tipo} onClick={() => onFiltro('tipo', '')}>Todos</button>
                    {TIPOS.map((t) => (
                        <button key={t.id} type="button" aria-pressed={filtros.tipo === t.id} onClick={() => onFiltro('tipo', t.id)}>
                            {t.etiqueta}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
                <FiltroPeriodo id={`${id}-periodo`} valor={periodo} onCambiar={onPeriodo} enRejilla />
                <CampoSelect id={`${id}-caja`} etiqueta="Caja" valor={filtros.cajaId} onCambiar={(v) => onFiltro('cajaId', v)} opciones={opciones.cajas} todos="Todas" className="" />
                <CampoSelect id={`${id}-obra`} etiqueta="Obra" valor={filtros.proyectoId} onCambiar={(v) => onFiltro('proyectoId', v)} opciones={opciones.obras} todos="Todas" className="" />
                <CampoSelect id={`${id}-proveedor`} etiqueta="Proveedor" valor={filtros.terceroId} onCambiar={(v) => onFiltro('terceroId', v)} opciones={opciones.terceros} className="" />
                <CampoSelect id={`${id}-categoria`} etiqueta="Categoría" valor={filtros.categoria} onCambiar={(v) => onFiltro('categoria', v)} opciones={opciones.categorias} todos="Todas" className="" />
                <CampoSelect id={`${id}-usuario`} etiqueta="Registró" valor={filtros.usuario} onCambiar={(v) => onFiltro('usuario', v)} opciones={opciones.usuarios} className="" />
            </div>

            {hayFiltros && (
                <button type="button" className="btn-ghost btn-sm" onClick={onLimpiar}>
                    Quitar todos los filtros
                </button>
            )}
        </div>
    );
}
