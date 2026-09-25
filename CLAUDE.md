# FinanzasObra (rsistema)

Sistema financiero para constructoras, pensado para usarse en obra: móvil,
con señal intermitente y bajo el sol. Registra ingresos, egresos y
transferencias entre cajas, préstamos entre cajas y cuentas por pagar a
proveedores, por empresa y por proyecto.

Lee esto entero antes de tocar código. Los detalles están en `docs/`.

## Stack

- React 19 + Vite 7 + Tailwind 4 (JavaScript, sin TypeScript)
- Dexie 4 (IndexedDB) como base local: la app funciona sin conexión
- Supabase (Postgres + Auth + Storage) como nube y fuente de verdad
- Capacitor 8 para el empaquetado Android (`android/` no se versiona entero)
- Recharts, AG-Grid, jsPDF, xlsx para reportes

## Comandos

```bash
npm run dev      # servidor de desarrollo, puerto 5173
npm run build    # build de producción; debe pasar antes de cada commit
npm run lint     # ESLint sobre src/ (android/ y dist/ están ignorados)
```

No hay suite de tests todavía. Se agrega Vitest al empezar la Fase 3
(ver `docs/BACKLOG.md`). Hasta entonces, "verificado" significa: build limpio,
lint sin errores nuevos, y comprobación en el navegador (skill
`verificar-cambios`).

## Mapa de la documentación

| Archivo | Para qué |
|---|---|
| `docs/DOMINIO.md` | Glosario y reglas de negocio. Qué hace cada tipo de movimiento con los saldos. |
| `docs/ARQUITECTURA.md` | Arquitectura actual, arquitectura objetivo (Clean Architecture) y cómo migrar. |
| `docs/SINCRONIZACION.md` | Modelo offline: cola de sync, pull, códigos de error, invariantes. |
| `docs/BACKLOG.md` | Bugs de la auditoría y fases del plan, con estado. **Fuente de verdad del trabajo pendiente.** |
| `docs/ORQUESTACION.md` | Cómo se reparte el trabajo entre agentes. |
| `docs/decisiones/` | ADRs: decisiones de diseño y por qué se tomaron. |

## Invariantes que no se rompen

Estas reglas existen porque romperlas ya causó pérdida o corrupción de datos.
Cada una tiene su historia en `docs/BACKLOG.md`.

1. **Nunca vaciar `sync_queue` a ciegas.** `processSyncQueue()` borra cada
   operación que sube bien; lo que queda son fallos que hay que reintentar.
   Tampoco se borra en el logout.
2. **Nunca descartar en silencio una operación que Supabase rechaza.** Si un
   error es permanente, el usuario tiene que enterarse.
3. **Los valores que la app escribe deben cumplir los CHECK del esquema.**
   Antes de escribir un literal de estado o tipo, revisa `supabase_setup.sql`.
   Ejemplos: proyectos usan `'Activo'` (no `'ACTIVO'`); categorías usan
   `'INGRESO' | 'EGRESO' | 'AMBOS'`.
4. **Todo campo que la app persiste debe existir como columna y estar en la
   whitelist de `prepareForSupabase()`** (`src/services/syncService.js`).
   Si falta en cualquiera de los dos, el dato se pierde en el siguiente pull.
5. **`transacciones.categoria` guarda el nombre, no el UUID.** Para mostrarla,
   usa siempre `resolverNombreCategoria()` (`src/services/categorias.js`).
   Nunca pintes un UUID en pantalla.
6. **No compares dinero con `===`.** Usa `src/services/dinero.js`
   (`restarMontos`, `esCero`, `estadoDeuda`).
7. **Una TRANSFERENCIA siempre tiene caja origen y caja destino distintas.**
8. **Las políticas RLS son solo para `authenticated`.** Nunca `USING (true)`
   sin rol: la anon key es pública.
9. **Nada de credenciales en el repo.** `.env` está ignorado; `.env.example`
   solo lleva placeholders.

## Deuda conocida que todavía está viva

- **Los saldos pueden derivar.** `cajas.saldo_actual` se muta de forma
  incremental desde cinco sitios distintos. El arreglo es derivarlo de las
  transacciones (Fase 4). Mientras tanto: si tocas lógica de saldos, cambia
  todos los sitios o ninguno, y dilo en el commit.
- Los componentes hablan directo con Dexie. La capa de dominio no existe aún.
- El bucket `soportes` es público.

## Convenciones

- Código, comentarios, commits y documentación **en español**. Nombres de
  variables: se respeta el idioma del código que rodea (hoy hay mezcla).
- Los comentarios explican el **por qué**, sobre todo cuando el código evita
  un bug que ya ocurrió. No narran lo que el código ya dice.
- Commits: `tipo(ámbito): resumen` (`fix`, `feat`, `refactor`, `docs`,
  `chore`). El cuerpo explica qué se rompía y por qué el cambio lo arregla.
- Cambios de esquema: siempre como migración nueva en `supabase/migrations/`
  **y** reflejados en `supabase_setup.sql`. Skill: `nueva-migracion`.
- Nada de emojis en la interfaz ni en los mensajes del sistema.
- UI: usa los tokens de `src/index.css` (`--bg-card`, `--border-subtle`...),
  no valores `rgba()` sueltos en `style={{}}`.
- Responsive: todo se prueba a 320px de ancho. Nada que dependa solo de hover.

## Definición de terminado

Un cambio está terminado cuando:

1. `npm run build` pasa.
2. `npm run lint` no tiene errores nuevos.
3. Se verificó en el navegador lo que se pueda verificar (skill
   `verificar-cambios`), y se dice explícitamente qué no se pudo verificar.
4. Si toca el esquema, hay migración y `supabase_setup.sql` está al día.
5. `docs/BACKLOG.md` refleja el nuevo estado.
6. Si hubo una decisión de diseño no obvia, hay un ADR.

## Orquestación multiagente

Para trabajo de más de un área, usa la skill `orquestar-fase`. Resumen:

- El **agente principal orquesta**. Los subagentes no pueden lanzar otros
  subagentes.
- `arquitecto` planifica y asigna archivos. `revisor` revisa contra estas
  invariantes. `qa` verifica. Los tres son de solo lectura.
- `dominio`, `sync-offline`, `supabase-sql` y `ui-movil` implementan, cada uno
  dentro de su zona de archivos.
- Dos agentes en paralelo nunca editan el mismo archivo.

Detalle completo en `docs/ORQUESTACION.md`.

## Límites

- No se inician sesiones en la app con credenciales reales. Lo que está
  detrás del login lo verifica una persona; decirlo en el resumen.
- No se ejecutan migraciones contra Supabase: se escriben y la persona las
  corre en el SQL Editor.
- No hacer push ni merge a `main` sin que lo pidan.
