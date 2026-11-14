-- =====================================================
-- ESQUEMA DE PRUEBAS dentro del proyecto de producción
-- =====================================================
--
-- PARA QUÉ: tener una "cuenta de pruebas" con sus propios datos sin crear otro
-- proyecto de Supabase (el plan gratuito permite solo dos proyectos activos).
--
-- CÓMO AÍSLA: crea un esquema de Postgres llamado `pruebas` con una copia
-- VACÍA de las 8 tablas de la app. La app en modo desarrollo
-- (`npm run dev` con VITE_SUPABASE_SCHEMA=pruebas) lee y escribe SOLO aquí;
-- la app de producción sigue usando `public` y no ve nada de esto.
--
-- QUÉ NO TOCA: ninguna tabla, columna, dato ni política del esquema `public`
-- (producción). Solo CREA objetos dentro de `pruebas`. Se puede correr varias
-- veces (todo es IF NOT EXISTS / DROP ... IF EXISTS).
--
-- QUÉ SÍ SE COMPARTE con producción (por ser el mismo proyecto):
--   - Los usuarios (Authentication). Lo más simple es probar con su propia
--     cuenta: en `npm run dev` sus datos van a `pruebas`, en la app instalada
--     a `public`. Si crea un usuario aparte para pruebas, ese usuario también
--     podrá entrar a la app de producción y ver los datos reales.
--   - El bucket de fotos `soportes`. Las fotos de pruebas se guardan bajo la
--     carpeta `pruebas/` del bucket.
--
-- EJECUTAR EN: Supabase Dashboard del proyecto de PRODUCCIÓN > SQL Editor.
-- DESPUÉS, A MANO (sin esto la app recibe el error PGRST106):
--   Project Settings > Data API > "Exposed schemas": agregar `pruebas` > Save.
--
-- Ver docs/ENTORNOS.md, "Cuenta de pruebas dentro del mismo proyecto".
-- =====================================================

CREATE SCHEMA IF NOT EXISTS pruebas;

-- Solo usuarios con sesión (invariante 8). A diferencia de `public`, aquí ni
-- siquiera se le da USAGE al rol anon: sin sesión, el esquema no existe.
REVOKE ALL ON SCHEMA pruebas FROM anon, public;
GRANT USAGE ON SCHEMA pruebas TO authenticated, service_role;


-- =====================================================
-- TABLAS (mismas columnas y CHECK que supabase_setup.sql)
-- =====================================================
-- Si cambia el esquema de `public` (nueva migración), hay que repetir el
-- cambio aquí: la skill nueva-migracion lo recuerda.

