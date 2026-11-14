// Piezas de interfaz compartidas por los paneles de deudas.
import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, X } from 'lucide-react';
import useDialogo from '../../hooks/useDialogo';
import { formatoFecha, formatoFechaHora, formatoMiles, formatoMoneda, parsearMiles } from '../../presentation/formato';
import { clavePago, ESTADO_DEUDA, interpretarMontoPegado, quitarDecimales } from './reglasDeuda';

// El foco programático sobre la hoja no debe pintar el anillo de foco
// alrededor de todo el panel. Va en línea porque el :focus-visible global de
// index.css no está en una capa y gana a cualquier utilidad de Tailwind.
const SIN_ANILLO = { outline: 'none' };

/**
 * Hoja modal (abajo en el celular, centrada en escritorio). Se monta en
 * <body> para que ningún contenedor con scroll o transformación la recorte.
 * `bloqueada` impide cerrarla mientras se guarda o mientras hay una
 * confirmación encima.
 *
 * Escape, la trampa de Tab y la devolución del foco salen de useDialogo
 * (DEU-19): antes Tab se escapaba a la página de atrás. Tocar el velo no
 * cierra: un toque de más en el fondo perdía el monto y el concepto escritos,
 * porque al reabrir el formulario arranca vacío. Se cierra con la X,
 * Cancelar o Escape.
 */
export function HojaModal({ abierta, titulo, onCerrar, bloqueada = false, children }) {
    const idTitulo = useId();
    // El foco inicial va a la hoja y no al primer campo: el lector de
    // pantalla anuncia el título y el celular no abre el teclado solo por
    // abrir el formulario.
    const hojaRef = useRef(null);
    const { refDialogo: dialogoRef } = useDialogo({
        abierto: abierta,
        onCerrar,
        bloqueado: bloqueada,
        refFocoInicial: hojaRef,
    });
    const asignarHoja = useCallback((nodo) => {
        hojaRef.current = nodo;
        dialogoRef.current = nodo;
    }, [dialogoRef]);

    if (!abierta) return null;

    return createPortal(
        <div className="modal-backdrop">
            <div
                ref={asignarHoja}
                className="modal-sheet"
                style={SIN_ANILLO}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                tabIndex={-1}
            >
                <div className="panel-head">
                    <h2 id={idTitulo} className="panel-title">{titulo}</h2>
                    <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar} disabled={bloqueada}>
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>
                <div className="p-4 sm:p-5">{children}</div>
            </div>
        </div>,
        document.body
    );
}

const NOTA_CENTAVOS = 'Se quitaron los centavos: los montos se guardan en pesos enteros.';

/**
 * Campo de dinero: muestra separadores de miles y guarda solo dígitos, así
 * lo que se ve es lo que se guarda (DEU-10).
 *
 * Lo que entra de golpe (pegar, arrastrar, sugerencia del teclado) se
 * interpreta con interpretarMontoPegado, que entiende "1500000.00" y
 * "$1,500,000.00" o los rechaza. Tecla a tecla sigue con parsearMiles: el
 * "1.50" que queda al borrar un dígito de "1.500" no son centavos.
 */
export function CampoMonto({ id, etiqueta, valor, onCambio, error, ayuda, disabled = false }) {
    const idNota = `${id}-nota`;
    // Resultado del último pegado: { valor, error } o { valor, nota }. Vale
    // solo mientras el campo conserve ese valor, así que desaparece al
    // teclear o al tocar "Abonar todo lo pendiente" sin un efecto que lo limpie.
    const [avisoPegado, setAvisoPegado] = useState(null);
    const aviso = avisoPegado && avisoPegado.valor === valor ? avisoPegado : null;
    const errorVisible = aviso?.error || error;
    const notaPegado = aviso?.nota;
    const nota = errorVisible || notaPegado || ayuda;

    function aplicarPegado(texto) {
        if (!String(texto ?? '').trim()) return;
        const resultado = interpretarMontoPegado(texto);
        if (resultado.error) {
            // No se toca el monto: mejor el valor anterior que uno adivinado.
            setAvisoPegado({ valor, error: resultado.error });
            return;
        }
        setAvisoPegado(resultado.redondeado ? { valor: resultado.digitos, nota: NOTA_CENTAVOS } : null);
        onCambio(resultado.digitos);
    }

    function alEscribir(evento) {
        const nativo = evento.nativeEvent;
        const tipo = nativo?.inputType;
        const insertado = typeof nativo?.data === 'string' ? nativo.data : '';
        // La composición del teclado también trae varios caracteres en
        // `data`, pero se está tecleando: no es un pegado.
        const deGolpe = (insertado.length > 1 && tipo !== 'insertCompositionText')
            || tipo === 'insertFromPaste'
            || tipo === 'insertFromDrop'
            || tipo === 'insertReplacementText';
        if (deGolpe) {
            aplicarPegado(insertado || evento.target.value);
            return;
        }
        setAvisoPegado(null);
        onCambio(parsearMiles(quitarDecimales(evento.target.value)));
    }

    function alPegar(evento) {
        evento.preventDefault();
        aplicarPegado(evento.clipboardData?.getData('text') ?? '');
    }

    return (
        <div>
            <label htmlFor={id} className="label">{etiqueta}</label>
            <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">$</span>
                <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="input-field num"
                    style={{ paddingLeft: 28 }}
                    placeholder="0"
                    value={formatoMiles(valor)}
                    onChange={alEscribir}
                    onPaste={alPegar}
                    aria-invalid={errorVisible ? true : undefined}
                    aria-describedby={nota ? idNota : undefined}
                    disabled={disabled}
                />
            </div>
            {errorVisible ? (
                <p id={idNota} className="mt-1 text-[13px] text-neg">{errorVisible}</p>
            ) : notaPegado || ayuda ? (
                <div id={idNota} className="mt-1 text-[13px] text-ink-3">
                    {notaPegado && <p>{notaPegado}</p>}
                    {ayuda}
                </div>
            ) : null}
        </div>
    );
}

