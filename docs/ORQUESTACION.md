# Orquestación multiagente

Cómo se reparte el trabajo entre agentes en este proyecto. El procedimiento
paso a paso está en la skill `orquestar-fase`
(`.claude/skills/orquestar-fase/SKILL.md`).

## Principio

Un solo orquestador (la sesión principal) y especialistas con **zonas de
archivos separadas**. Los agentes de solo lectura planifican, revisan y
verifican; los implementadores escriben solo dentro de su zona.

Restricciones de Claude Code:

- **Los subagentes no pueden lanzar otros subagentes.** Todo reparto lo hace
  el orquestador.
- **Los subagentes no tienen herramientas de navegador.** La verificación en
  el navegador (skill `verificar-cambios`, paso 4) la hace siempre el
  orquestador, después de `qa`.

## Agentes

Definidos en `.claude/agents/`.

| Agente | Rol | Escribe | Zona |
|---|---|---|---|
| `arquitecto` | Planifica, divide en tareas, asigna archivos, detecta conflictos | no | todo (lectura) |
| `dominio` | Reglas de negocio puras y casos de uso, con tests | sí | `src/domain/`, `src/application/`, `src/services/dinero.js`, `src/services/categorias.js`, tests de esas carpetas |
| `sync-offline` | Dexie, cola de sync, pull, repositorios | sí | `src/infrastructure/`, `src/services/db.js`, `src/services/syncService.js`, `src/services/supabase.js` |
| `supabase-sql` | Esquema, migraciones, RLS, vistas | sí | `supabase/`, `supabase_setup.sql` |
| `ui-movil` | Presentación, responsive, design system | sí | `src/presentation/`, `src/components/`, `src/index.css`, `index.html` |
| `revisor` | Revisa el diff contra las invariantes de `CLAUDE.md` | no | todo (lectura) |
| `qa` | Build, lint, tests, verificación en navegador | no (solo comandos) | todo (lectura) |

Archivos compartidos (`src/App.jsx`, `src/context/`, `package.json`,
`CLAUDE.md`, `docs/`) los edita **el orquestador**, o un agente al que se le
asignen explícitamente en esa tarea.

## Flujo de una fase

```
 orquestador
    │ 1. lee BACKLOG.md y elige el alcance
    ▼
 arquitecto ─► plan: tareas, dueño de cada archivo, dependencias, riesgos
    │
    │ 2. orquestador valida que ningún archivo tenga dos dueños
    ▼
 ┌──────────────┬──────────────┬──────────────┐
 │ supabase-sql │   dominio    │   ui-movil   │   3. en paralelo si no
 │              │              │              │      hay dependencias
 └──────┬───────┴──────┬───────┴──────┬───────┘
        └──────────────┼──────────────┘
                       ▼
                 sync-offline            (si depende del esquema o del dominio)
                       │
                       ▼
                    revisor ─► hallazgos ─► vuelve al implementador si hay bloqueantes
                       │
                       ▼
                      qa ─► build, lint, tests, navegador
                       │
                       ▼
 orquestador: commit por bloque lógico + actualiza BACKLOG.md
```

## Reglas de paralelismo

1. **Un archivo, un dueño por ronda.** Si dos tareas necesitan el mismo
   archivo, van en secuencia.
2. **Dependencias explícitas.** El esquema antes que el código que lo usa; el
   dominio antes que la UI que lo llama.
3. **Aislamiento.** Si dos implementadores corren en paralelo sobre zonas que
   se tocan (p. ej. ambos agregan imports a `App.jsx`), usar
   `isolation: "worktree"` y fusionar después.
4. **Máximo tres implementadores a la vez.** Más que eso cuesta más en
   revisión de lo que ahorra.

## Contrato de entrega de un implementador

Cada implementador termina su reporte con esta sección, que el orquestador
usa para revisar e integrar:

```markdown
## Entrega
- Archivos modificados: (lista)
- Archivos creados: (lista)
- Invariantes de CLAUDE.md que toca: (números) y cómo se respetan
- Verificado: (qué comandos corrió y resultado)
- No verificado: (qué no pudo probar y por qué)
- Pendientes o riesgos: (lista, o "ninguno")
```

## Contrato de entrega del revisor

```markdown
## Revisión
- Bloqueantes: (lista con archivo:línea, o "ninguno")
- Recomendados: (lista)
- Invariantes verificadas: (números)
- Veredicto: aprobar | corregir y volver
```

## Cuándo NO orquestar

- Un bug de un solo archivo: lo arregla el orquestador directamente.
- Una pregunta sobre el código: se responde leyendo.
- Tareas de menos de ~30 minutos de trabajo humano: el costo de coordinar
  supera el beneficio.
