// Generacion y verificacion del codigo OTP (One Time Password).
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const config = require('./../config/env');

// crypto.randomInt es un generador criptograficamente seguro.
// Math.random() NO sirve para esto: es predecible.
function generarCodigo() {
  const maximo = 10 ** config.otp.largo;              // 6 digitos -> 1000000
  const numero = crypto.randomInt(0, maximo);         // 0 .. 999999
  return String(numero).padStart(config.otp.largo, '0'); // "000042"
}

function hashearCodigo(codigo) {
  return bcrypt.hash(codigo, 10);
}

function compararCodigo(codigo, hash) {
  return bcrypt.compare(codigo, hash);
}

module.exports = { generarCodigo, hashearCodigo, compararCodigo };
