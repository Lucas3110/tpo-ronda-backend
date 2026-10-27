-- =============================================================
--  Hallado - Punto 7: reclamos y verificacion
-- =============================================================
-- Un reclamo es lo que hace un tercero sobre una publicacion ajena:
--
--   ES_MIO       sobre algo ENCONTRADO: contesta la pregunta de verificacion
--                y puede agregar una descripcion y una foto que acredite
--                que el objeto le pertenece.
--   LO_ENCONTRE  sobre algo PERDIDO: adjunta una foto y el barrio donde lo
--                encontro, para que el dueno confirme si es lo suyo.
--
-- El publicador acepta o rechaza cada uno. Cada persona tiene hasta 3
-- intentos por publicacion, y un reclamo sin respuesta vence a las 48 horas.
USE ronda;

CREATE TABLE IF NOT EXISTS hallado_reclamos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  publicacion_id INT NOT NULL,
  reclamante_id  INT NOT NULL,

  -- Lo decide el tipo de la publicacion, no quien reclama: en una ENCONTRE
  -- solo cabe ES_MIO, en una PERDI solo LO_ENCONTRE. Se guarda igual para
  -- que la fila se entienda sola.
  tipo           ENUM('ES_MIO','LO_ENCONTRE') NOT NULL,

  -- ES_MIO: lo que contesto, ya normalizado, y si coincidio con la respuesta
  -- del publicador. Se guarda tambien cuando no coincidio: esa fila es la
  -- que cuenta como intento gastado.
  respuesta          VARCHAR(255) NULL,
  respuesta_correcta TINYINT(1)   NULL,

  descripcion    VARCHAR(1000) NULL,
  foto_url       VARCHAR(500)  NULL,

  -- LO_ENCONTRE: donde lo encontro.
  barrio_id      INT NULL,

  estado         ENUM('PENDIENTE','ACEPTADO','RECHAZADO','VENCIDO')
                 NOT NULL DEFAULT 'PENDIENTE',

  -- Por que se rechazo. Lo escribe el publicador, o lo pone el sistema
  -- cuando el rechazo es automatico (respuesta incorrecta, se acepto otro).
  motivo         VARCHAR(300) NULL,
  automatico     TINYINT(1)   NOT NULL DEFAULT 0,

  -- "Vence automaticamente a las 48 horas si no recibe respuesta." Igual que
  -- con las publicaciones, se guarda la fecha y se compara con NOW(): no
  -- hace falta ninguna tarea programada.
  vence_en       DATETIME NOT NULL,
  respondido_en  DATETIME NULL,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_hr_publicacion FOREIGN KEY (publicacion_id) REFERENCES hallado_publicaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_reclamante  FOREIGN KEY (reclamante_id)  REFERENCES usuarios(id)              ON DELETE CASCADE,
  CONSTRAINT fk_hr_barrio      FOREIGN KEY (barrio_id)      REFERENCES zonas(id),

  -- Los recibidos de una publicacion, y los intentos de una persona sobre
  -- ella, son las dos consultas que se hacen todo el tiempo.
  INDEX idx_hr_publicacion (publicacion_id, estado),
  INDEX idx_hr_reclamante  (reclamante_id, publicacion_id)
) ENGINE=InnoDB;

-- Cuando se acepta un reclamo la publicacion pasa a RESUELTA, y hace falta
-- saber CUANDO: el historial del punto 10 lo muestra como fecha de la
-- devolucion y desde ahi corren los 7 dias para valorar.
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'hallado_publicaciones' AND COLUMN_NAME = 'resuelto_en'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE hallado_publicaciones ADD COLUMN resuelto_en DATETIME NULL AFTER vence_en',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
