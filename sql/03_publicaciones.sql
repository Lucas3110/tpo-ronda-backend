-- =============================================================
--  Punto 3: Explorar Publicaciones
-- =============================================================
USE ronda;

-- -------------------------------------------------------------
-- categorias
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL,
  CONSTRAINT uq_categorias_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

-- Datos de referencia: la app los necesita para el filtro y para el alta.
INSERT IGNORE INTO categorias (nombre) VALUES
  ('Celulares'),
  ('Computación'),
  ('Consolas y videojuegos'),
  ('Electrodomésticos'),
  ('Hogar y muebles'),
  ('Herramientas'),
  ('Deportes'),
  ('Instrumentos musicales'),
  ('Libros'),
  ('Indumentaria'),
  ('Bebés'),
  ('Otros');

-- -------------------------------------------------------------
-- publicaciones
-- -------------------------------------------------------------
--   estado_articulo -> en qué condición está la cosa (lo que pide el enunciado)
--   estado          -> en qué situación está el aviso (Punto 5: pausar/reactivar)
CREATE TABLE IF NOT EXISTS publicaciones (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  vendedor_id     INT           NOT NULL,
  titulo          VARCHAR(120)  NOT NULL,
  descripcion     TEXT          NOT NULL,
  categoria_id    INT           NOT NULL,
  precio          DECIMAL(12,2) NOT NULL,
  estado_articulo ENUM('NUEVO','COMO_NUEVO','USADO') NOT NULL,
  estado          ENUM('ACTIVA','PAUSADA','VENDIDA') NOT NULL DEFAULT 'ACTIVA',
  zona_id         INT           NOT NULL,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_publicaciones_vendedor  FOREIGN KEY (vendedor_id)  REFERENCES usuarios(id)   ON DELETE CASCADE,
  CONSTRAINT fk_publicaciones_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  CONSTRAINT fk_publicaciones_zona      FOREIGN KEY (zona_id)      REFERENCES zonas(id),
  CONSTRAINT ck_publicaciones_precio CHECK (precio >= 0),
  -- Índices pensados para los filtros del listado.
  INDEX idx_publicaciones_estado   (estado, creado_en),
  INDEX idx_publicaciones_categoria(categoria_id),
  INDEX idx_publicaciones_zona     (zona_id),
  INDEX idx_publicaciones_precio   (precio),
  INDEX idx_publicaciones_vendedor (vendedor_id),
  -- Índice de texto: hace que el buscador por título y descripción no tenga
  -- que recorrer toda la tabla.
  FULLTEXT KEY ft_publicaciones_texto (titulo, descripcion)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- fotos_publicacion
-- -------------------------------------------------------------
-- Una publicación tiene varias fotos y un orden. La primera (orden = 0) es
-- la que se muestra en el listado.
CREATE TABLE IF NOT EXISTS fotos_publicacion (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  publicacion_id INT          NOT NULL,
  url            VARCHAR(500) NOT NULL,
  orden          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_fotos_publicacion FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
  INDEX idx_fotos_publicacion (publicacion_id, orden)
) ENGINE=InnoDB;
