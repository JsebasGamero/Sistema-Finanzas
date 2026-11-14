# Sistema de diseño: "Libro de obra"

FinanzasObra se usa en obra, con el celular, a pleno sol, por gente que lleva
cuentas. La interfaz anterior era la plantilla genérica de dashboard oscuro:
tarjetas de vidrio con blur, degradados en cada botón, brillos animados,
emojis en los mensajes y todo con el mismo peso visual. Este documento define
el reemplazo. Los tokens viven en `src/index.css`; el tema, en
`src/presentation/tema/`.

## Principios

1. **Papel y tinta.** Fondo claro cálido, texto casi negro, filetes finos. La
   jerarquía la dan el tamaño, el peso y el espacio, no sombras ni brillos.
2. **Las cifras mandan.** Montos con cifras tabulares (`.amount`, `.num`),
   alineados a la derecha en tablas, con signo y color semántico. Un número
   importante es grande; su rótulo es pequeño y en versalitas (`.eyebrow`).
3. **Un solo acento.** Naranja de obra (`--accent`) solo para la acción
   principal de cada pantalla y el estado activo. Nada de dorado en iconos
   decorativos.
4. **El color significa algo.** Verde = ingreso / a favor. Rojo = egreso /
   deuda. Azul = transferencia. Ámbar = pendiente o parcial. Nunca color sin
   texto o marca que lo acompañe (`.tipo-mark` pone I / E / T).
5. **Densidad útil.** Listas como libro contable (`.ledger` con filetes entre
   filas), no una tarjeta flotante por registro. Indicadores en una franja
   (`.kpi-strip`), no cuatro tarjetas sueltas.
6. **Se lee al sol.** Contraste alto en el tema día (predeterminado). Botones
   de 44 px en táctil. Inputs de 16 px en móvil (iOS hace zoom si son menores).

## Prohibido

- `backdrop-filter`, `linear-gradient` decorativo, `box-shadow` de color,
  animaciones de brillo o de entrada de más de 200 ms.
- Emojis en la interfaz, toasts o mensajes (`✅ ❌ 📴 🌐`...). Iconos: solo
  lucide-react. Nada de flechas unicode (`→ ↑ ↓`) mezcladas con iconos.
- Colores sueltos: `style={{ background: 'rgba(...)' }}`, `#hex` en JSX,
  `text-white`, `text-gray-400`, `bg-green-500/10`... Siempre tokens.
- `alert()` y `confirm()` nativos: usar `ConfirmModal` y los toasts.
- `rounded-2xl`/`rounded-3xl` y píldoras: los radios son 4 / 6 / 10 px.

## Tokens (utilidades de Tailwind)

| Uso | Utilidad | Variable |
|---|---|---|
| Fondo de la app | `bg-paper` | `--paper` |
| Panel, tabla, modal | `bg-surface` | `--surface` |
| Zona secundaria, encabezado de tabla | `bg-surface-2` | `--surface-2` |
| Hover / presionado | `bg-surface-3` | `--surface-3` |
| Filete | `border-line` | `--line` |
| Borde de input / botón secundario | `border-line-strong` | `--line-strong` |
| Texto principal | `text-ink` | `--ink` |
| Texto secundario | `text-ink-2` | `--ink-2` |
| Texto atenuado, rótulos | `text-ink-3` | `--ink-3` |
| Acento | `text-accent`, `bg-accent`, `text-accent-ink` | `--accent` |
| Ingreso / positivo | `text-pos`, `bg-pos-soft` | `--pos` |
| Egreso / negativo | `text-neg`, `bg-neg-soft` | `--neg` |
| Transferencia / info | `text-info`, `bg-info-soft` | `--info` |
| Pendiente / aviso | `text-warn`, `bg-warn-soft` | `--warn` |
| Fondo de modal | `bg-overlay` | `--overlay` |

Todas admiten opacidad: `bg-ink/5`, `border-accent/40`.

### Tabla de reemplazo para código existente

| Antes | Ahora |
|---|---|
| `text-white` (texto) | `text-ink` |
| `text-white` sobre botón de acento | `text-accent-ink` |
| `text-gray-300`, `text-gray-400` | `text-ink-2` |
| `text-gray-500`, `text-gray-600` | `text-ink-3` |
| `text-green-400/500`, `text-green` | `text-pos` |
| `text-red-400/500`, `text-red` | `text-neg` |
| `text-blue-400` | `text-info` |
| `text-amber-400`, `text-yellow-400`, `text-orange-400` | `text-warn` |
| `text-gold` | `text-accent` (solo si es acento real; si es decoración, `text-ink-3`) |
| `bg-card`, `bg-secondary` | `bg-surface`, `bg-surface-2` |
| `bg-white/5`, `bg-white/10`, `hover:bg-white/5` | `bg-surface-2`, `bg-surface-3`, `hover:bg-surface-2` |
| `bg-green-500/10..20` | `bg-pos-soft` |
| `bg-red-500/10..20` | `bg-neg-soft` |
| `bg-blue-500/10..20` | `bg-info-soft` |
| `bg-amber-500/10..25`, `bg-gold/10` | `bg-warn-soft` / `bg-accent-soft` |
| `border-white/5`, `border-white/10` | `border-line` |
| `border-green-500/30` etc. | `border-pos/30` etc. |
| `bg-black/60`, `bg-black/70` (fondo de modal) | `bg-overlay` o `.modal-backdrop` |
| `bg-gradient-to-* from-... to-...` | color plano del token que corresponda |
| `rounded-xl`, `rounded-2xl` | `rounded-md` (6 px) o `rounded-lg` (10 px) |

