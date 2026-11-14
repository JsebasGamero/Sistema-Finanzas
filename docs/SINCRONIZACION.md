# Sincronización offline

## Modelo

La app escribe siempre primero en IndexedDB (Dexie) y encola la operación en
`sync_queue`. Cuando hay conexión y sesión válida, la cola se envía a
Supabase en orden. Supabase es la fuente de verdad: al arrancar, la app hace
un pull que reemplaza las tablas locales y vuelve a aplicar encima lo que
sigue en la cola.

```
 escritura del usuario
        │
        ▼
 Dexie (tabla)  +  sync_queue.add({ tabla, operacion, datos })
        │
        │  hay conexión y sesión válida
        ▼
 processSyncQueue()  ── en orden, una corrida a la vez ──►  Supabase
        │
        │  éxito ............................ sale de la cola
        │  fallo pasajero (red, sesión, 5xx)  se queda y la corrida SE DETIENE
        │  rechazo de datos o de esquema .... pasa a sync_errores (bandeja)
        ▼
 arranque: push → pull (paginado, atómico) + replay en la misma transacción
```

Nada se descarta en silencio (invariante 2 de `CLAUDE.md`): lo que la nube
rechaza queda en la bandeja de errores, visible en la interfaz, hasta que el
usuario lo reintenta o lo descarta.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/services/db.js` | Esquema Dexie (versiones 1 a 6), `syncFromSupabase()` (pull), `turnoDeSync` y el vaciado del logout |
| `src/services/syncService.js` | `addToSyncQueue`, `processSyncQueue`, `prepareForSupabase`, `reapplyPendingOperations`, bandeja de errores, `suscribirCambiosCola` |
| `src/services/supabase.js` | Cliente con timeout por petición, `obtenerSesionActiva()` y `conSesion()` (token explícito) |
| `src/context/AuthContext.jsx` | Sesión, sesión sin conexión, logout, recuperación de contraseña |
| `src/context/reglasContrasena.js` | `MINIMO_CONTRASENA` y mensajes de contraseña débil (con tests) |
| `src/App.jsx` | Secuencia de arranque, contadores, reintento al recuperar la conexión |
| `src/infrastructure/sync/clasificarResultadoSync.js` | Qué hacer con cada respuesta de Supabase (lógica pura, con tests) |
| `src/infrastructure/sync/descargaPaginada.js` | Descarga completa de una tabla por páginas (lógica pura, con tests) |
| `src/infrastructure/sync/ejecutorSerial.js` | Turno común de push, pull y logout, y candado entre pestañas (lógica pura, con tests) |
| `src/infrastructure/sync/reaplicarPendientes.js` | Replay de la cola sobre la base local (con tests) |
| `src/infrastructure/sync/outboxDexie.js` | Única implementación del registro de `sync_queue` (`addToSyncQueue` delega aquí) |
| `src/infrastructure/dexie/aplicadorDeAjustesDexie.js` | Único escritor de `saldo_actual` por movimientos; encola un `cajas UPDATE` por ajuste |

## Secuencia de arranque

1. **Push**: `processSyncQueue()` intenta subir lo pendiente.
2. **Pull**: `seedInitialData()` → `syncFromSupabase()` descarga todas las
   tablas y, en una sola transacción Dexie, las reemplaza y
3. **Replay**: vuelve a aplicar lo que sigue en la cola, para que el usuario
   vea lo que registró sin señal. Si el pull no corrió (sin señal, sin
   sesión, falló), `App.jsx` llama a `reapplyPendingOperations()`, que es
   idempotente.

Nunca se vacía la cola en el arranque ni en el logout (invariante 1).

La pantalla de carga se mantiene hasta que termina el arranque **si la base
local está vacía** (primer ingreso o recién cerrada la sesión): pintar las
pantallas antes las dejaría en cero, porque cargan una sola vez al montarse.
Si hay datos locales y el arranque pasa de 8 s (señal que no pasa datos), se
muestra lo local y el arranque sigue en segundo plano.

`initialized` es por usuario: cerrar sesión y volver a entrar (aunque sea con
el mismo usuario) vuelve a la pantalla de carga y a la pestaña Inicio.

## Turno de sincronización

Push, pull y el vaciado del logout comparten **un solo turno**
(`turnoDeSync` en `db.js`, construido con `crearTurnoSerial()` de
`ejecutorSerial.js`) y, entre pestañas, el mismo Web Lock
(`sync-cola-<base>`). Nunca corren a la vez.

Por qué: el pull descargaba sin turno. Si mientras descargaba subía un gasto
y salía de la cola, el reemplazo escribía la foto vieja de la caja y de las
transacciones y el replay ya no lo traía: el gasto desaparecía del
dispositivo y el siguiente movimiento subía a la nube un saldo calculado
sobre la foto vieja, perdiendo el efecto del primero.

- Una llamada nueva se une a la corrida **de la misma clave** que espera
  turno (push con push, pull con pull). Un pull nunca se une a un push: su
  resultado no sería el suyo.
- `detenerSincronizacion()` cancela lo encolado hasta ese momento. El push
  lo consulta antes de cada operación y el pull antes de cada página y
  antes de escribir; ninguno se corta a mitad de una petición.
- Defensa extra del pull: un contador de operaciones que salieron de la
  cola (`registrarSalidaDeCola`, en `confirmarOperacion` y `moverABandeja`).
  Si cambió entre el inicio de la descarga y la transacción del reemplazo,
  lo descargado se descarta y se vuelve a descargar (3 intentos). Con el
  turno no debería pasar; protege de una subida que no pase por
  `processSyncQueue`.

## Push: `processSyncQueue()`

- **Exige sesión válida antes de CADA operación** (`obtenerSesionActiva()`),
  no solo al empezar, y manda su token explícito en la petición
  (`conSesion()`, `setHeader('Authorization', ...)`). Sin sesión,
  supabase-js manda la anon key y, con RLS solo para `authenticated`, un
  UPDATE o un DELETE responde 200 con 0 filas y sin error: antes se daban
  por subidos y se perdían. Pasaba también a mitad de una corrida larga
  (logout, refresh fallido por la señal). Ahora la corrida se detiene con
  `detenido.tipo = 'sesion'` sin tocar lo que queda, y un token vencido da
  401 (se queda en la cola) en vez de caer a la anon key.
- **Orden FIFO estricto**: recorre la cola por `id`. Ante un fallo pasajero
  hace `break`; seguir con las siguientes subía el hijo antes que el padre o
  un saldo viejo después de uno nuevo.
- **Una corrida a la vez** (ver "Turno de sincronización"). Antes de enviar
  cada operación se comprueba que siga en la cola.
- **INSERT idempotente**: `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`
  (ON CONFLICT DO NOTHING). Si el servidor guardó la fila y la respuesta se
  perdió, el reintento no pisa los cambios posteriores. En `categorias` el
  conflicto es por `nombre` (ADR-001): una categoría sembrada que ya existe
  no es un error.
- **Categoría absorbida por nombre**: el INSERT de `categorias` pide
  `.select('id')`. Si vuelve vacío, la nube ya tenía una con ese nombre y
  otro id: se lee el id real y, en la misma transacción que confirma, se
  cambia el id de la fila local y el de sus operaciones en la cola y en la
  bandeja. Antes la fila local conservaba un id que no existía en la nube:
  su DELETE afectaba 0 filas y se daba por subido, y su UPDATE iba a la
  bandeja.
- **UPDATE y DELETE con `.select('id')`** para saber cuántas filas tocaron.
- **`transacciones.sincronizado`**: se pone en `true` al confirmar solo si no
  queda ninguna otra operación de esa transacción en la cola (una edición
  pendiente la mantiene "Pendiente"), y vuelve a `false` si un cambio suyo
  pasa a la bandeja.

Resultado: `{ success, synced, enBandeja, pendientes, detenido, sinSesion?, errors }`.
`detenido` es `null` o `{ tipo, mensaje }` cuando la corrida se detuvo por un
fallo pasajero.

## Clasificación de respuestas

Se decide por `error.code`, no por el status HTTP: PostgREST responde 409
tanto a un duplicado como a una FK rota, y antes cualquier 409 se daba por
"ya existe".

| Respuesta | Qué significa | Qué hace |
|---|---|---|
| Éxito | | Sale de la cola |
| UPDATE sin filas | La fila no existe en la nube | Bandeja (`no_existe`) |
| DELETE sin filas | Ya estaba borrada | Sale de la cola (éxito idempotente) |
| `23503` | FK rota: el padre no existe en la nube | Bandeja (`referencia`) |
| `23505` | Otra UNIQUE (NIT, nombre de categoría) | Bandeja (`duplicado`) |
| `23514` / otros `23xxx` | CHECK | Bandeja (`regla`) |
| `23502` | NOT NULL | Bandeja (`incompleto`) |
| `22xxx`, `PGRST1xx` | Formato inválido (`''` en un uuid o un número) | Bandeja (`formato`) |
| `42703`, `42P01`, `42883`, `42P10`, `PGRST202/204/205`, 404 | Falta una migración | Bandeja (`esquema`), mensaje "Falta aplicar una migración en la base" |
| Otro 4xx | Rechazo | Bandeja (`rechazado`) |
| Sin respuesta (status 0), timeout | Red | Se queda; la corrida se detiene |
| `42501`, `PGRST30x`, 401, 403 | Sesión vencida o sin permiso | Se queda; la corrida se detiene |
| 5xx, 408, 429, `08/40/53/57/58/XX`, `PGRST00x` | Servidor | Se queda; la corrida se detiene |
| Payload ilegible o tabla desconocida | Dato dañado en el dispositivo | Bandeja (`corrupto`) |

Ya no existe el reintento con las FK en `null`: guardaba el registro
desvinculado (un gasto sin caja) y en la práctica nunca se ejecutaba.

## Bandeja de errores (`sync_errores`, Dexie versión 6)

Una operación rechazada se mueve de `sync_queue` a `sync_errores` en una
transacción, con el payload intacto, el id que tenía en la cola (`cola_id`),
`tipo`, `codigo`, `mensaje` (para el usuario), `detalle` (técnico) y `fecha`.

API en `syncService.js`:

- `listarErroresSync()` → `[{ id, tabla, operacion, datos, codigo, mensaje, fecha, tipo, detalle }]`
  (`datos` ya interpretado como objeto, o `null` si está dañado).
- `contarErroresSync()`.
- `reintentarErrorSync(id)` → `{ reencolada, resultado }`: la devuelve a la
  cola **en su puesto original** (mismo id, así un padre y su hijo se envían
  en el orden en que se crearon) y, con conexión, corre `processSyncQueue()`.
  Si vuelve a fallar, reaparece en la bandeja con otro id.
- **Saldo superado**: cuando sube un `cajas UPDATE` con saldo, los de la
  misma caja que esperan en la bandeja con un puesto anterior se marcan
  `saldo_superado`. Al reintentarlos se envía el saldo local vigente (nube +
  pendiente) en vez del absoluto viejo, o ningún saldo si la caja ya no
  existe aquí. Antes el reintento viajaba solo, después de todo lo
  confirmado, y dejaba la nube con el saldo anterior. Un `cajas UPDATE` no
  superado conserva su saldo: puede ser la única copia de un ajuste que
  nunca llegó (por ejemplo, rechazado por una migración que faltaba).
- `reintentarTodosErroresSync()`: útil después de aplicar una migración.
- `descartarErrorSync(id)`: la interfaz pide confirmación antes.
- `ajustesQueQuedanAlDescartar(id)` → `[{ cajaId, cajaNombre, delta }]`:
  para el alta de un movimiento, los ajustes de saldo que ya subieron y que
  descartar NO deshace (ver abajo). El diálogo de descarte debe mostrarlos y
  sugerir un movimiento de ajuste.
- `suscribirCambiosCola(cb)` → `desuscribir`: avisa con `{ pendientes, errores }`
  cada vez que cambian `sync_queue` o `sync_errores` (liveQuery de Dexie, así
  que también ve las escrituras del outbox y de otras pestañas).

`Layout` recibe `erroresSync` y muestra el aviso que abre `ErroresSyncPanel`.

Ojo: lo que está en la bandeja **no** se re-aplica después del pull, así que
desaparece de las listas y solo se ve en la bandeja. Si era una transacción,
los ajustes de saldo que la precedían en la cola sí subieron: descartarla deja
el saldo de la nube descuadrado (deuda viva C6 hasta la Fase 4).
`ajustesQueQuedanAlDescartar(id)` calcula esos ajustes con
`efectoEnSaldos()` (omite los que también están en la bandeja) para que la
interfaz lo diga. No se compensa solo: si el ajuste lo pisó un saldo
posterior, compensar descuadraría la caja al revés.

## Pull: `syncFromSupabase()`

- **Comparte turno con el push y el logout** (ver "Turno de
  sincronización"): mientras descarga no sube nada.
- **Exige sesión válida en cada página**, con el token explícito
  (`conSesion()`): con la anon key RLS devuelve todo vacío y el pull vaciaba
  la base local. Si la sesión se pierde o se cancela el turno (logout) a
  mitad, aborta sin escribir.
- **Paginado**: cada tabla se descarga con `.order('id').range()`. La
  primera página pide `count: 'exact'` y se sigue hasta tener ese total o
  hasta una página vacía (no "hasta una página corta": si el `max-rows` del
  proyecto es menor que la página, se cortaría antes de tiempo). Si al final
  faltan filas, se aborta. Antes cada tabla se truncaba en silencio a 1000
  filas y los reportes sumaban sobre una copia parcial.
- **Todo o nada**: se descarga todo antes de tocar Dexie. Si una página o una
  tabla falla, se aborta y la base local queda como estaba. Las tablas
  `categorias`, `deudas_cajas` y `deudas_terceros` solo se saltan (sin
  vaciarlas) si la nube responde que no existen (`42P01`, `PGRST205`); antes
  un timeout las vaciaba.
- **Atómico**: `clear` + `bulkPut` de todas las tablas y el replay de la cola
  van en una sola `db.transaction('rw', ...)`. Si la app muere a mitad no
  quedan tablas vacías, y las pantallas con liveQuery nunca ven la base sin lo
  pendiente. `sync_queue` y `sync_errores` no se tocan.

## Replay: `reaplicarPendientes()`

- INSERT: `put` (el payload es la fila completa).
- UPDATE: `update` (fusiona: hay payloads parciales como `{ id, saldo_actual }`).
  Si la fila no existe localmente, `put` solo si el payload trae los campos
  mínimos de la tabla (en cajas, `nombre` y `tipo`); si no, se omite. Antes
  creaba cajas fantasma sin nombre.
- DELETE: `delete`.
- Cada operación se atrapa por separado: dentro de la transacción del pull,
  una operación dañada no aborta el pull completo.

## Sesión

- **Timeout por petición** (`supabase.js`): 20 s (120 s para Storage), con
  `AbortController` + `setTimeout` porque un WebView viejo puede no tener
  `AbortSignal.any`. Una petición vencida es un fallo de red: la operación se
  queda en la cola.
- **Sesión sin conexión**: al iniciar sesión se guarda `{ id, email, nombre }`
  (`finanzasobra.usuarioSesion`). Si al arrancar el refresh del token falla
  por red (o tarda más de 6 s) y la sesión de supabase-js sigue guardada y es
  del mismo usuario, se entra con `currentUser.sinConexion = true`. En ese
  modo push y pull no hacen nada (no hay sesión válida). Cuando vuelve la
  señal y llega `TOKEN_REFRESHED`, la marca se quita y `App` corre push →
  pull → replay en segundo plano.
- **Logout**, en este orden:
  1. `detenerSincronizacion()`: el push para antes de su siguiente
     operación y el pull antes de su siguiente página.
  2. `signOut({ scope: 'local' })` cierra solo este dispositivo (el `global`
     por defecto revocaba la sesión del celular de obra con cola
     pendiente). Si falla (sin señal), se borran a mano las claves de la
     sesión de supabase-js para que el siguiente que abra la app no entre
     como el anterior. Se cierra antes de esperar al push: así otra pestaña
     que esté subiendo ve que no hay sesión y suelta el candado.
  3. `conSincronizacionDetenida(vaciarTablasDeDatos)`: espera en el turno a
     que el push y el pull en curso paren (como mucho una petición) y vacía
     las tablas de datos en una transacción, con el candado entre pestañas.
     Nunca `sync_queue` ni `sync_errores`. Antes un pull en curso volvía a
     llenar las tablas recién vaciadas.
  4. Si mientras tanto la persona volvió a entrar (SIGNED_IN), no se la saca.
- **Recuperar contraseña**: el evento `PASSWORD_RECOVERY` (o `type=recovery`
  **con** `access_token` en el hash al cargar) activa
  `recuperacionPendiente`; `App` muestra `NuevaContrasenaScreen` y
  `completarRecuperacion(nueva)` actualiza la contraseña sin pedir la
  actual. Solo `#type=recovery` no basta: con eso cualquiera con la sesión
  abierta en un equipo prestado cambiaba la contraseña sin la actual. El
  enlace vuelve a `VITE_URL_RECUPERACION` (o al origin), que debe estar en
  las Redirect URLs del proyecto Supabase.
