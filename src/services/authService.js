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
  toPerfilDto,
} = require('../dtos/authDto');

// Propositos que la app puede pedir por los endpoints publicos /auth/otp/*.
// CAMBIO_EMAIL y RECUPERO existen en la tabla pero NO van aca.
//   - CAMBIO_EMAIL solo se usa desde las rutas autenticadas de
//     /usuarios/me/email, asi nadie puede usar un codigo de cambio de email
//     para iniciar sesion.
//   - RECUPERO tiene sus propias rutas (/auth/password/*). Si estuviera aca,
//     un codigo de recupero alcanzaria para abrir sesion por /otp/verificar
//     sin llegar a definir la contrasena nueva.
const PROPOSITOS = ['REGISTRO', 'LOGIN'];

// Límites de los datos de alta. Están acá y no repartidos por el código para
// que la app y la API puedan mostrar los mismos números.
const EMAIL_MAX = 255; // igual que el VARCHAR(255) de la tabla
const NOMBRE_MAX = 30;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 40;

// Letras (con acentos y ñ), espacios, apóstrofos y guiones. Tiene que empezar
// con una letra. La bandera u hace que \p{L} tome letras de cualquier idioma.
const FORMATO_NOMBRE = /^\p{L}[\p{L} '’-]*$/u;

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
  if (email.length > EMAIL_MAX) {
    throw ApiError.badRequest(
      `El email no puede tener más de ${EMAIL_MAX} caracteres`,
      'EMAIL_LARGO'
    );
  }
}

/**
 * El nombre es obligatorio: el perfil público del Punto 2 y las
 * publicaciones necesitan mostrar de quién son.
 * Devuelve el nombre ya recortado de espacios sobrantes.
 */
function validarNombre(nombre) {
  const limpio = String(nombre ?? '').trim();

  if (limpio === '') {
    throw ApiError.badRequest('El nombre es obligatorio', 'NOMBRE_REQUERIDO');
  }
  if (limpio.length > NOMBRE_MAX) {
    throw ApiError.badRequest(
      `El nombre no puede tener más de ${NOMBRE_MAX} caracteres`,
      'NOMBRE_LARGO'
    );
  }
  if (/\d/.test(limpio)) {
    throw ApiError.badRequest('El nombre no puede contener números', 'NOMBRE_CON_NUMEROS');
  }
  if (!FORMATO_NOMBRE.test(limpio)) {
    throw ApiError.badRequest(
      'El nombre sólo puede tener letras, espacios, apóstrofos y guiones',
      'NOMBRE_INVALIDO'
    );
  }
  return limpio;
}

function validarPassword(password) {
  const valor = String(password ?? '');

  if (valor.length < PASSWORD_MIN) {
    throw ApiError.badRequest(
      `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`,
      'PASSWORD_CORTA'
    );
  }
  if (valor.length > PASSWORD_MAX) {
    throw ApiError.badRequest(
      `La contraseña no puede tener más de ${PASSWORD_MAX} caracteres`,
      'PASSWORD_LARGA'
    );
  }
  return valor;
}

function validarProposito(proposito) {
  if (!PROPOSITOS.includes(proposito)) {
    throw ApiError.badRequest(
      `El propósito debe ser uno de: ${PROPOSITOS.join(', ')}`,
      'PROPOSITO_INVALIDO'
    );
  }
}

// El LEFT JOIN trae el nombre de la zona para que el DTO lo pueda incluir
// sin tener que hacer una segunda consulta.
const SELECT_USUARIO = `
  SELECT u.*, z.nombre AS zona_nombre
    FROM usuarios u
    LEFT JOIN zonas z ON z.id = u.zona_id
`;

async function buscarUsuarioPorEmail(email) {
  const [filas] = await pool.query(`${SELECT_USUARIO} WHERE u.email = ? LIMIT 1`, [email]);
  return filas[0] || null;
}

