// CAPA DE SERVICIO: acá vive toda la lógica de negocio del Punto 1.
// Los controllers sólo traducen HTTP <-> funciones de este archivo.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { pool } = require('../config/db');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { generarCodigo, hashearCodigo, compararCodigo } = require('../utils/otp');
const { enviarCodigoOtp } = require('./mailer');
const {
  toRegistroDto,
  toOtpEnviadoDto,
  toSesionDto,
} = require('../dtos/authDto');

const PROPOSITOS = ['REGISTRO', 'LOGIN'];

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validarEmail(email) {
  const formato = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!formato.test(email)) {
    throw ApiError.badRequest('El email no tiene un formato válido', 'EMAIL_INVALIDO');
  }
}

function validarProposito(proposito) {
  if (!PROPOSITOS.includes(proposito)) {
    throw ApiError.badRequest(
      `El propósito debe ser uno de: ${PROPOSITOS.join(', ')}`,
      'PROPOSITO_INVALIDO'
    );
  }
}

async function buscarUsuarioPorEmail(email) {
  const [filas] = await pool.query(
    'SELECT * FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  );
  return filas[0] || null;
}

async function buscarUsuarioPorId(id) {
  const [filas] = await pool.query(
    'SELECT * FROM usuarios WHERE id = ? LIMIT 1',
    [id]
  );
  return filas[0] || null;
}

function generarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, email: usuario.email },
    config.jwt.secreto,
    { expiresIn: config.jwt.expiracion }
  );
}

