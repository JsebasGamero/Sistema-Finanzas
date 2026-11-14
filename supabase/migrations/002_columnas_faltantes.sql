-- =====================================================
-- MIGRACIÓN 002 — Columnas que la app escribe y la tabla no tenía
-- =====================================================
--
-- La app guardaba estos campos en IndexedDB y los mostraba en pantalla, pero
-- no existían en Supabase. Como el pull hace clear + replace usando la nube
-- como fuente de verdad, el dato se veía bien hasta el siguiente arranque y
-- después desaparecía sin dejar rastro.
--
-- EJECUTAR EN: Supabase Dashboard > SQL Editor.
-- =====================================================


-- Descripción del préstamo entre cajas.
-- DeudaCajasPanel la pide en el formulario ("Ej: Préstamo para materiales"),
-- la muestra al expandir la deuda, y se perdía en cada sincronización.
ALTER TABLE deudas_cajas
  ADD COLUMN IF NOT EXISTS descripcion TEXT;


-- Fecha de última modificación de una deuda entre cajas.
-- El resto de tablas ya la tiene; esta quedó sin su trigger.
DROP TRIGGER IF EXISTS update_deudas_cajas_updated_at ON deudas_cajas;
CREATE TRIGGER update_deudas_cajas_updated_at
    BEFORE UPDATE ON deudas_cajas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deudas_terceros_updated_at ON deudas_terceros;
CREATE TRIGGER update_deudas_terceros_updated_at
    BEFORE UPDATE ON deudas_terceros
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