- **Longitud mínima de contraseña**: una sola constante,
  `MINIMO_CONTRASENA` (`src/context/reglasContrasena.js`), igual a la de
  Authentication > Providers > Email en los dos proyectos. Si Supabase
  rechaza por débil, el mensaje usa `error.reasons` y la cifra que trae el
  servidor (`at least N characters`), nunca una fija.

## Contadores en la interfaz

`App` se suscribe con `suscribirCambiosCola` y pasa `pendingSync` y
`erroresSync` a `Layout`. Al volver la conexión sincroniza **siempre** (antes
solo si el contador decía > 0, y el contador no se enteraba de ediciones,
borrados ni abonos). En modo local no se sincroniza ni se muestran avisos.

## Whitelist de columnas

`prepareForSupabase()` solo envía las columnas listadas por tabla. **Si un
campo no está ahí, se pierde en el siguiente pull**, aunque se vea bien en
pantalla hasta entonces. Al agregar un campo:

1. Columna en Supabase (migración).
2. Columna en `supabase_setup.sql`.
3. Campo en la whitelist de `prepareForSupabase()`.
4. Si se consulta por él, índice en el esquema Dexie (nueva `db.version()`).

Desplegar un build que envía una columna nueva **antes** de correr su
migración ya no pierde datos (las operaciones quedan en la bandeja con
"Falta aplicar una migración"), pero sí llena la bandeja: la migración va
primero.

