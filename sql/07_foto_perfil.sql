-- =============================================================
--  Punto 2: foto de perfil
-- =============================================================
-- La consigna nueva agrega la foto de perfil a los datos editables del
-- usuario: "Ver y editar los datos personales: nombre, email, teléfono de
-- contacto, zona y foto de perfil."
--
-- Guardamos la URL, no el archivo. Subir binarios a la base es caro y
-- complica el backup; la app manda una URL (galería del dispositivo, o un
-- servicio de imágenes) y acá sólo se persiste el texto.
USE ronda;

-- Se agrega la columna sólo si todavía no existe, para que el script se
-- pueda volver a correr sin errores.
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'foto_url'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE usuarios ADD COLUMN foto_url VARCHAR(500) NULL AFTER zona_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
