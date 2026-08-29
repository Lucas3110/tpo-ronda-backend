-- =============================================================
--  Punto 6: Favoritos y Búsquedas Guardadas
-- =============================================================
USE ronda;

-- -------------------------------------------------------------
-- favoritos
-- -------------------------------------------------------------
-- La clave primaria compuesta (usuario, publicación) hace que sea imposible
-- guardar dos veces lo mismo: no hace falta chequearlo en el código.
--
-- precio_al_guardar es la clave de la novedad que pide el enunciado: para
-- saber "si un artículo favorito cambia de precio" hay que recordar cuánto
-- salía cuando se guardó.
CREATE TABLE IF NOT EXISTS favoritos (
  usuario_id        INT           NOT NULL,
  publicacion_id    INT           NOT NULL,
  precio_al_guardar DECIMAL(12,2) NOT NULL,
  creado_en         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, publicacion_id),
  CONSTRAINT fk_favoritos_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)      ON DELETE CASCADE,
  CONSTRAINT fk_favoritos_publicacion FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
  INDEX idx_favoritos_publicacion (publicacion_id)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- busquedas_guardadas
-- -------------------------------------------------------------
-- Los filtros van en JSON porque son los mismos parámetros que acepta
-- GET /api/publicaciones: guardarlos tal cual permite reproducir la búsqueda
-- sin traducir nada, y si mañana se agrega un filtro nuevo no hay que migrar.
--
-- ultimo_visto_en marca hasta cuándo la persona ya miró los resultados. Todo
-- lo publicado después de esa fecha que coincida con los filtros es novedad.
CREATE TABLE IF NOT EXISTS busquedas_guardadas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT          NOT NULL,
  nombre          VARCHAR(60)  NOT NULL,
  filtros         JSON         NOT NULL,
  ultimo_visto_en DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_busquedas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT uq_busquedas_nombre UNIQUE (usuario_id, nombre),
  INDEX idx_busquedas_usuario (usuario_id)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- Precisión de milisegundos para poder comparar "qué es nuevo"
-- -------------------------------------------------------------
-- DATETIME guarda hasta el segundo. Si alguien guarda una búsqueda y en ese
-- mismo segundo se publica algo que coincide, la comparación
-- `creado_en > ultimo_visto_en` da falso y la novedad se pierde para
-- siempre. Con DATETIME(3) el orden entre los dos eventos siempre se puede
-- distinguir.
--
-- Los dos campos tienen que tener la misma precisión: comparar un DATETIME(3)
-- contra un DATETIME(0) trunca los milisegundos y el problema vuelve.
ALTER TABLE publicaciones
  MODIFY creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE busquedas_guardadas
  MODIFY ultimo_visto_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