CREATE TABLE IF NOT EXISTS pruebas.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  nit TEXT UNIQUE,
  direccion TEXT,
  telefono TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pruebas.proyectos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  empresa_id UUID REFERENCES pruebas.empresas(id) ON DELETE SET NULL,
  presupuesto_estimado NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Pausado', 'Finalizado')),
  fecha_inicio DATE,
  fecha_fin DATE,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pruebas.cajas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Efectivo', 'Banco', 'Tarjeta')),
  empresa_id UUID REFERENCES pruebas.empresas(id) ON DELETE SET NULL,
  saldo_actual NUMERIC DEFAULT 0,
  banco_nombre TEXT,
  numero_cuenta TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pruebas.terceros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT 'Proveedor' CHECK (tipo IN ('Proveedor', 'Empleado', 'Contratista')),
  nit_cedula TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pruebas.transacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE DEFAULT CURRENT_DATE,
  descripcion TEXT,
  monto NUMERIC NOT NULL CHECK (monto > 0),
  tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('INGRESO', 'EGRESO', 'TRANSFERENCIA')),
  categoria TEXT,
  proyecto_id UUID REFERENCES pruebas.proyectos(id) ON DELETE SET NULL,
  caja_origen_id UUID REFERENCES pruebas.cajas(id) ON DELETE SET NULL,
  caja_destino_id UUID REFERENCES pruebas.cajas(id) ON DELETE SET NULL,
  tercero_id UUID REFERENCES pruebas.terceros(id) ON DELETE SET NULL,
  soporte_url TEXT,
  sincronizado BOOLEAN DEFAULT TRUE,
  device_id TEXT,
  usuario_nombre TEXT,
  editado_por TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pruebas.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT CHECK (tipo IN ('INGRESO', 'EGRESO', 'AMBOS')),
  icono TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pruebas.deudas_cajas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_deudora_id UUID REFERENCES pruebas.cajas(id) ON DELETE SET NULL,
  caja_acreedora_id UUID REFERENCES pruebas.cajas(id) ON DELETE SET NULL,
  monto_original NUMERIC NOT NULL CHECK (monto_original > 0),
  monto_pendiente NUMERIC NOT NULL DEFAULT 0,
  fecha_prestamo DATE DEFAULT CURRENT_DATE,
  estado TEXT DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA')),
  descripcion TEXT,
  pagos JSONB DEFAULT '[]',
  usuario_nombre TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pruebas.deudas_terceros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tercero_id UUID REFERENCES pruebas.terceros(id) ON DELETE SET NULL,
  proyecto_id UUID REFERENCES pruebas.proyectos(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES pruebas.empresas(id) ON DELETE SET NULL,
  monto_original NUMERIC NOT NULL CHECK (monto_original > 0),
  monto_pendiente NUMERIC NOT NULL DEFAULT 0,
  fecha_deuda DATE DEFAULT CURRENT_DATE,
  estado TEXT DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA')),
  descripcion TEXT,
  pagos JSONB DEFAULT '[]',
  usuario_nombre TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON pruebas.transacciones(fecha);
CREATE INDEX IF NOT EXISTS idx_transacciones_tipo ON pruebas.transacciones(tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_transacciones_caja_origen ON pruebas.transacciones(caja_origen_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_proyecto ON pruebas.transacciones(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_cajas_empresa ON pruebas.cajas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_empresa ON pruebas.proyectos(empresa_id);

-- RLS escrita tabla por tabla (además del bucle de políticas de abajo): el
-- revisor del SQL Editor no ve el ALTER que va dentro del DO y avisaba
-- "creates tables without enabling Row Level Security".
ALTER TABLE pruebas.empresas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pruebas.proyectos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pruebas.cajas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pruebas.terceros        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pruebas.transacciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pruebas.categorias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pruebas.deudas_cajas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pruebas.deudas_terceros ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- updated_at automático (función propia del esquema, para no depender de
-- la de `public`)
-- =====================================================

CREATE OR REPLACE FUNCTION pruebas.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas', 'proyectos', 'cajas', 'terceros', 'transacciones',
    'deudas_cajas', 'deudas_terceros'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%1$s_updated_at ON pruebas.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER update_%1$s_updated_at BEFORE UPDATE ON pruebas.%1$I '
      'FOR EACH ROW EXECUTE FUNCTION pruebas.update_updated_at_column()', t);
  END LOOP;
END $$;


-- =====================================================
-- PERMISOS Y RLS: solo `authenticated` (invariante 8)
-- =====================================================

GRANT ALL ON ALL TABLES IN SCHEMA pruebas TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pruebas TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pruebas TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pruebas GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pruebas GRANT ALL ON SEQUENCES TO authenticated, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas', 'proyectos', 'cajas', 'terceros', 'transacciones',
    'categorias', 'deudas_cajas', 'deudas_terceros'
  ]
  LOOP
    EXECUTE format('ALTER TABLE pruebas.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "auth_select_%1$s" ON pruebas.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%1$s" ON pruebas.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_update_%1$s" ON pruebas.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%1$s" ON pruebas.%1$I', t);

    EXECUTE format(
      'CREATE POLICY "auth_select_%1$s" ON pruebas.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format(
      'CREATE POLICY "auth_insert_%1$s" ON pruebas.%1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format(
      'CREATE POLICY "auth_update_%1$s" ON pruebas.%1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format(
      'CREATE POLICY "auth_delete_%1$s" ON pruebas.%1$I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;


-- =====================================================
-- CATEGORÍAS INICIALES (las demás tablas arrancan vacías: use
-- Configuración > Entorno de pruebas > Generar datos de prueba)
-- =====================================================

INSERT INTO pruebas.categorias (nombre, tipo) VALUES
  ('Nómina', 'EGRESO'),
  ('Materiales', 'EGRESO'),
  ('Viáticos', 'EGRESO'),
  ('Combustible (ACPM)', 'EGRESO'),
  ('Transporte', 'EGRESO'),
  ('Alquiler Maquinaria', 'EGRESO'),
  ('Préstamo', 'AMBOS'),
  ('Pago Préstamo', 'EGRESO'),
  ('Servicios', 'EGRESO'),
  ('Seguridad Social', 'EGRESO'),
  ('Arriendo', 'EGRESO'),
  ('Anticipos Obra', 'INGRESO'),
  ('Pago Contrato', 'INGRESO'),
  ('Horas Maquinaria', 'INGRESO'),
  ('Otros', 'AMBOS')
ON CONFLICT (nombre) DO NOTHING;


-- =====================================================
-- VERIFICACIÓN (correr después; no modifica nada)
-- =====================================================
-- 1) Las 8 tablas existen en `pruebas` con RLS activa:
--
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'pruebas' ORDER BY 1;
--
-- 2) Las políticas son solo para authenticated:
--
--   SELECT tablename, policyname, roles FROM pg_policies
--   WHERE schemaname = 'pruebas' ORDER BY 1, 2;
--
-- 3) `public` no cambió: compare el conteo antes y después.
--
--   SELECT count(*) FROM public.transacciones;


-- =====================================================
-- EMPEZAR DE CERO (opcional, NO se ejecuta solo)
-- =====================================================
-- Borra TODOS los datos de pruebas (solo del esquema `pruebas`). Revise que
-- diga `pruebas.` en cada tabla antes de correrlo.
--
--   TRUNCATE pruebas.transacciones, pruebas.deudas_cajas, pruebas.deudas_terceros,
--            pruebas.cajas, pruebas.proyectos, pruebas.terceros, pruebas.empresas
--   RESTART IDENTITY;
--
-- Y en el navegador de pruebas, cierre sesión para limpiar la copia local.