## Componentes base (clases de `index.css`)

- **Panel:** `.card` (padding 16/20). Con encabezado: `.card.card-flush` +
  `.panel-head` + `.panel-title`.
- **Título de página:** `.section-header` > (`h2.section-title` +
  `p.section-subtitle`) y las acciones a la derecha. Sin icono dorado delante
  del título.
- **Indicadores:** `.kpi-strip` > `.kpi` > `.kpi-label` (con `.stat-mark`
  opcional coloreado vía `style={{ '--stat-color': 'var(--pos)' }}`) +
  `.kpi-value.amount` + `.kpi-meta`.
- **Botones:** `.btn-primary` (uno por pantalla), `.btn-secondary`,
  `.btn-ghost`, `.btn-danger`, tamaño `.btn-sm`, solo icono `.btn-icon`
  (con `aria-label`).
- **Campos:** `.label` + `.input-field`. Opciones excluyentes: `.segmented`
  con `<button aria-pressed>`.
- **Pestañas:** `.tab-pill` / `.tab-pill.active` (tinta invertida).
- **Etiquetas de estado:** `.chip` + `.chip-pos | -neg | -info | -warn | -accent`.
- **Tipo de movimiento:** `<span className="tipo-mark ingreso">I</span>`,
  `egreso` → E, `transferencia` → T.
- **Listas:** `.ledger` > `.ledger-row` (o `button.ledger-row`).
- **Tablas HTML:** `table.tabla`, celdas numéricas `td.col-num`, totales en `tfoot`.
- **Progreso:** `.meter > span` con `style={{ width: '40%' }}` (color por
  `background` con token).
- **Modal:** `.modal-backdrop` > `.modal-sheet` (hoja inferior en móvil,
  centrado en escritorio).
- **Menú flotante:** `.popover`.
- **Vacío:** `.empty-state`. **Carga:** `.skeleton`.

## Tipografía

IBM Plex Sans (400/500/600/700) para todo; IBM Plex Mono 500 para códigos
(número de cuenta, NIT, marcas de tipo). Empaquetadas con la app vía
`@fontsource`: funcionan sin conexión.

| Rol | Tamaño / peso |
|---|---|
| Título de página | 22 px (26 en escritorio) / 700, tracking -0.02em |
| Título de panel | 15 px / 600 |
| Texto | 15 px / 400 (14 en tablas) |
| Rótulo | 11 px / 600, versalitas, tracking 0.08em, `text-ink-3` |
| Cifra principal | 22–26 px / 600, tabular |

## Gráficas (Recharts)

Recharts no lee variables CSS en atributos SVG de forma fiable. Usa
`useColoresTema()` (`src/presentation/tema/useTema.js`): devuelve los colores
resueltos del tema activo (`pos`, `neg`, `info`, `ink2`, `line`...) y
`categorica`, una paleta de 10 tonos para series sin significado propio.

- Ingresos siempre `pos`, egresos siempre `neg`, saldo/neto `ink` o `info`.
- Rejilla horizontal solamente, color `line`, sin trazos punteados.
- Ejes en `ink3`, 12 px, montos con `formatoCompacto()` (`1,2 M`).
- Tooltip con fondo `surface`, borde `lineStrong`, montos con `formatoMoneda()`.
- Barras con radio 2 como mucho. Nada de degradados en áreas: relleno plano
  con opacidad 0.12.
- Tortas: solo si hay 6 porciones o menos; si no, barras horizontales
  ordenadas.

## AG-Grid

Tema construido con `themeQuartz.withParams()` usando variables CSS
(`backgroundColor: 'var(--surface)'`, `foregroundColor: 'var(--ink)'`,
`headerBackgroundColor: 'var(--surface-2)'`, `borderColor: 'var(--line)'`,
`accentColor: 'var(--accent)'`, `fontFamily: 'inherit'`). Así cambia con el
tema sin recrear la grilla.

## Formato

Todo formato de dinero, número y fecha sale de `src/presentation/formato.js`
(`formatoMoneda`, `formatoCompacto`, `formatoFecha`, `formatoMiles`,
`parsearMiles`...). Las fechas de calendario se manipulan con
`src/domain/value-objects/fecha.js` (`hoyLocal`, `claveDia`, `enRango`...).
**Nunca** `new Date().toISOString().split('T')[0]` (da la fecha UTC: de noche
en Colombia es "mañana") ni `new Date('YYYY-MM-DD')` (muestra el día anterior).

## Textos

- Español neutro de Colombia, frases cortas, sin signos de exclamación.
- Mensajes de error: qué pasó y qué hacer ("No se pudo subir. Se reintentará
  al recuperar la señal."), sin códigos técnicos para el usuario.
- Botones con verbo: "Guardar movimiento", "Registrar abono", no "OK".