// ---------------------------------------------------------------
// Emisión de OTP (se reusa en registro, reenvío y login por OTP)
// ---------------------------------------------------------------
async function crearYEnviarOtp(usuario, proposito) {
  // 1) Anti-spam: no permitimos pedir otro código antes del cooldown.
  const [filasUltimo] = await pool.query(
    `SELECT TIMESTAMPDIFF(SECOND, creado_en, NOW()) AS segundos
       FROM codigos_otp
      WHERE usuario_id = ? AND proposito = ?
      ORDER BY id DESC
      LIMIT 1`,
    [usuario.id, proposito]
  );
  const ultimo = filasUltimo[0];
  if (ultimo && ultimo.segundos < config.otp.segundosEntreEnvios) {
    const faltan = config.otp.segundosEntreEnvios - ultimo.segundos;
    throw ApiError.tooManyRequests(
      `Esperá ${faltan} segundos antes de pedir otro código`,
      'OTP_COOLDOWN'
    );
  }

  // 2) Invalidamos los códigos anteriores: sólo uno vigente por vez.
  await pool.query(
    `UPDATE codigos_otp
        SET usado_en = NOW()
      WHERE usuario_id = ? AND proposito = ? AND usado_en IS NULL`,
    [usuario.id, proposito]
  );

  // 3) Generamos, hasheamos y guardamos.
  //    El vencimiento lo calcula MySQL con NOW() para no mezclar
  //    zonas horarias entre Node y la base.
  const codigo = generarCodigo();
  const codigoHash = await hashearCodigo(codigo);
  await pool.query(
    `INSERT INTO codigos_otp (usuario_id, codigo_hash, proposito, expira_en)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [usuario.id, codigoHash, proposito, config.otp.minutosValidez]
  );

  // 4) Lo mandamos (consola o mail real según MAIL_MODE).
  await enviarCodigoOtp(usuario.email, codigo, proposito);

  return codigo;
}

// En desarrollo devolvemos el código en la respuesta para poder probar
// la app sin abrir el mail. En producción esto NUNCA se hace.
function codigoParaDesarrollo(codigo) {
  return config.otp.exponerEnRespuesta ? codigo : undefined;
}

// ---------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------

// POST /api/auth/registro
async function registrar({ email, password, nombre }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);

  if (!password || String(password).length < 6) {
    throw ApiError.badRequest(
      'La contraseña debe tener al menos 6 caracteres',
      'PASSWORD_CORTA'
    );
  }

  const existente = await buscarUsuarioPorEmail(mail);

  // Si ya existe Y ya validó el email, es un alta duplicada.
  if (existente && existente.email_verificado) {
    throw ApiError.conflict('Ya existe una cuenta con ese email', 'EMAIL_EN_USO');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (existente) {
    // Se registró antes pero nunca confirmó: pisamos los datos y
    // le mandamos un código nuevo. Evita cuentas zombie.
    await pool.query(
      'UPDATE usuarios SET password_hash = ?, nombre = COALESCE(?, nombre) WHERE id = ?',
      [passwordHash, nombre || null, existente.id]
    );
  } else {
    await pool.query(
      'INSERT INTO usuarios (email, password_hash, nombre) VALUES (?, ?, ?)',
      [mail, passwordHash, nombre || null]
    );
  }

  const usuario = await buscarUsuarioPorEmail(mail);
  const codigo = await crearYEnviarOtp(usuario, 'REGISTRO');

  return toRegistroDto(usuario, codigoParaDesarrollo(codigo));
}

// POST /api/auth/otp/enviar
// Sirve para DOS cosas del enunciado:
//   - reenviar el código de registro (no llegó / venció)
//   - pedir un código para ingresar sin contraseña (login por OTP)
async function solicitarOtp({ email, proposito }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);
  validarProposito(proposito);

  const usuario = await buscarUsuarioPorEmail(mail);
  if (!usuario) {
    throw ApiError.notFound(
      'No existe una cuenta con ese email',
      'USUARIO_NO_ENCONTRADO'
    );
  }

  const codigo = await crearYEnviarOtp(usuario, proposito);

  return toOtpEnviadoDto(codigoParaDesarrollo(codigo));
}

// POST /api/auth/otp/verificar
// Es el paso que "confirma y crea sesión": devuelve el token.
async function verificarOtp({ email, codigo, proposito }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);
  validarProposito(proposito);

  if (!codigo) {
    throw ApiError.badRequest('Tenés que enviar el código', 'CODIGO_REQUERIDO');
  }

  const usuario = await buscarUsuarioPorEmail(mail);
  if (!usuario) {
    throw ApiError.notFound(
      'No existe una cuenta con ese email',
      'USUARIO_NO_ENCONTRADO'
    );
  }

  // Traemos el último código sin usar, y le preguntamos a MySQL si sigue vigente.
  const [filas] = await pool.query(
    `SELECT id, codigo_hash, intentos, (expira_en > NOW()) AS vigente
       FROM codigos_otp
      WHERE usuario_id = ? AND proposito = ? AND usado_en IS NULL
      ORDER BY id DESC
      LIMIT 1`,
    [usuario.id, proposito]
  );
  const registro = filas[0];

  if (!registro) {
    throw ApiError.badRequest(
      'No hay ningún código pendiente. Pedí uno nuevo.',
      'OTP_INEXISTENTE'
    );
  }
  if (!registro.vigente) {
    throw ApiError.badRequest('El código venció. Pedí uno nuevo.', 'OTP_EXPIRADO');
  }
  if (registro.intentos >= config.otp.intentosMaximos) {
    throw ApiError.tooManyRequests(
      'Superaste la cantidad de intentos. Pedí un código nuevo.',
      'OTP_BLOQUEADO'
    );
  }

  const coincide = await compararCodigo(String(codigo), registro.codigo_hash);
  if (!coincide) {
    await pool.query(
      'UPDATE codigos_otp SET intentos = intentos + 1 WHERE id = ?',
      [registro.id]
    );
    throw ApiError.badRequest('El código es incorrecto', 'OTP_INVALIDO');
  }

  // Correcto: lo marcamos como usado (un solo uso) y verificamos el email.
  await pool.query('UPDATE codigos_otp SET usado_en = NOW() WHERE id = ?', [
    registro.id,
  ]);
  if (!usuario.email_verificado) {
    await pool.query('UPDATE usuarios SET email_verificado = 1 WHERE id = ?', [
      usuario.id,
    ]);
  }

  const actualizado = await buscarUsuarioPorId(usuario.id);
  return toSesionDto(actualizado, generarToken(actualizado));
}

module.exports = {
  registrar,
  solicitarOtp,
  verificarOtp,
  buscarUsuarioPorId,
};
