# 005. Los casos de uso de movimientos escriben dentro de una unidad de trabajo y no esperan la sincronización

- Estado: aceptada
- Fecha: 2026-11-13

## Contexto

Alta, edición y borrado de un movimiento escriben en tres tablas de Dexie: la
transacción, `cajas.saldo_actual` (vía el aplicador, ADR-004) y `sync_queue`.
Eran escrituras sueltas, y la auditoría encontró cuatro fallas que salen de
ahí:

- **C22 / MOV-8 / SYNC-18.** Si una escritura fallaba a mitad
  (`QuotaExceededError` en un teléfono lleno, o Android matando el WebView),
  quedaba el `cajas UPDATE` encolado sin el INSERT de la transacción. Subía el
  saldo, y el siguiente pull borraba la fila local: la caja descuadrada sin
  un movimiento que lo explique. El formulario además invitaba a reintentar,
  y el reintento descontaba dos veces.
- **MOV-4.** Un doble toque en "Sí, eliminar" revertía el saldo dos veces:
  cada llamada calculaba el efecto con la copia de la pantalla, y borrar un
  id que ya no existe no falla. Un egreso de $500.000 devolvía $1.000.000.
- **MOV-7.** El alta hacía `await` de la sync completa, que sube TODA la cola
  en serie y sin timeout. Con un día de cola y señal débil, "Guardando..."
  duraba minutos; el usuario creía que no se había guardado y lo registraba
  otra vez. Y como el resultado de la sync se ignoraba, esperar no servía
  para avisar de nada.
- **C21 / MOV-9.** La edición conservaba `sincronizado: true`.

## Decisión

- Un puerto `unidadDeTrabajo.ejecutar(trabajo)` (`domain/ports/puertos.js`),
  implementado con `db.transaction('rw', transacciones, cajas, sync_queue)`
  (`infrastructure/dexie/unidadDeTrabajoDexie.js`) e inyectado desde
  `app/contenedor.js`. Es obligatorio: los casos de uso no se pueden crear
  sin él.
- Todo lo que el caso de uso escribe va dentro: releer la fila, aplicar los
  ajustes, escribir la transacción y encolar. Dexie propaga la transacción al
  aplicador y al outbox sin pasarla a mano.
- Borrar y editar **releen la fila** dentro de la unidad. Borrar una que ya
  no está no hace nada (idempotente); editarla lanza
  `MovimientoNoEncontradoError`. Como IndexedDB no intercala dos
  transacciones `rw` sobre las mismas tablas, el doble toque ya no puede
  revertir dos veces.
- El alta acepta un `id` de la UI como llave de idempotencia: si ya existe,
  devuelve la existente sin volver a aplicar el efecto.
- La sincronización se lanza **después** del commit y **sin esperarla**
  (`sincronizarEnSegundoPlano`). Los rechazos se ven en la bandeja de errores
  de sincronización (C14), no en el formulario.
- La edición guarda `sincronizado: false`.

## Consecuencias

- Un fallo local deja todo como estaba, así que "No se guardó, vuelve a
  intentar" pasa a ser cierto y reintentar es seguro.
- Dentro de `trabajo` solo puede haber operaciones de Dexie. Un `fetch` o un
  `setTimeout` dejan la transacción sin trabajo pendiente, IndexedDB la cierra
  y la siguiente escritura falla con `TransactionInactiveError`. Por eso la
  sync va fuera. Si algún día el aplicador o el outbox necesitan red, tienen
  que salir de la unidad.
- Verificado con Dexie 4 real en el navegador (base desechable): rollback de
  una transferencia a medias, doble borrado concurrente que revierte una sola
  vez, doble alta con el mismo id que descuenta una sola vez.
- Los paneles de deudas siguen escribiendo sueltos (no usan estos casos de
  uso). Les falta lo mismo cuando tengan sus casos de uso (porción 3).
- La carga de datos de prueba (`app/datosDePrueba.js`) usa también una sola
  transacción de Dexie y **consolida** los ajustes: un `cajas UPDATE` por caja
  en vez de uno por movimiento. ADR-004 deja la consolidación para cuando la
  cola deje de llevar saldos, pero eso habla de los movimientos del usuario,
  donde cambiaría lo que se envía hoy; en una carga nueva de cientos de
  movimientos, encolar cientos de saldos intermedios solo alarga la subida.

## Alternativas descartadas

- **Solo proteger la UI (botón deshabilitado mientras guarda).** Necesario,
  pero no cubre el fallo a mitad de camino ni la llamada repetida desde otro
  sitio. La regla tiene que estar en el caso de uso.
- **Releer la fila antes de aplicar, sin transacción.** Deja una carrera:
  las dos llamadas leen la fila antes de que cualquiera la borre.
- **Borrar primero y aplicar solo si se borró algo (conteo de
  `where().delete()`).** Cierra el doble borrado pero no la atomicidad: un
  fallo al aplicar deja la fila borrada y el saldo sin revertir.
- **Esperar la sync con un timeout corto (`Promise.race`).** El formulario
  seguiría bloqueado ese tiempo y el resultado no le diría nada útil al
  usuario: los rechazos llegan por la bandeja de errores.
