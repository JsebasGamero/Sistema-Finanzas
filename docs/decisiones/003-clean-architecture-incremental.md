# 003. Clean Architecture por porciones verticales

- Estado: aceptada
- Fecha: 2026-09-25

## Contexto

Los componentes de React leen y escriben IndexedDB directamente, encolan su
propia sincronización y contienen las reglas de negocio. `ReportsPanel.jsx`
tiene 1800 líneas. No hay tests. La app está en uso, así que no puede quedar
rota durante semanas.

## Decisión

Adoptar Clean Architecture (`domain` → `application` → `infrastructure` /
`presentation`, ver `docs/ARQUITECTURA.md`) migrando **una porción vertical a
la vez** (movimientos, luego deudas, luego maestros, luego reportes). Cada
porción es un PR que deja la app funcionando.

## Consecuencias

- Durante la migración conviven la estructura vieja y la nueva.
- Código nuevo va siempre en la estructura nueva.
- Cada porción agrega tests del dominio antes de mover la UI.
- Los agentes tienen zonas de archivos claras (`docs/ORQUESTACION.md`), lo
  que permite paralelizar sin conflictos.

## Alternativas descartadas

- **Reescritura completa**: semanas sin entregar valor y alto riesgo de
  perder comportamientos que hoy funcionan.
- **Solo extraer funciones utilitarias**: reduce duplicación, pero no separa
  el negocio de Dexie ni permite testear sin navegador.
- **Migrar a TypeScript a la vez**: suma riesgo a un refactor que ya es
  grande. Se puede hacer después, capa por capa, empezando por `domain/`.
