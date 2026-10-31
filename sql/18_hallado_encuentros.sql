-- =============================================================
--  Hallado - Punto 8: punto de encuentro
-- =============================================================
-- "Una vez aceptado un reclamo, quien tiene el objeto propone un punto de
-- encuentro, y la otra parte puede aceptarlo o sugerir uno alternativo."
--
-- Una fila por reclamo, no un historial de propuestas: lo que la app
-- necesita mostrar es el lugar que esta sobre la mesa ahora. Una
-- contrapropuesta reemplaza a la anterior en la misma fila y sube la
-- version; quedarse con las viejas no le sirve a ninguna pantalla del
-- enunciado y obligaria a ordenar y filtrar en cada lectura.
--
-- La direccion del encuentro es SEPARADA de la de la publicacion: donde se
-- encontro el objeto no es donde se van a juntar a devolverlo. Por eso esta
-- tabla y no un par de columnas en hallado_publicaciones.
USE ronda;

CREATE TABLE IF NOT EXISTS hallado_encuentros (
  id            INT AUTO_INCREMENT PRIMARY KEY,

  -- Un reclamo tiene a lo sumo un punto de encuentro vigente: de ahi el
  -- UNIQUE. Tambien es lo que hace que proponer sea un INSERT ... ON
  -- DUPLICATE KEY UPDATE y no un "mira si existe y despues escribi", que
  -- entre dos pedidos simultaneos dejaria dos filas.
  reclamo_id    INT NOT NULL,

  -- Quien dejo la propuesta que esta vigente. La app lo usa para saber si
  -- esta esperando respuesta o si le toca contestar.
  propuesto_por INT NOT NULL,

  direccion     VARCHAR(255) NOT NULL,

  -- Opcionales: se puede proponer "Av. Santa Fe 3253" sin GPS. Mismo tipo
  -- que hallado_publicaciones para que las dos se comparen sin castear.
  lat           DECIMAL(10,7) NULL,
  lng           DECIMAL(10,7) NULL,

  -- PROPUESTO espera respuesta. ACEPTADO es el lugar acordado y cierra la
  -- negociacion: el enunciado pide proponer, aceptar o contraproponer, y
  -- nada mas despues de eso.
  estado        ENUM('PROPUESTO','ACEPTADO') NOT NULL DEFAULT 'PROPUESTO',

  -- Sube con cada cambio. La app manda la version que tenia en pantalla y
  -- el backend rechaza el pedido si ya no es esa: sin esto, aceptar una
  -- propuesta que la otra persona acaba de reemplazar cerraria el acuerdo
  -- sobre un lugar que ninguno de los dos esta viendo.
  version       INT NOT NULL DEFAULT 1,

  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_he_reclamo (reclamo_id),

  CONSTRAINT fk_he_reclamo FOREIGN KEY (reclamo_id)
    REFERENCES hallado_reclamos(id) ON DELETE CASCADE,
  CONSTRAINT fk_he_propone FOREIGN KEY (propuesto_por)
    REFERENCES usuarios(id)
) ENGINE=InnoDB;
