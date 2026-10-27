-- =============================================================
--  Hallado - Punto 4: seguir una publicacion
-- =============================================================
-- "Cualquier persona puede seguir la publicacion para enterarse de sus
-- novedades." Esta tabla es el "quien sigue que". Las novedades en si (el
-- indicador de que una publicacion seguida cambio de estado) son del punto
-- 9, que lee de aca: por eso se guarda tambien el estado que tenia la
-- publicacion cuando la persona la empezo a seguir, asi el punto 9 puede
-- comparar sin pedirnos nada mas.
USE ronda;

CREATE TABLE IF NOT EXISTS hallado_seguidas (
  usuario_id     INT NOT NULL,
  publicacion_id INT NOT NULL,

  -- El ultimo estado que la persona vio. Arranca con el estado al momento
  -- de seguir; el punto 9 lo actualiza cuando la persona abre la novedad.
  estado_visto   ENUM('ABIERTA','EN_RECLAMO','RESUELTA','VENCIDA') NOT NULL,

  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Una persona sigue una publicacion una sola vez: la clave es el par.
  PRIMARY KEY (usuario_id, publicacion_id),

  CONSTRAINT fk_hs_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)              ON DELETE CASCADE,
  CONSTRAINT fk_hs_publicacion FOREIGN KEY (publicacion_id) REFERENCES hallado_publicaciones(id) ON DELETE CASCADE,

  -- Para contar seguidores de una publicacion sin recorrer la tabla entera.
  INDEX idx_hs_publicacion (publicacion_id)
) ENGINE=InnoDB;
