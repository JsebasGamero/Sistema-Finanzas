---
name: registrar-decision
description: Registra una decisión de diseño de FinanzasObra como ADR en docs/decisiones/ - contexto con datos concretos, decisión, consecuencias y alternativas descartadas. Úsalo cuando se toma una decisión que alguien podría deshacer sin saber por qué se tomó, o cuando se cambia una decisión anterior.
---

# Registrar una decisión

## Cuándo

- La decisión no es obvia mirando el código.
- Alguien podría "arreglarla" y reintroducir un bug.
- Se eligió entre alternativas razonables.
- Se reemplaza una decisión anterior.

No hace falta para detalles de implementación que el código ya explica.

## Pasos

1. Número siguiente según `docs/decisiones/README.md`.
2. Archivo `docs/decisiones/NNN-titulo-en-kebab-case.md` con la plantilla del
   README.
3. **Título como afirmación**: "Las categorías se guardan por nombre", no
   "Categorías".
4. **Contexto con datos concretos**: archivos, códigos de error, síntomas que
   veía el usuario. Una decisión sin su contexto no se puede reevaluar.
5. **Alternativas descartadas**, cada una con el motivo. Es la parte que más
   ahorra discusiones futuras.
6. Agrega la fila a la tabla de `docs/decisiones/README.md`.
7. Si reemplaza otra, cambia el estado de la anterior a
   "reemplazada por NNN".
8. Si la decisión cambia una regla de `CLAUDE.md` o `docs/DOMINIO.md`,
   actualiza también ese archivo.
