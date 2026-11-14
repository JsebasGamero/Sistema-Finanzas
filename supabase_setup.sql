-- =====================================================
-- SISTEMA DE GESTIÓN FINANCIERA PARA CONSTRUCTORA
-- Script SQL para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =====================================================
--
-- PARA QUÉ ES: crear desde cero un proyecto NUEVO (el de pruebas, por
-- ejemplo) con el mismo esquema que producción. Equivale al setup original
-- más todas las migraciones de supabase/migrations/ (001, 002 y 003): RLS
-- solo para authenticated, columnas y triggers de la 002, sin las vistas que
-- quitó la 003, y el bucket `soportes` con sus políticas.
--
-- NO SE EJECUTA SOBRE PRODUCCIÓN. Los cambios en una base que ya existe van
-- siempre como migración nueva (skill nueva-migracion). Este script es
-- idempotente (IF NOT EXISTS, DROP ... IF EXISTS, semillas con WHERE NOT
-- EXISTS / ON CONFLICT), así que correrlo dos veces no duplica datos, pero
-- re-crea todas las políticas: no es la forma de aplicar un cambio puntual.
--
-- Después de correrlo, en el dashboard (no se puede por SQL): ver
-- docs/SEGURIDAD.md, sobre todo desactivar "Allow new users to sign up".
-- =====================================================

-- 1. EXTENSIONES (Supabase ya tiene uuid-ossp habilitado)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 2. TABLAS PRINCIPALES
-- =====================================================

-- Tabla de Empresas (RUTs de las 5 empresas detectadas en Excel)
CREATE TABLE IF NOT EXISTS empresas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  nit TEXT UNIQUE,
  direccion TEXT,
  telefono TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Proyectos (Obras)
CREATE TABLE IF NOT EXISTS proyectos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
  presupuesto_estimado NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Pausado', 'Finalizado')),
  fecha_inicio DATE,
  fecha_fin DATE,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Cajas (Bancos, Caja Menor, Tarjetas)
CREATE TABLE IF NOT EXISTS cajas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Efectivo', 'Banco', 'Tarjeta')),
  empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
  saldo_actual NUMERIC DEFAULT 0,
  banco_nombre TEXT, -- Para tipo Banco
  numero_cuenta TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Terceros (Proveedores y Empleados)
CREATE TABLE IF NOT EXISTS terceros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT 'Proveedor' CHECK (tipo IN ('Proveedor', 'Empleado', 'Contratista')),
  nit_cedula TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Transacciones (Tabla principal de movimientos)
CREATE TABLE IF NOT EXISTS transacciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha DATE DEFAULT CURRENT_DATE,
  descripcion TEXT,
  monto NUMERIC NOT NULL CHECK (monto > 0),
  tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('INGRESO', 'EGRESO', 'TRANSFERENCIA')),
  categoria TEXT,
  
  -- Relaciones
  proyecto_id UUID REFERENCES proyectos(id) ON DELETE SET NULL,
  caja_origen_id UUID REFERENCES cajas(id) ON DELETE SET NULL,
  caja_destino_id UUID REFERENCES cajas(id) ON DELETE SET NULL,
  tercero_id UUID REFERENCES terceros(id) ON DELETE SET NULL,
  
  -- Soporte documental
  soporte_url TEXT,
  
  -- Control de sincronización offline
  sincronizado BOOLEAN DEFAULT TRUE,
  device_id TEXT, -- Identificador del dispositivo que creó la transacción
  
  -- Tracking de usuarios
  usuario_nombre TEXT, -- Nombre del usuario que registró
  editado_por TEXT, -- Nombre del usuario que editó (si aplica)
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Categorías predefinidas
CREATE TABLE IF NOT EXISTS categorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT CHECK (tipo IN ('INGRESO', 'EGRESO', 'AMBOS')),
  icono TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Deudas entre Cajas (préstamos internos)
