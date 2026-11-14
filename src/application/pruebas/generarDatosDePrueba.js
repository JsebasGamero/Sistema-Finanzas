// Datos de prueba realistas para una constructora colombiana.
//
// Función pura: con la misma semilla y el mismo "hoy" devuelve exactamente lo
// mismo, y no toca ninguna base. Quien la escribe en Dexie y la encola es
// src/app/datosDePrueba.js.
//
// Reglas que respeta (y que prueba generarDatosDePrueba.test.js):
// - Todo valor cumple los CHECK de supabase_setup.sql (invariante 3).
// - `transacciones.categoria` guarda el NOMBRE (invariante 5).
// - Montos > 0 y redondeados a miles; transferencias con origen != destino.
// - Las deudas tienen `monto_pendiente` y `estado` coherentes con sus `pagos`
//   (restarMontos / estadoDeuda), y cada pago apunta a su movimiento de abono
//   (`transaccion_id`), creado con las categorías de movimientoDeDeuda.js.
// - Las cajas salen con `saldo_actual: 0`. Cada una recibe un INGRESO
//   "Saldo inicial" en el primer día del periodo, como pide docs/DOMINIO.md
//   para el dinero que había antes de usar el sistema. Así el saldo de cada
//   caja es exactamente la suma de sus movimientos (la regla objetivo de la
//   Fase 4), y el reporte de cajas no muestra "diferencia de saldo". Ese
//   saldo inicial se calcula para que ninguna caja quede en negativo en
//   ningún momento del periodo.
import { claveDiaDeDate, fechaLocal, sumarDias } from '../../domain/value-objects/fecha';
import { estadoDeuda, restarMontos } from '../../domain/value-objects/dinero';
import { efectoEnSaldos } from '../../domain/rules/efectoEnSaldos';
import { CATEGORIA_DEUDA } from '../../domain/rules/movimientoDeDeuda';
import { TIPO_MOVIMIENTO } from '../../domain/value-objects/tipoMovimiento';
import { CATEGORIAS_POR_DEFECTO, TIPO_CATEGORIA_POR_DEFECTO } from '../../services/categorias';

const { INGRESO, EGRESO, TRANSFERENCIA } = TIPO_MOVIMIENTO;

/** Va en `usuario_nombre`: permite reconocer (y filtrar) lo generado. */
export const USUARIO_DATOS_DE_PRUEBA = 'Datos de prueba';
export const CATEGORIA_SALDO_INICIAL = 'Saldo inicial';
const CATEGORIA_ACTA = 'Acta de obra';
const CATEGORIA_ANTICIPO = 'Anticipo de obra';

// ---------------------------------------------------------------------------
// Aleatoriedad con semilla
// ---------------------------------------------------------------------------

/** fmix32 de MurmurHash3: separa semillas cercanas (1000 y 1001). */
function mezclar32(x) {
    let h = x >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
}

