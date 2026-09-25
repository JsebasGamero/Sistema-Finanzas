---
name: orquestar-fase
description: Procedimiento para ejecutar una fase o un cambio grande de FinanzasObra con varios agentes especializados - planificar con arquitecto, repartir a implementadores con zonas de archivos separadas, revisar, verificar, commitear y actualizar el backlog. Úsalo cuando el trabajo toca más de un área (esquema + sync + UI) o cuando piden "hacer la fase N".
---

# Orquestar una fase

Tú eres el orquestador. Los subagentes no pueden lanzar otros subagentes: todo
reparto pasa por ti. Referencia: `docs/ORQUESTACION.md`.

## 0. ¿Vale la pena orquestar?

Si el cambio es de un solo archivo o de un solo agente, hazlo directamente o
lanza solo ese agente. Orquestar tiene costo: cada agente arranca sin
contexto.

## 1. Preparar

- Confirma la rama de trabajo (`git branch --show-current`). Si estás en
  `main`, crea una rama `tipo/descripcion` antes de empezar.
- Lee `docs/BACKLOG.md` y define el alcance: qué IDs se cierran.
- Si el alcance es ambiguo y dos lecturas llevan a trabajo muy distinto,
  pregunta a la persona antes de lanzar agentes.

## 2. Planificar

Lanza `arquitecto` con:

- el objetivo y los IDs del backlog
- restricciones que la persona haya dado
- "entrega el plan con el formato de tu definición"

Al recibir el plan, **valídalo tú**:

- [ ] Ningún archivo tiene dos dueños en la misma ronda.
- [ ] Las tareas de esquema van antes que el código que depende de ellas.
- [ ] Cada tarea está dentro de la zona de su agente, o la excepción está
      justificada.
- [ ] Hay una lista de lo que requiere verificación humana.

Si algo falla, corrige el plan tú mismo o devuélvelo al arquitecto.

## 3. Ejecutar por rondas

Para cada ronda, lanza en paralelo (en un mismo mensaje) los implementadores
de esa ronda. El prompt de cada uno debe ser autosuficiente:

```
Tarea N del plan "<nombre>".
Objetivo: ...
Archivos de los que eres dueño en esta tarea: ...
No toques: ... (archivos de otros agentes en esta ronda)
Contexto que necesitas: ... (decisiones del plan, resultados de rondas anteriores)
Criterio de aceptación: ...
Termina con la sección "Entrega" de docs/ORQUESTACION.md.
```

- Si dos agentes de la misma ronda podrían chocar en archivos compartidos,
  usa `isolation: "worktree"` y fusiona tú al terminar.
- Máximo tres implementadores simultáneos.
- No empieces la ronda siguiente hasta tener todas las entregas de la actual.
- Lee cada entrega. Lo que un agente reporta como hecho, compruébalo en el
  diff antes de darlo por bueno.

## 4. Revisar

Lanza `revisor` sobre el diff de la ronda (o de la fase completa si es
pequeña). Si el veredicto es "corregir y volver":

- devuelve cada bloqueante al agente dueño del archivo, con archivo y línea
- vuelve a revisar solo lo corregido

Los "recomendados" se aplican si son baratos; si no, van al backlog.

## 5. Verificar

Lanza `qa` (build, lint, tests, greps). Puede ir en segundo plano mientras tú
haces la parte de navegador de `verificar-cambios`: los subagentes no tienen
navegador, así que esa parte es siempre tuya. Si algo falla, vuelve al paso 3
con el agente dueño.

## 6. Cerrar

- Commit por bloque lógico (no uno gigante, no uno por archivo), con el
  formato de `CLAUDE.md`. El cuerpo explica qué se rompía y por qué el cambio
  lo arregla.
- Actualiza `docs/BACKLOG.md`: estado y commit de cada ID cerrado; IDs nuevos
  para lo descubierto.
- Si hubo una decisión de diseño no obvia, skill `registrar-decision`.
- Si hay migraciones, la persona tiene que correrlas: dilo.

## 7. Informar a la persona

- Qué se cerró (IDs y efecto para el usuario, no nombres de funciones).
- Acciones manuales pendientes (migraciones, rotación de keys).
- Qué no se pudo verificar y cómo probarlo.
- Qué sigue.

No hagas push ni merge a `main` sin que lo pidan.
