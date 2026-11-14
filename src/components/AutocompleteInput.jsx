// Campo de texto con sugerencias y alta al vuelo ("Crear «X»").
//
// Sigue el patrón combobox de WAI-ARIA: el foco se queda en el input, la
// opción activa se anuncia con aria-activedescendant y el teclado funciona
// completo (flechas, Enter, Escape).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, Plus, X } from 'lucide-react';
import { esUUID } from '../services/categorias';

const ALTO_MAXIMO_LISTA = 264;
const ALTO_MINIMO_LISTA = 132;
const SEPARACION = 4;
// Con cientos de proveedores, pintar todas las opciones en cada tecla se nota
// en un Android de gama media. Escribir más filtra el resto.
const MAXIMO_OPCIONES = 80;

/**
 * Compara nombres como los lee una persona. Bug MOV-12: "caja menor " (el
 * espacio que deja el teclado predictivo) o "nomina" frente a "Nómina" no
 * coincidían con nada, y la única opción era crear un duplicado.
 */
function normalizar(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function limpiarNombre(texto) {
    return String(texto ?? '').trim().replace(/\s+/g, ' ');
}

export default function AutocompleteInput({
    id,
    items = [],
    value = '',
    onChange,
    onCreateNew,
    placeholder = 'Escribir o seleccionar...',
    displayKey = 'nombre',
    valueKey = 'id',
    createLabel = 'Crear',
    emptyMessage = 'Sin resultados',
    disabled = false,
    className = '',
    error = '',
    // Qué mostrar si el valor guardado ya no existe en la lista (bug MOV-13:
    // se pintaba el UUID crudo).
    etiquetaNoEncontrada = 'Elemento eliminado',
    // Avisa (texto | null) cuando queda escrito algo que no es ninguna opción,
    // para que el formulario no se envíe como si el campo estuviera vacío.
    onPendienteChange,
    ariaDescribedBy,
}) {
    const idAuto = useId();
    const idInput = id || `${idAuto}-campo`;
    const idLista = `${idInput}-lista`;
    const idError = `${idInput}-error`;
    const idOpcion = (indice) => `${idLista}-${indice}`;

    // Lo que el usuario está escribiendo. null = no está editando: el input
    // muestra la etiqueta del valor seleccionado. Se deriva en vez de
    // sincronizarse con un efecto porque varios formularios pasan `items` en
    // línea (un array nuevo en cada render) y el efecto entraba en cascada.
    const [typed, setTyped] = useState(null);
    const [abierto, setAbierto] = useState(false);
    const [resaltado, setResaltado] = useState(-1);
    const [enfocado, setEnfocado] = useState(false);
    const [creando, setCreando] = useState(false);
    const [errorCrear, setErrorCrear] = useState('');

    const inputRef = useRef(null);
    const contenedorRef = useRef(null);
    const listaRef = useRef(null);
    const creandoRef = useRef(false);
    const ultimoPendienteRef = useRef(null);
    const onPendienteRef = useRef(onPendienteChange);
    const salirRef = useRef(null);

    function etiquetaDe(valor) {
        if (!valor) return '';
        const encontrado = items.find((item) => item[valueKey] === valor)
            // Transacciones antiguas guardan el UUID de la categoría en vez
            // del nombre: se intenta también por id.
            ?? items.find((item) => item.id === valor);
        if (encontrado) return encontrado[displayKey] ?? '';
        // Catálogo todavía cargando: mejor vacío un instante que un aviso falso.
        if (items.length === 0) return '';
        // Un nombre que no está en el catálogo se puede mostrar; un UUID, nunca.
        return esUUID(valor) ? etiquetaNoEncontrada : String(valor);
    }

    const inputValue = typed ?? etiquetaDe(value);
    const consulta = typed === null ? '' : normalizar(typed);
    const coincidencia = consulta
        ? items.find((item) => normalizar(item[displayKey]) === consulta)
        : undefined;
    const filtrados = !abierto
        ? []
        : consulta
            ? items.filter((item) => normalizar(item[displayKey]).includes(consulta))
            : items;
    const visibles = filtrados.slice(0, MAXIMO_OPCIONES);
    const puedeCrear = Boolean(onCreateNew) && consulta !== '' && !coincidencia;
    const totalOpciones = visibles.length + (puedeCrear ? 1 : 0);
    const pendiente = typed !== null && consulta !== '';

    const avisoPendiente = pendiente && !enfocado && !abierto
        ? onCreateNew
            ? `«${limpiarNombre(typed)}» no está en la lista. Elige una opción o créala.`
            : `«${limpiarNombre(typed)}» no está en la lista. Elige una opción.`
        : '';
    const mensaje = error || errorCrear || avisoPendiente;
    const describedBy = [mensaje ? idError : null, ariaDescribedBy].filter(Boolean).join(' ') || undefined;

    useEffect(() => {
        onPendienteRef.current = onPendienteChange;
    });

    // Si el campo desaparece (p. ej. el proveedor al pasar a ingreso), su
    // texto pendiente ya no debe bloquear el formulario.
    useEffect(() => {
        const pendienteRef = ultimoPendienteRef;
        const avisar = onPendienteRef;
        return () => {
            if (pendienteRef.current !== null) {
                pendienteRef.current = null;
                avisar.current?.(null);
            }
        };
    }, []);

    function avisarPendiente(texto) {
        const valor = texto && normalizar(texto) ? limpiarNombre(texto) : null;
        if (valor === ultimoPendienteRef.current) return;
        ultimoPendienteRef.current = valor;
        onPendienteRef.current?.(valor);
    }

    /**
     * Al salir del campo. Bug MOV-11: antes el texto se descartaba en silencio
     * y el movimiento se guardaba sin categoría u obra. Ahora, si coincide
     * con una opción se elige; si no, se conserva y se avisa.
     */
    function salir() {
        if (!abierto && typed === null) return;
        setAbierto(false);
        setResaltado(-1);
        if (typed === null) return;
        if (!consulta) {
            setTyped(null);
            avisarPendiente(null);
            return;
        }
        if (coincidencia) {
            setTyped(null);
            onChange?.(coincidencia[valueKey]);
            avisarPendiente(null);
            return;
        }
        avisarPendiente(typed);
    }

    useEffect(() => {
        salirRef.current = salir;
    });

    // En iOS tocar un botón no le quita el foco al input, así que el blur no
    // llega: un toque fuera del campo también cuenta como salir. Va en fase
    // de captura para resolver antes del click de "Guardar".
    useEffect(() => {
        function alTocarFuera(e) {
            if (contenedorRef.current?.contains(e.target)) return;
            salirRef.current?.();
        }
        document.addEventListener('pointerdown', alTocarFuera, true);
        return () => document.removeEventListener('pointerdown', alTocarFuera, true);
    }, []);

    // Bug MOV-19: la lista era `absolute` dentro del modal con scroll y se
    // recortaba. Ahora es `fixed`, se ubica con las coordenadas del input y
    // abre hacia arriba si abajo no cabe (teclado abierto, último campo).
    useLayoutEffect(() => {
        if (!abierto) return undefined;
        const lista = listaRef.current;
        const input = inputRef.current;
        if (!lista || !input) return undefined;
        const vista = window.visualViewport;
        let cuadro = 0;

        function ubicar() {
            const r = input.getBoundingClientRect();
            const techo = vista ? vista.offsetTop : 0;
            const piso = vista ? vista.offsetTop + vista.height : window.innerHeight;
            const abajo = piso - r.bottom - SEPARACION * 2;
            const arriba = r.top - techo - SEPARACION * 2;
            const haciaArriba = abajo < ALTO_MINIMO_LISTA && arriba > abajo;
            const alto = Math.max(88, Math.min(ALTO_MAXIMO_LISTA, haciaArriba ? arriba : abajo));
            lista.style.left = `${r.left}px`;
            lista.style.width = `${r.width}px`;
            lista.style.maxHeight = `${alto}px`;
            lista.style.top = `${haciaArriba ? r.top - SEPARACION : r.bottom + SEPARACION}px`;
            lista.style.transform = haciaArriba ? 'translateY(-100%)' : '';
            // Si un ancestro tiene `transform`, `fixed` se ubica respecto a él
            // y no a la ventana: se corrige con la diferencia medida.
            const real = lista.getBoundingClientRect();
            const dx = r.left - real.left;
            const dy = haciaArriba ? r.top - SEPARACION - real.bottom : r.bottom + SEPARACION - real.top;
            if (Math.abs(dx) > 0.5) lista.style.left = `${r.left + dx}px`;
            if (Math.abs(dy) > 0.5) lista.style.top = `${parseFloat(lista.style.top) + dy}px`;
        }

        function programar(e) {
            if (e?.target === lista) return;
            cancelAnimationFrame(cuadro);
            cuadro = requestAnimationFrame(ubicar);
        }

        ubicar();
        window.addEventListener('scroll', programar, true);
        window.addEventListener('resize', programar);
        vista?.addEventListener('resize', programar);
        vista?.addEventListener('scroll', programar);
        return () => {
            cancelAnimationFrame(cuadro);
            window.removeEventListener('scroll', programar, true);
            window.removeEventListener('resize', programar);
            vista?.removeEventListener('resize', programar);
            vista?.removeEventListener('scroll', programar);
        };
    }, [abierto]);

    function alEscribir(e) {
        const texto = e.target.value;
        setTyped(texto);
        setAbierto(true);
        setResaltado(-1);
        setErrorCrear('');
        if (!texto && value) onChange?.('');
        avisarPendiente(texto);
    }

    function alEnfocar(e) {
        setEnfocado(true);
        if (disabled) return;
        setAbierto(true);
        // En escritorio, escribir reemplaza la selección actual. En táctil no:
        // la selección saca la barra de copiar encima de la lista.
        if (typed === null && value && window.matchMedia?.('(pointer: fine)')?.matches) {
            e.target.select();
        }
    }

    function alDesenfocar() {
        setEnfocado(false);
        salir();
    }

    function seleccionar(item) {
        setTyped(null);
        setAbierto(false);
        setResaltado(-1);
        setErrorCrear('');
        onChange?.(item[valueKey]);
        avisarPendiente(null);
    }

    async function crear() {
        // Un doble toque en "Crear" creaba dos registros iguales.
        if (!puedeCrear || creandoRef.current) return;
        creandoRef.current = true;
        setCreando(true);
        setErrorCrear('');
        const nombre = limpiarNombre(typed);
        try {
            const nuevo = await onCreateNew(nombre);
            if (nuevo) {
                setTyped(null);
                setAbierto(false);
                setResaltado(-1);
                onChange?.(nuevo[valueKey]);
                avisarPendiente(null);
            }
        } catch (err) {
            console.error('No se pudo crear el elemento:', err);
            setErrorCrear(`No se pudo crear «${nombre}». Intenta de nuevo.`);
        } finally {
            creandoRef.current = false;
            setCreando(false);
        }
    }

    function limpiar() {
        setTyped(null);
        setErrorCrear('');
        setResaltado(-1);
        onChange?.('');
        avisarPendiente(null);
        setAbierto(true);
        inputRef.current?.focus();
    }

    function mover(paso) {
        if (totalOpciones === 0) return;
        const siguiente = resaltado < 0
            ? (paso > 0 ? 0 : totalOpciones - 1)
            : (resaltado + paso + totalOpciones) % totalOpciones;
        setResaltado(siguiente);
        document.getElementById(idOpcion(siguiente))?.scrollIntoView({ block: 'nearest' });
    }

    function alTeclear(e) {
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                e.preventDefault();
                if (!abierto) {
                    setAbierto(true);
                    return;
                }
                mover(e.key === 'ArrowDown' ? 1 : -1);
                break;
            case 'Enter':
                if (!abierto) {
                    // Con la lista cerrada, Enter deja pasar al siguiente
                    // campo, salvo que haya texto por resolver.
                    if (pendiente) {
                        e.preventDefault();
                        salir();
                    }
                    return;
                }
                e.preventDefault();
                if (resaltado >= 0 && resaltado < visibles.length) seleccionar(visibles[resaltado]);
                else if (resaltado === visibles.length && puedeCrear) crear();
                else if (coincidencia) seleccionar(coincidencia);
                else if (consulta && visibles.length === 1) seleccionar(visibles[0]);
                else if (puedeCrear && visibles.length === 0) crear();
                break;
            case 'Escape':
                // Primero cierra la lista; con la lista cerrada, descarta lo
                // escrito. Se detiene aquí para no cerrar el modal que lo
                // contiene.
                if (abierto) {
                    e.preventDefault();
                    e.stopPropagation();
                    setAbierto(false);
                    setResaltado(-1);
                } else if (typed !== null) {
                    e.preventDefault();
                    e.stopPropagation();
                    setTyped(null);
                    avisarPendiente(null);
                }
                break;
            default:
                break;
        }
    }

    const mostrarBorrar = Boolean(inputValue) && !disabled;

    return (
        <div ref={contenedorRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    id={idInput}
                    type="text"
                    role="combobox"
                    aria-expanded={abierto}
                    aria-controls={abierto ? idLista : undefined}
                    aria-autocomplete="list"
                    aria-activedescendant={abierto && resaltado >= 0 ? idOpcion(resaltado) : undefined}
                    aria-invalid={mensaje ? true : undefined}
                    aria-describedby={describedBy}
                    value={inputValue}
                    onChange={alEscribir}
                    onFocus={alEnfocar}
                    onBlur={alDesenfocar}
                    onKeyDown={alTeclear}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="input-field"
                    style={mostrarBorrar ? { paddingRight: 44 } : undefined}
                />
                {mostrarBorrar && (
                    <button
                        type="button"
                        aria-label="Borrar"
                        // Sin esto el input pierde el foco antes del click y
                        // "salir" alcanza a resolver el texto que se va a borrar.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={limpiar}
                        className="btn-icon absolute right-0 top-1/2 -translate-y-1/2"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                )}
            </div>

            {abierto && !disabled && (
                <ul
                    ref={listaRef}
                    id={idLista}
                    role="listbox"
                    className="popover fixed z-30 overflow-y-auto py-1"
                    // El foco se queda en el input mientras se toca la lista.
                    onMouseDown={(e) => e.preventDefault()}
                >
                    {visibles.map((item, indice) => {
                        const elegido = item[valueKey] === value;
                        const activo = resaltado === indice;
                        return (
                            <li
                                key={item.id ?? item[valueKey]}
                                id={idOpcion(indice)}
                                role="option"
                                aria-selected={activo}
                                onClick={() => seleccionar(item)}
                                className={`flex cursor-pointer items-center justify-between gap-2 px-3 text-[15px] ${activo ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}
                                style={{ minHeight: 44 }}
                            >
                                <span className="truncate">{item[displayKey]}</span>
                                {elegido && (
                                    <>
                                        <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />
                                        <span className="sr-only">(elegido)</span>
                                    </>
                                )}
                            </li>
                        );
                    })}

                    {filtrados.length > visibles.length && (
                        <li role="presentation" className="px-3 py-2 text-xs text-ink-3">
                            Hay más resultados. Sigue escribiendo para filtrar.
                        </li>
                    )}

                    {visibles.length === 0 && !puedeCrear && (
                        <li role="presentation" className="px-3 py-3 text-sm text-ink-3">
                            {consulta ? 'Sin coincidencias' : emptyMessage}
                        </li>
                    )}

                    {puedeCrear && (
                        <li
                            id={idOpcion(visibles.length)}
                            role="option"
                            aria-selected={resaltado === visibles.length}
                            aria-disabled={creando || undefined}
                            onClick={crear}
                            className={`flex items-center gap-2 px-3 text-[15px] font-semibold text-ink ${visibles.length > 0 ? 'border-t border-line' : ''} ${resaltado === visibles.length ? 'bg-surface-3' : 'hover:bg-surface-2'} ${creando ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
                            style={{ minHeight: 44 }}
                        >
                            {creando ? (
                                <Loader2 size={16} className="shrink-0 animate-spin text-ink-3" aria-hidden="true" />
                            ) : (
                                <Plus size={16} className="shrink-0 text-accent" aria-hidden="true" />
                            )}
                            <span className="min-w-0 truncate">
                                {creando ? 'Creando...' : `${createLabel} «${limpiarNombre(typed)}»`}
                            </span>
                        </li>
                    )}
                </ul>
            )}

            {mensaje && (
                <p id={idError} className="mt-1.5 flex items-start gap-1.5 text-[13px] text-neg">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{mensaje}</span>
                </p>
            )}
        </div>
    );
}
