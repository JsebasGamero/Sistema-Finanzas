// "Nuevo movimiento": la pantalla más usada. Se llena en obra, con el celular
// en una mano y a pleno sol, así que el monto manda, el tipo se elige con un
// toque y el botón de guardar queda siempre a la vista.
//
// Este archivo exporta además CamposMovimiento y ResumenErrores: el modal de
// edición usa exactamente los mismos controles y validaciones que el alta,
// para que las reglas no vuelvan a divergir entre las dos pantallas.
import { Fragment, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { AlertCircle, Camera, Check, ImageOff, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import { db, generateUUID } from '../services/db';
import { addToSyncQueue, processSyncQueue } from '../services/syncService';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { CATEGORIAS_POR_DEFECTO, TIPO_CATEGORIA_POR_DEFECTO, resolverNombreCategoria } from '../services/categorias';
import { registrarMovimiento } from '../app/contenedor';
import { MovimientoInvalidoError } from '../domain/errores';
import { validarMovimiento } from '../domain/rules/validarMovimiento';
import { TIPO_MOVIMIENTO } from '../domain/value-objects/tipoMovimiento';
import { hoyLocal } from '../domain/value-objects/fecha';
import { formatoFecha, formatoMiles, formatoMoneda, parsearMiles } from '../presentation/formato';
import { useAuth } from '../context/useAuth';
import useOnlineStatus from '../hooks/useOnlineStatus';
import AutocompleteInput from './AutocompleteInput';
import ConfirmModal from './ConfirmModal';
import ImagePreviewModal from './ImagePreviewModal';
import DeudaCajasPanel from './DeudaCajasPanel';
import DeudaTercerosPanel from './DeudaTercerosPanel';
import { PREFIJO_SOPORTES } from '../services/entorno';

// Egreso primero: es lo que más se registra en obra.
const TIPOS = [
    { valor: TIPO_MOVIMIENTO.EGRESO, etiqueta: 'Egreso', marca: 'E', clase: 'egreso' },
    { valor: TIPO_MOVIMIENTO.INGRESO, etiqueta: 'Ingreso', marca: 'I', clase: 'ingreso' },
    { valor: TIPO_MOVIMIENTO.TRANSFERENCIA, etiqueta: 'Transferencia', marca: 'T', clase: 'transferencia' },
];

const ETIQUETA_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.etiqueta]));

// Orden de los campos en pantalla: decide a cuál se lleva el foco cuando hay
// varios errores y en qué orden se listan en el resumen.
const ETIQUETA_CAMPO = {
    tipo_movimiento: 'Tipo',
    monto: 'Monto',
    fecha: 'Fecha',
    caja_origen_id: 'Caja',
    caja_destino_id: 'Caja destino',
    categoria: 'Categoría',
    proyecto_id: 'Obra',
    tercero_id: 'Proveedor',
    descripcion: 'Descripción',
    soporte_url: 'Soporte',
};
const ORDEN_CAMPOS = Object.keys(ETIQUETA_CAMPO);

// 13 dígitos = billones de pesos. Más que eso es un error de digitación.
const MAX_DIGITOS_MONTO = 13;

const LADO_MAXIMO_FOTO = 1600;
const CALIDAD_FOTO = 0.8;

const SIN_SENAL_ALTA = 'Sin señal no se puede subir la foto. Guarda el movimiento y agrégala después desde Editar.';

const CATALOGOS_VACIOS = Object.freeze({ empresas: [], proyectos: [], cajas: [], terceros: [], categorias: [] });

function valoresIniciales(tipo = TIPO_MOVIMIENTO.EGRESO) {
    return {
        tipo_movimiento: tipo,
        monto: '',
        fecha: hoyLocal(),
        caja_origen_id: '',
        caja_destino_id: '',
        categoria: '',
        proyecto_id: '',
        tercero_id: '',
        descripcion: '',
        soporte_url: null,
    };
}