## Payloads de UPDATE

Algunas operaciones encolan la fila completa y otras solo los campos
cambiados (p. ej. `{ id, saldo_actual }`). Por eso el replay usa `update()`
(fusiona) y no `put()` (reemplaza). Si se unifica, que sea hacia filas
completas.

## Invariantes

1. Nunca `sync_queue.clear()` salvo que la persona lo pida explícitamente.
2. El logout no borra `sync_queue` ni `sync_errores`.
3. Toda escritura local de datos de negocio se encola.
4. El orden de la cola importa: el padre (caja, proyecto) antes que el hijo
   (transacción). Por eso un fallo pasajero detiene la corrida.
5. Los valores escritos deben cumplir los CHECK del esquema.
6. Nada sube ni baja sin sesión válida: se comprueba antes de cada
   operación y de cada página, y el token va explícito en la petición.
7. Push, pull y el vaciado del logout nunca corren a la vez (`turnoDeSync`).

## Ajustes de saldo en la cola

Cada ajuste de saldo encola un `cajas UPDATE`, **antes** de la operación de
la transacción que lo provoca. El payload depende de quién llama (ADR-004):

- `parcial` (`{ id, saldo_actual }`): movimientos (alta, edición, borrado).
- `filaCompleta` (`{ ...caja, saldo_actual }`): paneles de deudas.

Una edición encola hasta 4 UPDATE (revertir origen y destino, aplicar origen y
destino). No se consolidan por caja todavía.

## Problemas conocidos

- Last-write-wins sobre `cajas.saldo_actual` entre dispositivos (C6, Fase 4).
- No hay control de concurrencia (`updated_at` no se compara).
- El pull descarga todas las tablas completas en cada arranque. Con miles de
  movimientos será lento; el paso siguiente es pull incremental por
  `updated_at`.
- Las pantallas que cargan una sola vez al montarse (Inicio, Cajas) no se
  refrescan si el pull termina en segundo plano después de mostrarlas; se
  actualizan al cambiar de pestaña. Reportes usa liveQuery y sí se refresca.
- `registrarMovimiento` espera la cola completa antes de soltar el
  formulario; con el timeout ya no se queda colgado, pero debería esperar
  como mucho su propia operación.
