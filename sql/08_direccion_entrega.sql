-- =============================================================
--  Puntos 4, 5 y 8: dirección exacta de entrega
-- =============================================================
-- Punto 5: "dirección exacta (cargar coordenadas)" al publicar.
-- Punto 4: "no se puede ver la dirección exacta hasta que no se efectúe la
--           oferta del articulo".
-- Punto 8: "el punto de encuentro se debe poder visualizar en google maps".
--
-- Las tres cosas se apoyan en las mismas columnas. La `zona` que ya existía
-- sigue siendo la ubicación aproximada y pública (la que se ve en el listado);
-- esto es la dirección precisa, que sólo ve el comprador con la oferta
-- aceptada.
--
-- DECIMAL(9,6) es el tipo estándar para lat/lng: 6 decimales dan una
-- precisión de ~11 cm, más que suficiente para un punto de encuentro, y
-- evita los errores de redondeo que traería un FLOAT.
USE ronda;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'publicaciones'
     AND COLUMN_NAME = 'direccion'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE publicaciones
     ADD COLUMN direccion VARCHAR(255) NULL AFTER zona_id,
     ADD COLUMN latitud   DECIMAL(9,6) NULL AFTER direccion,
     ADD COLUMN longitud  DECIMAL(9,6) NULL AFTER latitud',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
