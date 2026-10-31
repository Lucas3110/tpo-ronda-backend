-- =============================================================
--  Hallado - Punto 9: alertas
-- =============================================================
-- "Cualquier busqueda realizada desde el buscador puede guardarse como
-- alerta, con todos sus criterios (tipo, categoria, barrio y palabras
-- clave)."
--
-- Se guardan los criterios y no los resultados: una alerta es una busqueda
-- que se vuelve a correr. Las publicaciones nuevas son las que coinciden y
-- tienen un id mayor a visto_hasta_id, asi que no hace falta ninguna tarea
-- programada que las vaya anotando.
--
-- La otra mitad del punto (las publicaciones seguidas) ya tiene su tabla:
-- hallado_seguidas, del punto 4.
USE ronda;

CREATE TABLE IF NOT EXISTS hallado_alertas (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT NOT NULL,

  -- Lo mismo que manda el buscador: lo que le paso a la persona. La alerta
  -- busca el tipo OPUESTO, igual que el punto 3.
  que_te_paso  ENUM('PERDI','ENCONTRE') NOT NULL,

  -- NULL = sin filtrar por ese criterio, como cuando el buscador no lo manda.
  categoria_id INT          NULL,
  barrio_id    INT          NULL,
  q            VARCHAR(80)  NULL,

  -- Pausada no avisa: no cuenta novedades ni prende el indicador.
  activa       TINYINT(1) NOT NULL DEFAULT 1,

  -- Hasta donde ya vio la persona: el id de la ultima publicacion que
  -- existia cuando miro. Lo publicado despues es "nuevo".
  --
  -- Un id y no una fecha: creado_en tiene precision de segundos, y una
  -- publicacion creada en el mismo segundo en que se marco la alerta como
  -- vista quedaria para siempre del lado de "vieja". Los id son
  -- AUTO_INCREMENT: crecen siempre y no empatan.
  visto_hasta_id INT NOT NULL DEFAULT 0,
  visto_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  creado_en    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_ha_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_ha_categoria FOREIGN KEY (categoria_id) REFERENCES hallado_categorias(id),
  CONSTRAINT fk_ha_barrio    FOREIGN KEY (barrio_id)    REFERENCES zonas(id),

  INDEX idx_ha_usuario (usuario_id, creado_en)
) ENGINE=InnoDB;
