# Backlog

Fuente de verdad del trabajo pendiente. Al cerrar un ítem, actualiza su
estado y pon el commit. Al descubrir un bug, agrégalo con su ID.

Estados: `pendiente` · `en curso` · `hecho` · `hecho (requiere acción manual)` · `descartado`

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Contención: RLS, credenciales, pérdida de trabajo offline | hecho (requiere acción manual) |
| 1 | Bugs de datos | hecho |
| 2 | Móvil y responsive | hecho |
| 3 | Clean Architecture, por porciones verticales | pendiente |
| 4 | Saldo derivado y dinero como entero | pendiente |
| 5 | UI: design system, tema claro de alto contraste, densidad | pendiente |

## Acciones manuales pendientes

- [ ] Rotar la anon key de Supabase (estuvo en `.env.example` en el historial de git).
- [ ] Ejecutar `supabase/migrations/001_rls_solo_autenticados.sql`.
- [ ] Ejecutar `supabase/migrations/002_columnas_faltantes.sql`.
- [ ] Probar detrás del login los flujos de las fases 1 y 2 (lista en cada commit).

## Bugs críticos y de datos

| ID | Descripción | Estado | Commit |
|---|---|---|---|
| C1 | RLS `USING (true)`: la base estaba abierta a cualquiera con la anon key | hecho (requiere acción manual) | 5ecb299 |
| C1b | `.env` versionado y credenciales reales en `.env.example` | hecho (rotar key) | 5ecb299 |
| C2 | Categorías con `tipo: 'general'` violaban el CHECK, se descartaban y quedaban UUID huérfanos en pantalla | hecho | cdb3d86 |
| C3 | Proyectos al vuelo con `estado: 'ACTIVO'`: nunca subían y el gasto perdía su obra | hecho | cdb3d86 |
| C4 | `sync_queue.clear()` ciego al arrancar | hecho | 5ecb299 |
| C5 | El logout borraba la cola de sync | hecho | 5ecb299 |
| C6 | Saldos incrementales desde cinco sitios: derivan entre dispositivos | pendiente (Fase 4) | |
| C7 | Transferencia sin caja destino hacía desaparecer dinero | hecho | cdb3d86 |
| C8 | Borrar maestros sin revisar referencias | hecho (avisa; no bloquea) | cdb3d86 |
| C9 | NIT convertido a número | hecho | cdb3d86 |
| C10 | `editado_por`, `deudas_cajas.descripcion`, `transacciones.empresa_id` se perdían en el pull | hecho | cdb3d86 |
| C11 | `=== 0` sobre flotantes dejaba deudas eternamente en PARCIAL | hecho | cdb3d86 |
| C12 | StrictMode duplicaba el seeding de categorías | hecho | cdb3d86 |
| C13 | Cambiar el nombre del usuario re-inicializaba toda la base | hecho | cdb3d86 |
| C14 | Errores permanentes de sync se descartan sin avisar al usuario | pendiente | |
| C15 | Borrar una transacción de préstamo/abono no actualiza la deuda asociada | pendiente | |
| C16 | Bucket `soportes` público | pendiente | |
| C17 | Transacciones con categoría ya perdida: el nombre original es irrecuperable | descartado (se muestra "Sin categoría") | |

## Móvil y responsive

| ID | Descripción | Estado | Commit |
|---|---|---|---|
| M1 | Editar/borrar movimientos y quitar foto solo con hover: inaccesible en táctil | hecho | 287fcfb |
| M2 | `.card { margin-top: 20px }` global rompía los grids | hecho | 287fcfb |
| M3 | Zoom bloqueado en el viewport | hecho | 287fcfb |
| M4 | Bottom nav desbordaba a 320px; AG-Grid arrastraba la página | hecho | 287fcfb |
| M5 | ConfirmModal sin scroll | hecho | 287fcfb |
| M6 | pb-24 muerto, login sin scroll en landscape, toasts tapando el header, grids apretados, inputs < 16px | hecho | 287fcfb |
| M7 | Dropdown de AutocompleteInput se recorta al final de formularios largos | pendiente | |
| M8 | TransactionEditModal y el modal de contraseña: revisar altura con teclado abierto en móvil | pendiente | |

## Calidad de código

| ID | Descripción | Estado |
|---|---|---|
| Q1 | `useAuth` exportado junto al Provider rompe Fast Refresh (último error de lint) | pendiente (Fase 3) |
| Q2 | `formatMoney`, `formatDisplayNumber`, `parseFormattedNumber` copiados en 8 componentes | pendiente (Fase 3) |
| Q3 | `ReportsPanel.jsx` tiene 1800 líneas y 6 componentes | pendiente (Fase 3) |
| Q4 | Búsquedas `.find()` dentro de loops en Reportes: O(n·m) | pendiente |
| Q5 | Bundle principal de 2,8 MB sin code-splitting (AG-Grid, jsPDF, Recharts) | pendiente |
| Q6 | Sin tests | pendiente (Fase 3: Vitest) |
| Q7 | `alert()` y `confirm()` nativos en los paneles de deudas | pendiente (Fase 5) |

## UI (Fase 5)

| ID | Descripción | Estado |
|---|---|---|
| U1 | Emojis en toasts y mensajes del sistema | pendiente |
| U2 | Gradientes y glassmorphism en todos los elementos | pendiente |
| U3 | Solo tema oscuro, pese a que el uso es en obra bajo el sol | pendiente |
| U4 | `style={{}}` con `rgba()` sueltos en vez de tokens | pendiente |
| U5 | Jerarquía plana: todo es una tarjeta del mismo peso | pendiente |
| U6 | Flechas unicode mezcladas con iconos lucide | pendiente |
