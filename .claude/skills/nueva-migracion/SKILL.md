---
name: nueva-migracion
description: Cómo escribir una migración SQL de Supabase para FinanzasObra - numeración, idempotencia, RLS, sincronizar supabase_setup.sql y comprobar que la app no escribe valores que violen los CHECK. Úsalo siempre que haya que agregar o cambiar tablas, columnas, restricciones, índices, vistas o políticas.
---

# Nueva migración

## 1. Numerar

```bash
ls supabase/migrations/
```

El archivo nuevo es `supabase/migrations/NNN_descripcion_en_snake_case.sql`,
con NNN = último + 1, rellenado a tres dígitos.

## 2. Encabezado

```sql
-- =====================================================
-- MIGRACIÓN NNN — Título corto
-- =====================================================
--
-- PROBLEMA QUE RESUELVE:
-- Qué pasaba y qué veía el usuario.
--
-- ESTA MIGRACIÓN:
-- Qué cambia.
--
-- EJECUTAR EN: Supabase Dashboard > SQL Editor.
-- REQUIERE: migraciones anteriores (si aplica).
-- =====================================================
```

## 3. Cuerpo idempotente

Debe poder correrse dos veces sin error:

| Operación | Forma |
|---|---|
| Columna | `ALTER TABLE t ADD COLUMN IF NOT EXISTS c TIPO;` |
| Índice | `CREATE INDEX IF NOT EXISTS ...` |
| Tabla | `CREATE TABLE IF NOT EXISTS ...` |
| Trigger | `DROP TRIGGER IF EXISTS x ON t;` y luego `CREATE TRIGGER` |
| Política | `DROP POLICY IF EXISTS "x" ON t;` y luego `CREATE POLICY` |
| CHECK | `ALTER TABLE t DROP CONSTRAINT IF EXISTS x;` y luego `ADD CONSTRAINT` |

## 4. Tablas nuevas

```sql
ALTER TABLE nueva ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_nueva" ON nueva FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_nueva" ON nueva FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_nueva" ON nueva FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_nueva" ON nueva FOR DELETE TO authenticated USING (true);
```

Con `created_at` y `updated_at`, y el trigger `update_updated_at_column`.

## 5. Comprobar la app contra los CHECK

Por cada CHECK nuevo o modificado, busca qué escribe la app en esa columna:

```bash
grep -rn "estado:" src/
grep -rn "tipo:" src/
```

Si algún literal no cumple el CHECK, la escritura se descartará en silencio al
sincronizar. Arregla la app en el mismo cambio o no agregues el CHECK.

## 6. Reflejar en supabase_setup.sql

El setup debe producir el mismo esquema que setup antiguo + todas las
migraciones. Edita la definición de la tabla ahí también.

## 7. Avisar a sync

Si la app debe leer o escribir la columna nueva, `prepareForSupabase()` en
`src/services/syncService.js` necesita el campo en su whitelist. Si eres
`supabase-sql`, repórtalo; no es tu zona.

## 8. Verificación al final del archivo

Una consulta comentada que la persona pueda correr para confirmar que quedó
bien.

## Nunca

- Credenciales o URLs de proyecto en el SQL.
- `USING (true)` sin `TO authenticated`.
- `DROP TABLE`, `DROP COLUMN`, `DELETE` o `TRUNCATE` sin confirmación
  explícita de la persona.
- Ejecutar la migración: la corre una persona.
