-- =====================================================
-- SISTEMA DE GESTIÓN FINANCIERA PARA CONSTRUCTORA
-- Script SQL para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
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
  pagos JSONB DEFAULT '[]',
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

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- Nota: Permite acceso público por ahora. Después puedes
-- agregar autenticación con usuarios.
-- =====================================================

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE terceros ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso público (para desarrollo)
-- IMPORTANTE: Para producción, cambia estas políticas para requerir autenticación

CREATE POLICY "Allow public read empresas" ON empresas FOR SELECT USING (true);
CREATE POLICY "Allow public insert empresas" ON empresas FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update empresas" ON empresas FOR UPDATE USING (true);
CREATE POLICY "Allow public delete empresas" ON empresas FOR DELETE USING (true);

CREATE POLICY "Allow public read proyectos" ON proyectos FOR SELECT USING (true);
CREATE POLICY "Allow public insert proyectos" ON proyectos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update proyectos" ON proyectos FOR UPDATE USING (true);
CREATE POLICY "Allow public delete proyectos" ON proyectos FOR DELETE USING (true);

CREATE POLICY "Allow public read cajas" ON cajas FOR SELECT USING (true);
CREATE POLICY "Allow public insert cajas" ON cajas FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update cajas" ON cajas FOR UPDATE USING (true);
CREATE POLICY "Allow public delete cajas" ON cajas FOR DELETE USING (true);

CREATE POLICY "Allow public read terceros" ON terceros FOR SELECT USING (true);
CREATE POLICY "Allow public insert terceros" ON terceros FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update terceros" ON terceros FOR UPDATE USING (true);
CREATE POLICY "Allow public delete terceros" ON terceros FOR DELETE USING (true);

CREATE POLICY "Allow public read transacciones" ON transacciones FOR SELECT USING (true);
CREATE POLICY "Allow public insert transacciones" ON transacciones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update transacciones" ON transacciones FOR UPDATE USING (true);
CREATE POLICY "Allow public delete transacciones" ON transacciones FOR DELETE USING (true);

CREATE POLICY "Allow public read categorias" ON categorias FOR SELECT USING (true);
CREATE POLICY "Allow public insert categorias" ON categorias FOR INSERT WITH CHECK (true);

ALTER TABLE deudas_cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_terceros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read deudas_cajas" ON deudas_cajas FOR SELECT USING (true);
CREATE POLICY "Allow public insert deudas_cajas" ON deudas_cajas FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update deudas_cajas" ON deudas_cajas FOR UPDATE USING (true);
CREATE POLICY "Allow public delete deudas_cajas" ON deudas_cajas FOR DELETE USING (true);

CREATE POLICY "Allow public read deudas_terceros" ON deudas_terceros FOR SELECT USING (true);
CREATE POLICY "Allow public insert deudas_terceros" ON deudas_terceros FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update deudas_terceros" ON deudas_terceros FOR UPDATE USING (true);
CREATE POLICY "Allow public delete deudas_terceros" ON deudas_terceros FOR DELETE USING (true);

-- =====================================================
-- 6. DATOS INICIALES - EMPRESAS
-- =====================================================

INSERT INTO empresas (nombre, nit) VALUES 
  ('MAVICOL SAS', NULL),
  ('PROEXI SAS', NULL),
  ('CONSTRUCTORA 360 SAS', NULL),
  ('UT MEDICINA INTERNA', NULL),
  ('UT ORU 2020', NULL)
ON CONFLICT (nit) DO NOTHING;

-- =====================================================
-- 7. DATOS INICIALES - CAJAS (basado en tu Excel)
-- =====================================================

-- Usar CTEs para obtener IDs de empresas
WITH empresa_mavicol AS (SELECT id FROM empresas WHERE nombre = 'MAVICOL SAS' LIMIT 1),
     empresa_proexi AS (SELECT id FROM empresas WHERE nombre = 'PROEXI SAS' LIMIT 1),
     empresa_360 AS (SELECT id FROM empresas WHERE nombre = 'CONSTRUCTORA 360 SAS' LIMIT 1),
     empresa_medicina AS (SELECT id FROM empresas WHERE nombre = 'UT MEDICINA INTERNA' LIMIT 1),
     empresa_oru AS (SELECT id FROM empresas WHERE nombre = 'UT ORU 2020' LIMIT 1)

INSERT INTO cajas (nombre, tipo, empresa_id, saldo_actual) 
SELECT 'Caja Rubén', 'Efectivo', id, 0 FROM empresa_mavicol
UNION ALL
SELECT 'Caja 24/7', 'Efectivo', id, 0 FROM empresa_mavicol
UNION ALL
SELECT 'Banco MAVICOL', 'Banco', id, 0 FROM empresa_mavicol
UNION ALL
SELECT 'Tarjeta Crédito MAVICOL', 'Tarjeta', id, 0 FROM empresa_mavicol
UNION ALL
SELECT 'Caja PROEXI', 'Efectivo', id, 0 FROM empresa_proexi
UNION ALL
SELECT 'Mantenimiento PROEXI', 'Efectivo', id, 0 FROM empresa_proexi
UNION ALL
SELECT 'Caja 360 SAS', 'Efectivo', id, 0 FROM empresa_360
UNION ALL
SELECT 'Caja Hospital', 'Efectivo', id, 0 FROM empresa_medicina
UNION ALL
SELECT 'Caja UT ORU', 'Efectivo', id, 0 FROM empresa_oru
UNION ALL
SELECT 'Caja Saneamiento', 'Efectivo', id, 0 FROM empresa_oru;