async function buscarUsuarioPorId(id) {
  const [filas] = await pool.query(`${SELECT_USUARIO} WHERE u.id = ? LIMIT 1`, [id]);
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
//
// Para el cambio de email el codigo NO va al email actual sino al nuevo, y hay
// que recordar cual es hasta que se confirme: por eso destino y emailNuevo.
async function crearYEnviarOtp(usuario, proposito, { destino = usuario.email, emailNuevo = null } = {}) {
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
    `INSERT INTO codigos_otp (usuario_id, codigo_hash, proposito, email_nuevo, expira_en)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [usuario.id, codigoHash, proposito, emailNuevo, config.otp.minutosValidez]
  );

  // 4) Lo mandamos (consola o mail real según MAIL_MODE).
  await enviarCodigoOtp(destino, codigo, proposito);

  return codigo;
}

// En desarrollo devolvemos el código en la respuesta para poder probar
// la app sin abrir el mail. En producción esto NUNCA se hace.
function codigoParaDesarrollo(codigo) {
  return config.otp.exponerEnRespuesta ? codigo : undefined;
}

// Valida un código OTP y, si es correcto, lo consume (un solo uso).
// Es el corazón compartido entre el registro/login y el cambio de email.
// Devuelve la fila del código, que trae email_nuevo cuando corresponde.
async function consumirOtp(usuario, proposito, codigo) {
  // Traemos el último código sin usar, y le preguntamos a MySQL si sigue vigente.
  const [filas] = await pool.query(
    `SELECT id, codigo_hash, email_nuevo, intentos, (expira_en > NOW()) AS vigente
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

  // Correcto: lo marcamos como usado (un solo uso).
  await pool.query('UPDATE codigos_otp SET usado_en = NOW() WHERE id = ?', [
    registro.id,
  ]);
  return registro;
}

// ---------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------

// POST /api/auth/registro
async function registrar({ email, password, nombre }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);

  // El orden importa: primero lo barato (validar), después lo caro (hashear
  // y pegarle a la base). Y validamos igual aunque la app ya lo haga: nunca
  // se confía en el cliente, que puede saltearse la pantalla con Postman.
  const nombreLimpio = validarNombre(nombre);
  validarPassword(password);

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
      'UPDATE usuarios SET password_hash = ?, nombre = ? WHERE id = ?',
      [passwordHash, nombreLimpio, existente.id]
    );
  } else {
    await pool.query(
      'INSERT INTO usuarios (email, password_hash, nombre) VALUES (?, ?, ?)',
      [mail, passwordHash, nombreLimpio]
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

  await consumirOtp(usuario, proposito, codigo);
  if (!usuario.email_verificado) {
    await pool.query('UPDATE usuarios SET email_verificado = 1 WHERE id = ?', [
      usuario.id,
    ]);
  }

  const actualizado = await buscarUsuarioPorId(usuario.id);
  return toSesionDto(actualizado, generarToken(actualizado));
}

// POST /api/auth/login
async function login({ email, password }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);

  const usuario = await buscarUsuarioPorEmail(mail);

  // Mensaje genérico a propósito: no le contamos a un atacante
  // si el email existe o si lo que falló fue la contraseña.
  if (!usuario || !usuario.password_hash) {
    throw ApiError.unauthorized(
      'Email o contraseña incorrectos',
      'CREDENCIALES_INVALIDAS'
    );
  }

  const coincide = await bcrypt.compare(
    String(password || ''),
    usuario.password_hash
  );
  if (!coincide) {
    throw ApiError.unauthorized(
      'Email o contraseña incorrectos',
      'CREDENCIALES_INVALIDAS'
    );
  }

  if (!usuario.email_verificado) {
    throw ApiError.forbidden(
      'Tenés que validar tu email con el código antes de ingresar',
      'EMAIL_NO_VERIFICADO'
    );
  }

  return toSesionDto(usuario, generarToken(usuario));
}

// ---------------------------------------------------------------
// Registro en dos pasos (orden que pide el enunciado de Hallado)
// ---------------------------------------------------------------
//
// El enunciado nuevo pide este orden: "solicitar email -> recibir un codigo
// de validacion (OTP) -> confirmarlo y definir una contrasena". O sea que la
// contrasena se elige DESPUES de probar que el email es tuyo, no antes.
//
// registrar() (arriba) hace el alta en un solo paso y sigue existiendo para
// no romper nada de lo que ya estaba. Estas dos funciones son el camino nuevo.
//
// Que la cuenta pueda existir sin contrasena no agrega riesgo: login() ya
// rechaza a cualquier usuario sin password_hash, y hasta que no se confirme
// el codigo el email tampoco queda verificado.

