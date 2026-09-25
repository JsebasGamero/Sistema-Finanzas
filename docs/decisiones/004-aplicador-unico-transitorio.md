# 004. Un único aplicador de ajustes de saldo, como paso transitorio

- Estado: aceptada
- Fecha: 2026-09-25

## Contexto

La lógica "un egreso resta del saldo" estaba copiada en cinco sitios
(`syncService`, `ProjectDashboard`, los dos paneles de deudas y
`recalculateCajaBalances`), cada uno con su variante. Algunos parseaban el
saldo y otros no; con un saldo guardado como string, `"100" + 5` daba
`"1005"` (C19).

El ADR-002 propone derivar el saldo de los movimientos y descarta, como
solución **final**, "centralizar el ajuste incremental en una sola función",
porque sigue siendo last-write-wins entre dispositivos. Pero derivar el saldo
es un cambio grande (Fase 4) y la Fase 3 es un refactor que no debe cambiar
el comportamiento.

## Decisión

En la Fase 3 se centraliza el ajuste incremental **como paso intermedio**:

- Una regla pura en el dominio: `efectoEnSaldos(movimiento)` devuelve los
  ajustes por caja.
- Un único escritor: `aplicadorDeAjustesDexie.aplicar(ajustes, { payload })`.
  Es el único sitio que escribe `saldo_actual` por efecto de un movimiento.
- Todos los sitios que ajustaban saldos pasan por ahí en la misma rama
  ("todos o ninguno", `CLAUDE.md`).

Para no cambiar lo que llega a la cola:

- `payload: 'parcial' | 'filaCompleta'` conserva lo que encolaba cada sitio
  (movimientos: `{ id, saldo_actual }`; deudas: la fila completa).
- No se consolidan ajustes por caja: una edición sigue encolando hasta 4
  UPDATE, en el mismo orden que antes.
- No se redondea: se mantiene la aritmética de antes (salvo `aMonto`, que
  corrige C19).

La composición vive en `src/app/contenedor.js`. Los paneles de deudas usan un
puente temporal (`aplicarEfectoEnSaldos`) hasta tener sus propios casos de uso.

## Consecuencias

- La Fase 4 tiene un solo punto que sustituir: el aplicador y la regla.
- Sigue habiendo last-write-wins sobre `saldo_actual` entre dispositivos. Este
  ADR no lo resuelve; el ADR-002 sí.
- Consolidar ajustes por caja (un UPDATE por caja en vez de hasta 4) reduciría
  la exposición a last-write-wins y es trivial ahora, pero cambia la cola: se
  deja para cuando la cola deje de llevar saldos.

## Alternativas descartadas

- **Esperar a la Fase 4 y dejar las cinco copias**: cada cambio a la regla
  hasta entonces tendría que hacerse cinco veces, y ya divergían.
- **Unificar el payload a fila completa ahora**: es lo que recomienda
  `SINCRONIZACION.md`, pero cambia lo que se envía a Supabase en un commit que
  promete no cambiar comportamiento.
