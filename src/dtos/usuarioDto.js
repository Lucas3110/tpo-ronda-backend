// DTO = Data Transfer Object.
//
// Es el objeto que viaja hacia afuera de la API. NO es la fila de la base:
// la fila de `usuarios` tiene `password_hash` y nombres con guion bajo, y eso
// no queremos que lo vea nadie.
//
// En JavaScript (sin TypeScript) un DTO se implementa como una función de
// mapeo: recibe la entidad de la base y devuelve exactamente los campos que
// la API expone, con los nombres que la app Android espera.
//
// Ventajas concretas:
//   1. Si mañana agregamos una columna secreta a `usuarios`, no se filtra sola.
//   2. El contrato con el front está escrito en UN solo lugar.
//   3. Traducimos snake_case (base) a camelCase (JSON), que es lo que Gson
//      va a mapear del lado de Android.

function toUsuarioDto(usuario) {
  if (!usuario) return null;

  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    telefono: usuario.telefono,
    zona: usuario.zona,
    emailVerificado: Boolean(usuario.email_verificado),
    creadoEn: usuario.creado_en,
  };
}

module.exports = { toUsuarioDto };
