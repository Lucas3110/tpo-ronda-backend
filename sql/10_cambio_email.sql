-- =============================================================
--  Punto 2: cambio de email con verificacion
-- =============================================================
-- La consigna pide que el usuario pueda "ver y editar" su email. Cambiarlo
-- no puede ser un UPDATE directo: si alguien pone un email ajeno (o con un
-- error de tipeo) se queda sin acceso a la cuenta. Por eso el cambio se
-- confirma con un codigo OTP enviado al email NUEVO, y el email de la
-- cuenta solo se actualiza cuando ese codigo se verifica.
--
-- Se reusa codigos_otp con dos cambios:
--   - un proposito nuevo, CAMBIO_EMAIL
--   - email_nuevo: a que direccion se va a cambiar. Se guarda junto al
--     codigo, asi que el pedido vence cuando vence el codigo.
USE ronda;

-- El ENUM se amplia solo si todavia no tiene el valor nuevo, para que el
-- script se pueda correr todas las veces que haga falta.
SET @tiene_proposito := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'codigos_otp'
     AND COLUMN_NAME = 'proposito' AND COLUMN_TYPE LIKE '%CAMBIO_EMAIL%'
);
SET @sql := IF(@tiene_proposito = 0,
  "ALTER TABLE codigos_otp MODIFY COLUMN proposito ENUM('REGISTRO','LOGIN','CAMBIO_EMAIL') NOT NULL",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tiene_email_nuevo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'codigos_otp' AND COLUMN_NAME = 'email_nuevo'
);
SET @sql := IF(@tiene_email_nuevo = 0,
  'ALTER TABLE codigos_otp ADD COLUMN email_nuevo VARCHAR(255) NULL AFTER proposito',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
