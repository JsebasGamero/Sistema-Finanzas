# Dominio: reglas de negocio

Este documento describe **qué significa** cada concepto y **qué debe pasar**
con el dinero en cada operación. Cuando el código y este documento no
coinciden, uno de los dos tiene un bug: averigua cuál antes de cambiar nada.

## Glosario

| Término | Significado |
|---|---|
| **Empresa** | Persona jurídica (MAVICOL SAS, PROEXI SAS...). Agrupa cajas y proyectos. |
| **Caja** | Cualquier lugar donde hay dinero: efectivo, cuenta bancaria o tarjeta. Tipos: `Efectivo`, `Banco`, `Tarjeta`. |
| **Proyecto / Obra** | Contrato u obra a la que se imputan gastos. Estados: `Activo`, `Pausado`, `Finalizado`. |
| **Tercero** | Proveedor, empleado o contratista. Tipos: `Proveedor`, `Empleado`, `Contratista`. |
| **Movimiento / Transacción** | Registro de dinero que entra, sale o cambia de caja. |
| **Categoría** | Clasificación del movimiento (Nómina, Materiales, ACPM...). Tipos: `INGRESO`, `EGRESO`, `AMBOS`. |
| **Préstamo entre cajas** | Una caja le presta dinero a otra. Queda una deuda interna (`deudas_cajas`). |
| **Cuenta por pagar** | Deuda con un tercero, típicamente crédito de un proveedor (`deudas_terceros`). |
| **Abono** | Pago parcial o total de una deuda. |
| **Soporte** | Foto de la factura o recibo que respalda un movimiento. |

## Tipos de movimiento y su efecto en los saldos

Esta tabla es la regla central del sistema.

| Tipo | Caja origen | Caja destino | Efecto |
|---|---|---|---|
| `INGRESO` | obligatoria | no aplica | origen **+ monto** |
| `EGRESO` | obligatoria | no aplica | origen **− monto** |
| `TRANSFERENCIA` | obligatoria | **obligatoria y distinta** | origen **− monto**, destino **+ monto** |

Consecuencias:

- Una transferencia **no cambia** el saldo total del sistema, solo lo mueve.
- Una transferencia sin destino haría desaparecer dinero. Está prohibida.
- `monto` siempre es positivo (`CHECK (monto > 0)`). El signo lo da el tipo.
- `fecha` es obligatoria y tiene que ser un día real en formato `YYYY-MM-DD`
  (`FECHA_REQUERIDA` / `FECHA_INVALIDA` en `validarMovimiento`). Una fecha
  vacía la rechaza Postgres, y la cola descartaba el movimiento después de
  haber subido el ajuste de saldo (MOV-2).
- Editar un movimiento = revertir el efecto del original + aplicar el nuevo.
  El "original" es la fila **guardada**, que el caso de uso relee; no la copia
  que tiene la pantalla, que puede estar vieja (MOV-4).
- Borrar un movimiento = revertir su efecto. Es idempotente: si la fila ya
  no está (doble toque, o la borró otro dispositivo), no se revierte nada.
- Alta, edición y borrado son **atómicos**: la fila, los ajustes de saldo y
  lo encolado se guardan juntos o no se guarda nada (unidad de trabajo, C22).
  Un reintento después de un fallo no duplica el efecto. La sincronización
  se lanza después y no se espera: el formulario no queda bloqueado mientras
  sube la cola (MOV-7).
- Una edición deja el movimiento `sincronizado: false` hasta que el UPDATE
  sube (C21).

### Movimientos que pertenecen a una deuda

Los paneles de Deudas crean movimientos que son la mitad de una operación
compuesta; la otra mitad es la deuda (`monto_pendiente`, `estado`, `pagos`):

| Tipo | Categoría | Qué es |
|---|---|---|
| `TRANSFERENCIA` | `Préstamo entre Cajas` | El préstamo de una caja a otra |
| `TRANSFERENCIA` | `Pago Préstamo` | Un abono a ese préstamo |
| `EGRESO` | `Pago Deuda` | Un abono a un proveedor |

Regla (C15), en `src/domain/rules/movimientoDeDeuda.js`:

- Esos movimientos **solo se administran desde Deudas**. Editarlos o
  borrarlos sueltos movería la caja sin tocar la deuda. La UI no ofrece
  editar ni borrar ("Se administra desde Deudas") y los casos de uso los
  rechazan con `MovimientoDeDeudaError`.
