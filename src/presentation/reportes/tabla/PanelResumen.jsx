// Configuración del modo resumen: filas, columnas, valor, cómo mostrarlo,
// orden, top N, mapa de calor y gráfica. Cada cambio pasa por
// normalizarConfigResumen() en el explorador, así que aquí no se valida.
import { useId, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { dimensionesDe } from '../../../application/reportes/dimensiones';
import {
    AGREGACIONES, MOSTRAR_COMO, ORDENES, CAMPO_CONTEO, camposDeValor, esAgregacionAditiva,
} from '../../../application/reportes/resumen';

const OPCIONES_TOP = [null, 5, 10, 15, 20, 50];

function Campo({ etiqueta, children }) {
    const id = useId();
    return (
        <div className="min-w-0">
            <label htmlFor={id} className="label">{etiqueta}</label>
            {children(id)}
        </div>
    );
}

function OpcionesDimension({ dimensiones, excluir = [] }) {
    const disponibles = dimensiones.filter((d) => !excluir.includes(d.id));
    const campos = disponibles.filter((d) => !d.cronologica);
    const fechas = disponibles.filter((d) => d.cronologica);
    return (
        <>
            {campos.length > 0 && (
                <optgroup label="Campos">
                    {campos.map((d) => <option key={d.id} value={d.id}>{d.etiqueta}</option>)}
                </optgroup>
            )}
            {fechas.length > 0 && (
                <optgroup label="Por fecha">
                    {fechas.map((d) => <option key={d.id} value={d.id}>{d.etiqueta}</option>)}
                </optgroup>
            )}
        </>
    );
}

export default function PanelResumen({ conjunto, config, mapaCalor, mostrarGrafica, onCambio, onOpciones, abiertoInicial = true }) {
    const [abierto, setAbierto] = useState(abiertoInicial);
    const idPanel = useId();
    const dimensiones = dimensionesDe(conjunto);
    const [fila1, fila2 = ''] = config.filas;
    const { campo, agregacion } = config.valor;
    const esConteo = campo === CAMPO_CONTEO;
    const camposValor = camposDeValor(conjunto, agregacion === 'distintos' ? 'distintos' : 'suma');
    const aditiva = esAgregacionAditiva(config.valor);

    function cambiarValor(nuevoCampo) {
        if (nuevoCampo === CAMPO_CONTEO) {
            onCambio({ valor: { campo: CAMPO_CONTEO, agregacion: 'conteo' } });
            return;
        }
        onCambio({ valor: { campo: nuevoCampo, agregacion: esConteo ? 'suma' : agregacion } });
    }

    function cambiarAgregacion(nueva) {
        // Al salir de "valores distintos" un campo de texto ya no sirve: el
        // normalizador elige el campo numérico por defecto.
        onCambio({ valor: { campo, agregacion: nueva } });
    }

    return (
        <section className="card">
            <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left min-h-11"
                aria-expanded={abierto}
                aria-controls={idPanel}
                onClick={() => setAbierto((v) => !v)}
            >
                <span className="flex items-center gap-2">
                    <SlidersHorizontal size={16} aria-hidden="true" className="text-ink-3" />
                    <span className="panel-title">Configurar resumen</span>
                </span>
                <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`text-ink-3 transition-transform ${abierto ? 'rotate-180' : ''}`}
                />
            </button>

            {abierto && (
                <div id={idPanel} className="mt-3 space-y-4">
                    <div className="explorador-panel-resumen">
                        <Campo etiqueta="Agrupar filas por">
                            {(id) => (
                                <select
                                    id={id}
                                    className="input-field"
                                    value={fila1}
                                    onChange={(e) => onCambio({ filas: fila2 && fila2 !== e.target.value ? [e.target.value, fila2] : [e.target.value] })}
                                >
                                    <OpcionesDimension dimensiones={dimensiones} />
                                </select>
                            )}
                        </Campo>
                        <Campo etiqueta="Y luego por">
                            {(id) => (
                                <select
                                    id={id}
                                    className="input-field"
                                    value={fila2}
                                    onChange={(e) => onCambio({ filas: e.target.value ? [fila1, e.target.value] : [fila1] })}
                                >
                                    <option value="">Nada más</option>
                                    <OpcionesDimension dimensiones={dimensiones} excluir={[fila1]} />
                                </select>
                            )}
                        </Campo>
                        <Campo etiqueta="Columnas">
                            {(id) => (
                                <select
                                    id={id}
                                    className="input-field"
                                    value={config.columnas ?? ''}
                                    onChange={(e) => onCambio({ columnas: e.target.value || null })}
                                >
                                    <option value="">Sin columnas (solo total)</option>
                                    <OpcionesDimension dimensiones={dimensiones} excluir={config.filas} />
                                </select>
                            )}
                        </Campo>
                        <Campo etiqueta="Valor">
                            {(id) => (
                                <select id={id} className="input-field" value={campo} onChange={(e) => cambiarValor(e.target.value)}>
                                    <option value={CAMPO_CONTEO}>Cantidad de registros</option>
                                    {camposValor.map((c) => <option key={c.campo} value={c.campo}>{c.etiqueta}</option>)}
                                </select>
                            )}
                        </Campo>
                        <Campo etiqueta="Cálculo">
                            {(id) => (
                                <select
                                    id={id}
                                    className="input-field"
                                    value={esConteo ? 'conteo' : agregacion}
                                    disabled={esConteo}
                                    onChange={(e) => cambiarAgregacion(e.target.value)}
                                >
                                    {AGREGACIONES.map((a) => <option key={a.id} value={a.id}>{a.etiqueta}</option>)}
                                </select>
                            )}
                        </Campo>
                        <Campo etiqueta="Mostrar como">
                            {(id) => (
                                <select
                                    id={id}
                                    className="input-field"
                                    value={config.mostrarComo}
                                    onChange={(e) => onCambio({ mostrarComo: e.target.value })}
                                >
                                    {MOSTRAR_COMO.map((m) => {
                                        const necesitaColumnas = m.id === 'pct_fila' || m.id === 'pct_columna';
                                        const deshabilitada = m.id !== 'valor' && (!aditiva || (necesitaColumnas && !config.columnas));
                                        return <option key={m.id} value={m.id} disabled={deshabilitada}>{m.etiqueta}</option>;
                                    })}
                                </select>
                            )}
                        </Campo>
                        <Campo etiqueta="Ordenar">
                            {(id) => (
                                <select id={id} className="input-field" value={config.orden} onChange={(e) => onCambio({ orden: e.target.value })}>
                                    {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                                </select>
                            )}
                        </Campo>
                        <Campo etiqueta="Mostrar">
                            {(id) => (
                                <select
                                    id={id}
                                    className="input-field"
                                    value={config.top ?? ''}
                                    onChange={(e) => onCambio({ top: e.target.value ? Number(e.target.value) : null })}
                                >
                                    {OPCIONES_TOP.map((n) => (
                                        <option key={n ?? 'todos'} value={n ?? ''}>
                                            {n ? `Los ${n} mayores y "Otros"` : 'Todos los grupos'}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </Campo>
                    </div>
                    {!aditiva && (
                        <p className="text-xs text-ink-3">
                            Los porcentajes solo aplican a sumas y conteos: un promedio o un máximo no se reparte.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <label className="explorador-interruptor">
                            <input
                                type="checkbox"
                                className="explorador-casilla"
                                checked={mapaCalor}
                                onChange={(e) => onOpciones({ mapaCalor: e.target.checked })}
                            />
                            Mapa de calor
                        </label>
                        <label className="explorador-interruptor">
                            <input
                                type="checkbox"
                                className="explorador-casilla"
                                checked={mostrarGrafica}
                                onChange={(e) => onOpciones({ mostrarGrafica: e.target.checked })}
                            />
                            Gráfica
                        </label>
                    </div>
                </div>
            )}
        </section>
    );
}
