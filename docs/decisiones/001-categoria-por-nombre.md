# 001. Las categorías se guardan por nombre

- Estado: aceptada
- Fecha: 2026-09-25

## Contexto

`transacciones.categoria` es una columna `TEXT`, pero la app guardaba ahí el
UUID de la fila de `categorias`. Eso provocó tres fallos encadenados:

1. La app insertaba categorías con `tipo: 'general'`, que viola
   `CHECK (tipo IN ('INGRESO','EGRESO','AMBOS'))`. El error `23514` se trataba
   como permanente y la categoría se descartaba sin aviso.
2. El pull reemplaza la tabla local con la de Supabase, donde esas categorías
   no existían: los UUID quedaban huérfanos.
3. `categorias.nombre` es `UNIQUE`. Dos dispositivos que creaban "Materiales"
   generaban UUID distintos; el segundo chocaba y tampoco subía.

El usuario veía un UUID crudo donde debía decir "Materiales".

## Decisión

`transacciones.categoria` guarda el **nombre** de la categoría. La tabla
`categorias` sigue existiendo como catálogo para el selector.

## Consecuencias

- El nombre ya es único en la base, así que es un identificador estable entre
  dispositivos sin coordinar UUID.
- Los reportes agrupan por nombre directamente.
- Renombrar una categoría no actualiza los movimientos anteriores. Si se
  necesita, se hace con un `UPDATE transacciones SET categoria = ...` en una
  migración.
- Los movimientos antiguos con UUID se resuelven con
  `resolverNombreCategoria()`. Los huérfanos muestran "Sin categoría"; su
  nombre original no se puede recuperar.

## Alternativas descartadas

- **Mantener el UUID y arreglar solo el `tipo`**: sigue el choque de UUID
  entre dispositivos por el `UNIQUE` en el nombre.
- **FK real `categoria_id UUID REFERENCES categorias`**: lo más correcto a
  largo plazo, pero exige migrar datos existentes y resolver los huérfanos
  primero. Se puede retomar en la Fase 3 con esta decisión como paso previo.
