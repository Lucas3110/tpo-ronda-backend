-- =============================================================
--  Punto 5: Publicar un Artículo
-- =============================================================
USE ronda;

-- -------------------------------------------------------------
-- borradores_publicacion
-- -------------------------------------------------------------
-- "Si la persona interrumpe la carga y sale de la app, al volver encuentra
--  el borrador conservado para retomarlo donde lo dejó."
--
-- Un borrador por usuario (de ahí el UNIQUE). Los datos van en una columna
-- JSON y no en columnas sueltas por dos razones: está incompleto por
-- definición — la mitad de los campos son NULL mientras se está cargando —,
-- y así el alta guiada puede sumar o sacar pasos sin migrar la tabla.
--
-- `paso` guarda en qué pantalla del asistente quedó, para volver ahí.
CREATE TABLE IF NOT EXISTS borradores_publicacion (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT      NOT NULL,
  datos          JSON     NOT NULL,
  paso           TINYINT UNSIGNED NOT NULL DEFAULT 1,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_borradores_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT uq_borradores_usuario UNIQUE (usuario_id)
) ENGINE=InnoDB;
