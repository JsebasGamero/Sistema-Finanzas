# 002. El saldo de una caja se deriva de sus movimientos

- Estado: propuesta
- Fecha: 2026-09-25

## Contexto

`cajas.saldo_actual` es un número almacenado que se suma o resta cada vez que
ocurre algo. Esa lógica está copiada en cinco sitios:

- `syncService.createTransaction`
- `ProjectDashboard.handleEditSave` y `handleDelete`
- `DeudaCajasPanel.handleCreateDebt` y `handlePayment`
- `DeudaTercerosPanel.handlePayment`

Cada copia encola su propio `UPDATE` de `saldo_actual`. Con dos dispositivos
gana la última escritura, y el saldo deja de coincidir con la suma de los
movimientos sin que nadie lo note. `recalculateCajaBalances()` existía para
reconciliar, pero nunca se llamaba.

## Decisión

El saldo es una **proyección**: `calcularSaldo(caja, movimientos)` en la capa
de dominio, aplicando la tabla de efectos de `docs/DOMINIO.md`.
`cajas.saldo_actual` deja de escribirse desde la app. En Supabase se reemplaza
por una vista (o se mantiene como caché calculada por trigger).

El dinero pasa a representarse como entero de pesos en el dominio (`Dinero`).

## Consecuencias

- Los saldos no pueden derivar: siempre salen del histórico.
- Desaparecen cinco copias de lógica y todos los `UPDATE` de saldo en la cola.
- El "saldo inicial" de una caja existente debe migrarse a un `INGRESO` de
  apertura por la diferencia entre `saldo_actual` y lo calculado.
- Calcular sobre todos los movimientos en cada render es caro con volumen
  alto: se memoiza en el hook y, si hace falta, se cachea en Dexie.

## Alternativas descartadas

- **Centralizar el ajuste incremental en una sola función**: reduce las
  copias, pero sigue siendo last-write-wins entre dispositivos.
- **Recalcular al arrancar con `recalculateCajaBalances()`**: arregla el
  síntoma localmente, pero escribe N filas en Supabase en cada arranque y
  sigue compitiendo con otros dispositivos.
