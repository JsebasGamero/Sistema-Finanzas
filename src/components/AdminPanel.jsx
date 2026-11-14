// Configuración: datos maestros (empresas, cajas, obras, proveedores y
// categorías) y, fuera de producción, el entorno de pruebas.
//
// Los maestros todavía hablan directo con Dexie y con la cola de sync (no
// tienen casos de uso), así que las reglas que protegen la base viven aquí:
// - Se normaliza antes de escribir: '' nunca llega a Supabase. Un '' en una
//   columna uuid/numeric o en un CHECK hacía que Supabase rechazara la
//   edición ENTERA y la sync la descartaba sin avisar (ADM-6).
// - Al editar se encolan solo los campos que cambiaron. Encolar la fila
//   completa reescribía saldo_actual con el valor leído en el arranque y
//   pisaba los movimientos registrados después desde otro celular (ADM-3).
// - El NIT repetido se detecta antes de guardar: la UNIQUE de Supabase lo
//   rechazaba con 23505, la sync lo tomaba como "ya existe" y la empresa
//   desaparecía en el siguiente arranque (ADM-4).
// - Guardar está protegido contra doble toque: cada envío generaba un UUID
//   nuevo y quedaban dos cajas iguales (ADM-19). El UUID se fija al abrir el
//   formulario, así que un reintento tras un fallo tampoco crea otro.
// - La fila y su operación en sync_queue se escriben en una sola transacción
//   de Dexie. Por separado, si el encolado fallaba (QuotaExceededError en un
//   teléfono lleno, C22) la fila quedaba solo en local y el siguiente pull la
//   borraba sin aviso (invariante 3 de SINCRONIZACION.md).
// - Los montos pegados ('1.500.000,00' desde Excel) pasan por un intérprete:
//   quedarse con todos los dígitos los multiplicaba por 100 (como MOV-3).
import { useEffect, useId, useRef, useState } from 'react';
import {
    Building2,
    Wallet,
    HardHat,
    Users,
    Tag,
    Plus,
    Pencil,
    Trash2,
    X,
    Search,
    LoaderCircle,
    FlaskConical
} from 'lucide-react';
import { db, generateUUID } from '../services/db';
import { addToSyncQueue, processSyncQueue } from '../services/syncService';
import { ES_PRODUCCION, ETIQUETA_ENTORNO, NOMBRE_BASE_LOCAL, hostSupabase } from '../services/entorno';
import { TIPO_CATEGORIA_POR_DEFECTO } from '../services/categorias';
import { useAuth } from '../context/useAuth';
import { aMonto, esCero, restarMontos } from '../domain/value-objects/dinero';
import { formatoMoneda, formatoMiles, formatoNumero, parsearMiles } from '../presentation/formato';
import useDialogo from '../hooks/useDialogo';
import ConfirmModal from './ConfirmModal';

// ---------------------------------------------------------------------------
// Definición de los maestros
// ---------------------------------------------------------------------------

// Literales exactos de los CHECK de supabase_setup.sql (invariante 3). Otro
// valor se rechaza al subir y se pierde la edición completa.
const opcionesIguales = (lista) => lista.map((valor) => ({ valor, etiqueta: valor }));
const TIPOS_CAJA = opcionesIguales(['Efectivo', 'Banco', 'Tarjeta']);
const ESTADOS_OBRA = opcionesIguales(['Activo', 'Pausado', 'Finalizado']);
const TIPOS_TERCERO = opcionesIguales(['Proveedor', 'Empleado', 'Contratista']);
const TIPOS_CATEGORIA = [
    { valor: 'INGRESO', etiqueta: 'Ingresos' },
    { valor: 'EGRESO', etiqueta: 'Egresos' },
    { valor: 'AMBOS', etiqueta: 'Ambos' }
];

const CAMPO_NOMBRE = { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 120 };