// Igual que en AutocompleteInput: dos nombres que una persona lee igual
// ("Nómina" y "nomina ") son el mismo registro.
function normalizar(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function buscarPorNombre(lista, nombre) {
    const buscado = normalizar(nombre);
    return lista.find((fila) => normalizar(fila.nombre) === buscado) ?? null;
}

function ordenarPorNombre(lista) {
    return [...lista].sort((a, b) =>
        String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es', { sensitivity: 'base' }));
}

function mensajePendiente(texto) {
    return `«${texto}» no está en la lista. Elige una opción o créala.`;
}

function sincronizarEnSegundoPlano() {
    if (navigator.onLine) {
        processSyncQueue().catch((error) => console.error('Error de sincronización:', error));
    }
}

/**
 * Interpreta un monto pegado o insertado de golpe (portapapeles, sugerencia
 * del teclado). Bug MOV-3: antes solo se quitaban los puntos, así que
 * "1,500,000" se guardaba como $1 y "$1.500.000" como NaN. Quitar todo lo que
 * no sea dígito tampoco sirve: "1.500.000,50" daría 150.000.050.
 *
 * Acepta "$ 1.234.567", "1,234,567", "1 234 567" y una cola de centavos
 * (",50" o ".50"), que se redondea porque los montos van en pesos enteros.
 * Todo lo demás se rechaza con un mensaje, nunca se adivina.
 * @returns {{ digitos: string, redondeado: boolean } | { error: string }}
 */
function interpretarMontoPegado(texto) {
    const original = String(texto ?? '');
    const muestra = original.trim().slice(0, 24);
    const noSeReconoce = {
        error: `No se reconoce «${muestra}» como monto. Escribe solo el número, por ejemplo 1.250.000.`,
    };
    const limpio = original
        .replace(/[\s\u00a0\u202f]/g, '')
        .replace(/^COP|COP$/i, '')
        .replace(/\$/g, '');
    if (!limpio || !/^[\d.,]+$/.test(limpio)) return noSeReconoce;

    let entero = limpio;
    let centavos = 0;
    const cola = limpio.match(/^(.*\d)([.,])(\d{1,2})$/);
    if (cola) {
        // "1.500.50" no es un formato: el separador de centavos no puede ser
        // el mismo que el de miles.
        if (cola[1].includes(cola[2])) return noSeReconoce;
        entero = cola[1];
        centavos = Number(`0.${cola[3]}`);
    }
    const miles = /^\d{1,3}(\.\d{3})+$/.test(entero) || /^\d{1,3}(,\d{3})+$/.test(entero);
    if (!/^\d+$/.test(entero) && !miles) return noSeReconoce;

    const digitos = entero.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
    if (digitos.length > MAX_DIGITOS_MONTO) {
        return { error: 'El monto es demasiado grande. Revisa la cifra.' };
    }
    return { digitos: String(Math.round(Number(digitos) + centavos)), redondeado: centavos > 0 };
}

/**
 * Reduce la foto antes de subirla: una foto de celular pesa de 4 a 12 MB y en
 * obra se sube por datos móviles. A 1600 px una factura se sigue leyendo.
 * Si algo falla se sube el archivo original.
 */
async function comprimirImagen(archivo) {
    if (!/^image\/(jpeg|webp)$/i.test(archivo.type) || archivo.size < 400 * 1024) return archivo;
    const url = URL.createObjectURL(archivo);
    try {
        const imagen = await new Promise((resolver, rechazar) => {
            const img = new Image();
            img.onload = () => resolver(img);
            img.onerror = rechazar;
            img.src = url;
        });
        const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(imagen.naturalWidth, imagen.naturalHeight));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(imagen.naturalWidth * escala);
        lienzo.height = Math.round(imagen.naturalHeight * escala);
        lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
        const blob = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', CALIDAD_FOTO));
        if (!blob || blob.size >= archivo.size) return archivo;
        return new File([blob], 'soporte.jpg', { type: 'image/jpeg' });
    } catch (error) {
        console.error('No se pudo comprimir la foto; se sube la original:', error);
        return archivo;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function esErrorDeRed(error) {
    const texto = String(error?.message ?? error ?? '').toLowerCase();
    return texto.includes('failed to fetch') || texto.includes('network') || texto.includes('load failed');
}

// ---------------------------------------------------------------------------
// Piezas de formulario
// ---------------------------------------------------------------------------

function MensajeError({ id, children }) {
    return (
        <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[13px] text-neg">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{children}</span>
        </p>
    );
}

function Campo({ htmlFor, etiqueta, opcional = false, ayuda, error, children }) {
    return (
        <div>
            <label htmlFor={htmlFor} className="label">
                {etiqueta}
                {opcional && <span className="ml-1.5 font-normal text-ink-3">(opcional)</span>}
            </label>
            {children}
            {error && <MensajeError id={`${htmlFor}-error`}>{error}</MensajeError>}
            {ayuda && !error && (
                <p id={`${htmlFor}-ayuda`} className="mt-1.5 text-[13px] text-ink-3">{ayuda}</p>
            )}
        </div>
    );
}

function describirCampo(htmlFor, { error, ayuda } = {}) {
    if (error) return `${htmlFor}-error`;
    if (ayuda) return `${htmlFor}-ayuda`;
    return undefined;
}

function Seccion({ titulo, children }) {
    const idTitulo = useId();
    return (
        <section aria-labelledby={idTitulo} className="space-y-4 border-t border-line pt-5">
            <h3 id={idTitulo} className="eyebrow">{titulo}</h3>
            {children}
        </section>
    );
}

function SelectorTipo({ tipo, onCambiar, deshabilitado }) {
    return (
        <div
            className="segmented"
            role="group"
            aria-label="Tipo de movimiento"
            style={{ display: 'flex', width: '100%' }}
        >
            {TIPOS.map((t) => {
                const activo = tipo === t.valor;
                return (
                    <button
                        key={t.valor}
                        type="button"
                        aria-pressed={activo}
                        disabled={deshabilitado}
                        onClick={() => onCambiar(t.valor)}
                        className="flex-col sm:flex-row"
                        // Más alto que el segmentado normal: se toca con el
                        // pulgar. "Transferencia" toma el ancho que necesita.
                        style={{
                            flex: '1 1 auto',
                            justifyContent: 'center',
                            minHeight: 56,
                            padding: '6px 8px',
                            ...(activo ? { boxShadow: '0 0 0 1.5px var(--ink)' } : null),
                        }}
                    >
                        <span className={`tipo-mark ${t.clase}`} aria-hidden="true">{t.marca}</span>
                        <span className="text-[13px] sm:text-[15px]">{t.etiqueta}</span>
                    </button>
                );
            })}
        </div>
    );
}

function CampoMonto({ id, valor, error, onCambio, onError }) {
    const [nota, setNota] = useState('');

    function aplicarInterpretado(texto) {
        if (!String(texto ?? '').trim()) return;
        const resultado = interpretarMontoPegado(texto);
        if (resultado.error) {
            setNota('');
            onError(resultado.error);
            return;
        }
        onCambio(resultado.digitos);
        setNota(resultado.redondeado ? 'Se quitaron los centavos: los montos se guardan en pesos enteros.' : '');
    }

    function alEscribir(e) {
        const evento = e.nativeEvent;
        const insertado = typeof evento?.data === 'string' ? evento.data : '';
        // Texto que entra de golpe (sugerencia del teclado, arrastrar y
        // soltar): se interpreta igual que un pegado.
        if (insertado.length > 1 || evento?.inputType === 'insertFromDrop' || evento?.inputType === 'insertReplacementText') {
            aplicarInterpretado(insertado || e.target.value);
            return;
        }
        // Tecla a tecla: el campo muestra formatoMiles(dígitos), así que lo que
        // se ve es exactamente lo que se guarda.
        const digitos = parsearMiles(e.target.value).replace(/^0+(?=\d)/, '');
        if (digitos.length > MAX_DIGITOS_MONTO) return;
        setNota('');
        onCambio(digitos);
    }

    function alPegar(e) {
        e.preventDefault();
        aplicarInterpretado(e.clipboardData?.getData('text') ?? '');
    }

    const describe = error ? `${id}-error` : nota ? `${id}-nota` : undefined;

    return (
        <div>
            <label htmlFor={id} className="label">Monto</label>
            <div className="relative">
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[26px] font-semibold text-ink-3"
                >
                    $
                </span>
                <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder="0"
                    value={formatoMiles(valor)}
                    onChange={alEscribir}
                    onPaste={alPegar}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describe}
                    className="input-field amount"
                    // `.input-field` no es una utilidad: sus medidas solo se
                    // pisan en línea. El monto es la cifra protagonista.
                    style={{ fontSize: 32, height: 64, paddingLeft: 38, letterSpacing: '-0.02em' }}
                />
            </div>
            {error && <MensajeError id={`${id}-error`}>{error}</MensajeError>}
            {nota && !error && <p id={`${id}-nota`} className="mt-1.5 text-[13px] text-ink-3">{nota}</p>}
        </div>
    );
}

function CampoSoporte({ id, valor, onCambio, onSubiendo, usuarioId, mensajeSinSenal }) {
    const enLinea = useOnlineStatus();
    const [subiendo, setSubiendo] = useState(false);
    const [aviso, setAviso] = useState('');
    const [verFoto, setVerFoto] = useState(false);
    const [imagenFallo, setImagenFallo] = useState(false);
    const camaraRef = useRef(null);
    const archivoRef = useRef(null);
    // Cada subida lleva un número. Si el formulario se reinicia o la subida
    // se cancela, el resultado que llegue tarde se ignora (bug MOV-5: la foto
    // de un gasto quedaba pegada al siguiente movimiento).
    const subidaRef = useRef({ token: 0 });
    const onSubiendoRef = useRef(onSubiendo);
    const almacenamiento = isSupabaseConfigured();

    useEffect(() => {
        onSubiendoRef.current = onSubiendo;
    });

    useEffect(() => {
        const subida = subidaRef.current;
        const avisar = onSubiendoRef;
        return () => {
            subida.token += 1;
            avisar.current?.(false);
        };
    }, []);

    function marcarSubiendo(estado) {
        setSubiendo(estado);
        onSubiendo?.(estado);
    }

    async function subir(archivo) {
        if (!archivo) return;
        setAviso('');
        if (!navigator.onLine) {
            setAviso(mensajeSinSenal);
            return;
        }
        const token = ++subidaRef.current.token;
        marcarSubiendo(true);
        try {
            const listo = await comprimirImagen(archivo);
            const extension = listo.type === 'image/jpeg'
                ? 'jpg'
                : (archivo.name.split('.').pop() || 'jpg').toLowerCase();
            // PREFIJO_SOPORTES: con el esquema de pruebas, las fotos van bajo
            // `pruebas/` del mismo bucket y no se mezclan con las reales.
            const ruta = `${PREFIJO_SOPORTES}${usuarioId || 'anon'}/${generateUUID()}.${extension}`;
            const { error } = await supabase.storage
                .from('soportes')
                .upload(ruta, listo, { contentType: listo.type || undefined });
            if (error) throw error;
            const { data } = supabase.storage.from('soportes').getPublicUrl(ruta);
            if (token !== subidaRef.current.token) return;
            setImagenFallo(false);
            onCambio(data.publicUrl);
        } catch (error) {
            if (token !== subidaRef.current.token) return;
            console.error('No se pudo subir el soporte:', error);
            setAviso(!navigator.onLine || esErrorDeRed(error)
                ? mensajeSinSenal
                : 'No se pudo subir la foto. Intenta de nuevo.');
        } finally {
            if (token === subidaRef.current.token) marcarSubiendo(false);
        }
    }

    function alElegir(e) {
        const archivo = e.target.files?.[0];
        // Se limpia para que elegir otra vez el mismo archivo dispare onChange.
        e.target.value = '';
        subir(archivo);
    }

    function cancelarSubida() {
        subidaRef.current.token += 1;
        marcarSubiendo(false);
    }

    const idTitulo = `${id}-titulo`;
    const bloqueado = !almacenamiento || !enLinea;

    return (
        <div role="group" aria-labelledby={idTitulo}>
            <p id={idTitulo} className="label">
                Soporte
                <span className="ml-1.5 font-normal text-ink-3">(opcional)</span>
            </p>

            <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} onChange={alElegir} />
            <input ref={archivoRef} type="file" accept="image/*" className="hidden" tabIndex={-1} onChange={alElegir} />

            {subiendo ? (
                <div role="status" className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-ink-2">
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        Subiendo foto...
                    </span>
                    <button type="button" className="btn-ghost btn-sm" onClick={cancelarSubida}>
                        Cancelar
                    </button>
                </div>
            ) : valor ? (
                <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-2">
                    <button
                        type="button"
                        onClick={() => setVerFoto(true)}
                        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2"
                        aria-label="Ver la foto del soporte"
                    >
                        {imagenFallo ? (
                            <ImageOff size={20} className="text-ink-3" aria-hidden="true" />
                        ) : (
                            <img src={valor} alt="" className="h-full w-full object-cover" onError={() => setImagenFallo(true)} />
                        )}
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                            <Check size={15} className="text-pos" aria-hidden="true" />
                            Soporte adjunto
                        </p>
                        <p className="text-xs text-ink-3">Toca la imagen para verla.</p>
                    </div>
                    <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={bloqueado}
                        onClick={() => archivoRef.current?.click()}
                    >
                        Cambiar
                    </button>
                    <button
                        type="button"
                        className="btn-icon"
                        aria-label="Quitar el soporte"
                        onClick={() => { setAviso(''); onCambio(null); }}
                    >
                        <Trash2 size={18} aria-hidden="true" />
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={bloqueado}
                        onClick={() => camaraRef.current?.click()}
                    >
                        <Camera size={18} aria-hidden="true" />
                        Tomar foto
                    </button>
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={bloqueado}
                        onClick={() => archivoRef.current?.click()}
                    >
                        <ImagePlus size={18} aria-hidden="true" />
                        Elegir imagen
                    </button>
                </div>
            )}

            {!almacenamiento ? (
                <p className="mt-1.5 text-[13px] text-ink-3">
                    Este entorno no tiene almacenamiento en la nube: el soporte no se puede adjuntar.
                </p>
            ) : !enLinea && !subiendo ? (
                <p className="mt-1.5 text-[13px] text-warn">{mensajeSinSenal}</p>
            ) : aviso ? (
                <MensajeError id={`${id}-error`}>{aviso}</MensajeError>
            ) : null}

            <ImagePreviewModal
                isOpen={verFoto}
                onClose={() => setVerFoto(false)}
                imageUrl={valor}
                title="Soporte del movimiento"
            />
        </div>
    );
}

/**
 * Lista de errores arriba del botón de guardar. Cada nombre de campo lleva
 * el foco a ese campo.
 */
export function ResumenErrores({ idBase, errores = {}, errorGeneral = '' }) {
    const campos = ORDEN_CAMPOS.filter((campo) => errores[campo]);
    if (campos.length === 0 && !errorGeneral) return null;
    return (
        <div role="alert" className="mb-3 rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-sm text-neg">
            {errorGeneral && <p>{errorGeneral}</p>}
            {campos.length > 0 && (
                <p>
                    {campos.length === 1 ? 'Revisa este campo: ' : `Revisa ${campos.length} campos: `}
                    {campos.map((campo, i) => (
                        <Fragment key={campo}>
                            {i > 0 && ', '}
                            <button
                                type="button"
                                className="font-semibold underline underline-offset-2"
                                onClick={() => document.getElementById(`${idBase}-${campo}`)?.focus()}
                            >
                                {ETIQUETA_CAMPO[campo]}
                            </button>
                        </Fragment>
                    ))}
                    .
                </p>
            )}
        </div>
    );
}

/**
 * Controles de un movimiento (monto, fecha, cajas, clasificación, detalle y
 * soporte). Los usan el alta y el modal de edición.
 *
 * Por `ref` expone `validar(datos)` (errores por campo, con las reglas del
 * dominio) y `enfocarPrimero(errores)`.
 */
export function CamposMovimiento({
    ref,
    idBase,
    valores,
    onCambio,
    errores = {},
    onErrorCampo,
    onSubiendo,
    catalogos = CATALOGOS_VACIOS,
    onCatalogoCreado,
    empresaId = '',
    onEmpresa,
    usuarioId,
    mensajeSinSenalSoporte = SIN_SENAL_ALTA,
}) {
    // Texto escrito en un autocompletar que no corresponde a ninguna opción
    // (bug MOV-11: se descartaba en silencio y el gasto quedaba sin obra).
    const pendientesRef = useRef({});

    useImperativeHandle(ref, () => ({
        validar(datos) {
            const encontrados = {};
            if (!datos.fecha) encontrados.fecha = 'Elige la fecha del movimiento.';
            for (const error of validarMovimiento(datos)) {
                if (!encontrados[error.campo]) encontrados[error.campo] = error.mensaje;
            }
            for (const [campo, texto] of Object.entries(pendientesRef.current)) {
                if (texto && !encontrados[campo]) encontrados[campo] = mensajePendiente(texto);
            }
            return encontrados;
        },
        enfocarPrimero(encontrados) {
            const campo = ORDEN_CAMPOS.find((c) => encontrados?.[c]);
            if (campo) document.getElementById(`${idBase}-${campo}`)?.focus();
        },
    }), [idBase]);

    const { empresas = [], proyectos = [], cajas = [], terceros = [], categorias = [] } = catalogos;
    const tipo = valores.tipo_movimiento;
    const esTransferencia = tipo === TIPO_MOVIMIENTO.TRANSFERENCIA;
    // En el alta el proveedor solo existe en egresos (al cambiar de tipo se
    // limpia). En la edición también se muestra si un registro viejo lo
    // tiene, para que se vea y se pueda quitar (bug MOV-10).
    const mostrarProveedor = tipo === TIPO_MOVIMIENTO.EGRESO || Boolean(valores.tercero_id);
    const cajasOrigen = empresaId ? cajas.filter((c) => c.empresa_id === empresaId) : cajas;
    const cajasDestino = cajas.filter((c) => c.id !== valores.caja_origen_id);
    const idDe = (campo) => `${idBase}-${campo}`;

    function alPendiente(campo, texto) {
        pendientesRef.current[campo] = texto;
        if (!texto) onErrorCampo?.(campo, null);
    }

    async function crearCaja(nombre, ambito) {
        // Una caja con el mismo nombre en otra empresa es legítima; en el
        // mismo ámbito, es un duplicado (bug MOV-12).
        const existente = buscarPorNombre(ambito, nombre);
        if (existente) return existente;
        const nueva = {
            id: generateUUID(),
            nombre,
            tipo: 'Efectivo',
            empresa_id: empresaId || null,
            saldo_actual: 0,
            created_at: new Date().toISOString(),
        };
        await db.cajas.add(nueva);
        await addToSyncQueue('cajas', 'INSERT', nueva);
        sincronizarEnSegundoPlano();
        onCatalogoCreado?.('cajas', nueva);
        return nueva;
    }

    async function crearCategoria(nombre) {
        const existente = buscarPorNombre(categorias, nombre);
        if (existente) return existente;
        const nueva = {
            id: generateUUID(),
            nombre,
            // CHECK (tipo IN ('INGRESO','EGRESO','AMBOS')).
            tipo: TIPO_CATEGORIA_POR_DEFECTO,
            created_at: new Date().toISOString(),
        };
        await db.categorias.add(nueva);
        await addToSyncQueue('categorias', 'INSERT', nueva);
        sincronizarEnSegundoPlano();
        onCatalogoCreado?.('categorias', nueva);
        return nueva;
    }

    async function crearProyecto(nombre) {
        const existente = buscarPorNombre(proyectos, nombre);
        if (existente) return existente;
        const nuevo = {
            id: generateUUID(),
            nombre,
            empresa_id: empresaId || null,
            // CHECK (estado IN ('Activo','Pausado','Finalizado')): con 'ACTIVO'
            // el proyecto nunca subía.
            estado: 'Activo',
            presupuesto_estimado: 0,
            created_at: new Date().toISOString(),
        };
        await db.proyectos.add(nuevo);
        await addToSyncQueue('proyectos', 'INSERT', nuevo);
        sincronizarEnSegundoPlano();
        onCatalogoCreado?.('proyectos', nuevo);
        return nuevo;
    }

    async function crearTercero(nombre) {
        const existente = buscarPorNombre(terceros, nombre);
        if (existente) return existente;
        const ahora = new Date().toISOString();
        const nuevo = {
            id: generateUUID(),
            nombre,
            tipo: 'Proveedor',
            nit_cedula: '',
            telefono: '',
            created_at: ahora,
            updated_at: ahora,
        };
        await db.terceros.add(nuevo);
        await addToSyncQueue('terceros', 'INSERT', nuevo);
        sincronizarEnSegundoPlano();
        onCatalogoCreado?.('terceros', nuevo);
        return nuevo;
    }

    // Enter en un campo de texto pasa al siguiente en vez de enviar el
    // formulario (en el celular, la tecla "Ir" abría la confirmación).
    function alPresionarTecla(e) {
        if (e.key !== 'Enter' || e.defaultPrevented) return;
        const objetivo = e.target;
        if (objetivo.tagName !== 'INPUT' || ['button', 'submit', 'file', 'checkbox', 'radio'].includes(objetivo.type)) return;
        e.preventDefault();
        const campos = Array.from(e.currentTarget.querySelectorAll('input:not([type=file]):not([disabled]), select:not([disabled]), textarea:not([disabled])'));
        campos[campos.indexOf(objetivo) + 1]?.focus();
    }

    const cajaOrigen = cajas.find((c) => c.id === valores.caja_origen_id);
    const saldoOrigen = cajaOrigen ? `Saldo actual: ${formatoMoneda(cajaOrigen.saldo_actual)}` : undefined;
    const cajaDestino = cajas.find((c) => c.id === valores.caja_destino_id);
    const saldoDestino = cajaDestino ? `Saldo actual: ${formatoMoneda(cajaDestino.saldo_actual)}` : undefined;

    return (
        <div className="space-y-6" onKeyDown={alPresionarTecla}>
            <CampoMonto
                id={idDe('monto')}
                valor={valores.monto}
                error={errores.monto}
                onCambio={(monto) => onCambio({ monto })}
                onError={(mensaje) => onErrorCampo?.('monto', mensaje)}
            />

            <Seccion titulo="Fecha y caja">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Campo htmlFor={idDe('fecha')} etiqueta="Fecha" error={errores.fecha}>
                        <input
                            id={idDe('fecha')}
                            type="date"
                            className="input-field"
                            value={valores.fecha}
                            onChange={(e) => onCambio({ fecha: e.target.value })}
                            aria-invalid={errores.fecha ? true : undefined}
                            aria-describedby={describirCampo(idDe('fecha'), { error: errores.fecha })}
                        />
                    </Campo>
                    {onEmpresa && empresas.length > 1 && (
                        <Campo htmlFor={idDe('empresa')} etiqueta="Empresa" ayuda="Filtra las cajas de la lista.">
                            <select
                                id={idDe('empresa')}
                                className="input-field"
                                value={empresaId}
                                onChange={(e) => onEmpresa(e.target.value)}
                                aria-describedby={`${idDe('empresa')}-ayuda`}
                            >
                                <option value="">Todas las empresas</option>
                                {empresas.map((empresa) => (
                                    <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                                ))}
                            </select>
                        </Campo>
                    )}
                </div>

                <Campo
                    htmlFor={idDe('caja_origen_id')}
                    etiqueta={tipo === TIPO_MOVIMIENTO.INGRESO ? 'Entra a la caja' : 'Sale de la caja'}
                    ayuda={saldoOrigen}
                >
                    <AutocompleteInput
                        id={idDe('caja_origen_id')}
                        items={cajasOrigen}
                        value={valores.caja_origen_id}
                        onChange={(id) => onCambio({ caja_origen_id: id })}
                        onCreateNew={(nombre) => crearCaja(nombre, cajasOrigen)}
                        onPendienteChange={(texto) => alPendiente('caja_origen_id', texto)}
                        error={errores.caja_origen_id}
                        ariaDescribedBy={saldoOrigen ? `${idDe('caja_origen_id')}-ayuda` : undefined}
                        placeholder="Escribe o elige la caja"
                        createLabel="Crear caja"
                        emptyMessage="No hay cajas registradas"
                        etiquetaNoEncontrada="Caja eliminada"
                    />
                </Campo>

                {esTransferencia && (
                    <Campo htmlFor={idDe('caja_destino_id')} etiqueta="Entra a la caja" ayuda={saldoDestino}>
                        <AutocompleteInput
                            id={idDe('caja_destino_id')}
                            items={cajasDestino}
                            value={valores.caja_destino_id}
                            onChange={(id) => onCambio({ caja_destino_id: id })}
                            onCreateNew={(nombre) => crearCaja(nombre, cajas)}
                            onPendienteChange={(texto) => alPendiente('caja_destino_id', texto)}
                            error={errores.caja_destino_id}
                            ariaDescribedBy={saldoDestino ? `${idDe('caja_destino_id')}-ayuda` : undefined}
                            placeholder="Escribe o elige la caja destino"
                            createLabel="Crear caja"
                            emptyMessage="No hay otras cajas"
                            etiquetaNoEncontrada="Caja eliminada"
                        />
                    </Campo>
                )}
            </Seccion>

            <Seccion titulo="Clasificación">
                <Campo htmlFor={idDe('categoria')} etiqueta="Categoría" opcional>
                    <AutocompleteInput
                        id={idDe('categoria')}
                        items={categorias}
                        value={valores.categoria}
                        onChange={(categoria) => onCambio({ categoria })}
                        onCreateNew={crearCategoria}
                        onPendienteChange={(texto) => alPendiente('categoria', texto)}
                        error={errores.categoria}
                        // Se guarda el NOMBRE, no el id: la columna es TEXT y
                        // `categorias.nombre` es UNIQUE (invariante 5).
                        valueKey="nombre"
                        placeholder="Materiales, nómina, ACPM..."
                        createLabel="Crear categoría"
                        emptyMessage="No hay categorías"
                        etiquetaNoEncontrada="Sin categoría"
                    />
                </Campo>

                <Campo htmlFor={idDe('proyecto_id')} etiqueta="Obra" opcional>
                    <AutocompleteInput
                        id={idDe('proyecto_id')}
                        items={proyectos}
                        value={valores.proyecto_id}
                        onChange={(id) => onCambio({ proyecto_id: id })}
                        onCreateNew={crearProyecto}
                        onPendienteChange={(texto) => alPendiente('proyecto_id', texto)}
                        error={errores.proyecto_id}
                        placeholder="Escribe o elige la obra"
                        createLabel="Crear obra"
                        emptyMessage="No hay obras registradas"
                        etiquetaNoEncontrada="Obra eliminada"
                    />
                </Campo>

                {mostrarProveedor && (
                    <Campo htmlFor={idDe('tercero_id')} etiqueta="Proveedor o beneficiario" opcional>
                        <AutocompleteInput
                            id={idDe('tercero_id')}
                            items={terceros}
                            value={valores.tercero_id}
                            onChange={(id) => onCambio({ tercero_id: id })}
                            onCreateNew={crearTercero}
                            onPendienteChange={(texto) => alPendiente('tercero_id', texto)}
                            error={errores.tercero_id}
                            placeholder="A quién se le pagó"
                            createLabel="Crear proveedor"
                            emptyMessage="No hay proveedores registrados"
                            etiquetaNoEncontrada="Proveedor eliminado"
                        />
                    </Campo>
                )}
            </Seccion>

            <Seccion titulo="Detalle">
                <Campo htmlFor={idDe('descripcion')} etiqueta="Descripción" opcional>
                    <textarea
                        id={idDe('descripcion')}
                        className="input-field resize-none"
                        style={{ minHeight: 76 }}
                        rows={2}
                        maxLength={500}
                        value={valores.descripcion}
                        onChange={(e) => onCambio({ descripcion: e.target.value })}
                        placeholder="Qué se pagó o recibió"
                    />
                </Campo>

                <CampoSoporte
                    id={idDe('soporte_url')}
                    valor={valores.soporte_url}
                    onCambio={(url) => onCambio({ soporte_url: url })}
                    onSubiendo={onSubiendo}
                    usuarioId={usuarioId}
                    mensajeSinSenal={mensajeSinSenalSoporte}
                />
            </Seccion>
        </div>
    );
}

function quitarClaves(objeto, claves) {
    if (!claves.some((clave) => clave in objeto)) return objeto;
    const copia = { ...objeto };
    for (const clave of claves) delete copia[clave];
    return copia;
}

function erroresPorCampo(lista) {
    const resultado = {};
    for (const error of lista ?? []) {
        if (!resultado[error.campo]) resultado[error.campo] = error.mensaje;
    }
    return resultado;
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function TransactionForm({ onTransactionAdded }) {
    const { currentUser } = useAuth();
    const idBase = useId();
    const [seccion, setSeccion] = useState('movimiento');

    const [valores, setValores] = useState(() => valoresIniciales());
    const [empresaId, setEmpresaId] = useState('');
    const [errores, setErrores] = useState({});
    const [errorGeneral, setErrorGeneral] = useState('');
    const [catalogos, setCatalogos] = useState(CATALOGOS_VACIOS);
    const [subiendo, setSubiendo] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [guardadoOk, setGuardadoOk] = useState(false);
    const [anuncio, setAnuncio] = useState('');
    const [pendiente, setPendiente] = useState(null);
    // Cambia después de cada guardado para montar los campos de cero (texto a
    // medio escribir, avisos, subidas en curso).
    const [version, setVersion] = useState(0);

    const camposRef = useRef(null);
    const inicioRef = useRef(null);
    const guardandoRef = useRef(false);
    const fechaTocadaRef = useRef(false);
    const sembradoRef = useRef(false);
    const temporizadorRef = useRef(null);

    // Catálogos en vivo: tras guardar, el saldo de la caja elegida ya es el
    // nuevo, y lo que traiga la sincronización aparece sin recargar.
    useEffect(() => {
        const suscripcion = liveQuery(() => Promise.all([
            db.empresas.toArray(),
            db.proyectos.toArray(),
            db.cajas.toArray(),
            db.terceros.toArray(),
            db.categorias.toArray(),
        ])).subscribe({
            next: ([empresas, proyectos, cajas, terceros, categorias]) => setCatalogos({
                empresas: ordenarPorNombre(empresas),
                proyectos: ordenarPorNombre(proyectos),
                cajas: ordenarPorNombre(cajas),
                terceros: ordenarPorNombre(terceros),
                categorias: ordenarPorNombre(categorias),
            }),
            error: (error) => console.error('No se pudieron leer los catálogos:', error),
        });
        return () => suscripcion.unsubscribe();
    }, []);

    // Categorías por defecto si la tabla está vacía. El ref evita que el doble
    // montaje de StrictMode las siembre dos veces (dejaba 22 duplicadas).
    useEffect(() => {
        async function sembrarCategorias() {
            try {
                const total = await db.categorias.count();
                if (total > 0 || sembradoRef.current) return;
                sembradoRef.current = true;
                const nuevas = CATEGORIAS_POR_DEFECTO.map((nombre) => ({
                    id: generateUUID(),
                    nombre,
                    // 'general' violaba el CHECK y la categoría se descartaba.
                    tipo: TIPO_CATEGORIA_POR_DEFECTO,
                    created_at: new Date().toISOString(),
                }));
                await db.categorias.bulkAdd(nuevas);
                for (const categoria of nuevas) {
                    await addToSyncQueue('categorias', 'INSERT', categoria);
                }
                sincronizarEnSegundoPlano();
            } catch (error) {
                console.error('No se pudieron crear las categorías por defecto:', error);
            }
        }
        sembrarCategorias();
    }, []);

    // Bug MOV-1: si la pantalla queda abierta de un día para otro, la fecha
    // por defecto se quedaba en el día anterior. Si el usuario no la tocó, se
    // recalcula al volver a la app.
    useEffect(() => {
        function alVolver() {
            if (document.visibilityState !== 'visible' || fechaTocadaRef.current) return;
            const hoy = hoyLocal();
            setValores((v) => (v.fecha === hoy ? v : { ...v, fecha: hoy }));
        }
        document.addEventListener('visibilitychange', alVolver);
        return () => document.removeEventListener('visibilitychange', alVolver);
    }, []);

    useEffect(() => () => clearTimeout(temporizadorRef.current), []);

    const tipo = valores.tipo_movimiento;

    function alCambiar(parcial) {
        if ('fecha' in parcial) fechaTocadaRef.current = true;
        setValores((v) => {
            const nuevo = { ...v, ...parcial };
            // Bug MOV-13: si el origen pasa a ser la caja destino, el destino
            // ya no está en su lista y el campo pintaba el UUID.
            if ('caja_origen_id' in parcial && parcial.caja_origen_id && parcial.caja_origen_id === v.caja_destino_id) {
                nuevo.caja_destino_id = '';
            }
            return nuevo;
        });
        setErrores((e) => quitarClaves(e, Object.keys(parcial)));
        setErrorGeneral('');
    }

    function alErrorCampo(campo, mensaje) {
        setErrores((e) => (mensaje ? { ...e, [campo]: mensaje } : quitarClaves(e, [campo])));
    }

    function cambiarTipo(nuevo) {
        // Bug MOV-10: el proveedor y el destino quedaban guardados aunque el
        // tipo nuevo no los muestre (un ingreso salía "de" la ferretería).
        setValores((v) => ({
            ...v,
            tipo_movimiento: nuevo,
            tercero_id: nuevo === TIPO_MOVIMIENTO.EGRESO ? v.tercero_id : '',
            caja_destino_id: nuevo === TIPO_MOVIMIENTO.TRANSFERENCIA ? v.caja_destino_id : '',
        }));
        setErrores((e) => quitarClaves(e, ['tipo_movimiento', 'tercero_id', 'caja_destino_id']));
        setErrorGeneral('');
    }

    function cambiarEmpresa(id) {
        setEmpresaId(id);
        const origen = catalogos.cajas.find((c) => c.id === valores.caja_origen_id);
        if (id && origen && origen.empresa_id !== id) alCambiar({ caja_origen_id: '' });
    }

    function alCrearCatalogo(tabla, fila) {
        // La consulta en vivo también la traerá; esto evita que el campo quede
        // un instante sin poder mostrar el nombre de lo que se acaba de crear.
        setCatalogos((c) => (c[tabla].some((f) => f.id === fila.id) ? c : { ...c, [tabla]: [...c[tabla], fila] }));
    }

    function construirDatos() {
        return {
            fecha: valores.fecha,
            descripcion: valores.descripcion.trim(),
            monto: Number(valores.monto || 0),
            tipo_movimiento: tipo,
            categoria: valores.categoria,
            proyecto_id: valores.proyecto_id || null,
            caja_origen_id: valores.caja_origen_id,
            caja_destino_id: tipo === TIPO_MOVIMIENTO.TRANSFERENCIA ? (valores.caja_destino_id || null) : null,
            tercero_id: tipo === TIPO_MOVIMIENTO.EGRESO ? (valores.tercero_id || null) : null,
            soporte_url: valores.soporte_url || null,
            sincronizado: false,
            usuario_nombre: currentUser?.nombre || 'Desconocido',
        };
    }

    function alEnviar(e) {
        e.preventDefault();
        if (guardandoRef.current || subiendo) return;
        const datos = construirDatos();
        const encontrados = camposRef.current?.validar(datos) ?? erroresPorCampo(validarMovimiento(datos));
        if (Object.keys(encontrados).length > 0) {
            setErrores(encontrados);
            camposRef.current?.enfocarPrimero(encontrados);
            return;
        }
        setErrores({});
        setErrorGeneral('');
        setPendiente(datos);
    }

    async function alConfirmar() {
        // Doble toque en "Sí, registrar": el ref corta antes de que React
        // alcance a pintar el estado "guardando".
        if (!pendiente || guardandoRef.current || subiendo) return;
        guardandoRef.current = true;
        const datos = pendiente;
        setPendiente(null);
        setGuardando(true);
        try {
            await registrarMovimiento(datos);

            setValores((v) => ({
                ...valoresIniciales(v.tipo_movimiento),
                // Se conserva la caja (se suelen registrar varios gastos de la
                // misma) y la fecha solo si el usuario la eligió a mano.
                caja_origen_id: v.caja_origen_id,
                fecha: fechaTocadaRef.current ? v.fecha : hoyLocal(),
            }));
            setVersion((n) => n + 1);
            setErrores({});
            setAnuncio(`${ETIQUETA_TIPO[datos.tipo_movimiento]} de ${formatoMoneda(datos.monto)} guardado.`);
            setGuardadoOk(true);
            clearTimeout(temporizadorRef.current);
            temporizadorRef.current = setTimeout(() => setGuardadoOk(false), 2000);
            const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            inicioRef.current?.scrollIntoView({ block: 'start', behavior: suave ? 'smooth' : 'auto' });
            onTransactionAdded?.();
        } catch (error) {
            if (error instanceof MovimientoInvalidoError) {
                const encontrados = erroresPorCampo(error.errores);
                setErrores(encontrados);
                camposRef.current?.enfocarPrimero(encontrados);
            } else {
                console.error('No se pudo guardar el movimiento:', error);
                // Puede haber quedado guardado en el dispositivo antes del
                // fallo: repetir a ciegas lo duplicaría.
                setErrorGeneral('No se pudo completar el guardado. Revisa en Inicio si el movimiento quedó registrado antes de repetirlo.');
            }
        } finally {
            guardandoRef.current = false;
            setGuardando(false);
        }
    }

    function detallesConfirmacion(datos) {
        if (!datos) return [];
        const nombre = (lista, id) => lista.find((fila) => fila.id === id)?.nombre ?? '';
        const filas = [
            { label: 'Tipo', value: ETIQUETA_TIPO[datos.tipo_movimiento], highlight: true },
            { label: 'Monto', value: formatoMoneda(datos.monto), highlight: true },
            { label: 'Fecha', value: `${formatoFecha(datos.fecha)}${datos.fecha === hoyLocal() ? ' (hoy)' : ''}` },
            {
                label: datos.tipo_movimiento === TIPO_MOVIMIENTO.INGRESO ? 'Entra a' : 'Sale de',
                value: nombre(catalogos.cajas, datos.caja_origen_id),
            },
        ];
        if (datos.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA) {
            filas.push({ label: 'Entra a', value: nombre(catalogos.cajas, datos.caja_destino_id) });
        }
        if (datos.categoria) {
            filas.push({ label: 'Categoría', value: resolverNombreCategoria(datos.categoria, catalogos.categorias) });
        }
        if (datos.proyecto_id) filas.push({ label: 'Obra', value: nombre(catalogos.proyectos, datos.proyecto_id) });
        if (datos.tercero_id) filas.push({ label: 'Proveedor', value: nombre(catalogos.terceros, datos.tercero_id) });
        if (datos.descripcion) filas.push({ label: 'Descripción', value: datos.descripcion });
        if (datos.soporte_url) filas.push({ label: 'Soporte', value: 'Foto adjunta' });
        return filas;
    }

    // Registrar un egreso no es destructivo: el botón rojo (danger) se reserva
    // para borrar o descartar, si no pierde su significado.
    const tipoConfirmacion = tipo === 'INGRESO' ? 'success' : 'default';
    const nombreTipo = ETIQUETA_TIPO[tipo].toLowerCase();

    return (
        <div ref={inicioRef} className="mx-auto max-w-2xl scroll-mt-4">
            <header className="section-header">
                <div>
                    <h2 className="section-title">{seccion === 'deudas' ? 'Deudas' : 'Nuevo movimiento'}</h2>
                    <p className="section-subtitle">
                        {seccion === 'deudas'
                            ? 'Préstamos entre cajas y cuentas por pagar.'
                            : 'Lo que sale, entra o se mueve entre cajas.'}
                    </p>
                </div>
                <div className="segmented" role="group" aria-label="Qué registrar">
                    <button
                        type="button"
                        aria-pressed={seccion === 'movimiento'}
                        onClick={() => setSeccion('movimiento')}
                        style={{ minHeight: 40 }}
                    >
                        Movimiento
                    </button>
                    <button
                        type="button"
                        aria-pressed={seccion === 'deudas'}
                        onClick={() => setSeccion('deudas')}
                        style={{ minHeight: 40 }}
                    >
                        Deudas
                    </button>
                </div>
            </header>

            {seccion === 'deudas' && (
                <div className="space-y-4">
                    <div className="card">
                        <DeudaCajasPanel />
                    </div>
                    <div className="card">
                        <DeudaTercerosPanel />
                    </div>
                </div>
            )}

            {seccion === 'movimiento' && (
                <form onSubmit={alEnviar} noValidate>
                    <div className="mb-6">
                        <SelectorTipo tipo={tipo} onCambiar={cambiarTipo} deshabilitado={guardando} />
                    </div>

                    <CamposMovimiento
                        key={version}
                        ref={camposRef}
                        idBase={idBase}
                        valores={valores}
                        onCambio={alCambiar}
                        errores={errores}
                        onErrorCampo={alErrorCampo}
                        onSubiendo={setSubiendo}
                        catalogos={catalogos}
                        onCatalogoCreado={alCrearCatalogo}
                        empresaId={empresaId}
                        onEmpresa={cambiarEmpresa}
                        usuarioId={currentUser?.id}
                    />

                    {/* En móvil el botón queda pegado abajo, encima de la barra
                        de navegación: se guarda sin bajar todo el formulario. */}
                    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-paper px-4 py-3 md:-mx-6 md:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0">
                        <ResumenErrores idBase={idBase} errores={errores} errorGeneral={errorGeneral} />
                        <button
                            type="submit"
                            className="btn-primary w-full"
                            style={{ minHeight: 52, fontSize: 16 }}
                            disabled={guardando || subiendo}
                        >
                            {guardando ? (
                                <>
                                    <Loader2 size={19} className="animate-spin" aria-hidden="true" />
                                    Guardando...
                                </>
                            ) : subiendo ? (
                                <>
                                    <Loader2 size={19} className="animate-spin" aria-hidden="true" />
                                    Esperando la foto...
                                </>
                            ) : guardadoOk ? (
                                <>
                                    <Check size={19} aria-hidden="true" />
                                    Guardado
                                </>
                            ) : (
                                <>
                                    <Save size={19} aria-hidden="true" />
                                    Guardar {nombreTipo}
                                </>
                            )}
                        </button>
                        <p role="status" className="sr-only">{anuncio}</p>
                    </div>
                </form>
            )}

            <ConfirmModal
                isOpen={Boolean(pendiente)}
                title={`Confirmar ${nombreTipo}`}
                message="Revisa los datos antes de registrar."
                details={detallesConfirmacion(pendiente)}
                confirmText="Sí, registrar"
                cancelText="Corregir"
                type={tipoConfirmacion}
                onConfirm={alConfirmar}
                onCancel={() => setPendiente(null)}
            />
        </div>
    );
}
