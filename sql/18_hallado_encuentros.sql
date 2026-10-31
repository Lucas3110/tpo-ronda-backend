USE ronda;

-- Una propuesta vigente por reclamo. La version evita aceptar una direccion
-- antigua si la otra persona acaba de sugerir otra desde su telefono.
CREATE TABLE IF NOT EXISTS hallado_encuentros (
  reclamo_id INT PRIMARY KEY,
  propuesto_por INT NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  lat DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  estado ENUM('PROPUESTO','ACEPTADO','CONCRETADO') NOT NULL DEFAULT 'PROPUESTO',
  version INT NOT NULL DEFAULT 1,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aceptado_en DATETIME NULL,
  concretado_en DATETIME NULL,
  CONSTRAINT fk_he_reclamo FOREIGN KEY (reclamo_id) REFERENCES hallado_reclamos(id) ON DELETE CASCADE,
  CONSTRAINT fk_he_usuario FOREIGN KEY (propuesto_por) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT chk_he_coordenadas CHECK (
    (lat IS NULL AND lng IS NULL) OR
    (lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
  )
) ENGINE=InnoDB;