- Por la misma razón, el formulario de movimientos no puede **crear** uno
  (ni convertir un movimiento normal en uno): quedaría sin deuda y, por la
  regla anterior, bloqueado para siempre. Error `RESERVADO_PARA_DEUDAS`.
- Se reconocen por tipo **y** categoría: un `EGRESO` "Pago Préstamo" (la
  cuota de un crédito bancario) es un gasto normal.
- Pendiente (porción 3 de la Fase 3): casos de uso de deudas que, al anular
  un abono, ajusten la deuda y el movimiento juntos.

### Saldo de una caja

**Regla objetivo:** el saldo de una caja es

```
saldo(caja) = Σ ingresos con origen = caja
            − Σ egresos con origen = caja
            − Σ transferencias con origen = caja
            + Σ transferencias con destino = caja
```

Hoy se guarda en `cajas.saldo_actual` y se actualiza de forma incremental,
lo que permite que diverja de esta fórmula (ver `BACKLOG.md`, C6). Cualquier
cambio debe acercar el sistema a esta regla, no alejarlo.

El "saldo inicial" de una caja que ya tenía dinero antes de usar el sistema
debe registrarse como un `INGRESO` con categoría de apertura (`Saldo
inicial`), no escribiendo `saldo_actual` a mano. Los datos de prueba
(`src/application/pruebas/generarDatosDePrueba.js`) lo hacen así: cada caja
nace en 0 y su saldo es exactamente la suma de sus movimientos.

## Préstamos entre cajas (`deudas_cajas`)

- **Caja acreedora**: la que presta. **Caja deudora**: la que recibe.
- Al crear el préstamo:
  1. se crea la deuda con `monto_pendiente = monto_original`, estado `PENDIENTE`
  2. se registra una `TRANSFERENCIA` acreedora → deudora, categoría `Préstamo entre Cajas`
- Al abonar:
  1. `monto_pendiente` baja; el abono se agrega a `pagos` (JSONB)
  2. se registra una `TRANSFERENCIA` deudora → acreedora, categoría `Pago Préstamo`
- El abono nunca puede superar `monto_pendiente`.
- Cada pago en `pagos` lleva `monto`, `fecha` (timestamp) y `usuario_nombre`
  (los abonos a proveedores, además, `descripcion` y `caja_id`). Los datos de
  prueba agregan `transaccion_id`, el movimiento del abono, que es el vínculo
  que necesitará "anular abono"; los paneles de Deudas todavía no lo
  escriben.

## Cuentas por pagar (`deudas_terceros`)

- Registrar la deuda **no mueve dinero**: el proveedor dio crédito.
- Cada abono registra un `EGRESO` desde la caja elegida, con el tercero y el
  proyecto de la deuda, categoría `Pago Deuda`.
- Reportes de proveedores excluyen los `Pago Deuda` de los "pagos directos"
  para no contar dos veces.

## Estados de una deuda

| Estado | Condición |
|---|---|
| `PENDIENTE` | `monto_pendiente = monto_original` |
| `PARCIAL` | `0 < monto_pendiente < monto_original` |
| `PAGADA` | `monto_pendiente = 0` |

Las comparaciones se hacen con `estadoDeuda()` de `src/services/dinero.js`,
nunca con `===` sobre flotantes.

## Categorías

- Se guardan en `transacciones.categoria` **por nombre** (ADR-001).
- `categorias.nombre` es único.
- Las transacciones antiguas pueden tener un UUID; `resolverNombreCategoria()`
  lo resuelve y, si está huérfano, muestra "Sin categoría".

## Moneda

- Pesos colombianos (COP), sin centavos en la práctica.
- Formato de pantalla: `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })`.
- Fechas de movimiento: `DATE` (sin hora). Parsear como fecha local, nunca con
  `new Date('YYYY-MM-DD')`, que interpreta UTC y corre el día en Colombia.

## Usuarios

- Autenticación con Supabase Auth (correo y contraseña).
- Hoy todos los usuarios autenticados ven y editan todo. No hay roles.
- Cada movimiento guarda `usuario_nombre` (quién lo registró) y
  `editado_por` (quién lo modificó por última vez).
