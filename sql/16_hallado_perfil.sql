-- =============================================================
--  Hallado - Punto 2: visibilidad del telefono
-- =============================================================
-- "La persona decide si su telefono es visible para la otra parte una vez
-- aceptado un reclamo, o si prefiere comunicarse solo a traves de la app."
--
-- Arranca en 0: el telefono es un dato personal, y compartirlo tiene que
-- ser una decision explicita de la persona, no algo que pasa por defecto.
USE ronda;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'telefono_visible'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE usuarios ADD COLUMN telefono_visible TINYINT(1) NOT NULL DEFAULT 0 AFTER foto_url',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
