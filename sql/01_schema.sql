-- =============================================================
--  TPO Ronda - Punto 1: Autenticacion y Registro de Usuarios
--  Motor: MySQL 8.0
--  Como correrlo:
--    mysql -u root -p < sql/01_schema.sql
--  (o pegarlo entero en MySQL Workbench y ejecutar con el rayo)
-- =============================================================

CREATE DATABASE IF NOT EXISTS ronda
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ronda;

-- -------------------------------------------------------------
-- usuarios
-- -------------------------------------------------------------
-- Guardamos SOLO el hash de la contrasena (bcrypt), nunca el texto plano.
-- password_hash es NULL-able porque en el futuro podria haber usuarios
-- que entren unicamente por OTP.
-- email_verificado pasa a 1 cuando la persona confirma el codigo OTP.
CREATE TABLE IF NOT EXISTS usuarios (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  email            VARCHAR(255)  NOT NULL,
  password_hash    VARCHAR(255)  NULL,
  nombre           VARCHAR(100)  NULL,
  telefono         VARCHAR(30)   NULL,
  zona             VARCHAR(100)  NULL,
  email_verificado TINYINT(1)    NOT NULL DEFAULT 0,
  creado_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_email UNIQUE (email)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- codigos_otp
-- -------------------------------------------------------------
-- Un registro por cada codigo emitido. Guardamos el HASH del codigo,
-- igual que con la contrasena: si alguien lee la base, no puede
-- usar los codigos pendientes.
--   proposito : para que se pidio el codigo (alta de cuenta o ingreso)
--   expira_en : vencimiento, se calcula con NOW() + OTP_TTL_MINUTES
--   usado_en  : NULL = todavia esta vigente; con fecha = ya se consumio
--   intentos  : cuantas veces se erro el codigo (para bloquear fuerza bruta)
CREATE TABLE IF NOT EXISTS codigos_otp (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT                        NOT NULL,
  codigo_hash VARCHAR(255)               NOT NULL,
  proposito   ENUM('REGISTRO','LOGIN')   NOT NULL,
  expira_en   DATETIME                   NOT NULL,
  usado_en    DATETIME                   NULL,
  intentos    TINYINT UNSIGNED           NOT NULL DEFAULT 0,
  creado_en   DATETIME                   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_otp_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE CASCADE,
  INDEX idx_otp_busqueda (usuario_id, proposito, usado_en, id)
) ENGINE=InnoDB;
