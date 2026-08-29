// Igual que autenticar(), pero NO falla si no hay token.
//
// Se usa en rutas públicas que devuelven algo distinto cuando sabemos quién
// mira: el listado puede ordenarse por cercanía, y el detalle puede decir si
// la publicación es tuya o si la tenés en favoritos.
const jwt = require('jsonwebtoken');
const config = require('../config/env');

function autenticarOpcional(req, res, next) {
  const header = req.headers.authorization || '';
  const [esquema, token] = header.split(' ');

  if (esquema === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, config.jwt.secreto);
      req.usuario = { id: payload.sub, email: payload.email };
    } catch (error) {
      // Token vencido o inválido: seguimos como visitante anónimo.
      req.usuario = null;
    }
  }
  next();
}

module.exports = { autenticarOpcional };
