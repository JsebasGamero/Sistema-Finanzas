-- =====================================================
-- MIGRACIÓN 001 — Cerrar el acceso anónimo (RLS)
-- =====================================================
--
-- PROBLEMA QUE RESUELVE:
-- El setup original creaba políticas `USING (true)` sobre todas las tablas.
-- La anon key viaja en el bundle JavaScript (es pública por diseño), así que
-- esas políticas permitían a CUALQUIERA leer, modificar y borrar toda la
-- contabilidad sin iniciar sesión. La pantalla de login no protegía nada.
--
-- ESTA MIGRACIÓN:
-- Reemplaza cada política pública por una que exige un usuario autenticado
-- (`auth.role() = 'authenticated'`). A partir de aquí, la sesión de Supabase
-- Auth es lo que realmente da acceso a los datos.
--
-- EJECUTAR EN: Supabase Dashboard > SQL Editor.
-- =====================================================


-- -----------------------------------------------------
-- 1. Eliminar las políticas públicas anteriores
-- -----------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'empresas', 'proyectos', 'cajas', 'terceros',
        'transacciones', 'categorias', 'deudas_cajas', 'deudas_terceros'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;


-- -----------------------------------------------------
-- 2. Asegurar que RLS está activo en todas las tablas
-- -----------------------------------------------------
ALTER TABLE empresas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE terceros         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_cajas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_terceros  ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------
-- 3. Políticas nuevas: solo usuarios autenticados
-- -----------------------------------------------------
-- Nota: hoy todos los usuarios autenticados comparten el mismo conjunto de
-- datos (no hay multi-empresa por usuario). Si más adelante se necesita
-- separar por empresa o por rol, el punto de cambio es exactamente aquí.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas', 'proyectos', 'cajas', 'terceros',
    'transacciones', 'categorias', 'deudas_cajas', 'deudas_terceros'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "auth_select_%1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format(
      'CREATE POLICY "auth_insert_%1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format(
      'CREATE POLICY "auth_update_%1$s" ON public.%1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format(
      'CREATE POLICY "auth_delete_%1$s" ON public.%1$I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;


-- -----------------------------------------------------
-- 4. Storage: bucket de soportes
-- -----------------------------------------------------
-- Las fotos de soporte son documentos contables. Solo usuarios autenticados
-- deben poder subirlas y verlas.

DROP POLICY IF EXISTS "soportes_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "soportes_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "soportes_auth_read"     ON storage.objects;
DROP POLICY IF EXISTS "soportes_auth_insert"   ON storage.objects;

CREATE POLICY "soportes_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'soportes');

CREATE POLICY "soportes_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'soportes');


-- -----------------------------------------------------
-- 5. Verificación
-- -----------------------------------------------------
-- Tras ejecutar, esta consulta no debe devolver ninguna fila.
-- Si devuelve algo, quedó una política abierta al rol anónimo.
--
--   SELECT tablename, policyname, roles
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND ('anon' = ANY(roles) OR roles = '{public}');
