# Sincronización offline

## Modelo

La app escribe siempre primero en IndexedDB (Dexie) y encola la operación en
`sync_queue`. Cuando hay conexión, la cola se envía a Supabase. Supabase es la
fuente de verdad: al arrancar, la app hace un pull que reemplaza las tablas
locales.

```
 escritura del usuario
        │
        ▼
 Dexie (tabla)  +  sync_queue.add({ tabla, operacion, datos })
        │
        │  hay conexión
        ▼
 processSyncQueue()  ── por cada operación ──►  Supabase
        │                                        │
        │  éxito: se borra de la cola            │
        │  fallo transitorio: se queda           │
        │  fallo permanente: se descarta (*)     │
        ▼
 arranque: push → pull (clear + replace) → reapplyPendingOperations()
```

(*) Hoy los errores permanentes se descartan solo con un `console.warn`.
Está en el backlog convertirlo en una bandeja de errores visible (invariante 2
de `CLAUDE.md`).

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/services/db.js` | Esquema Dexie (versiones 1 a 5) y `syncFromSupabase()` (pull) |
| `src/services/syncService.js` | `addToSyncQueue`, `processSyncQueue`, `prepareForSupabase`, `reapplyPendingOperations` |
| `src/App.jsx` | Secuencia de arranque y reintento al recuperar la conexión |
| `src/infrastructure/sync/outboxDexie.js` | Única implementación del registro de `sync_queue` (`addToSyncQueue` delega aquí) |
| `src/infrastructure/dexie/aplicadorDeAjustesDexie.js` | Único escritor de `saldo_actual` por movimientos; encola un `cajas UPDATE` por ajuste |

## Secuencia de arranque

1. **Push**: `processSyncQueue()` intenta subir lo pendiente.
2. **Pull**: `seedInitialData()` → `syncFromSupabase()` vacía cada tabla local
   y la llena con lo que hay en Supabase.
3. **Replay**: `reapplyPendingOperations()` vuelve a aplicar sobre Dexie lo que
   sigue en la cola, para que el usuario vea lo que registró sin señal.

## Clasificación de errores de Supabase

| Código | Significado | Qué hace hoy |
|---|---|---|
| `23505` / HTTP 409 | Ya existe (UNIQUE/PK) | Se da por sincronizada |
| `23503` | Violación de FK | Se reintenta con las FK en `null` (ver advertencia) |
| `23514` | Violación de CHECK | Permanente: se descarta |
| `23502` | NOT NULL | Permanente: se descarta |
| `42601`, `42P01`, `42703` | Error de esquema | Permanente: se descarta |
| HTTP 400 | Petición inválida | Permanente: se descarta |
| RLS (`42501`, 401/403) | Sin sesión o sin permiso | Se queda en la cola |
| Red | Sin conexión | Se queda en la cola |

**Advertencia sobre `23503`:** reintentar con las FK en `null` guarda el
registro, pero lo desvincula (un gasto sin proyecto, un movimiento sin caja).
Casi siempre es síntoma de que la fila padre no subió, normalmente por un
`23514`. Arreglar el padre, no el síntoma.

## Whitelist de columnas

`prepareForSupabase()` solo envía las columnas listadas por tabla. **Si un
campo no está ahí, se pierde en el siguiente pull**, aunque se vea bien en
pantalla hasta entonces. Al agregar un campo:

1. Columna en Supabase (migración).
2. Columna en `supabase_setup.sql`.
3. Campo en la whitelist de `prepareForSupabase()`.
4. Si se consulta por él, índice en el esquema Dexie (nueva `db.version()`).

## Payloads de UPDATE

Algunas operaciones encolan la fila completa y otras solo los campos
cambiados (p. ej. `{ id, saldo_actual }`). Por eso `reapplyPendingOperations()`
usa `update()` (fusiona) y no `put()` (reemplaza). Si se unifica, que sea hacia
filas completas.

## Invariantes

1. Nunca `sync_queue.clear()` salvo que la persona lo pida explícitamente.
2. El logout no borra `sync_queue`.
3. Toda escritura local de datos de negocio se encola.
4. El orden de la cola importa: el padre (caja, proyecto) antes que el hijo
   (transacción).
5. Los valores escritos deben cumplir los CHECK del esquema.

## Ajustes de saldo en la cola

Cada ajuste de saldo encola un `cajas UPDATE`, **antes** de la operación de
la transacción que lo provoca. El payload depende de quién llama (ADR-004):

- `parcial` (`{ id, saldo_actual }`): movimientos (alta, edición, borrado).
- `filaCompleta` (`{ ...caja, saldo_actual }`): paneles de deudas.

Una edición encola hasta 4 UPDATE (revertir origen y destino, aplicar origen y
destino). No se consolidan por caja todavía.

## Problemas conocidos

- Last-write-wins sobre `cajas.saldo_actual` entre dispositivos (C6).
- No hay control de concurrencia (`updated_at` no se compara).
- El pull descarga todas las tablas completas en cada arranque. Con miles de
  movimientos será lento; el paso siguiente es pull incremental por
  `updated_at`.
