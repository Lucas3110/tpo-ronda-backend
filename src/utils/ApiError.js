// Error "de negocio" con codigo HTTP y un codigo interno legible.
// Lo usamos para que el manejador de errores central sepa que responder
// y para que la app Android pueda reaccionar segun el codigo.
class ApiError extends Error {
  constructor(estado, mensaje, codigo) {
    super(mensaje);
    this.name = 'ApiError';
    this.estado = estado;
    this.codigo = codigo || 'ERROR';
  }

  static badRequest(mensaje, codigo) {
    return new ApiError(400, mensaje, codigo || 'DATOS_INVALIDOS');
  }
  static unauthorized(mensaje, codigo) {
    return new ApiError(401, mensaje, codigo || 'NO_AUTENTICADO');
  }
  static forbidden(mensaje, codigo) {
    return new ApiError(403, mensaje, codigo || 'PROHIBIDO');
  }
  static notFound(mensaje, codigo) {
    return new ApiError(404, mensaje, codigo || 'NO_ENCONTRADO');
  }
  static conflict(mensaje, codigo) {
    return new ApiError(409, mensaje, codigo || 'CONFLICTO');
  }
  static tooManyRequests(mensaje, codigo) {
    return new ApiError(429, mensaje, codigo || 'DEMASIADOS_INTENTOS');
  }
}

module.exports = ApiError;