/** Select con etiqueta y error en línea. */
export function CampoSelect({ id, etiqueta, valor, onCambio, error, disabled = false, children }) {
    const idError = `${id}-error`;
    return (
        <div>
            <label htmlFor={id} className="label">{etiqueta}</label>
            <select
                id={id}
                className="input-field"
                value={valor}
                onChange={(evento) => onCambio(evento.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? idError : undefined}
                disabled={disabled}
            >
                {children}
            </select>
            {error && <p id={idError} className="mt-1 text-[13px] text-neg">{error}</p>}
        </div>
    );
}

const CHIP_ESTADO = {
    [ESTADO_DEUDA.PENDIENTE]: { clase: 'chip-warn', texto: 'Pendiente' },
    [ESTADO_DEUDA.PARCIAL]: { clase: 'chip-info', texto: 'Parcial' },
    [ESTADO_DEUDA.PAGADA]: { clase: 'chip-pos', texto: 'Pagada' },
};

/** `masculino` para préstamos ("Pagado"); por defecto, deudas ("Pagada"). */
export function ChipEstadoDeuda({ estado, masculino = false }) {
    const chip = CHIP_ESTADO[estado] ?? CHIP_ESTADO[ESTADO_DEUDA.PENDIENTE];
    const texto = masculino && estado === ESTADO_DEUDA.PAGADA ? 'Pagado' : chip.texto;
    return <span className={`chip ${chip.clase}`}>{texto}</span>;
}

/** Barra de lo abonado. */
export function MedidorAbono({ fraccion, etiqueta }) {
    const porcentaje = Math.round(Math.min(1, Math.max(0, fraccion)) * 100);
    return (
        <div
            className="meter"
            role="progressbar"
            aria-label={etiqueta}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentaje}
        >
            <span style={{ width: `${porcentaje}%`, background: 'var(--pos)' }} />
        </div>
    );
}

// pago.fecha es un instante ISO (con hora). Los abonos muy viejos pueden
// traer solo 'YYYY-MM-DD': new Date() lo leería en UTC y mostraría el día
// anterior, así que esos van por formatoFecha.
function fechaDePago(fecha) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ''))) return formatoFecha(fecha);
    return formatoFechaHora(fecha) || 'Sin fecha';
}

/** Historial de abonos, del más reciente al más antiguo. */
export function HistorialAbonos({ pagos, nombreCaja }) {
    const lista = [...pagos].reverse();
    return (
        <div>
            <p className="eyebrow mb-1.5">Abonos ({lista.length})</p>
            <ul className="ledger">
                {lista.map((pago, indice) => {
                    const detalle = [
                        pago.caja_id && nombreCaja ? nombreCaja(pago.caja_id) : null,
                        pago.descripcion && pago.descripcion !== 'Abono' ? pago.descripcion : null,
                        pago.usuario_nombre || null,
                    ].filter(Boolean).join(' · ');
                    return (
                        <li key={`${clavePago(pago)}-${indice}`} className="flex items-start justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                                <p className="num text-[14px] text-ink">{fechaDePago(pago.fecha)}</p>
                                {detalle && <p className="truncate text-[12px] text-ink-3">{detalle}</p>}
                            </div>
                            <p className="amount shrink-0 text-[14px] text-pos">{formatoMoneda(pago.monto)}</p>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/**
 * Aviso en línea. La región aria-live existe siempre para que el lector de
 * pantalla anuncie el mensaje cuando aparece.
 */
export function AvisoEnLinea({ aviso, onCerrar }) {
    const esError = aviso?.tipo === 'error';
    return (
        <div aria-live="polite" aria-atomic="true">
            {aviso && (
                <div
                    role={esError ? 'alert' : 'status'}
                    className={`flex items-start gap-2 rounded-md px-3 py-2 text-[14px] ${esError ? 'bg-neg-soft text-neg' : 'bg-pos-soft text-pos'}`}
                >
                    {esError
                        ? <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                        : <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
                    <p className="flex-1">{aviso.texto}</p>
                    <button type="button" className="btn-icon -my-2.5 -mr-2.5 shrink-0" aria-label="Cerrar aviso" onClick={onCerrar}>
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Franja de indicadores con el aspecto de .kpi-strip. Se arma con utilidades
 * porque .kpi-strip reparte columnas con auto-fit y, dentro de un panel
 * angosto, cortaba las cifras con puntos suspensivos.
 */
export function FranjaKpi({ children }) {
    return (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line min-[480px]:grid-cols-2">
            {children}
        </div>
    );
}

export function Kpi({ etiqueta, valor, meta, marca, colorValor }) {
    return (
        <div className="kpi">
            <p className="kpi-label">
                <span className="stat-mark" style={{ '--stat-color': marca }} aria-hidden="true" />
                {etiqueta}
            </p>
            <p className="kpi-value amount" style={colorValor ? { color: colorValor } : undefined} title={valor}>{valor}</p>
            {meta && <p className="kpi-meta">{meta}</p>}
        </div>
    );
}
