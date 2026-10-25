-- =============================================================
--  Punto 1 (Hallado): recupero de contrasena
-- =============================================================
-- El enunciado nuevo pide dos cosas que el backend todavia no tenia:
--
--   1) "Recupero de contrasena: recibir un codigo por email para definir
--      una nueva, con la posibilidad de reenviarlo en caso de no haberlo
--      recibido o de que haya expirado."
--
--   2) El registro en el orden que pide la consigna: primero el email,
--      despues el codigo, y recien al final el nombre y la contrasena.
--      Eso no necesita cambios de esquema: usuarios.password_hash y
--      usuarios.nombre ya son NULL, asi que la cuenta puede existir sin
--      contrasena mientras el email no este confirmado.
--
-- Lo unico que hace falta es un proposito nuevo para el OTP: RECUPERO.
--
-- Igual que CAMBIO_EMAIL, RECUPERO NO se expone en /auth/otp/verificar.
-- Si estuviera, un codigo de recupero alcanzaria para abrir sesion sin
-- definir contrasena nueva, y perderiamos el unico paso que garantiza que
-- la persona efectivamente eligio una.
USE ronda;

-- El ENUM se amplia solo si todavia no tiene el valor nuevo, para que el
-- script se pueda correr todas las veces que haga falta.
SET @tiene_proposito := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'codigos_otp'
     AND COLUMN_NAME = 'proposito' AND COLUMN_TYPE LIKE '%RECUPERO%'
);
SET @sql := IF(@tiene_proposito = 0,
  "ALTER TABLE codigos_otp MODIFY COLUMN proposito ENUM('REGISTRO','LOGIN','CAMBIO_EMAIL','RECUPERO') NOT NULL",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
