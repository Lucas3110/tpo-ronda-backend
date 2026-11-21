-- =============================================================
--  Punto 12: Cierre de la operación con QR
-- =============================================================
-- "El comprador escanea un código QR con la cámara para confirmar que
-- recibió el artículo. [...] Al confirmarse, la publicación pasa
-- automáticamente al estado vendida y la operación queda registrada para
-- ambas partes."
--
-- Hasta acá, aceptar una oferta dejaba la publicación VENDIDA y la operación
-- concretada en el mismo instante. Con el QR hay dos momentos distintos:
--
--   1. se acepta la oferta   -> la publicación queda RESERVADA y nace la
--                               operación PENDIENTE_ENTREGA con su código;
--   2. el comprador escanea  -> la operación pasa a CONCRETADA y la
--                               publicación a VENDIDA.
--
-- El código viaja impreso en el QR físico que el vendedor entrega con el
-- artículo. La app no genera el QR: sólo lo lee y se lo manda al backend.
USE ronda;

-- -------------------------------------------------------------
-- publicaciones.estado: RESERVADA
-- -------------------------------------------------------------
-- Se reescribe el ENUM completo (MySQL no tiene "agregar un valor"); incluye
-- a los tres viejos, así que las filas existentes no se tocan.
ALTER TABLE publicaciones
  MODIFY COLUMN estado ENUM('ACTIVA', 'PAUSADA', 'RESERVADA', 'VENDIDA')
    NOT NULL DEFAULT 'ACTIVA';

-- -------------------------------------------------------------
-- operaciones: estado, código de entrega y las dos fechas
-- -------------------------------------------------------------
-- oferta_id      la oferta aceptada que la originó (para "Mis ofertas").
-- estado         PENDIENTE_ENTREGA hasta que se escanea el QR; CONCRETADA después.
-- codigo_entrega lo que dice el QR. Único: con él solo se encuentra la operación.
-- aceptada_en    cuándo se cerró el precio.
-- concretada_en  pasa a admitir NULL: ahora se completa recién al confirmar la
--                entrega, y es desde ahí que corren los 7 días para calificar.
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'operaciones'
     AND COLUMN_NAME = 'codigo_entrega'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE operaciones
     ADD COLUMN oferta_id      INT NULL AFTER publicacion_id,
     ADD COLUMN estado         ENUM(''PENDIENTE_ENTREGA'', ''CONCRETADA'')
                                 NOT NULL DEFAULT ''CONCRETADA'' AFTER monto,
     ADD COLUMN codigo_entrega VARCHAR(20) NULL AFTER estado,
     ADD COLUMN aceptada_en    DATETIME NULL AFTER codigo_entrega,
     MODIFY COLUMN concretada_en DATETIME NULL,
     ADD CONSTRAINT fk_operaciones_oferta
         FOREIGN KEY (oferta_id) REFERENCES ofertas(id) ON DELETE SET NULL,
     ADD UNIQUE INDEX uq_operaciones_codigo (codigo_entrega)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Las operaciones que ya existían se cerraron sin QR: quedan CONCRETADAS (es
-- el DEFAULT) y se toma que el precio se cerró el mismo día que se concretaron.
UPDATE operaciones SET aceptada_en = concretada_en WHERE aceptada_en IS NULL;