// POST /api/auth/registro/solicitar
// Paso 1: solo el email. Crea la cuenta sin contrasena y manda el codigo.
async function solicitarRegistro({ email }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);

  const existente = await buscarUsuarioPorEmail(mail);

  // Si ya confirmo el email, es un alta duplicada.
  if (existente && existente.email_verificado) {
    throw ApiError.conflict('Ya existe una cuenta con ese email', 'EMAIL_EN_USO');
  }

  // Si existe pero nunca confirmo, no pisamos nada: le mandamos otro codigo.
  // Asi el mismo endpoint sirve para "empezar de nuevo" sin cuentas zombie.
  if (!existente) {
    await pool.query('INSERT INTO usuarios (email) VALUES (?)', [mail]);
  }

  const usuario = await buscarUsuarioPorEmail(mail);
  const codigo = await crearYEnviarOtp(usuario, 'REGISTRO');

  return toOtpEnviadoDto(codigoParaDesarrollo(codigo));
}

// POST /api/auth/registro/confirmar
// Paso 2: el codigo mas el nombre y la contrasena. Deja la sesion abierta,
// para que la persona no tenga que loguearse justo despues de registrarse.
async function confirmarRegistro({ email, codigo, nombre, password }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);

  if (!codigo) {
    throw ApiError.badRequest('Tenes que enviar el codigo', 'CODIGO_REQUERIDO');
  }

  // Validamos los datos ANTES de consumir el codigo: si el nombre o la
  // contrasena estan mal, el codigo tiene que seguir sirviendo. Si no,
  // un error de tipeo obligaria a pedir uno nuevo.
  const nombreLimpio = validarNombre(nombre);
  validarPassword(password);

  const usuario = await buscarUsuarioPorEmail(mail);
  if (!usuario) {
    throw ApiError.notFound('No existe una cuenta con ese email', 'USUARIO_NO_ENCONTRADO');
  }

  await consumirOtp(usuario, 'REGISTRO', codigo);

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    'UPDATE usuarios SET password_hash = ?, nombre = ?, email_verificado = 1 WHERE id = ?',
    [passwordHash, nombreLimpio, usuario.id]
  );

  const actualizado = await buscarUsuarioPorId(usuario.id);
  return toSesionDto(actualizado, generarToken(actualizado));
}

// ---------------------------------------------------------------
// Recupero de contrasena
// ---------------------------------------------------------------

// POST /api/auth/password/recuperar
// Manda un codigo al email de la cuenta. Llamarlo otra vez es el "reenviar"
// que pide el enunciado: el cooldown de crearYEnviarOtp se encarga de que no
// se pueda spamear, y el codigo anterior queda invalidado.
async function solicitarRecuperoPassword({ email }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);

  const usuario = await buscarUsuarioPorEmail(mail);

  // A diferencia de /otp/enviar, aca no decimos si el email existe o no.
  // En un recupero de contrasena eso le sirve a un atacante para averiguar
  // quien tiene cuenta, y a la persona no le cambia nada: si el mail es suyo,
  // el codigo le llega igual.
  if (!usuario || !usuario.email_verificado) {
    return toOtpEnviadoDto(undefined);
  }

  const codigo = await crearYEnviarOtp(usuario, 'RECUPERO');
  return toOtpEnviadoDto(codigoParaDesarrollo(codigo));
}

