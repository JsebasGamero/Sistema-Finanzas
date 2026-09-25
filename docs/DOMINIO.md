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
- Editar un movimiento = revertir el efecto del original + aplicar el nuevo.
- Borrar un movimiento = revertir su efecto.

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
debe registrarse como un `INGRESO` con categoría de apertura, no escribiendo
`saldo_actual` a mano.

## Préstamos entre cajas (`deudas_cajas`)

- **Caja acreedora**: la que presta. **Caja deudora**: la que recibe.
- Al crear el préstamo:
  1. se crea la deuda con `monto_pendiente = monto_original`, estado `PENDIENTE`
  2. se registra una `TRANSFERENCIA` acreedora → deudora, categoría `Préstamo entre Cajas`
- Al abonar:
  1. `monto_pendiente` baja; el abono se agrega a `pagos` (JSONB)
  2. se registra una `TRANSFERENCIA` deudora → acreedora, categoría `Pago Préstamo`
- El abono nunca puede superar `monto_pendiente`.

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
