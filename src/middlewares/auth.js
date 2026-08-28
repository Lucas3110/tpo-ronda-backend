// Middleware de autenticación.
// Se pone delante de las rutas privadas. Lee el header:
//     Authorization: Bearer <token>
// valida la firma del JWT y deja el usuario en req.usuario.
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { buscarUsuarioPorId } = require('../services/authService');

async function autenticar(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [esquema, token] = header.split(' ');

    if (esquema !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Falta el token de acceso', 'TOKEN_FALTANTE');
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secreto);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('La sesión expiró', 'TOKEN_EXPIRADO');
      }
      throw ApiError.unauthorized('Token inválido', 'TOKEN_INVALIDO');
    }

    // Verificamos contra la base: el usuario pudo haber sido borrado
    // después de que se emitió el token.
    const usuario = await buscarUsuarioPorId(payload.sub);
    if (!usuario) {
      throw ApiError.unauthorized('Token inválido', 'TOKEN_INVALIDO');
    }

    req.usuario = { id: usuario.id, email: usuario.email };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { autenticar };