CREATE TABLE IF NOT EXISTS deudas_cajas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caja_deudora_id UUID REFERENCES cajas(id) ON DELETE SET NULL,
  caja_acreedora_id UUID REFERENCES cajas(id) ON DELETE SET NULL,
  monto_original NUMERIC NOT NULL CHECK (monto_original > 0),
  monto_pendiente NUMERIC NOT NULL DEFAULT 0,
  fecha_prestamo DATE DEFAULT CURRENT_DATE,
  estado TEXT DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA')),
  descripcion TEXT, -- Concepto del préstamo (lo pide el formulario de la app)
  pagos JSONB DEFAULT '[]',
  usuario_nombre TEXT, -- Nombre del usuario que registró
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Deudas a Terceros (proveedores, empleados)
CREATE TABLE IF NOT EXISTS deudas_terceros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tercero_id UUID REFERENCES terceros(id) ON DELETE SET NULL,
  proyecto_id UUID REFERENCES proyectos(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
  monto_original NUMERIC NOT NULL CHECK (monto_original > 0),
  monto_pendiente NUMERIC NOT NULL DEFAULT 0,
  fecha_deuda DATE DEFAULT CURRENT_DATE,
  estado TEXT DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA')),
  descripcion TEXT,
  pagos JSONB DEFAULT '[]',
  usuario_nombre TEXT, -- Nombre del usuario que registró
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 3. ÍNDICES PARA MEJOR RENDIMIENTO
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha);
CREATE INDEX IF NOT EXISTS idx_transacciones_tipo ON transacciones(tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_transacciones_caja_origen ON transacciones(caja_origen_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_proyecto ON transacciones(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_cajas_empresa ON cajas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_empresa ON proyectos(empresa_id);

-- =====================================================
-- 4. FUNCIONES AUXILIARES
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_empresas_updated_at ON empresas;
CREATE TRIGGER update_empresas_updated_at
    BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_proyectos_updated_at ON proyectos;
CREATE TRIGGER update_proyectos_updated_at
    BEFORE UPDATE ON proyectos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cajas_updated_at ON cajas;
CREATE TRIGGER update_cajas_updated_at
    BEFORE UPDATE ON cajas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_terceros_updated_at ON terceros;
CREATE TRIGGER update_terceros_updated_at
    BEFORE UPDATE ON terceros
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transacciones_updated_at ON transacciones;
CREATE TRIGGER update_transacciones_updated_at
    BEFORE UPDATE ON transacciones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- De la migración 002: las deudas tienen updated_at pero no tenían trigger,
-- así que en un proyecto creado solo con este script la fecha no cambiaba
-- al abonar, a diferencia de producción (ADM-13).
DROP TRIGGER IF EXISTS update_deudas_cajas_updated_at ON deudas_cajas;
CREATE TRIGGER update_deudas_cajas_updated_at
    BEFORE UPDATE ON deudas_cajas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deudas_terceros_updated_at ON deudas_terceros;
CREATE TRIGGER update_deudas_terceros_updated_at
    BEFORE UPDATE ON deudas_terceros
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- Solo usuarios autenticados. La anon key viaja en el bundle JS
-- (es publica por diseno), asi que politicas `USING (true)` sin
-- restriccion de rol equivalen a dejar la base abierta a internet.
-- =====================================================

ALTER TABLE empresas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE terceros         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_cajas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_terceros  ENABLE ROW LEVEL SECURITY;

-- Primero se quita CUALQUIER política previa de estas tablas (igual que el
-- paso 1 de la migración 001). Si este script se corre sobre una base que
-- tenía las políticas públicas del setup original, quedarían vivas junto a
-- las nuevas y la base seguiría abierta a la anon key.
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

-- Politicas CRUD para el rol `authenticated` sobre todas las tablas.
-- Hoy todos los usuarios autenticados comparten el mismo conjunto de datos.
-- Si mas adelante hace falta separar por empresa o por rol, el punto de
-- cambio es exactamente este bloque (plan en docs/SEGURIDAD.md, ADM-11).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas', 'proyectos', 'cajas', 'terceros',
    'transacciones', 'categorias', 'deudas_cajas', 'deudas_terceros'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_select_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_update_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%1$s" ON public.%1$I', t);

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

-- =====================================================
-- 6. DATOS INICIALES - EMPRESAS
-- =====================================================

-- Idempotente por nombre (ADM-14). Antes era ON CONFLICT (nit) DO NOTHING,
-- que nunca actuaba: las semillas llevan nit NULL y en un UNIQUE dos NULL no
-- chocan. Cada re-ejecución creaba 5 empresas, 10 cajas y 11 obras más.
INSERT INTO empresas (nombre)
SELECT v.nombre
FROM (VALUES
  ('MAVICOL SAS'),
  ('PROEXI SAS'),
  ('CONSTRUCTORA 360 SAS'),
  ('UT MEDICINA INTERNA'),
  ('UT ORU 2020')
) AS v(nombre)
WHERE NOT EXISTS (SELECT 1 FROM empresas e WHERE e.nombre = v.nombre);

-- =====================================================
-- 7. DATOS INICIALES - CAJAS (basado en tu Excel)
-- =====================================================

-- Una caja de la semilla se inserta solo si no hay ya una caja con ese
-- nombre (aunque alguien la haya movido de empresa). La empresa se toma de
-- forma estable (la más antigua con ese nombre).
INSERT INTO cajas (nombre, tipo, empresa_id, saldo_actual)
SELECT v.nombre, v.tipo, emp.id, 0
FROM (VALUES
  ('Caja Rubén',              'Efectivo', 'MAVICOL SAS'),
  ('Caja 24/7',               'Efectivo', 'MAVICOL SAS'),
  ('Banco MAVICOL',           'Banco',    'MAVICOL SAS'),
  ('Tarjeta Crédito MAVICOL', 'Tarjeta',  'MAVICOL SAS'),
  ('Caja PROEXI',             'Efectivo', 'PROEXI SAS'),
  ('Mantenimiento PROEXI',    'Efectivo', 'PROEXI SAS'),
  ('Caja 360 SAS',            'Efectivo', 'CONSTRUCTORA 360 SAS'),
  ('Caja Hospital',           'Efectivo', 'UT MEDICINA INTERNA'),
  ('Caja UT ORU',             'Efectivo', 'UT ORU 2020'),
  ('Caja Saneamiento',        'Efectivo', 'UT ORU 2020')
) AS v(nombre, tipo, empresa)
CROSS JOIN LATERAL (
  SELECT e.id FROM empresas e
  WHERE e.nombre = v.empresa
  ORDER BY e.created_at, e.id
  LIMIT 1
) AS emp
WHERE NOT EXISTS (SELECT 1 FROM cajas c WHERE c.nombre = v.nombre);

-- =====================================================
-- 8. DATOS INICIALES - PROYECTOS (basado en tu Excel)
-- =====================================================

INSERT INTO proyectos (nombre, empresa_id, estado)
SELECT v.nombre, emp.id, 'Activo'
FROM (VALUES
  ('Proyecto Infraestructura Educativa', 'MAVICOL SAS'),
  ('Obra Pavimentación',                 'MAVICOL SAS'),
  ('Universidad Catatumbo',              'MAVICOL SAS'),
  ('Proyecto Suministro Cemento y Zinc', 'PROEXI SAS'),
  ('Proyecto Suministro Tubería',        'PROEXI SAS'),
  ('Consorcio CVMAV',                    'CONSTRUCTORA 360 SAS'),
  ('Hospital 24/7',                      'UT MEDICINA INTERNA'),
  ('Vías Terciarias',                    'UT ORU 2020'),
  ('Vías El Tarra',                      'UT ORU 2020'),
  ('UT Saneamiento Básico',              'UT ORU 2020'),
  ('UT Hacari 2019',                     'UT ORU 2020')
) AS v(nombre, empresa)
CROSS JOIN LATERAL (
  SELECT e.id FROM empresas e
  WHERE e.nombre = v.empresa
  ORDER BY e.created_at, e.id
  LIMIT 1
) AS emp
WHERE NOT EXISTS (SELECT 1 FROM proyectos p WHERE p.nombre = v.nombre);

-- =====================================================
-- 9. DATOS INICIALES - CATEGORÍAS
-- =====================================================

INSERT INTO categorias (nombre, tipo, icono, color) VALUES
  ('Nómina', 'EGRESO', '💰', '#ef4444'),
  ('Materiales', 'EGRESO', '🧱', '#f97316'),
  ('Viáticos', 'EGRESO', '🚗', '#eab308'),
  ('Combustible (ACPM)', 'EGRESO', '⛽', '#84cc16'),
  ('Transporte', 'EGRESO', '🚚', '#22c55e'),
  ('Alquiler Maquinaria', 'EGRESO', '🚜', '#14b8a6'),
  ('Préstamo', 'AMBOS', '🔄', '#3b82f6'),
  ('Pago Préstamo', 'EGRESO', '💳', '#6366f1'),
  ('Servicios', 'EGRESO', '🔧', '#a855f7'),
  ('Seguridad Social', 'EGRESO', '🏥', '#ec4899'),
  ('Arriendo', 'EGRESO', '🏠', '#f43f5e'),
  ('Anticipos Obra', 'INGRESO', '📥', '#10b981'),
  ('Pago Contrato', 'INGRESO', '📜', '#059669'),
  ('Horas Maquinaria', 'INGRESO', '⏱️', '#0d9488'),
  ('Otros', 'AMBOS', '📋', '#6b7280')
ON CONFLICT (nombre) DO NOTHING;

-- =====================================================
-- 10. STORAGE: BUCKET Y POLÍTICAS PARA SOPORTES (FOTOS)
-- =====================================================
-- Antes esto se hacía a mano en el dashboard y faltaban las políticas de la
-- migración 001: en un proyecto nuevo, subir un soporte fallaba con "new row
-- violates row-level security policy" aunque el bucket fuera público
-- (storage.objects tiene RLS activa y subir exige una política INSERT).
-- Ahora el proyecto de pruebas queda igual a producción (ADM-13).

-- Bucket público, igual que producción por ahora.
INSERT INTO storage.buckets (id, name, public)
VALUES ('soportes', 'soportes', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de la migración 001 (bloque 4): solo usuarios autenticados.
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

-- PENDIENTE (deuda conocida, C16): el bucket es público, así que cualquiera
-- con la URL exacta de una foto puede verla sin iniciar sesión. El arreglo es
-- un bucket privado + URLs firmadas, que exige guardar en
-- `transacciones.soporte_url` la RUTA del archivo en vez de la URL pública.
-- Plan y riesgos en docs/SEGURIDAD.md.

-- =====================================================
-- 11. VISTAS
-- =====================================================
-- El setup original creaba v_saldo_por_empresa, v_gastos_por_proyecto y
-- v_prestamos_entre_cajas sin security_invoker: saltaban RLS y se podían leer
-- solo con la anon key. La app no las usa; la migración 003 las elimina y
-- aquí se borran por si este script corre sobre una base que las tenía.
-- Una vista nueva debe llevar WITH (security_invoker = true).
DROP VIEW IF EXISTS public.v_prestamos_entre_cajas;
DROP VIEW IF EXISTS public.v_gastos_por_proyecto;
DROP VIEW IF EXISTS public.v_saldo_por_empresa;

-- =====================================================
-- LISTO. Base de datos configurada
-- =====================================================

-- Para verificar que todo se creó correctamente:
-- SELECT * FROM empresas;
-- SELECT * FROM cajas;
-- SELECT * FROM proyectos;
-- SELECT * FROM categorias;
--
-- Ninguna política abierta al rol anónimo (debe devolver 0 filas):
--   SELECT schemaname, tablename, policyname, roles
--   FROM pg_policies
--   WHERE schemaname IN ('public', 'storage')
--     AND ('anon' = ANY(roles) OR roles = '{public}');
--
-- Políticas del bucket de soportes (debe devolver 2 filas):
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname IN ('soportes_auth_read', 'soportes_auth_insert');
--
-- Triggers de updated_at (debe devolver 7 filas):
--   SELECT tgname FROM pg_trigger
--   WHERE tgname LIKE 'update\_%\_updated\_at' AND NOT tgisinternal;

-- =====================================================
-- 12. MIGRACIÓN: AGREGAR COLUMNAS DE TRACKING DE USUARIO
-- Ejecutar SOLO si ya tienes las tablas creadas
-- =====================================================

-- ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;
-- ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS editado_por TEXT;
-- ALTER TABLE deudas_cajas ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;
-- ALTER TABLE deudas_terceros ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;
