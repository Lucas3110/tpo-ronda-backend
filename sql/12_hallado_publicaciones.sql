-- =============================================================
--  Hallado - Punto 5: publicar un hallazgo o una perdida
-- =============================================================
-- Este es el esquema del que cuelga casi todo el TPO nuevo: el punto 3 lo
-- busca, el 4 lo muestra, el 7 reclama sobre el y el 9 lo sigue. Por eso
-- vale la pena explicar las decisiones.
--
-- Por que tablas nuevas y no reusar las de Ronda
-- ----------------------------------------------
-- El dominio es otro. Una publicacion de Ronda tiene precio, estado del
-- articulo y vendedor; una de Hallado tiene tipo (perdi / encontre), fecha
-- del suceso y una pregunta de verificacion. Forzar las dos cosas en la
-- misma tabla deja media tabla en NULL y nadie entiende cual columna es de
-- que. Van con prefijo hallado_ para que en la base se vea de un vistazo
-- cual tabla es de que entrega.
--
-- Lo que SI se reusa: usuarios, codigos_otp y zonas. Los barrios que pide el
-- enunciado ("barrio o localidad, eligiendolo de una lista") son exactamente
-- las zonas que ya teniamos cargadas, asi que no duplicamos el catalogo.
USE ronda;

-- -------------------------------------------------------------
-- hallado_categorias
-- -------------------------------------------------------------
-- El enunciado las enumera: documentos, llaves, electronica, mascotas, ropa,
-- otros. Tabla propia y no la `categorias` de Ronda, que tiene las del
-- marketplace (Electrodomesticos, Muebles, etc.).
CREATE TABLE IF NOT EXISTS hallado_categorias (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(60) NOT NULL,
  orden     TINYINT     NOT NULL DEFAULT 0,
  CONSTRAINT uq_hallado_categorias_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

INSERT INTO hallado_categorias (nombre, orden)
SELECT * FROM (
  SELECT 'Documentos'  AS nombre, 1 AS orden UNION ALL
  SELECT 'Llaves',      2 UNION ALL
  SELECT 'Electronica', 3 UNION ALL
  SELECT 'Mascotas',    4 UNION ALL
  SELECT 'Ropa',        5 UNION ALL
  SELECT 'Otros',       6
) AS nuevas
WHERE NOT EXISTS (SELECT 1 FROM hallado_categorias);

-- -------------------------------------------------------------
-- hallado_publicaciones
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hallado_publicaciones (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NOT NULL,

  -- El eje de todo: la busqueda del punto 3 devuelve el tipo OPUESTO al que
  -- le paso la persona. Si perdiste algo, ves lo que otros encontraron.
  tipo           ENUM('PERDI','ENCONTRE') NOT NULL,

  categoria_id   INT          NOT NULL,
  titulo         VARCHAR(80)  NOT NULL,
  descripcion    TEXT         NULL,

  -- Fecha y franja son dos campos, no un timestamp: quien perdio algo casi
  -- nunca sabe la hora exacta, pero si se acuerda si fue a la manana o a la
  -- tarde. El enunciado los pide separados ("fecha y franja horaria").
  fecha_suceso   DATE NOT NULL,
  franja_horaria ENUM('MANANA','TARDE','NOCHE','NO_SE') NOT NULL DEFAULT 'NO_SE',

  barrio_id      INT NOT NULL,

  -- La direccion exacta NO se expone hasta que un reclamo este aceptado
  -- (punto 4). Eso se resuelve en el service, no aca: la columna guarda el
  -- dato y el DTO decide si lo manda.
  direccion      VARCHAR(255) NULL,

  -- Coordenadas para el "ordenar por mas cercanos" del punto 3 y para el
  -- "como llegar" del punto 8. Van juntas o no van: ver el CHECK de abajo.
  lat            DECIMAL(10,7) NULL,
  lng            DECIMAL(10,7) NULL,

  -- Pregunta de verificacion. Solo tiene sentido en las de tipo ENCONTRE:
  -- quien encontro algo pregunta por un detalle que no se ve en las fotos,
  -- y quien dice "es mio" tiene que contestarlo (punto 7).
  --
  -- La respuesta se guarda normalizada (minusculas, sin espacios de sobra) y
  -- en texto plano a proposito. Hashearla impediria las dos cosas que hacen
  -- falta: comparar con tolerancia (nadie escribe "Azul" igual dos veces) y
  -- que el propio publicador pueda ver que respuesta cargo. Que sea privada
  -- se resuelve no incluyendola en ningun DTO.
  pregunta_verificacion VARCHAR(255) NULL,
  respuesta_verificacion VARCHAR(255) NULL,

  estado         ENUM('ABIERTA','EN_RECLAMO','RESUELTA','VENCIDA')
                 NOT NULL DEFAULT 'ABIERTA',

  -- "Las publicaciones vencen a los 30 dias y pueden renovarse." Guardamos
  -- la fecha de vencimiento y no un booleano: asi el vencimiento se calcula
  -- solo comparando con NOW(), sin ninguna tarea programada que lo marque.
  vence_en       DATETIME NOT NULL,

  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_hp_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_hp_categoria FOREIGN KEY (categoria_id) REFERENCES hallado_categorias(id),
  CONSTRAINT fk_hp_barrio    FOREIGN KEY (barrio_id)    REFERENCES zonas(id),

  -- Media coordenada no sirve para nada: o estan las dos o ninguna.
  CONSTRAINT ck_hp_coordenadas CHECK (
    (lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL)
  ),

  -- Los filtros del punto 3 siempre arrancan por tipo + estado, y despues
  -- recortan por categoria, barrio y fecha.
  INDEX idx_hp_busqueda (tipo, estado, categoria_id, barrio_id, fecha_suceso),
  INDEX idx_hp_mias (usuario_id, estado, creado_en)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- hallado_fotos
-- -------------------------------------------------------------
-- Tabla aparte y no un campo: el enunciado pide "galeria con todas las
-- fotos", o sea varias por publicacion.
CREATE TABLE IF NOT EXISTS hallado_fotos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  publicacion_id INT NOT NULL,
  url            VARCHAR(500) NOT NULL,
  orden          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hf_publicacion
    FOREIGN KEY (publicacion_id) REFERENCES hallado_publicaciones(id)
    ON DELETE CASCADE,
  INDEX idx_hf_publicacion (publicacion_id, orden)
) ENGINE=InnoDB;
