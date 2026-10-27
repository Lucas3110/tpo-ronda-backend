-- =============================================================
--  Hallado - Punto 10: valoraciones y agradecimientos
-- =============================================================
-- "Dentro de los 7 dias posteriores a la devolucion, cada parte puede
-- valorar a la otra (positiva o negativa) y dejar un mensaje breve
-- opcional. Quien recupero su objeto puede ademas dejar un agradecimiento
-- publico, visible en el perfil de quien se lo devolvio. Las valoraciones
-- recibidas alimentan la reputacion del usuario."
--
-- Una valoracion cuelga del reclamo aceptado (el caso), no de la
-- publicacion: es lo que identifica a las dos partes y la fecha de la
-- devolucion. Cada parte valora una sola vez por caso.
USE ronda;

CREATE TABLE IF NOT EXISTS hallado_valoraciones (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  reclamo_id      INT NOT NULL,
  autor_id        INT NOT NULL,
  destinatario_id INT NOT NULL,

  tipo            ENUM('POSITIVA','NEGATIVA') NOT NULL,
  mensaje         VARCHAR(300) NULL,

  -- Solo lo puede dejar quien RECUPERO su objeto, y es publico: se muestra
  -- en el perfil de quien devolvio. El mensaje de arriba, en cambio, es
  -- entre las dos partes.
  agradecimiento  VARCHAR(500) NULL,

  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_hv_reclamo      FOREIGN KEY (reclamo_id)      REFERENCES hallado_reclamos(id) ON DELETE CASCADE,
  CONSTRAINT fk_hv_autor        FOREIGN KEY (autor_id)        REFERENCES usuarios(id)         ON DELETE CASCADE,
  CONSTRAINT fk_hv_destinatario FOREIGN KEY (destinatario_id) REFERENCES usuarios(id)         ON DELETE CASCADE,

  -- Cada parte valora una sola vez por caso.
  CONSTRAINT uq_hv_una_por_parte UNIQUE (reclamo_id, autor_id),

  -- La reputacion y los agradecimientos del perfil se buscan por quien
  -- las recibio.
  INDEX idx_hv_destinatario (destinatario_id, tipo)
) ENGINE=InnoDB;