const ENTIDADES = {
    empresas: {
        titulo: 'Empresas',
        singular: 'empresa',
        femenino: true,
        icono: Building2,
        campos: [
            CAMPO_NOMBRE,
            {
                clave: 'nit', etiqueta: 'NIT', tipo: 'texto', maximo: 30,
                ayuda: 'Opcional. Con dígito de verificación, por ejemplo 900.123.456-7.'
            }
        ]
    },
    cajas: {
        titulo: 'Cajas',
        singular: 'caja',
        femenino: true,
        icono: Wallet,
        campos: [
            CAMPO_NOMBRE,
            { clave: 'tipo', etiqueta: 'Tipo', tipo: 'opciones', opciones: TIPOS_CAJA, requerido: true, porDefecto: 'Efectivo' },
            { clave: 'empresa_id', etiqueta: 'Empresa', tipo: 'empresa' },
            {
                clave: 'saldo_actual', etiqueta: 'Saldo de apertura', tipo: 'monto',
                permiteNegativo: true, soloAlCrear: true,
                ayuda: 'Solo se fija al crear la caja. Después el saldo cambia únicamente con movimientos.'
            }
        ]
    },
    proyectos: {
        titulo: 'Obras',
        singular: 'obra',
        femenino: true,
        icono: HardHat,
        campos: [
            CAMPO_NOMBRE,
            { clave: 'empresa_id', etiqueta: 'Empresa', tipo: 'empresa' },
            { clave: 'estado', etiqueta: 'Estado', tipo: 'opciones', opciones: ESTADOS_OBRA, requerido: true, porDefecto: 'Activo' },
            { clave: 'presupuesto_estimado', etiqueta: 'Presupuesto estimado', tipo: 'monto', permiteNegativo: false, ayuda: 'Opcional.' }
        ]
    },
    terceros: {
        titulo: 'Proveedores',
        singular: 'proveedor',
        femenino: false,
        icono: Users,
        campos: [
            CAMPO_NOMBRE,
            { clave: 'tipo', etiqueta: 'Tipo', tipo: 'opciones', opciones: TIPOS_TERCERO, requerido: true, porDefecto: 'Proveedor' },
            { clave: 'nit_cedula', etiqueta: 'NIT o cédula', tipo: 'texto', maximo: 30, ayuda: 'Opcional.' },
            { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', tipoInput: 'tel', inputMode: 'tel', maximo: 30, ayuda: 'Opcional.' }
        ]
    },
    categorias: {
        titulo: 'Categorías',
        singular: 'categoría',
        femenino: true,
        icono: Tag,
        // La tabla categorias no tiene updated_at (ver supabase_setup.sql).
        sinUpdatedAt: true,
        campos: [
            CAMPO_NOMBRE,
            {
                clave: 'tipo', etiqueta: 'Se usa en', tipo: 'opciones', opciones: TIPOS_CATEGORIA,
                requerido: true, porDefecto: TIPO_CATEGORIA_POR_DEFECTO
            }
        ]
    }
};

const ORDEN = ['empresas', 'cajas', 'proyectos', 'terceros', 'categorias'];

const un = (cfg) => (cfg.femenino ? 'una' : 'un');
const la = (cfg) => (cfg.femenino ? 'la' : 'el');
const loLa = (cfg) => (cfg.femenino ? 'la' : 'lo');
const nuevo = (cfg) => (cfg.femenino ? 'Nueva' : 'Nuevo');
const llamado = (cfg) => (cfg.femenino ? 'llamada' : 'llamado');

// Qué apunta a cada maestro. Borrar sin mirar esto dejaba movimientos
// huérfanos (en Supabase la FK es ON DELETE SET NULL) y el total de cajas
// dejaba de cuadrar con ingresos menos egresos, sin ningún aviso.
const REFERENCIAS = {
    empresas: [
        { tabla: 'cajas', campos: ['empresa_id'], etiqueta: 'Cajas' },
        { tabla: 'proyectos', campos: ['empresa_id'], etiqueta: 'Obras' },
        { tabla: 'deudas_terceros', campos: ['empresa_id'], etiqueta: 'Cuentas por pagar' }
    ],
    cajas: [
        { tabla: 'transacciones', campos: ['caja_origen_id', 'caja_destino_id'], etiqueta: 'Movimientos' },
        { tabla: 'deudas_cajas', campos: ['caja_deudora_id', 'caja_acreedora_id'], etiqueta: 'Préstamos entre cajas' }
    ],
    proyectos: [
        { tabla: 'transacciones', campos: ['proyecto_id'], etiqueta: 'Movimientos' },
        { tabla: 'deudas_terceros', campos: ['proyecto_id'], etiqueta: 'Cuentas por pagar' }
    ],
    terceros: [
        { tabla: 'transacciones', campos: ['tercero_id'], etiqueta: 'Movimientos' },
        { tabla: 'deudas_terceros', campos: ['tercero_id'], etiqueta: 'Cuentas por pagar' }
    ]
};

// ---------------------------------------------------------------------------
// Texto y montos
// ---------------------------------------------------------------------------

/** Texto sin espacios sobrantes; vacío -> null (nunca '' hacia Supabase). */
function limpiarTexto(valor) {
    const texto = String(valor ?? '').trim().replace(/\s+/g, ' ');
    return texto || null;
}

/** Clave para comparar nombres: sin tildes, sin mayúsculas, sin espacios extra. */
function normalizarTexto(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

// Los montos se editan como texto canónico: signo opcional + dígitos
// ('-2500000', '350000000', ''). Lo que se ve es exactamente lo que se
// guarda: antes el campo borraba el '-' al mostrarlo pero parseFloat lo
// guardaba, y un saldo de -2.500.000 se veía como 2.500.000 (ADM-7).

const MAX_CIFRAS_MONTO = 15;

/** Lo que el usuario escribe tecla a tecla -> texto canónico. 15 cifras: más allá Number pierde precisión. */
function leerMonto(texto, permiteNegativo) {
    const negativo = permiteNegativo && /^\s*-/.test(texto);
    return (negativo ? '-' : '') + parsearMiles(texto).slice(0, MAX_CIFRAS_MONTO);
}

/**
 * Interpreta un monto sin signo pegado o insertado de golpe. Misma regla que
 * interpretarMontoPegado de TransactionForm.jsx (MOV-3); mientras no viva en
 * presentation/, cualquier cambio se hace en las dos copias.
 *
 * Acepta "$ 1.234.567", "1,234,567", "1 234 567" y una cola de centavos
 * (",50" o ".50"), que se redondea porque los montos van en pesos enteros.
 * Todo lo demás se rechaza con un mensaje, nunca se adivina: quedarse con
 * todos los dígitos convertía "1.500.000,00" en 150.000.000.
 * @returns {{ digitos: string, redondeado: boolean } | { error: string }}
 */
function interpretarMontoPegado(texto) {
    const original = String(texto ?? '');
    const muestra = original.trim().slice(0, 24);
    const noSeReconoce = {
        error: `No se reconoce «${muestra}» como monto. Escribe solo el número, por ejemplo 1.250.000.`
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
    if (digitos.length > MAX_CIFRAS_MONTO) {
        return { error: 'El monto es demasiado grande. Revisa la cifra.' };
    }
    return { digitos: String(Math.round(Number(digitos) + centavos)), redondeado: centavos > 0 };
}

/**
 * Monto pegado -> texto canónico ('-1500000'), o { error }. El '-' inicial se
 * separa antes de interpretar. Sin signo en lo pegado se conserva el que ya
 * tenía el campo: en el celular el signo se elige con "En contra (deuda)"
 * antes de pegar la cifra, y perderlo voltearía el saldo de apertura.
 */
function leerMontoPegado(texto, permiteNegativo, valorActual) {
    const crudo = String(texto ?? '').trim();
    const conMenos = /^[-\u2212]/.test(crudo);
    const resultado = interpretarMontoPegado(conMenos ? crudo.slice(1) : crudo);
    if (resultado.error) return resultado;
    const negativo = permiteNegativo && (conMenos || String(valorActual ?? '').startsWith('-'));
    return { valor: (negativo ? '-' : '') + resultado.digitos, redondeado: resultado.redondeado };
}

/** Texto canónico -> lo que muestra el campo ('-2.500.000'). */
function mostrarMonto(valor) {
    const texto = String(valor ?? '');
    return (texto.startsWith('-') ? '-' : '') + formatoMiles(texto);
}

function conSigno(valor, negativo) {
    return (negativo ? '-' : '') + parsearMiles(valor);
}

/** Texto canónico -> número. Vacío -> 0 (las columnas tienen DEFAULT 0). */
function montoDesdeTexto(valor) {
    const texto = String(valor ?? '');
    const digitos = parsearMiles(texto);
    if (!digitos) return 0;
    const n = Number(digitos);
    return texto.trim().startsWith('-') ? -n : n;
}

/** Valor guardado -> texto canónico. Conserva el signo para no voltearlo en silencio. */
function textoDesdeMonto(valor) {
    const n = Math.round(aMonto(valor));
    if (esCero(n)) return '';
    return (n < 0 ? '-' : '') + String(Math.abs(n));
}

const unir = (partes) => partes.filter(Boolean).join(' · ');
const plural = (n, uno, varios) => `${formatoNumero(n ?? 0)} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------
// Formulario: valores, validación y diferencias
// ---------------------------------------------------------------------------

function valoresIniciales(entidad) {
    const valores = {};
    for (const campo of ENTIDADES[entidad].campos) {
        valores[campo.clave] = campo.porDefecto ?? '';
    }
    return valores;
}

function valoresDesdeFila(entidad, fila) {
    const valores = {};
    for (const campo of ENTIDADES[entidad].campos) {
        const valor = fila?.[campo.clave];
        valores[campo.clave] = campo.tipo === 'monto' ? textoDesdeMonto(valor) : (valor ?? '');
    }
    return valores;
}

/**
 * Normaliza y valida. Devuelve los datos listos para Dexie/Supabase, los
 * errores por campo y, si aplica, un aviso de nombre repetido (no bloquea:
 * puede haber dos proveedores con el mismo nombre).
 */
function validar(entidad, { valores, modo, fila, filas, usoCategoria }) {
    const cfg = ENTIDADES[entidad];
    const errores = {};
    const datos = {};

    for (const campo of cfg.campos) {
        // El saldo solo se fija al crear (ADM-3): al editar ni se lee ni se envía.
        if (campo.soloAlCrear && modo === 'editar') continue;
        const valor = valores[campo.clave];

        if (campo.tipo === 'texto') {
            const texto = limpiarTexto(valor);
            if (campo.requerido && !texto) errores[campo.clave] = 'Escribe el nombre.';
            datos[campo.clave] = texto;
        } else if (campo.tipo === 'opciones') {
            const valida = campo.opciones.some((opcion) => opcion.valor === valor);
            if (!valida && campo.requerido) errores[campo.clave] = 'Elige una opción.';
            datos[campo.clave] = valida ? valor : null;
        } else if (campo.tipo === 'empresa') {
            datos[campo.clave] = valor || null;
        } else if (campo.tipo === 'monto') {
            const monto = montoDesdeTexto(valor);
            if (!campo.permiteNegativo && monto < 0) errores[campo.clave] = 'No puede ser negativo.';
            datos[campo.clave] = monto;
        }
    }

    const otras = filas.filter((f) => f.id !== fila?.id);
    let duplicado = null;

    const nombreCambio = modo === 'crear' || normalizarTexto(datos.nombre) !== normalizarTexto(fila?.nombre);
    if (datos.nombre && nombreCambio) {
        const clave = normalizarTexto(datos.nombre);
        const repetida = otras.find((f) => normalizarTexto(f.nombre) === clave);
        if (repetida && entidad === 'categorias') {
            // categorias.nombre es UNIQUE y los movimientos guardan el nombre:
            // dos categorías con el mismo nombre serían una sola en los reportes.
            errores.nombre = `Ya existe la categoría "${repetida.nombre}".`;
        } else if (repetida) {
            duplicado = `Ya hay ${un(cfg)} ${cfg.singular} ${llamado(cfg)} "${repetida.nombre}".`;
        }
    }

    // transacciones.categoria guarda el NOMBRE (invariante 5): renombrar una
    // categoría en uso dejaría esos movimientos con un nombre que ya no existe.
    if (entidad === 'categorias' && modo === 'editar' && usoCategoria > 0 &&
        datos.nombre !== limpiarTexto(fila?.nombre)) {
        errores.nombre = 'La usan movimientos que guardan este nombre: no se puede cambiar.';
    }

    if (entidad === 'empresas' && datos.nit) {
        const nitCambio = modo === 'crear' || datos.nit !== limpiarTexto(fila?.nit);
        if (nitCambio) {
            const digitos = soloDigitos(datos.nit);
            const repetida = otras.find((f) => {
                const otro = limpiarTexto(f.nit);
                if (!otro) return false;
                if (normalizarTexto(otro) === normalizarTexto(datos.nit)) return true;
                // "900.123.456-7" y "9001234567" son el mismo NIT escrito distinto.
                return digitos.length > 0 && soloDigitos(otro) === digitos;
            });
            if (repetida) {
                errores.nit = `Ese NIT ya es de "${repetida.nombre}". Cada empresa necesita un NIT distinto.`;
            }
        }
    }

    return { errores, datos, duplicado };
}

/** Solo los campos que de verdad cambiaron respecto a la fila guardada. */
function cambiosRespectoA(entidad, datos, fila) {
    const cambios = {};
    for (const campo of ENTIDADES[entidad].campos) {
        if (!(campo.clave in datos)) continue;
        const valorNuevo = datos[campo.clave];
        if (campo.tipo === 'monto') {
            const original = Math.round(aMonto(fila[campo.clave]));
            if (!esCero(restarMontos(valorNuevo, original))) cambios[campo.clave] = valorNuevo;
        } else {
            const original = campo.tipo === 'texto' ? limpiarTexto(fila[campo.clave]) : (fila[campo.clave] || null);
            if (valorNuevo !== original) cambios[campo.clave] = valorNuevo;
        }
    }
    return cambios;
}

// ---------------------------------------------------------------------------
// Lectura de datos
// ---------------------------------------------------------------------------

const porNombre = (a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es', { sensitivity: 'base' });

async function cargarDatos(entidad) {
    const [filas, empresas, ...cuentas] = await Promise.all([
        db[entidad].toArray(),
        db.empresas.toArray(),
        ...ORDEN.map((tabla) => db[tabla].count())
    ]);

    const conteos = Object.fromEntries(ORDEN.map((tabla, i) => [tabla, cuentas[i]]));
    const uso = {};

    if (entidad === 'empresas') {
        const [cajas, proyectos] = await Promise.all([db.cajas.toArray(), db.proyectos.toArray()]);
        for (const empresa of filas) uso[empresa.id] = { cajas: 0, proyectos: 0 };
        for (const caja of cajas) if (uso[caja.empresa_id]) uso[caja.empresa_id].cajas += 1;
        for (const obra of proyectos) if (uso[obra.empresa_id]) uso[obra.empresa_id].proyectos += 1;
    } else if (entidad === 'categorias') {
        // Un movimiento apunta a su categoría por nombre, o por UUID si es
        // del formato antiguo (ver services/categorias.js).
        const porValor = new Map();
        await db.transacciones.each((t) => {
            if (t.categoria) porValor.set(t.categoria, (porValor.get(t.categoria) || 0) + 1);
        });
        for (const categoria of filas) {
            uso[categoria.id] = (porValor.get(categoria.nombre) || 0) + (porValor.get(categoria.id) || 0);
        }
    }

    return {
        entidad,
        filas: filas.sort(porNombre),
        empresas: empresas.sort(porNombre),
        conteos,
        uso
    };
}

/** [{ etiqueta, n }] con lo que apunta a la fila; null si no se pudo contar. */
async function contarReferencias(entidad, fila) {
    try {
        if (entidad === 'categorias') {
            const n = await db.transacciones
                .filter((t) => t.categoria === fila.nombre || t.categoria === fila.id)
                .count();
            return n > 0 ? [{ etiqueta: 'Movimientos', n }] : [];
        }
        const conteos = [];
        for (const ref of REFERENCIAS[entidad] || []) {
            const tabla = db[ref.tabla];
            if (!tabla) continue;
            const n = await tabla.filter((f) => ref.campos.some((campo) => f[campo] === fila.id)).count();
            if (n > 0) conteos.push({ etiqueta: ref.etiqueta, n });
        }
        return conteos;
    } catch (error) {
        console.error('No se pudieron contar las referencias del registro:', error);
        return null;
    }
}

/**
 * Escribe un maestro y lo encola como todo o nada. Dentro solo puede haber
 * operaciones de Dexie (ver infrastructure/dexie/unidadDeTrabajoDexie.js): la
 * sincronización se lanza después del commit, nunca desde aquí.
 */
function escribirConCola(entidad, trabajo) {
    return db.transaction('rw', db[entidad], db.sync_queue, trabajo);
}

function sincronizarSiHayRed() {
    if (!navigator.onLine) return;
    processSyncQueue().catch((error) => console.error('No se pudo sincronizar después de guardar:', error));
}

// ---------------------------------------------------------------------------
// Piezas de presentación
// ---------------------------------------------------------------------------

function Vacio() {
    return <span className="text-ink-3" aria-label="Sin dato">–</span>;
}

function Monto({ valor }) {
    const negativo = aMonto(valor) < 0;
    return <span className={`amount ${negativo ? 'text-neg' : 'text-ink'}`}>{formatoMoneda(valor)}</span>;
}

const CHIP_ESTADO = { Activo: 'chip chip-pos', Pausado: 'chip chip-warn', Finalizado: 'chip' };

function ChipEstado({ estado }) {
    if (!estado) return <span className="chip">Sin estado</span>;
    return <span className={CHIP_ESTADO[estado] || 'chip'}>{estado}</span>;
}

const CHIP_TIPO_CATEGORIA = {
    INGRESO: { clase: 'chip chip-pos', texto: 'Ingresos' },
    EGRESO: { clase: 'chip chip-neg', texto: 'Egresos' },
    AMBOS: { clase: 'chip', texto: 'Ambos' }
};

function ChipTipoCategoria({ tipo }) {
    const chip = CHIP_TIPO_CATEGORIA[tipo];
    if (!chip) return <span className="chip">Sin tipo</span>;
    return <span className={chip.clase}>{chip.texto}</span>;
}

function Alerta({ tono, children }) {
    const clases = {
        neg: 'border-neg/30 bg-neg-soft text-neg',
        warn: 'border-warn/30 bg-warn-soft text-warn',
        pos: 'border-pos/30 bg-pos-soft text-pos'
    }[tono];
    return (
        <div role={tono === 'pos' ? 'status' : 'alert'} className={`rounded-md border px-3 py-2 text-sm font-medium ${clases}`}>
            {children}
        </div>
    );
}

/** Columnas de la tabla de escritorio. */
function columnasDe(entidad, ctx) {
    const nombre = {
        titulo: 'Nombre',
        celda: (f) => <span className="font-semibold text-ink">{f.nombre || 'Sin nombre'}</span>
    };
    const empresa = {
        titulo: 'Empresa',
        celda: (f) => ctx.nombreEmpresa(f.empresa_id) || <Vacio />
    };
    switch (entidad) {
        case 'empresas':
            return [
                nombre,
                { titulo: 'NIT', celda: (f) => (f.nit ? <span className="mono text-ink-2">{f.nit}</span> : <Vacio />) },
                { titulo: 'Cajas', num: true, celda: (f) => formatoNumero(ctx.uso[f.id]?.cajas ?? 0) },
                { titulo: 'Obras', num: true, celda: (f) => formatoNumero(ctx.uso[f.id]?.proyectos ?? 0) }
            ];
        case 'cajas':
            return [
                nombre,
                { titulo: 'Tipo', celda: (f) => f.tipo || <Vacio /> },
                empresa,
                { titulo: 'Saldo actual', num: true, celda: (f) => <Monto valor={f.saldo_actual} /> }
            ];
        case 'proyectos':
            return [
                nombre,
                empresa,
                { titulo: 'Estado', celda: (f) => <ChipEstado estado={f.estado} /> },
                {
                    titulo: 'Presupuesto',
                    num: true,
                    celda: (f) => (esCero(aMonto(f.presupuesto_estimado)) ? <Vacio /> : <Monto valor={f.presupuesto_estimado} />)
                }
            ];
        case 'terceros':
            return [
                nombre,
                { titulo: 'Tipo', celda: (f) => f.tipo || <Vacio /> },
                { titulo: 'NIT o cédula', celda: (f) => (f.nit_cedula ? <span className="mono text-ink-2">{f.nit_cedula}</span> : <Vacio />) },
                { titulo: 'Teléfono', celda: (f) => (f.telefono ? <span className="num text-ink-2">{f.telefono}</span> : <Vacio />) }
            ];
        case 'categorias':
            return [
                nombre,
                { titulo: 'Se usa en', celda: (f) => <ChipTipoCategoria tipo={f.tipo} /> },
                { titulo: 'Movimientos', num: true, celda: (f) => formatoNumero(ctx.uso[f.id] ?? 0) }
            ];
        default:
            return [nombre];
    }
}

/** Resumen de una fila para la lista de móvil: una línea secundaria y un valor a la derecha. */
function resumenDe(entidad, f, ctx) {
    switch (entidad) {
        case 'empresas': {
            const uso = ctx.uso[f.id];
            return { meta: unir([f.nit && `NIT ${f.nit}`, plural(uso?.cajas, 'caja', 'cajas'), plural(uso?.proyectos, 'obra', 'obras')]) };
        }
        case 'cajas':
            return { meta: unir([f.tipo, ctx.nombreEmpresa(f.empresa_id)]), derecha: <Monto valor={f.saldo_actual} /> };
        case 'proyectos':
            return {
                meta: unir([
                    ctx.nombreEmpresa(f.empresa_id),
                    !esCero(aMonto(f.presupuesto_estimado)) && `Presupuesto ${formatoMoneda(f.presupuesto_estimado)}`
                ]),
                derecha: <ChipEstado estado={f.estado} />
            };
        case 'terceros':
            return { meta: unir([f.tipo, f.nit_cedula, f.telefono]) };
        case 'categorias':
            return {
                meta: unir([CHIP_TIPO_CATEGORIA[f.tipo]?.texto, plural(ctx.uso[f.id] ?? 0, 'movimiento', 'movimientos')])
            };
        default:
            return { meta: '' };
    }
}

function textoParaBuscar(f, ctx) {
    return normalizarTexto([f.nombre, f.nit, f.nit_cedula, f.telefono, f.tipo, f.estado, ctx.nombreEmpresa(f.empresa_id)]
        .filter(Boolean)
        .join(' '));
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function AdminPanel() {
    const { currentUser } = useAuth();
    const modoLocal = currentUser?.modoLocal === true;

    const [entidad, setEntidad] = useState('empresas');
    const [version, setVersion] = useState(0);
    const [datos, setDatos] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [formulario, setFormulario] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const guardandoRef = useRef(false);
    const [borrado, setBorrado] = useState(null);
    const [aviso, setAviso] = useState(null);
    const idBuscar = useId();

    useEffect(() => {
        let vigente = true;
        cargarDatos(entidad)
            .then((resultado) => {
                if (vigente) setDatos(resultado);
            })
            .catch((error) => {
                console.error('No se pudieron leer los datos maestros:', error);
                if (vigente) setDatos({ entidad, filas: [], empresas: [], conteos: {}, uso: {}, error: true });
            });
        return () => {
            vigente = false;
        };
    }, [entidad, version]);

    const recargar = () => setVersion((v) => v + 1);

    const cfg = ENTIDADES[entidad];
    const listo = Boolean(datos) && datos.entidad === entidad;
    const filas = listo ? datos.filas : [];
    const empresas = datos?.empresas ?? [];
    const conteos = datos?.conteos ?? {};
    const nombresEmpresa = new Map(empresas.map((e) => [e.id, e.nombre]));
    const ctx = {
        uso: listo ? datos.uso : {},
        nombreEmpresa: (id) => (id ? nombresEmpresa.get(id) || 'Empresa no encontrada' : null)
    };

    const consulta = normalizarTexto(busqueda);
    const visibles = consulta ? filas.filter((f) => textoParaBuscar(f, ctx).includes(consulta)) : filas;

    function cambiarEntidad(clave) {
        if (clave === entidad) return;
        setEntidad(clave);
        setBusqueda('');
        setAviso(null);
    }

    function abrirCrear() {
        setAviso(null);
        setFormulario({
            modo: 'crear',
            fila: null,
            // Un solo UUID por formulario: reintentar después de un error no
            // puede dejar dos registros iguales.
            idNuevo: generateUUID(),
            valores: valoresIniciales(entidad),
            errores: {},
            duplicado: null,
            duplicadoAceptado: false,
            errorGeneral: null
        });
    }

    function abrirEditar(fila) {
        setAviso(null);
        setFormulario({
            modo: 'editar',
            fila,
            valores: valoresDesdeFila(entidad, fila),
            errores: {},
            duplicado: null,
            duplicadoAceptado: false,
            errorGeneral: null
        });
    }

    function cambiarValor(clave, valor) {
        setFormulario((f) => {
            if (!f) return f;
            const errores = { ...f.errores };
            delete errores[clave];
            // Otro nombre: el aviso de repetido ya no aplica y hay que volver a mirar.
            const reiniciarDuplicado = clave === 'nombre' ? { duplicado: null, duplicadoAceptado: false } : {};
            return { ...f, valores: { ...f.valores, [clave]: valor }, errores, ...reiniciarDuplicado };
        });
    }

    function marcarErrorCampo(clave, mensaje) {
        setFormulario((f) => (f ? { ...f, errores: { ...f.errores, [clave]: mensaje } } : f));
    }

    function cerrarFormulario() {
        if (guardandoRef.current) return;
        setFormulario(null);
    }

    async function guardar(evento) {
        evento.preventDefault();
        if (guardandoRef.current || !formulario || !listo) return;

        const { modo, fila, valores, idNuevo } = formulario;
        const usoCategoria = entidad === 'categorias' && fila ? (datos.uso[fila.id] ?? 0) : 0;
        const { errores, datos: normalizados, duplicado } = validar(entidad, { valores, modo, fila, filas, usoCategoria });

        if (Object.keys(errores).length > 0) {
            setFormulario((f) => ({ ...f, errores, errorGeneral: null }));
            return;
        }
        if (duplicado && !formulario.duplicadoAceptado) {
            // Primer intento con un nombre repetido: se avisa y el segundo
            // "Guardar" confirma que es otro registro distinto.
            setFormulario((f) => ({ ...f, errores: {}, duplicado, duplicadoAceptado: true }));
            return;
        }

        guardandoRef.current = true;
        setGuardando(true);
        try {
            const ahora = new Date().toISOString();
            if (modo === 'editar') {
                const cambios = cambiosRespectoA(entidad, normalizados, fila);
                if (Object.keys(cambios).length > 0) {
                    if (!cfg.sinUpdatedAt) cambios.updated_at = ahora;
                    await escribirConCola(entidad, async () => {
                        await db[entidad].update(fila.id, cambios);
                        // Payload parcial: reapplyPendingOperations y processSyncQueue
                        // lo aplican con update(), sin tocar las demás columnas.
                        await addToSyncQueue(entidad, 'UPDATE', { id: fila.id, ...cambios });
                    });
                    sincronizarSiHayRed();
                }
            } else {
                const registro = { id: idNuevo, ...normalizados, created_at: ahora };
                if (!cfg.sinUpdatedAt) registro.updated_at = ahora;
                await escribirConCola(entidad, async () => {
                    await db[entidad].add(registro);
                    await addToSyncQueue(entidad, 'INSERT', registro);
                });
                sincronizarSiHayRed();
            }

            const sinRed = !modoLocal && !navigator.onLine ? ' Se subirá a la nube cuando vuelva la señal.' : '';
            setFormulario(null);
            setAviso({ tono: 'pos', texto: `Se guardó ${la(cfg)} ${cfg.singular} "${normalizados.nombre}".${sinRed}` });
            recargar();
        } catch (error) {
            console.error('No se pudo guardar el registro maestro:', error);
            setFormulario((f) => (f ? { ...f, errorGeneral: 'No se pudo guardar en este dispositivo. Intenta de nuevo.' } : f));
        } finally {
            guardandoRef.current = false;
            setGuardando(false);
        }
    }

    async function pedirBorrado(fila) {
        setAviso(null);
        const referencias = await contarReferencias(entidad, fila);
        setBorrado({ entidad, fila, referencias });
    }

    // ConfirmModal deshabilita sus botones mientras esta promesa no termina:
    // un segundo toque no encola dos DELETE.
    async function confirmarBorrado() {
        const actual = borrado;
        if (!actual) return;
        const cfgBorrado = ENTIDADES[actual.entidad];
        try {
            await escribirConCola(actual.entidad, async () => {
                await db[actual.entidad].delete(actual.fila.id);
                await addToSyncQueue(actual.entidad, 'DELETE', { id: actual.fila.id });
            });
            sincronizarSiHayRed();
            setAviso({ tono: 'pos', texto: `Se eliminó ${la(cfgBorrado)} ${cfgBorrado.singular} "${actual.fila.nombre}".` });
            recargar();
        } catch (error) {
            console.error('No se pudo eliminar el registro maestro:', error);
            setAviso({ tono: 'neg', texto: 'No se pudo eliminar. Intenta de nuevo.' });
        } finally {
            setBorrado(null);
        }
    }

    const columnas = columnasDe(entidad, ctx);

    return (
        <div className="space-y-6 animate-fade-in">
            <header className="section-header">
                <div>
                    <h2 className="section-title">Configuración</h2>
                    <p className="section-subtitle">
                        Empresas, cajas, obras, proveedores y categorías que usan los movimientos y los reportes.
                    </p>
                </div>
                <button type="button" className="btn-primary" onClick={abrirCrear} disabled={!listo}>
                    <Plus size={18} aria-hidden="true" />
                    Agregar {cfg.singular}
                </button>
            </header>

            <div
                role="group"
                aria-label="Tipo de dato maestro"
                className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 sm:flex-wrap sm:overflow-visible"
            >
                {ORDEN.map((clave) => {
                    const cfgPestana = ENTIDADES[clave];
                    const Icono = cfgPestana.icono;
                    const activa = clave === entidad;
                    return (
                        <button
                            key={clave}
                            type="button"
                            aria-pressed={activa}
                            onClick={() => cambiarEntidad(clave)}
                            className={`tab-pill shrink-0 min-h-11! lg:min-h-9! ${activa ? 'active' : ''}`}
                        >
                            <Icono size={15} aria-hidden="true" />
                            {cfgPestana.titulo}
                            {conteos[clave] !== undefined && (
                                <span className="num font-medium opacity-70">{formatoNumero(conteos[clave])}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            <section aria-label={cfg.titulo} className="space-y-3">
                <div aria-live="polite">
                    {aviso && (
                        <div
                            className={`flex items-start gap-2 rounded-md border pl-3 text-sm font-medium ${aviso.tono === 'neg'
                                ? 'border-neg/30 bg-neg-soft text-neg'
                                : 'border-pos/30 bg-pos-soft text-pos'
                                }`}
                        >
                            <p className="flex-1 py-2.5">{aviso.texto}</p>
                            <button type="button" className="btn-icon shrink-0" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>
                                <X size={16} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                </div>

                {listo && filas.length > 0 && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative w-full sm:max-w-xs">
                            <label htmlFor={idBuscar} className="sr-only">
                                Buscar en {cfg.titulo.toLowerCase()}
                            </label>
                            <Search
                                size={16}
                                aria-hidden="true"
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                            />
                            <input
                                id={idBuscar}
                                type="search"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder={`Buscar ${cfg.titulo.toLowerCase()}`}
                                autoComplete="off"
                                className="input-field pl-9!"
                            />
                        </div>
                        <p className="num text-sm text-ink-3">
                            {consulta
                                ? `${formatoNumero(visibles.length)} de ${formatoNumero(filas.length)}`
                                : plural(filas.length, cfg.singular, cfg.titulo.toLowerCase())}
                        </p>
                    </div>
                )}

                {!listo ? (
                    <div className="ledger" aria-busy="true" aria-label="Cargando">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="ledger-row">
                                <div className="skeleton h-4 w-1/2" />
                            </div>
                        ))}
                    </div>
                ) : datos.error ? (
                    <div role="alert" className="rounded-md border border-neg/30 bg-neg-soft px-4 py-6 text-center text-sm text-neg">
                        No se pudieron leer los datos de este dispositivo. Recarga la app e intenta de nuevo.
                    </div>
                ) : filas.length === 0 ? (
                    <div className="ledger">
                        <div className="empty-state">
                            <p>Todavía no hay {cfg.titulo.toLowerCase()}.</p>
                            <button type="button" className="btn-secondary mt-3" onClick={abrirCrear}>
                                <Plus size={16} aria-hidden="true" />
                                Agregar {un(cfg)} {cfg.singular}
                            </button>
                        </div>
                    </div>
                ) : visibles.length === 0 ? (
                    <div className="ledger">
                        <p className="empty-state">Nada coincide con "{busqueda.trim()}".</p>
                    </div>
                ) : (
                    <>
                        {/* Escritorio y tableta: tabla contable. */}
                        <div className="hidden md:block">
                            <div className="card card-flush">
                                <div className="overflow-x-auto">
                                    <table className="tabla">
                                        <caption className="sr-only">{cfg.titulo}</caption>
                                        <thead>
                                            <tr>
                                                {columnas.map((columna) => (
                                                    <th key={columna.titulo} scope="col" className={columna.num ? 'col-num' : undefined}>
                                                        {columna.titulo}
                                                    </th>
                                                ))}
                                                <th scope="col" className="col-num">
                                                    <span className="sr-only">Acciones</span>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibles.map((fila) => (
                                                <tr key={fila.id} className="hover:bg-surface-2">
                                                    {columnas.map((columna) => (
                                                        <td key={columna.titulo} className={columna.num ? 'col-num' : undefined}>
                                                            {columna.celda(fila)}
                                                        </td>
                                                    ))}
                                                    <td className="col-num py-0.5!">
                                                        <div className="inline-flex gap-1">
                                                            <button
                                                                type="button"
                                                                className="btn-icon"
                                                                aria-label={`Editar ${fila.nombre || cfg.singular}`}
                                                                onClick={() => abrirEditar(fila)}
                                                            >
                                                                <Pencil size={16} aria-hidden="true" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-icon"
                                                                aria-label={`Eliminar ${fila.nombre || cfg.singular}`}
                                                                onClick={() => pedirBorrado(fila)}
                                                            >
                                                                <Trash2 size={16} aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Móvil: libro con filetes; tocar la fila la edita. */}
                        <div className="md:hidden">
                            <ul className="ledger">
                                {visibles.map((fila) => {
                                    const resumen = resumenDe(entidad, fila, ctx);
                                    return (
                                        <li key={fila.id} className="ledger-row gap-2! py-1! pr-1!">
                                            <button
                                                type="button"
                                                onClick={() => abrirEditar(fila)}
                                                className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center py-1.5 text-left"
                                            >
                                                <span className="sr-only">Editar </span>
                                                <span className="block w-full truncate font-semibold text-ink">
                                                    {fila.nombre || 'Sin nombre'}
                                                </span>
                                                {resumen.meta && (
                                                    <span className="block w-full truncate text-sm text-ink-3">{resumen.meta}</span>
                                                )}
                                            </button>
                                            {resumen.derecha && <div className="shrink-0 text-right text-sm">{resumen.derecha}</div>}
                                            <button
                                                type="button"
                                                className="btn-icon shrink-0"
                                                aria-label={`Eliminar ${fila.nombre || cfg.singular}`}
                                                onClick={() => pedirBorrado(fila)}
                                            >
                                                <Trash2 size={18} aria-hidden="true" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </>
                )}
            </section>

            {!ES_PRODUCCION && <SeccionEntornoPruebas modoLocal={modoLocal} onDatosCambiados={recargar} />}

            {formulario && (
                <FormularioMaestro
                    entidad={entidad}
                    formulario={formulario}
                    empresas={empresas}
                    usoCategoria={entidad === 'categorias' && formulario.fila ? (ctx.uso[formulario.fila.id] ?? 0) : 0}
                    guardando={guardando}
                    onCambiar={cambiarValor}
                    onErrorCampo={marcarErrorCampo}
                    onGuardar={guardar}
                    onCerrar={cerrarFormulario}
                />
            )}

            <ConfirmModal
                isOpen={Boolean(borrado)}
                title={borrado ? `Eliminar ${ENTIDADES[borrado.entidad].singular}` : ''}
                message={borrado ? textoDeBorrado(borrado) : ''}
                details={borrado?.referencias?.map((ref) => ({ label: ref.etiqueta, value: formatoNumero(ref.n), highlight: true }))}
                confirmText={borrado?.referencias?.length ? 'Eliminar de todas formas' : 'Sí, eliminar'}
                cancelText="Cancelar"
                textoProcesando="Eliminando..."
                type="danger"
                onConfirm={confirmarBorrado}
                onCancel={() => setBorrado(null)}
            />
        </div>
    );
}

function textoDeBorrado({ entidad, fila, referencias }) {
    const cfg = ENTIDADES[entidad];
    const nombre = `"${fila.nombre || 'Sin nombre'}"`;
    if (referencias === null) {
        return `No se pudo comprobar si ${nombre} está en uso. Si lo está, esos registros quedarán sin ${cfg.singular}. No se puede deshacer.`;
    }
    if (referencias.length === 0) {
        return `Se eliminará ${nombre}. No está en uso. No se puede deshacer.`;
    }
    if (entidad === 'categorias') {
        return `${nombre} está en uso. Esos movimientos conservan el nombre, pero la categoría ya no aparecerá para elegirla en movimientos nuevos. No se puede deshacer.`;
    }
    return `${nombre} está en uso. Si ${loLa(cfg)} eliminas, esos registros quedarán sin ${cfg.singular} y los totales por ${cfg.singular} dejarán de cuadrar. No se puede deshacer.`;
}

// ---------------------------------------------------------------------------
// Formulario en hoja (modal)
// ---------------------------------------------------------------------------

function FormularioMaestro({ entidad, formulario, empresas, usoCategoria, guardando, onCambiar, onErrorCampo, onGuardar, onCerrar }) {
    const cfg = ENTIDADES[entidad];
    const { modo, fila, valores, errores, duplicado, errorGeneral } = formulario;
    const idTitulo = useId();
    const idBase = useId();
    // Al crear, el foco va directo al nombre; al editar, al primer control
    // (Cerrar), para no abrir el teclado del celular solo por mirar el registro.
    const refFoco = useRef(null);
    // Sin propsVelo: tocar fuera de la hoja no la cierra, para no perder lo escrito.
    const { refDialogo } = useDialogo({ abierto: true, onCerrar, bloqueado: guardando, refFocoInicial: refFoco });

    const titulo = modo === 'crear' ? `${nuevo(cfg)} ${cfg.singular}` : `Editar ${cfg.singular}`;
    const nombreBloqueado = entidad === 'categorias' && modo === 'editar' && usoCategoria > 0
        ? `La usan ${plural(usoCategoria, 'movimiento', 'movimientos')}, que guardan su nombre. Para usar otro nombre, crea una categoría nueva.`
        : null;

    return (
        <div className="modal-backdrop">
            <div
                ref={refDialogo}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                tabIndex={-1}
                className="modal-sheet animate-fade-in outline-none"
            >
                <form onSubmit={onGuardar} noValidate>
                    <div className="panel-head sticky top-0 z-10 bg-surface">
                        <h2 id={idTitulo} className="panel-title">{titulo}</h2>
                        <button
                            type="button"
                            className="btn-icon -mr-2 shrink-0"
                            aria-label="Cerrar"
                            onClick={onCerrar}
                            disabled={guardando}
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="space-y-5 px-4 py-4 sm:px-5">
                        {errorGeneral && <Alerta tono="neg">{errorGeneral}</Alerta>}

                        {cfg.campos.map((campo) => (
                            <Campo
                                key={campo.clave}
                                campo={campo}
                                idBase={idBase}
                                modo={modo}
                                fila={fila}
                                valor={valores[campo.clave]}
                                error={errores[campo.clave]}
                                empresas={empresas}
                                bloqueadoPor={campo.clave === 'nombre' ? nombreBloqueado : null}
                                refFoco={modo === 'crear' && campo.clave === 'nombre' ? refFoco : undefined}
                                onCambiar={onCambiar}
                                onErrorCampo={onErrorCampo}
                            />
                        ))}

                        {duplicado && (
                            <Alerta tono="warn">
                                {duplicado} Si es {cfg.femenino ? 'otra distinta' : 'otro distinto'}, pulsa Guardar otra vez.
                            </Alerta>
                        )}
                    </div>

                    <div
                        className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-4 pt-3 sm:flex-row sm:justify-end sm:px-5"
                        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
                    >
                        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={onCerrar} disabled={guardando}>
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="btn-primary w-full sm:w-auto"
                            disabled={guardando}
                            aria-busy={guardando || undefined}
                        >
                            {guardando ? (
                                <>
                                    <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                                    Guardando...
                                </>
                            ) : (
                                `Guardar ${cfg.singular}`
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function Campo({ campo, idBase, modo, fila, valor, error, empresas, bloqueadoPor, refFoco, onCambiar, onErrorCampo }) {
    const id = `${idBase}-${campo.clave}`;
    const idAyuda = `${id}-ayuda`;
    const idError = `${id}-error`;
    const marcaRequerido = campo.requerido ? <span className="text-neg" aria-hidden="true"> *</span> : null;
    const textoError = error ? <p id={idError} className="mt-1.5 text-sm font-medium text-neg">{error}</p> : null;

    // Caja ya creada: el saldo se muestra, no se edita (ADM-3).
    if (campo.tipo === 'monto' && campo.soloAlCrear && modo === 'editar') {
        return (
            <div>
                <p className="label">Saldo actual</p>
                <p className="text-xl">
                    <Monto valor={fila?.[campo.clave]} />
                </p>
                <p className="mt-1.5 text-sm text-ink-3">
                    El saldo cambia solo con movimientos. Para corregirlo, registra un ingreso o un egreso de ajuste.
                </p>
            </div>
        );
    }

    if (campo.tipo === 'opciones') {
        return (
            <fieldset aria-describedby={error ? idError : undefined}>
                <legend className="label">
                    {campo.etiqueta}
                    {marcaRequerido}
                </legend>
                <div className="segmented w-full">
                    {campo.opciones.map((opcion) => (
                        <button
                            key={opcion.valor}
                            type="button"
                            aria-pressed={valor === opcion.valor}
                            onClick={() => onCambiar(campo.clave, opcion.valor)}
                            className="flex-1 justify-center min-h-11! px-2! sm:px-3! lg:min-h-9!"
                        >
                            {opcion.etiqueta}
                        </button>
                    ))}
                </div>
                {textoError}
            </fieldset>
        );
    }

    if (campo.tipo === 'empresa') {
        const huerfana = valor && !empresas.some((e) => e.id === valor);
        return (
            <div>
                <label htmlFor={id} className="label">{campo.etiqueta}</label>
                <select id={id} className="input-field" value={valor || ''} onChange={(e) => onCambiar(campo.clave, e.target.value)}>
                    <option value="">Sin empresa</option>
                    {huerfana && <option value={valor}>Empresa no encontrada</option>}
                    {empresas.map((empresa) => (
                        <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                    ))}
                </select>
            </div>
        );
    }

    if (campo.tipo === 'monto') {
        return (
            <CampoMonto
                campo={campo}
                id={id}
                valor={valor}
                error={error}
                textoError={textoError}
                onCambiar={onCambiar}
                onErrorCampo={onErrorCampo}
            />
        );
    }

    const ayuda = bloqueadoPor || campo.ayuda;
    return (
        <div>
            <label htmlFor={id} className="label">
                {campo.etiqueta}
                {marcaRequerido}
            </label>
            <input
                ref={refFoco}
                id={id}
                type={campo.tipoInput || 'text'}
                inputMode={campo.inputMode}
                autoComplete="off"
                maxLength={campo.maximo}
                className="input-field"
                value={valor ?? ''}
                disabled={Boolean(bloqueadoPor)}
                onChange={(e) => onCambiar(campo.clave, e.target.value)}
                aria-required={campo.requerido || undefined}
                aria-invalid={error ? true : undefined}
                aria-describedby={[ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined}
            />
            {ayuda && <p id={idAyuda} className="mt-1.5 text-sm text-ink-3">{ayuda}</p>}
            {textoError}
        </div>
    );
}

function CampoMonto({ campo, id, valor, error, textoError, onCambiar, onErrorCampo }) {
    const [nota, setNota] = useState('');
    const idAyuda = `${id}-ayuda`;
    const idError = `${id}-error`;
    const idNota = `${id}-nota`;
    const negativo = String(valor ?? '').startsWith('-');
    const monto = montoDesdeTexto(valor);

    function aplicarPegado(texto) {
        if (!String(texto ?? '').trim()) return;
        const resultado = leerMontoPegado(texto, campo.permiteNegativo, valor);
        if (resultado.error) {
            setNota('');
            onErrorCampo(campo.clave, resultado.error);
            return;
        }
        onCambiar(campo.clave, resultado.valor);
        setNota(resultado.redondeado ? 'Se quitaron los centavos: los montos se guardan en pesos enteros.' : '');
    }

    function alEscribir(e) {
        const evento = e.nativeEvent;
        const insertado = typeof evento?.data === 'string' ? evento.data : '';
        // Texto que entra de golpe (sugerencia del teclado, arrastrar y
        // soltar): se interpreta igual que un pegado.
        if (insertado.length > 1 || evento?.inputType === 'insertFromDrop' || evento?.inputType === 'insertReplacementText') {
            aplicarPegado(insertado || e.target.value);
            return;
        }
        setNota('');
        onCambiar(campo.clave, leerMonto(e.target.value, campo.permiteNegativo));
    }

    function alPegar(e) {
        e.preventDefault();
        aplicarPegado(e.clipboardData?.getData('text') ?? '');
    }

    return (
        <div>
            <label htmlFor={id} className="label">{campo.etiqueta}</label>
            <input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                className="input-field num"
                value={mostrarMonto(valor)}
                onChange={alEscribir}
                onPaste={alPegar}
                aria-invalid={error ? true : undefined}
                aria-describedby={[idAyuda, nota && !error && idNota, error && idError].filter(Boolean).join(' ')}
            />
            {/* El teclado numérico del celular no tiene signo menos: una
                tarjeta de crédito con deuda se marca aquí. */}
            {campo.permiteNegativo && (
                <div className="segmented mt-2" role="group" aria-label={`Signo del ${campo.etiqueta.toLowerCase()}`}>
                    <button
                        type="button"
                        aria-pressed={!negativo}
                        onClick={() => onCambiar(campo.clave, conSigno(valor, false))}
                        className="min-h-11! lg:min-h-9!"
                    >
                        A favor
                    </button>
                    <button
                        type="button"
                        aria-pressed={negativo}
                        onClick={() => onCambiar(campo.clave, conSigno(valor, true))}
                        className="min-h-11! lg:min-h-9!"
                    >
                        En contra (deuda)
                    </button>
                </div>
            )}
            <p id={idAyuda} className="mt-1.5 text-sm text-ink-3">
                Se guardará como <Monto valor={monto} />. {campo.ayuda}
            </p>
            {nota && !error && <p id={idNota} className="mt-1.5 text-sm text-ink-2">{nota}</p>}
            {textoError}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Entorno de pruebas (nunca en producción)
// ---------------------------------------------------------------------------

const VOLUMENES = {
    poco: { etiqueta: 'Poco', meses: 3, movimientosPorMes: 20 },
    normal: { etiqueta: 'Normal', meses: 6, movimientosPorMes: 40 },
    mucho: { etiqueta: 'Mucho', meses: 12, movimientosPorMes: 100 }
};

const ETIQUETAS_CONTEO = [
    ['empresas', 'Empresas'],
    ['cajas', 'Cajas'],
    ['proyectos', 'Obras'],
    ['terceros', 'Proveedores'],
    ['categorias', 'Categorías'],
    ['transacciones', 'Movimientos'],
    ['deudasTerceros', 'Cuentas por pagar'],
    ['deudasCajas', 'Préstamos entre cajas']
];

function SeccionEntornoPruebas({ modoLocal, onDatosCambiados }) {
    const host = hostSupabase();
    const idTitulo = useId();
    const [volumen, setVolumen] = useState('normal');
    const [estado, setEstado] = useState({ fase: 'inactivo' });
    const [pidiendoBorrar, setPidiendoBorrar] = useState(false);
    const ocupadoRef = useRef(false);
    const ocupado = estado.fase === 'generando' || estado.fase === 'borrando';
    const opciones = VOLUMENES[volumen];

    const destino = modoLocal ? 'modo local, sin Supabase' : host || 'sin Supabase configurado';
    const explicacion = modoLocal
        ? 'Los datos de prueba quedan solo en este navegador. No se suben a ninguna parte.'
        : host
            ? `Los datos se crean en este dispositivo y se suben al proyecto de pruebas ${host} al sincronizar. Nunca a producción: esta sección no existe en la versión de producción.`
            : 'No hay un proyecto Supabase conectado: los datos quedan solo en este navegador.';

    async function generar() {
        if (ocupadoRef.current) return;
        ocupadoRef.current = true;
        setEstado({ fase: 'generando' });
        try {
            // Import dinámico: el generador queda en su propio chunk y nunca
            // se carga en producción (además lanza error si ES_PRODUCCION).
            const { generarDatosDePrueba } = await import('../app/datosDePrueba');
            const conteos = await generarDatosDePrueba({
                meses: opciones.meses,
                movimientosPorMes: opciones.movimientosPorMes
            });
            setEstado({ fase: 'listo', conteos: conteos || {} });
            onDatosCambiados();
        } catch (error) {
            console.error('No se pudieron generar los datos de prueba:', error);
            setEstado({ fase: 'error', texto: 'No se pudieron generar los datos de prueba.', detalle: error?.message });
        } finally {
            ocupadoRef.current = false;
        }
    }

    async function borrarDatosLocales() {
        if (ocupadoRef.current) return;
        ocupadoRef.current = true;
        setEstado({ fase: 'borrando' });
        try {
            const { borrarDatosModoLocal } = await import('../app/datosDePrueba');
            await borrarDatosModoLocal();
            setEstado({ fase: 'borrado' });
            onDatosCambiados();
        } catch (error) {
            console.error('No se pudieron borrar los datos del modo local:', error);
            setEstado({ fase: 'error', texto: 'No se pudieron borrar los datos del modo local.', detalle: error?.message });
        } finally {
            ocupadoRef.current = false;
            setPidiendoBorrar(false);
        }
    }

    return (
        <section aria-labelledby={idTitulo} className="card card-flush">
            <div className="panel-head">
                <h3 id={idTitulo} className="panel-title flex items-center gap-2">
                    <FlaskConical size={16} aria-hidden="true" className="text-ink-3" />
                    Entorno de pruebas
                </h3>
                {ETIQUETA_ENTORNO && <span className="chip chip-warn">{ETIQUETA_ENTORNO}</span>}
            </div>

            <div className="space-y-4 p-4 md:p-5">
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                    <dt className="eyebrow sm:pt-0.5">Estás en</dt>
                    <dd className="break-words text-ink">
                        {ETIQUETA_ENTORNO} · <span className="mono break-all">{destino}</span>
                    </dd>
                    <dt className="eyebrow mt-2 sm:mt-0 sm:pt-0.5">Base local</dt>
                    <dd className="mono break-all text-ink-2">{NOMBRE_BASE_LOCAL}</dd>
                </dl>

                <p className="text-sm text-ink-2">{explicacion}</p>

                <fieldset>
                    <legend className="label">Cantidad de datos</legend>
                    <div className="segmented">
                        {Object.entries(VOLUMENES).map(([clave, opcion]) => (
                            <button
                                key={clave}
                                type="button"
                                aria-pressed={volumen === clave}
                                onClick={() => setVolumen(clave)}
                                disabled={ocupado}
                                className="min-h-11! lg:min-h-9!"
                            >
                                {opcion.etiqueta}
                            </button>
                        ))}
                    </div>
                    <p className="mt-1.5 text-sm text-ink-3">
                        {opciones.meses} meses, unos {formatoNumero(opciones.meses * opciones.movimientosPorMes)} movimientos,
                        con empresas, cajas, obras, proveedores y deudas inventadas.
                    </p>
                </fieldset>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-secondary" onClick={generar} disabled={ocupado} aria-busy={estado.fase === 'generando' || undefined}>
                        {estado.fase === 'generando' ? (
                            <>
                                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                                Generando...
                            </>
                        ) : (
                            'Generar datos de prueba'
                        )}
                    </button>
                    {modoLocal && (
                        <button type="button" className="btn-danger" onClick={() => setPidiendoBorrar(true)} disabled={ocupado}>
                            <Trash2 size={16} aria-hidden="true" className="shrink-0" />
                            {/* Rótulo corto: .btn-danger no parte líneas y a 320 px
                                "Borrar todos los datos del modo local" se salía del fondo. */}
                            Borrar datos locales
                        </button>
                    )}
                </div>

                <div aria-live="polite">
                    {estado.fase === 'generando' && (
                        <p className="text-sm text-ink-2">
                            Generando {opciones.meses} meses de movimientos. Puede tardar unos segundos; no cierres la app.
                        </p>
                    )}
                    {estado.fase === 'borrando' && <p className="text-sm text-ink-2">Borrando los datos de este navegador...</p>}
                    {estado.fase === 'borrado' && (
                        <p className="text-sm font-medium text-pos">Se borraron los datos del modo local.</p>
                    )}
                    {estado.fase === 'error' && (
                        <div role="alert" className="text-sm">
                            <p className="font-medium text-neg">{estado.texto}</p>
                            {estado.detalle && <p className="mt-1 break-words text-ink-3">{estado.detalle}</p>}
                        </div>
                    )}
                    {estado.fase === 'listo' && (
                        <div>
                            <p className="text-sm font-medium text-pos">Datos de prueba generados.</p>
                            <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
                                {ETIQUETAS_CONTEO.filter(([clave]) => typeof estado.conteos[clave] === 'number').map(([clave, etiqueta]) => (
                                    <div key={clave} className="bg-surface px-3 py-2">
                                        <dt className="eyebrow">{etiqueta}</dt>
                                        <dd className="num text-lg font-semibold text-ink">{formatoNumero(estado.conteos[clave])}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={pidiendoBorrar}
                title="Borrar los datos del modo local"
                message="Se borrarán todas las empresas, cajas, obras, proveedores, movimientos y deudas de este navegador. No toca ningún proyecto de Supabase. No se puede deshacer."
                confirmText="Borrar datos locales"
                cancelText="Cancelar"
                textoProcesando="Borrando..."
                type="danger"
                onConfirm={borrarDatosLocales}
                onCancel={() => setPidiendoBorrar(false)}
            />
        </section>
    );
}