// POST /api/auth/password/restablecer
// Con el codigo correcto, define la contrasena nueva y abre sesion.
async function restablecerPassword({ email, codigo, password }) {
  const mail = normalizarEmail(email);
  validarEmail(mail);

  if (!codigo) {
    throw ApiError.badRequest('Tenes que enviar el codigo', 'CODIGO_REQUERIDO');
  }

  // Igual que en el registro: validamos antes de consumir el codigo.
  validarPassword(password);

  const usuario = await buscarUsuarioPorEmail(mail);
  if (!usuario) {
    // Aca si cortamos con un error: ya mostramos la pantalla del codigo, y
    // "codigo incorrecto" es lo que corresponde cuando no hay ninguno.
    throw ApiError.badRequest('El codigo es incorrecto', 'OTP_INVALIDO');
  }

  await consumirOtp(usuario, 'RECUPERO', codigo);

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [
    passwordHash,
    usuario.id,
  ]);

  const actualizado = await buscarUsuarioPorId(usuario.id);
  return toSesionDto(actualizado, generarToken(actualizado));
}

// GET /api/auth/me
async function obtenerPerfil(usuarioId) {
  const usuario = await buscarUsuarioPorId(usuarioId);
  if (!usuario) {
    throw ApiError.notFound('Usuario no encontrado', 'USUARIO_NO_ENCONTRADO');
  }
  return toPerfilDto(usuario);
}

// POST /api/usuarios/me/email/solicitar
// Paso 1 del cambio de email: manda un código al email NUEVO. Todavía no se
// cambia nada; si la persona se equivoca de dirección, simplemente no llega
// a confirmar y la cuenta queda intacta.
async function solicitarCambioEmail(usuarioId, { emailNuevo }) {
  const mail = normalizarEmail(emailNuevo);
  validarEmail(mail);

  const usuario = await buscarUsuarioPorId(usuarioId);
  if (!usuario) {
    throw ApiError.notFound('Usuario no encontrado', 'USUARIO_NO_ENCONTRADO');
  }
  if (mail === usuario.email) {
    throw ApiError.badRequest('Ese ya es el email de tu cuenta', 'EMAIL_IGUAL_AL_ACTUAL');
  }
  // Cualquier cuenta con ese email lo ocupa, esté verificada o no: la
  // restricción UNIQUE de la tabla no distingue, y pisar una cuenta ajena
  // (aunque sea zombie) no es algo que se decida desde acá.
  if (await buscarUsuarioPorEmail(mail)) {
    throw ApiError.conflict('Ya existe una cuenta con ese email', 'EMAIL_EN_USO');
  }

  const codigo = await crearYEnviarOtp(usuario, 'CAMBIO_EMAIL', {
    destino: mail,
    emailNuevo: mail,
  });
  return toOtpEnviadoDto(codigoParaDesarrollo(codigo));
}

// POST /api/usuarios/me/email/confirmar
// Paso 2: con el código correcto, el email de la cuenta pasa a ser el nuevo.
async function confirmarCambioEmail(usuarioId, { codigo }) {
  if (!codigo) {
    throw ApiError.badRequest('Tenés que enviar el código', 'CODIGO_REQUERIDO');
  }

  const usuario = await buscarUsuarioPorId(usuarioId);
  if (!usuario) {
    throw ApiError.notFound('Usuario no encontrado', 'USUARIO_NO_ENCONTRADO');
  }

  const registro = await consumirOtp(usuario, 'CAMBIO_EMAIL', codigo);
  const emailNuevo = registro.email_nuevo;

  try {
    // Recibir el código prueba que la persona lee ese buzón, así que el email
    // queda verificado.
    await pool.query(
      'UPDATE usuarios SET email = ?, email_verificado = 1 WHERE id = ?',
      [emailNuevo, usuario.id]
    );
  } catch (error) {
    // Alguien más pudo registrar ese email entre el pedido y la confirmación.
    // La restricción UNIQUE es la que lo frena de verdad.
    if (error.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('Ya existe una cuenta con ese email', 'EMAIL_EN_USO');
    }
    throw error;
  }

  const actualizado = await buscarUsuarioPorId(usuario.id);
  return { mensaje: 'Email actualizado', ...toPerfilDto(actualizado) };
}

module.exports = {
  registrar,
  solicitarRegistro,
  confirmarRegistro,
  solicitarOtp,
  verificarOtp,
  login,
  solicitarRecuperoPassword,
  restablecerPassword,
  obtenerPerfil,
  solicitarCambioEmail,
  confirmarCambioEmail,
  buscarUsuarioPorId,
};
