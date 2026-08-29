-- =============================================================
--  Punto 4: Detalle de la Publicación
-- =============================================================
USE ronda;

-- -------------------------------------------------------------
-- preguntas
-- -------------------------------------------------------------
-- Pregunta pública de un interesado, con la respuesta del vendedor en la
-- misma fila: siempre hay una sola respuesta y siempre es del vendedor,
-- así que una tabla aparte no aportaría nada.
CREATE TABLE IF NOT EXISTS preguntas (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  publicacion_id INT          NOT NULL,
  usuario_id     INT          NOT NULL,
  texto          VARCHAR(500) NOT NULL,
  respuesta      VARCHAR(500) NULL,
  respondida_en  DATETIME     NULL,
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_preguntas_publicacion FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_preguntas_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)      ON DELETE CASCADE,
  INDEX idx_preguntas_publicacion (publicacion_id, creado_en)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- ofertas
-- -------------------------------------------------------------
-- "Negociar el precio con los interesados" del enunciado.
CREATE TABLE IF NOT EXISTS ofertas (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  publicacion_id INT           NOT NULL,
  usuario_id     INT           NOT NULL,
  monto          DECIMAL(12,2) NOT NULL,
  estado         ENUM('PENDIENTE','ACEPTADA','RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
  respondida_en  DATETIME      NULL,
  creado_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ofertas_publicacion FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_ofertas_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)      ON DELETE CASCADE,
  CONSTRAINT ck_ofertas_monto CHECK (monto > 0),
  INDEX idx_ofertas_publicacion (publicacion_id, creado_en),
  INDEX idx_ofertas_usuario (usuario_id)
) ENGINE=InnoDB;
