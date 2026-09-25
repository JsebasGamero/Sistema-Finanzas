# Registro de decisiones (ADR)

Una decisión de diseño por archivo, numerada. Se registra cuando la decisión
no es obvia mirando el código, o cuando alguien podría "arreglarla" sin saber
por qué se tomó.

Para escribir una nueva, usa la skill `registrar-decision`.

| # | Título | Estado |
|---|---|---|
| 001 | [Las categorías se guardan por nombre](001-categoria-por-nombre.md) | aceptada |
| 002 | [El saldo de una caja se deriva de sus movimientos](002-saldo-derivado.md) | propuesta |
| 003 | [Clean Architecture por porciones verticales](003-clean-architecture-incremental.md) | aceptada |
| 004 | [Un único aplicador de ajustes de saldo, como paso transitorio](004-aplicador-unico-transitorio.md) | aceptada |

## Plantilla

```markdown
# NNN. Título en forma de afirmación

- Estado: propuesta | aceptada | reemplazada por NNN
- Fecha: AAAA-MM-DD

## Contexto
Qué problema había. Datos concretos: archivos, errores, síntomas.

## Decisión
Qué se decidió, en una o dos frases.

## Consecuencias
Qué mejora, qué empeora, qué queda pendiente.

## Alternativas descartadas
Cada una con el motivo.
```