-- =====================================================
-- 8. DATOS INICIALES - PROYECTOS (basado en tu Excel)
-- =====================================================

WITH empresa_mavicol AS (SELECT id FROM empresas WHERE nombre = 'MAVICOL SAS' LIMIT 1),
     empresa_proexi AS (SELECT id FROM empresas WHERE nombre = 'PROEXI SAS' LIMIT 1),
     empresa_360 AS (SELECT id FROM empresas WHERE nombre = 'CONSTRUCTORA 360 SAS' LIMIT 1),
     empresa_medicina AS (SELECT id FROM empresas WHERE nombre = 'UT MEDICINA INTERNA' LIMIT 1),
     empresa_oru AS (SELECT id FROM empresas WHERE nombre = 'UT ORU 2020' LIMIT 1)

INSERT INTO proyectos (nombre, empresa_id, estado) 
SELECT 'Proyecto Infraestructura Educativa', id, 'Activo' FROM empresa_mavicol
UNION ALL
SELECT 'Obra Pavimentación', id, 'Activo' FROM empresa_mavicol
UNION ALL
SELECT 'Universidad Catatumbo', id, 'Activo' FROM empresa_mavicol
UNION ALL
SELECT 'Proyecto Suministro Cemento y Zinc', id, 'Activo' FROM empresa_proexi
UNION ALL
SELECT 'Proyecto Suministro Tubería', id, 'Activo' FROM empresa_proexi
UNION ALL
SELECT 'Consorcio CVMAV', id, 'Activo' FROM empresa_360
UNION ALL
SELECT 'Hospital 24/7', id, 'Activo' FROM empresa_medicina
UNION ALL
SELECT 'Vías Terciarias', id, 'Activo' FROM empresa_oru
UNION ALL
SELECT 'Vías El Tarra', id, 'Activo' FROM empresa_oru
UNION ALL
SELECT 'UT Saneamiento Básico', id, 'Activo' FROM empresa_oru
UNION ALL
SELECT 'UT Hacari 2019', id, 'Activo' FROM empresa_oru;

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
-- 10. STORAGE BUCKET PARA SOPORTES (FOTOS)
-- Esto se debe crear desde el Dashboard de Supabase
-- Storage > New Bucket > "soportes" (público)
-- =====================================================

-- NOTA: Para crear el bucket de almacenamiento:
-- 1. Ve a Storage en el dashboard de Supabase
-- 2. Clic en "New bucket"
-- 3. Nombre: "soportes"
-- 4. Marca "Public bucket" si quieres que las imágenes sean accesibles

-- =====================================================
-- 11. VISTAS ÚTILES
-- =====================================================

-- Vista de saldo por empresa
CREATE OR REPLACE VIEW v_saldo_por_empresa AS
SELECT 
  e.id,
  e.nombre,
  COALESCE(SUM(c.saldo_actual), 0) as saldo_total
FROM empresas e
LEFT JOIN cajas c ON c.empresa_id = e.id
GROUP BY e.id, e.nombre;

-- Vista de gastos por proyecto
CREATE OR REPLACE VIEW v_gastos_por_proyecto AS
SELECT 
  p.id,
  p.nombre,
  p.empresa_id,
  e.nombre as empresa_nombre,
  COALESCE(SUM(CASE WHEN t.tipo_movimiento = 'EGRESO' THEN t.monto ELSE 0 END), 0) as total_egresos,
  COALESCE(SUM(CASE WHEN t.tipo_movimiento = 'INGRESO' THEN t.monto ELSE 0 END), 0) as total_ingresos
FROM proyectos p
LEFT JOIN empresas e ON e.id = p.empresa_id
LEFT JOIN transacciones t ON t.proyecto_id = p.id
GROUP BY p.id, p.nombre, p.empresa_id, e.nombre;

-- Vista de préstamos entre cajas (deudas)
CREATE OR REPLACE VIEW v_prestamos_entre_cajas AS
SELECT 
  co.nombre as caja_origen,
  cd.nombre as caja_destino,
  SUM(t.monto) as monto_prestado,
  COUNT(*) as num_prestamos
FROM transacciones t
JOIN cajas co ON co.id = t.caja_origen_id
JOIN cajas cd ON cd.id = t.caja_destino_id
WHERE t.tipo_movimiento = 'TRANSFERENCIA'
  AND t.categoria = 'Préstamo'
GROUP BY co.nombre, cd.nombre
HAVING SUM(t.monto) > 0;

-- =====================================================
-- ¡LISTO! Base de datos configurada
-- =====================================================

-- Para verificar que todo se creó correctamente:
-- SELECT * FROM empresas;
-- SELECT * FROM cajas;
-- SELECT * FROM proyectos;
-- SELECT * FROM categorias;
