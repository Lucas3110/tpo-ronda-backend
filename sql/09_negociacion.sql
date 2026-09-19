-- =============================================================
--  Punto 7: Ofertas y Negociación
-- =============================================================
-- Lo que agrega el enunciado sobre las ofertas simples del Punto 4:
--   - "acompañado de un mensaje breve opcional"
--   - "el vendedor puede [...] realizar una contraoferta con un nuevo precio"
--   - "cada oferta tiene un estado (pendiente, aceptada, rechazada, vencida)
--      y un plazo de vigencia, pasado el cual caduca automáticamente"
USE ronda;

-- -------------------------------------------------------------
-- mensaje, vigencia y cadena de contraofertas
-- -------------------------------------------------------------
-- origen dice QUIÉN propuso este monto. Es lo que permite la negociación de
-- ida y vuelta sin agregar otra tabla: una oferta la propone el comprador y
-- la responde el vendedor; en una contraoferta es al revés.
--
-- contraoferta_de_id encadena cada propuesta con la anterior, así queda el
-- historial completo del regateo y no sólo el último monto.
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'ofertas' AND COLUMN_NAME = 'mensaje'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE ofertas
     ADD COLUMN mensaje            VARCHAR(500) NULL AFTER monto,
     ADD COLUMN origen             ENUM(''COMPRADOR'', ''VENDEDOR'') NOT NULL DEFAULT ''COMPRADOR'' AFTER mensaje,
     ADD COLUMN contraoferta_de_id INT NULL AFTER origen,
     ADD COLUMN expira_en          DATETIME NULL AFTER respondida_en,
     ADD CONSTRAINT fk_ofertas_contraoferta
         FOREIGN KEY (contraoferta_de_id) REFERENCES ofertas(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------
-- estado VENCIDA
-- -------------------------------------------------------------
-- El ENUM original era ('PENDIENTE','ACEPTADA','RECHAZADA'). Se reescribe
-- completo porque MySQL no tiene "agregar un valor al ENUM"; como el nuevo
-- conjunto incluye a los tres viejos, las filas existentes no se tocan.
ALTER TABLE ofertas
  MODIFY COLUMN estado ENUM('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'VENCIDA')
    NOT NULL DEFAULT 'PENDIENTE';

-- Las ofertas que ya existían no tenían vencimiento. Se les pone uno para
-- que la regla valga para todas y no haya que tratar el NULL como caso aparte.
UPDATE ofertas
   SET expira_en = DATE_ADD(creado_en, INTERVAL 72 HOUR)
 WHERE expira_en IS NULL;

-- El barrido de vencidas filtra por estado + fecha; sin este índice haría un
-- scan completo de la tabla en cada consulta de ofertas.
SET @existe_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'ofertas'
     AND INDEX_NAME = 'idx_ofertas_vencimiento'
);
SET @sql := IF(@existe_idx = 0,
  'CREATE INDEX idx_ofertas_vencimiento ON ofertas (estado, expira_en)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------
-- operaciones.publicacion_id
-- -------------------------------------------------------------
-- Aceptar una oferta cierra el trato y registra la operación. Hasta ahora
-- `operaciones` sólo guardaba las dos partes y el monto, así que no se podía
-- saber QUÉ se vendió — y el historial del Punto 9 pide justamente el
-- artículo. Queda NULL para las operaciones viejas que no tienen con qué
-- completarse.
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ronda' AND TABLE_NAME = 'operaciones'
     AND COLUMN_NAME = 'publicacion_id'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE operaciones
     ADD COLUMN publicacion_id INT NULL AFTER id,
     ADD CONSTRAINT fk_operaciones_publicacion
         FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