/** Convierte cualquier semilla (número o texto) en un entero de 32 bits. */
export function semillaNumerica(semilla) {
    if (typeof semilla === 'number' && Number.isFinite(semilla)) {
        return mezclar32(Math.trunc(semilla));
    }
    let h = 0x811c9dc5; // FNV-1a
    for (const caracter of String(semilla ?? '')) {
        h ^= caracter.codePointAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return mezclar32(h);
}

/** Generador mulberry32 con utilidades. */
export function crearAleatorio(semilla) {
    let estado = semillaNumerica(semilla);

    function numero() {
        estado = (estado + 0x6d2b79f5) >>> 0;
        let t = estado;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    const entero = (min, max) => min + Math.floor(numero() * (max - min + 1));
    const elegir = (lista) => lista[Math.floor(numero() * lista.length)];

    function ponderado(opciones) {
        const total = opciones.reduce((suma, o) => suma + o.peso, 0);
        let resto = numero() * total;
        for (const opcion of opciones) {
            resto -= opcion.peso;
            if (resto < 0) return opcion;
        }
        return opciones[opciones.length - 1];
    }

    function barajar(lista) {
        const copia = [...lista];
        for (let i = copia.length - 1; i > 0; i--) {
            const j = entero(0, i);
            [copia[i], copia[j]] = [copia[j], copia[i]];
        }
        return copia;
    }

    function uuid() {
        const bytes = Array.from({ length: 16 }, () => entero(0, 255));
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
        const h = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }

    return { numero, entero, elegir, ponderado, barajar, uuid };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const PESOS_DV_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de un NIT (algoritmo de la DIAN). */
export function digitoVerificacionNit(numero) {
    const suma = String(numero)
        .split('')
        .reverse()
        .reduce((total, digito, i) => total + Number(digito) * PESOS_DV_NIT[i], 0);
    const residuo = suma % 11;
    return residuo > 1 ? 11 - residuo : residuo;
}

function nitFicticio(rng) {
    const base = `9${String(rng.entero(0, 99_999_999)).padStart(8, '0')}`;
    return `${base}-${digitoVerificacionNit(base)}`;
}

const cedulaFicticia = (rng) => String(rng.entero(10_000_000, 1_199_999_999));
const celularFicticio = (rng) => `3${rng.entero(0, 2)}${rng.entero(0, 9)} ${rng.entero(100, 999)} ${rng.entero(1000, 9999)}`;

/** Monto redondo: a miles, y a decenas de miles por encima de 2 millones. */
function montoRedondo(rng, min, max) {
    const paso = max > 2_000_000 ? 10_000 : 1_000;
    return Math.max(paso, Math.round(rng.entero(min, max) / paso) * paso);
}

const dos = (n) => String(n).padStart(2, '0');

/**
 * Timestamp del día `fecha`. Las horas van de 12:00 a 22:59 UTC, que en
 * Colombia (UTC-5) son de 7 a. m. a 5 p. m. del MISMO día: el created_at
 * nunca cae en otra fecha de calendario que la del movimiento.
 */
const marcaDeTiempo = (rng, fecha) =>
    `${fecha}T${dos(rng.entero(12, 22))}:${dos(rng.entero(0, 59))}:${dos(rng.entero(0, 59))}.000Z`;

const diasEntre = (desde, hasta) => Math.round((fechaLocal(hasta) - fechaLocal(desde)) / 86_400_000);

function fechaEntre(rng, desde, hasta) {
    const total = Math.max(0, diasEntre(desde, hasta));
    return sumarDias(desde, rng.entero(0, total));
}

/** Meses del periodo, del más viejo al actual (este solo hasta hoy). */
function mesesDelPeriodo(hoy, meses) {
    const fechaHoy = fechaLocal(hoy);
    const lista = [];
    for (let k = meses - 1; k >= 0; k--) {
        const primero = new Date(fechaHoy.getFullYear(), fechaHoy.getMonth() - k, 1);
        const dias = k === 0
            ? fechaHoy.getDate()
            : new Date(primero.getFullYear(), primero.getMonth() + 1, 0).getDate();
        lista.push({ anio: primero.getFullYear(), mes: primero.getMonth(), dias });
    }
    return lista;
}

/**
 * Parte `total` (múltiplo de `paso`) en `partes` montos múltiplos de `paso`,
 * todos mayores que cero.
 */
function repartir(rng, total, partes, paso) {
    const montos = [];
    let restante = total;
    for (let i = 0; i < partes - 1; i++) {
        const quedan = partes - i;
        const maximo = restante - paso * (quedan - 1);
        const sugerido = Math.round(((restante / quedan) * (0.6 + 0.8 * rng.numero())) / paso) * paso;
        const monto = Math.min(Math.max(sugerido, paso), maximo);
        montos.push(monto);
        restante -= monto;
    }
    montos.push(restante);
    return montos.filter((m) => m > 0);
}

/** Abonos de una deuda según el estado al que se quiere llegar. */
function planDeAbonos(rng, objetivo, montoOriginal) {
    const paso = 10_000;
    if (objetivo === 'PAGADA') return repartir(rng, montoOriginal, rng.entero(1, 3), paso);
    if (objetivo === 'PARCIAL') {
        const fraccion = 0.3 + 0.5 * rng.numero();
        const total = Math.min(
            Math.max(Math.round((montoOriginal * fraccion) / paso) * paso, paso),
            montoOriginal - paso,
        );
        return repartir(rng, total, rng.entero(1, 2), paso);
    }
    return [];
}

// ---------------------------------------------------------------------------
// Plantillas (nombres, NIT y cuentas son ficticios)
// ---------------------------------------------------------------------------

const PLANTILLA_EMPRESAS = [
    { nombre: 'Constructora Cerro Verde S.A.S.', direccion: 'Cra. 15 # 93-47, Bogotá', telefono: '601 742 1180' },
    { nombre: 'Obras y Vías del Llano S.A.S.', direccion: 'Calle 38 # 30A-12, Villavicencio', telefono: '608 668 2045' },
];

const PLANTILLA_CAJAS = [
    { empresa: 0, nombre: 'Bancolombia corriente', tipo: 'Banco', banco: 'Bancolombia' },
    { empresa: 0, nombre: 'Caja menor obra', tipo: 'Efectivo' },
    { empresa: 0, nombre: 'Tarjeta de crédito empresarial', tipo: 'Tarjeta', banco: 'Bancolombia' },
    { empresa: 1, nombre: 'Davivienda ahorros', tipo: 'Banco', banco: 'Davivienda' },
    { empresa: 1, nombre: 'Banco de Bogotá corriente', tipo: 'Banco', banco: 'Banco de Bogotá' },
    { empresa: 1, nombre: 'Caja general', tipo: 'Efectivo' },
];

// `banco`: índice en PLANTILLA_CAJAS de la cuenta de la obra. Cada obra
// cobra y paga por su cuenta, como se maneja en la práctica; si todo saliera
// de cualquier banco de la empresa, unos quedarían muy en rojo y otros muy
// llenos.
const PLANTILLA_PROYECTOS = [
    { empresa: 0, banco: 0, nombre: 'Edificio Mirador del Parque', estado: 'Activo', presupuesto: 2_850_000_000, descripcion: 'Torre de 12 pisos, 48 apartamentos.' },
    { empresa: 1, banco: 3, nombre: 'Pavimentación vía Puerto López', estado: 'Activo', presupuesto: 1_420_000_000, descripcion: 'Pavimento flexible, 6,2 km.' },
    { empresa: 0, banco: 0, nombre: 'Bodega logística Funza', estado: 'Pausado', presupuesto: 960_000_000, descripcion: 'Suspendida a la espera de licencia de ampliación.' },
    { empresa: 1, banco: 4, nombre: 'Colegio rural La Esperanza', estado: 'Finalizado', presupuesto: 240_000_000, descripcion: 'Cuatro aulas y batería sanitaria.' },
];

// `rol` decide qué gastos se le pagan a cada tercero.
const PLANTILLA_TERCEROS = [
    { nombre: 'Ferretería El Constructor', tipo: 'Proveedor', rol: 'materiales' },
    { nombre: 'Concretos Premezclados del Centro', tipo: 'Proveedor', rol: 'materiales' },
    { nombre: 'Aceros y Hierros La 30', tipo: 'Proveedor', rol: 'materiales' },
    { nombre: 'Estación de Servicio La Ruta', tipo: 'Proveedor', rol: 'combustible' },
    { nombre: 'Equipos y Andamios del Llano', tipo: 'Proveedor', rol: 'maquinaria' },
    { nombre: 'Transportes Volquetas Unidas', tipo: 'Proveedor', rol: 'transporte' },
    { nombre: 'Jhon Fredy Ramírez Ortiz', tipo: 'Empleado', rol: 'personal' },
    { nombre: 'Luz Marina Ospina Gil', tipo: 'Empleado', rol: 'personal' },
    { nombre: 'Wilson Andrés Cárdenas', tipo: 'Empleado', rol: 'personal' },
    { nombre: 'Instalaciones Eléctricas JR S.A.S.', tipo: 'Contratista', rol: 'contratista' },
    { nombre: 'Hidrosanitarios del Valle', tipo: 'Contratista', rol: 'contratista' },
    { nombre: 'Estructuras Metálicas Bolívar', tipo: 'Contratista', rol: 'contratista' },
];

// Proveedores que suelen dar crédito (cuentas por pagar).
const ROLES_CON_CREDITO = ['materiales', 'maquinaria', 'contratista'];

// Egresos: peso relativo, rango de monto, quién cobra, de qué caja sale y si
// a veces es un gasto de administración (sin obra).
const PLAN_EGRESOS = [
    {
        categoria: 'Materiales', peso: 18, monto: [1_500_000, 18_000_000], rol: 'materiales', cajas: ['Banco'],
        descripciones: ['Cemento gris x 50 bultos', 'Varilla corrugada 1/2"', 'Concreto 3000 psi', 'Bloque No. 5', 'Arena y gravilla', 'Malla electrosoldada'],
    },
    {
        // Compras menores de ferretería: con la tarjeta o la caja menor.
        categoria: 'Materiales', peso: 8, monto: [40_000, 1_200_000], rol: 'materiales', cajas: ['Tarjeta', 'Efectivo'],
        descripciones: ['Tornillería y anclajes', 'Discos de corte', 'Tubería PVC sanitaria', 'Cinta y silicona'],
    },
    {
        categoria: 'Nómina', peso: 14, monto: [1_400_000, 4_200_000], rol: 'personal', cajas: ['Banco'],
        descripciones: ['Pago de quincena', 'Nómina quincenal', 'Horas extra'],
    },
    {
        categoria: 'Servicios', peso: 10, monto: [1_500_000, 14_000_000], rol: 'contratista', cajas: ['Banco'],
        descripciones: ['Corte de obra contratista', 'Avance de instalaciones', 'Acta de subcontrato'],
    },
    {
        categoria: 'Combustible (ACPM)', peso: 10, monto: [180_000, 1_600_000], rol: 'combustible', cajas: ['Efectivo', 'Tarjeta'],
        descripciones: ['ACPM retroexcavadora', 'ACPM volqueta', 'Tanqueo planta eléctrica'],
    },
    {
        categoria: 'Alquiler Maquinaria', peso: 8, monto: [700_000, 8_500_000], rol: 'maquinaria', cajas: ['Banco'],
        descripciones: ['Alquiler retroexcavadora', 'Alquiler mezcladora', 'Alquiler de andamios'],
    },
    {
        categoria: 'Transporte', peso: 8, monto: [150_000, 1_800_000], rol: 'transporte', cajas: ['Efectivo', 'Banco'],
        descripciones: ['Viaje de volqueta', 'Acarreo de material', 'Retiro de escombros'],
    },
    {
        categoria: 'Viáticos', peso: 7, monto: [40_000, 600_000], rol: 'personal', cajas: ['Efectivo'],
        descripciones: ['Almuerzos de la cuadrilla', 'Hospedaje del residente', 'Pasajes'],
    },
    {
        categoria: 'Seguridad Social', peso: 5, monto: [900_000, 5_500_000], rol: null, cajas: ['Banco'], sinObra: 0.5,
        descripciones: ['Planilla PILA', 'Aportes a seguridad social'],
    },
    {
        categoria: 'Otros', peso: 4, monto: [30_000, 1_200_000], rol: null, cajas: ['Efectivo'], sinObra: 0.4,
        descripciones: ['Papelería', 'Elementos de aseo', 'Dotación EPP'],
    },
];

const DESCRIPCION_TRANSFERENCIA = {
    Efectivo: 'Reembolso de caja menor',
    Tarjeta: 'Pago de tarjeta de crédito',
    Banco: 'Traslado entre cuentas',
};

// ---------------------------------------------------------------------------
// Generador
// ---------------------------------------------------------------------------

/**
 * @param {object} opciones
 * @param {string} opciones.hoy fecha 'YYYY-MM-DD' (inyectada: la función es pura)
 * @param {number} [opciones.meses=6] meses hacia atrás, contando el actual
 * @param {number} [opciones.movimientosPorMes=40] movimientos normales por mes
 *   (aparte van los saldos iniciales y los préstamos y abonos de las deudas)
 * @param {number|string} [opciones.semilla=1]
 * @param {() => string} [opciones.generarId] por defecto, UUID v4 de la semilla
 * @param {string} [opciones.usuario]
 */
export function generarDatosDePrueba({
    hoy,
    meses = 6,
    movimientosPorMes = 40,
    semilla = 1,
    generarId,
    usuario = USUARIO_DATOS_DE_PRUEBA,
} = {}) {
    const fechaHoy = fechaLocal(hoy);
    if (typeof hoy !== 'string' || !fechaHoy || claveDiaDeDate(fechaHoy) !== hoy) {
        throw new Error('generarDatosDePrueba necesita `hoy` como fecha YYYY-MM-DD.');
    }
    const nMeses = Math.min(Math.max(Math.trunc(Number(meses)) || 1, 1), 36);
    const nPorMes = Math.min(Math.max(Math.trunc(Number(movimientosPorMes)) || 0, 0), 500);

    const rng = crearAleatorio(semilla);
    // Los ids salen de otra secuencia: así el contenido es el mismo se
    // inyecte o no `generarId`.
    const nuevoId = generarId ?? crearAleatorio(`ids:${semillaNumerica(semilla)}`).uuid;

    const periodo = mesesDelPeriodo(hoy, nMeses);
    const inicio = claveDiaDeDate(new Date(periodo[0].anio, periodo[0].mes, 1));
    const antesDelInicio = () => marcaDeTiempo(rng, sumarDias(inicio, -rng.entero(30, 120)));

    // --- Maestros -----------------------------------------------------------

    const nits = new Set();
    const empresas = PLANTILLA_EMPRESAS.map((p) => {
        let nit = nitFicticio(rng);
        while (nits.has(nit)) nit = nitFicticio(rng);
        nits.add(nit);
        return {
            id: nuevoId(),
            nombre: p.nombre,
            nit,
            direccion: p.direccion,
            telefono: p.telefono,
            created_at: antesDelInicio(),
        };
    });

    const cajas = PLANTILLA_CAJAS.map((p) => ({
        id: nuevoId(),
        nombre: p.nombre,
        tipo: p.tipo,
        empresa_id: empresas[p.empresa].id,
        saldo_actual: 0,
        banco_nombre: p.banco ?? null,
        numero_cuenta: p.tipo === 'Banco'
            ? `${rng.entero(100, 999)}-${rng.entero(100000, 999999)}-${dos(rng.entero(10, 99))}`
            : p.tipo === 'Tarjeta' ? `**** ${rng.entero(1000, 9999)}` : null,
        created_at: antesDelInicio(),
    }));

    // Ventana en la que cada obra recibe movimientos, y su cuenta.
    const ventanas = new Map();
    const bancoDeObra = new Map();
    const proyectos = PLANTILLA_PROYECTOS.map((p) => {
        const fechaInicio = sumarDias(inicio, -rng.entero(20, 150));
        let fechaFin = null;
        let activaHasta = hoy;
        if (p.estado === 'Finalizado') {
            fechaFin = sumarDias(hoy, -rng.entero(35, 70));
            if (fechaFin <= fechaInicio) fechaFin = sumarDias(fechaInicio, 30);
            activaHasta = fechaFin;
        } else if (p.estado === 'Pausado') {
            activaHasta = sumarDias(hoy, -rng.entero(12, 30));
        }
        const proyecto = {
            id: nuevoId(),
            nombre: p.nombre,
            empresa_id: empresas[p.empresa].id,
            presupuesto_estimado: p.presupuesto,
            estado: p.estado,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            descripcion: p.descripcion,
            created_at: marcaDeTiempo(rng, fechaInicio),
        };
        ventanas.set(proyecto.id, { desde: fechaInicio, hasta: activaHasta });
        bancoDeObra.set(proyecto.id, cajas[p.banco]);
        return proyecto;
    });

    const terceros = PLANTILLA_TERCEROS.map((p) => ({
        id: nuevoId(),
        nombre: p.nombre,
        tipo: p.tipo,
        nit_cedula: p.tipo === 'Empleado' ? cedulaFicticia(rng) : nitFicticio(rng),
        telefono: celularFicticio(rng),
        email: null,
        direccion: null,
        created_at: antesDelInicio(),
    }));
    const tercerosPorRol = (rol) => terceros.filter((_, i) => PLANTILLA_TERCEROS[i].rol === rol);
    const acreedoresComerciales = terceros.filter((_, i) => ROLES_CON_CREDITO.includes(PLANTILLA_TERCEROS[i].rol));

    // Las por defecto, como las siembra la app (AMBOS), y las de ingreso que
    // necesita una constructora y que la lista por defecto no trae.
    const categorias = [
        ...CATEGORIAS_POR_DEFECTO.map((nombre) => ({ nombre, tipo: TIPO_CATEGORIA_POR_DEFECTO })),
        { nombre: CATEGORIA_ACTA, tipo: 'INGRESO' },
        { nombre: CATEGORIA_ANTICIPO, tipo: 'INGRESO' },
        { nombre: CATEGORIA_SALDO_INICIAL, tipo: 'INGRESO' },
    ].map((c) => ({ id: nuevoId(), nombre: c.nombre, tipo: c.tipo, created_at: antesDelInicio() }));

    // --- Movimientos -------------------------------------------------------

    const transacciones = [];
    function agregarMovimiento({ fecha, tipo, monto, categoria = null, proyectoId = null, origenId, destinoId = null, terceroId = null, descripcion, createdAt }) {
        const tx = {
            id: nuevoId(),
            fecha,
            descripcion,
            monto,
            tipo_movimiento: tipo,
            categoria,
            proyecto_id: proyectoId,
            caja_origen_id: origenId,
            caja_destino_id: destinoId,
            tercero_id: terceroId,
            soporte_url: null,
            sincronizado: false,
            usuario_nombre: usuario,
            created_at: createdAt ?? marcaDeTiempo(rng, fecha),
        };
        transacciones.push(tx);
        return tx;
    }

    const obrasActivasEn = (fecha) => proyectos.filter((p) => {
        const v = ventanas.get(p.id);
        return fecha >= v.desde && fecha <= v.hasta;
    });

    const cajaPorId = new Map(cajas.map((c) => [c.id, c]));
    const bancoPrincipal = (empresaId) => cajas.find((c) => c.empresa_id === empresaId && c.tipo === 'Banco');

    /** Caja de uno de los `tipos`; si es banco y hay obra, la cuenta de la obra. */
    function elegirCaja(empresaId, tipos, proyecto = null) {
        const tipo = rng.elegir(tipos);
        if (tipo !== 'Banco') {
            const candidatas = cajas.filter((c) => c.empresa_id === empresaId && c.tipo === tipo);
            if (candidatas.length > 0) return rng.elegir(candidatas);
        }
        return (proyecto && bancoDeObra.get(proyecto.id)) || bancoPrincipal(empresaId);
    }

    function egreso(fecha) {
        const plan = rng.ponderado(PLAN_EGRESOS);
        const activas = obrasActivasEn(fecha);
        const sinObra = activas.length === 0 || (plan.sinObra && rng.numero() < plan.sinObra);
        const proyecto = sinObra ? null : rng.elegir(activas);
        const empresaId = proyecto?.empresa_id ?? rng.elegir(empresas).id;
        const tercero = plan.rol ? rng.elegir(tercerosPorRol(plan.rol)) : null;
        return agregarMovimiento({
            fecha,
            tipo: EGRESO,
            monto: montoRedondo(rng, ...plan.monto),
            categoria: plan.categoria,
            proyectoId: proyecto?.id ?? null,
            origenId: elegirCaja(empresaId, plan.cajas, proyecto).id,
            terceroId: tercero?.id ?? null,
            descripcion: rng.elegir(plan.descripciones),
        });
    }

    function ingreso(fecha) {
        const activas = obrasActivasEn(fecha);
        const proyecto = activas.length > 0 ? rng.elegir(activas) : null;
        const empresaId = proyecto?.empresa_id ?? rng.elegir(empresas).id;
        const esActa = rng.numero() < 0.7;
        return agregarMovimiento({
            fecha,
            tipo: INGRESO,
            monto: montoRedondo(rng, 4_000_000, 32_000_000),
            categoria: esActa ? CATEGORIA_ACTA : CATEGORIA_ANTICIPO,
            proyectoId: proyecto?.id ?? null,
            origenId: elegirCaja(empresaId, ['Banco'], proyecto).id,
            descripcion: esActa ? `Pago acta parcial No. ${rng.entero(1, 24)}` : 'Anticipo de contrato de obra',
        });
    }

    /** Traslado suelto desde el banco principal a otra caja de la empresa. */
    function traslado(fecha) {
        const empresa = rng.elegir(empresas);
        const origen = bancoPrincipal(empresa.id);
        const destino = rng.elegir(cajas.filter((c) => c.empresa_id === empresa.id && c.id !== origen.id));
        agregarMovimiento({
            fecha,
            tipo: TRANSFERENCIA,
            monto: montoRedondo(rng, 500_000, 6_000_000),
            origenId: origen.id,
            destinoId: destino.id,
            descripcion: DESCRIPCION_TRANSFERENCIA[destino.tipo],
        });
    }

    /**
     * Las transferencias del mes reponen lo que gastaron la caja menor y la
     * tarjeta (reembolso de caja menor, pago de la tarjeta), como se hace en
     * una obra. Con montos al azar, una caja que solo gasta acumula meses en
     * rojo y su saldo inicial tendría que ser absurdo.
     */
    function reponer(salidasDelMes, cupos, fechaDelMes) {
        const destinos = [...salidasDelMes.keys()]
            .sort((a, b) => salidasDelMes.get(b) - salidasDelMes.get(a))
            .map((id) => cajaPorId.get(id));
        if (destinos.length === 0) {
            for (let i = 0; i < cupos; i++) traslado(fechaDelMes());
            return;
        }
        const veces = new Map();
        for (let i = 0; i < cupos; i++) {
            const destino = destinos[i % destinos.length];
            veces.set(destino, (veces.get(destino) ?? 0) + 1);
        }
        for (const [destino, n] of veces) {
            const monto = Math.max(200_000, Math.ceil(salidasDelMes.get(destino.id) / n / 10_000) * 10_000);
            for (let k = 0; k < n; k++) {
                agregarMovimiento({
                    fecha: fechaDelMes(),
                    tipo: TRANSFERENCIA,
                    monto,
                    origenId: bancoPrincipal(destino.empresa_id).id,
                    destinoId: destino.id,
                    descripcion: DESCRIPCION_TRANSFERENCIA[destino.tipo],
                });
            }
        }
    }

    const nEgresos = Math.round(nPorMes * 0.7);
    const nIngresos = Math.round(nPorMes * 0.2);
    const nTransferencias = nPorMes - nEgresos - nIngresos;
    const tiposDelMes = [...Array(nEgresos).fill(egreso), ...Array(nIngresos).fill(ingreso)];
    for (const mes of periodo) {
        const fechaDelMes = () => claveDiaDeDate(new Date(mes.anio, mes.mes, rng.entero(1, mes.dias)));
        const salidas = new Map();
        for (const crear of rng.barajar(tiposDelMes)) {
            const tx = crear(fechaDelMes());
            if (tx.tipo_movimiento === EGRESO && cajaPorId.get(tx.caja_origen_id).tipo !== 'Banco') {
                salidas.set(tx.caja_origen_id, (salidas.get(tx.caja_origen_id) ?? 0) + tx.monto);
            }
        }
        reponer(salidas, nTransferencias, fechaDelMes);
    }

    // --- Deudas ------------------------------------------------------------

    const OBJETIVOS = ['PAGADA', 'PARCIAL', 'PENDIENTE'];
    const ultimoDiaParaDeudas = (dias) => {
        const limite = sumarDias(hoy, -dias);
        return limite < inicio ? inicio : limite;
    };

    /** Crea los abonos en orden de fecha; los que caerían después de hoy no se hacen. */
    function abonar(objetivo, montoOriginal, desde, crearAbono) {
        const pagos = [];
        let fecha = desde;
        for (const monto of planDeAbonos(rng, objetivo, montoOriginal)) {
            fecha = sumarDias(fecha, rng.entero(7, 30));
            if (fecha > hoy) break;
            pagos.push(crearAbono(monto, fecha));
        }
        const pagado = pagos.reduce((suma, p) => suma + p.monto, 0);
        const montoPendiente = restarMontos(montoOriginal, pagado);
        return { pagos, montoPendiente, estado: estadoDeuda(montoPendiente, montoOriginal) };
    }

    const nDeudasTerceros = Math.min(6, Math.max(2, nMeses));
    const deudasTerceros = [];
    for (let i = 0; i < nDeudasTerceros; i++) {
        const tercero = rng.elegir(acreedoresComerciales);
        const fechaDeuda = fechaEntre(rng, inicio, ultimoDiaParaDeudas(5));
        const activas = obrasActivasEn(fechaDeuda);
        const proyecto = activas.length > 0 ? rng.elegir(activas) : null;
        const empresaId = proyecto?.empresa_id ?? rng.elegir(empresas).id;
        const montoOriginal = montoRedondo(rng, 3_000_000, 28_000_000);
        const descripcion = `Factura FE-${rng.entero(1000, 9999)} a crédito`;

        const { pagos, montoPendiente, estado } = abonar(OBJETIVOS[i % 3], montoOriginal, fechaDeuda, (monto, fecha) => {
            const caja = elegirCaja(empresaId, ['Banco'], proyecto);
            // Igual que DeudaTercerosPanel: EGRESO "Pago Deuda" con el tercero
            // y la obra de la deuda.
            const tx = agregarMovimiento({
                fecha,
                tipo: EGRESO,
                monto,
                categoria: CATEGORIA_DEUDA.ABONO_DEUDA_TERCERO,
                proyectoId: proyecto?.id ?? null,
                origenId: caja.id,
                terceroId: tercero.id,
                descripcion: `Abono deuda: ${tercero.nombre} - ${descripcion}`,
            });
            return { monto, fecha: tx.created_at, descripcion: 'Abono', caja_id: caja.id, usuario_nombre: usuario, transaccion_id: tx.id };
        });

        deudasTerceros.push({
            id: nuevoId(),
            tercero_id: tercero.id,
            proyecto_id: proyecto?.id ?? null,
            empresa_id: empresaId,
            monto_original: montoOriginal,
            monto_pendiente: montoPendiente,
            fecha_deuda: fechaDeuda,
            estado,
            descripcion,
            pagos,
            usuario_nombre: usuario,
            created_at: marcaDeTiempo(rng, fechaDeuda),
        });
    }

    const nPrestamos = Math.min(3, Math.max(1, Math.ceil(nMeses / 2)));
    const deudasCajas = [];
    for (let i = 0; i < nPrestamos; i++) {
        const acreedora = rng.elegir(cajas.filter((c) => c.tipo === 'Banco'));
        const deudora = rng.elegir(cajas.filter((c) => c.id !== acreedora.id && c.tipo !== 'Tarjeta'));
        const fechaPrestamo = fechaEntre(rng, inicio, ultimoDiaParaDeudas(10));
        const montoOriginal = montoRedondo(rng, 2_000_000, 15_000_000);
        const descripcion = `Préstamo de ${acreedora.nombre} a ${deudora.nombre}`;

        // Igual que DeudaCajasPanel: el préstamo es una TRANSFERENCIA
        // acreedora -> deudora, y cada abono la inversa.
        const prestamo = agregarMovimiento({
            fecha: fechaPrestamo,
            tipo: TRANSFERENCIA,
            monto: montoOriginal,
            categoria: CATEGORIA_DEUDA.PRESTAMO_ENTRE_CAJAS,
            origenId: acreedora.id,
            destinoId: deudora.id,
            descripcion,
        });

        const { pagos, montoPendiente, estado } = abonar(OBJETIVOS[i % 3], montoOriginal, fechaPrestamo, (monto, fecha) => {
            const tx = agregarMovimiento({
                fecha,
                tipo: TRANSFERENCIA,
                monto,
                categoria: CATEGORIA_DEUDA.ABONO_PRESTAMO_CAJAS,
                origenId: deudora.id,
                destinoId: acreedora.id,
                descripcion: `Pago deuda: ${deudora.nombre} → ${acreedora.nombre}`,
            });
            return { monto, fecha: tx.created_at, usuario_nombre: usuario, transaccion_id: tx.id };
        });

        deudasCajas.push({
            id: nuevoId(),
            caja_deudora_id: deudora.id,
            caja_acreedora_id: acreedora.id,
            monto_original: montoOriginal,
            monto_pendiente: montoPendiente,
            fecha_prestamo: fechaPrestamo,
            estado,
            descripcion,
            pagos,
            usuario_nombre: usuario,
            created_at: prestamo.created_at,
        });
    }

    // --- Saldos iniciales ----------------------------------------------------

    ordenarCronologicamente(transacciones);
    const minimoPorCaja = minimosDeSaldo(transacciones, cajas);
    const COLCHON = { Banco: [20_000_000, 60_000_000], Efectivo: [1_000_000, 3_000_000], Tarjeta: [2_000_000, 5_000_000] };
    for (const [i, caja] of cajas.entries()) {
        const faltante = Math.max(0, -minimoPorCaja.get(caja.id));
        const colchon = montoRedondo(rng, ...COLCHON[caja.tipo]);
        // Redondeado hacia arriba a decenas de miles para que siga siendo un
        // monto "de persona" y nunca quede por debajo de lo que falta.
        const saldoInicial = Math.ceil((faltante + colchon) / 10_000) * 10_000;
        agregarMovimiento({
            fecha: inicio,
            tipo: INGRESO,
            monto: saldoInicial,
            categoria: CATEGORIA_SALDO_INICIAL,
            origenId: caja.id,
            descripcion: 'Saldo con el que la caja empezó a usar el sistema',
            // Antes que cualquier otro movimiento del primer día (esos van de
            // las 12:00 UTC en adelante).
            createdAt: `${inicio}T11:00:${dos(i)}.000Z`,
        });
    }
    ordenarCronologicamente(transacciones);

    return { empresas, cajas, proyectos, terceros, categorias, transacciones, deudasTerceros, deudasCajas };
}

/**
 * Orden de fecha y luego hora de registro. `sort` es estable: los empates
 * conservan el orden de creación, así que el resultado no depende de los ids.
 */
export function ordenarCronologicamente(transacciones) {
    return transacciones.sort((a, b) =>
        a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
}

/**
 * Saldo más bajo que alcanza cada caja recorriendo los movimientos en orden,
 * partiendo de 0. (Lo usan el generador y sus tests.)
 * @returns {Map<string, number>}
 */
export function minimosDeSaldo(transaccionesOrdenadas, cajas) {
    const saldo = new Map(cajas.map((c) => [c.id, 0]));
    const minimo = new Map(cajas.map((c) => [c.id, 0]));
    for (const tx of transaccionesOrdenadas) {
        for (const { cajaId, delta } of efectoEnSaldos(tx)) {
            const nuevo = (saldo.get(cajaId) ?? 0) + delta;
            saldo.set(cajaId, nuevo);
            if (nuevo < (minimo.get(cajaId) ?? 0)) minimo.set(cajaId, nuevo);
        }
    }
    return minimo;
}
