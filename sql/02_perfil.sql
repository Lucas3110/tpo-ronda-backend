-- =============================================================
--  Punto 2: Perfil y Reputación
-- =============================================================
USE ronda;

-- -------------------------------------------------------------
-- zonas
-- -------------------------------------------------------------
-- Antes la zona era un texto libre en `usuarios`. Pasarla a tabla propia
-- sirve para tres cosas del enunciado: que el selector de la app ofrezca
-- opciones cerradas, que el filtro por zona del Punto 3 sea confiable, y
-- que se pueda calcular "cercanía" con las coordenadas.
CREATE TABLE IF NOT EXISTS zonas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(100)  NOT NULL,
  latitud   DECIMAL(9,6)  NOT NULL,
  longitud  DECIMAL(9,6)  NOT NULL,
  CONSTRAINT uq_zonas_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

-- Zonas del AMBA. Son datos de referencia, no datos de prueba: la app los
-- necesita para funcionar, así que van con el esquema.
INSERT IGNORE INTO zonas (nombre, latitud, longitud) VALUES
  ('Almagro',            -34.606400, -58.420000),
  ('Belgrano',           -34.562500, -58.456400),
  ('Caballito',          -34.618900, -58.440600),
  ('Flores',             -34.638100, -58.462800),
  ('La Boca',            -34.635300, -58.363600),
  ('Palermo',            -34.588100, -58.430600),
  ('Recoleta',           -34.587500, -58.393100),
  ('San Telmo',          -34.621100, -58.371900),
  ('Villa Urquiza',      -34.570300, -58.489200),
  ('Avellaneda',         -34.663900, -58.365300),
  ('Lanús',              -34.706900, -58.392500),
  ('Lomas de Zamora',    -34.760300, -58.400600),
  ('Quilmes',            -34.720600, -58.254200),
  ('San Isidro',         -34.471400, -58.512800),
  ('Tigre',              -34.425800, -58.579400),
  ('Vicente López',      -34.526900, -58.478600),
  ('Morón',              -34.653100, -58.619400),
  ('San Miguel',         -34.542800, -58.712200);

-- -------------------------------------------------------------
-- usuarios: la zona pasa a ser una referencia
-- -------------------------------------------------------------
-- Se agrega la columna sólo si todavía no existe, para que el script se
-- pueda volver a correr sin errores.
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'zona_id'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE usuarios
     ADD COLUMN zona_id INT NULL AFTER telefono,
     ADD CONSTRAINT fk_usuarios_zona FOREIGN KEY (zona_id) REFERENCES zonas(id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migramos el texto viejo a la referencia, cuando el nombre coincide.
-- Va condicionado porque en la segunda corrida la columna `zona` ya no existe
-- (se borra al final de este mismo script) y la consulta fallaría.
SET @existe_zona_texto := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'zona'
);
SET @sql := IF(@existe_zona_texto = 1,
  'UPDATE usuarios u
      JOIN zonas z ON z.nombre = u.zona
       SET u.zona_id = z.id
     WHERE u.zona_id IS NULL AND u.zona IS NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------
-- operaciones
-- -------------------------------------------------------------
-- Una compraventa concretada. Es lo que da la "cantidad de operaciones
-- concretadas como comprador y como vendedor" del enunciado.
CREATE TABLE IF NOT EXISTS operaciones (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  vendedor_id  INT      NOT NULL,
  comprador_id INT      NOT NULL,
  monto        DECIMAL(12,2) NOT NULL,
  concretada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_operaciones_vendedor  FOREIGN KEY (vendedor_id)  REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_operaciones_comprador FOREIGN KEY (comprador_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_operaciones_vendedor (vendedor_id),
  INDEX idx_operaciones_comprador (comprador_id)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- calificaciones
-- -------------------------------------------------------------
-- Las estrellas que una parte le pone a la otra después de una operación.
-- rol_calificado dice si a esa persona la están calificando por su papel de
-- comprador o de vendedor, que es como el enunciado separa la reputación.
CREATE TABLE IF NOT EXISTS calificaciones (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  operacion_id   INT      NOT NULL,
  calificador_id INT      NOT NULL,
  calificado_id  INT      NOT NULL,
  rol_calificado ENUM('COMPRADOR','VENDEDOR') NOT NULL,
  estrellas      TINYINT UNSIGNED NOT NULL,
  comentario     VARCHAR(500) NULL,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_calificaciones_operacion  FOREIGN KEY (operacion_id)   REFERENCES operaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_calificaciones_calificador FOREIGN KEY (calificador_id) REFERENCES usuarios(id)   ON DELETE CASCADE,
  CONSTRAINT fk_calificaciones_calificado  FOREIGN KEY (calificado_id)  REFERENCES usuarios(id)   ON DELETE CASCADE,
  CONSTRAINT ck_calificaciones_estrellas CHECK (estrellas BETWEEN 1 AND 5),
  -- Cada parte califica una sola vez por operación.
  CONSTRAINT uq_calificaciones_una_por_parte UNIQUE (operacion_id, calificador_id),
  INDEX idx_calificaciones_calificado (calificado_id)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- Limpieza: la columna de texto ya no se usa
-- -------------------------------------------------------------
-- Los valores se migraron arriba a zona_id. Se borra sólo si sigue estando,
-- para que el script se pueda volver a correr sin fallar.
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'zona'
);
SET @sql := IF(@existe = 1, 'ALTER TABLE usuarios DROP COLUMN zona', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
