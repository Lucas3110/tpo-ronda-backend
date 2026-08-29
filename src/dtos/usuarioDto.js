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

/** Zona embebida dentro de otro objeto. Null si el usuario no eligió ninguna. */
function toZonaDto(fila) {
  if (!fila || !fila.zona_id) return null;
  return {
    id: fila.zona_id,
    nombre: fila.zona_nombre,
  };
}

/** Datos propios: los ve únicamente el dueño de la cuenta. */
function toUsuarioDto(usuario) {
  if (!usuario) return null;

  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    telefono: usuario.telefono,
    zona: toZonaDto(usuario),
    emailVerificado: Boolean(usuario.email_verificado),
    creadoEn: usuario.creado_en,
  };
}

/**
 * Reputación construida a partir de las calificaciones recibidas.
 * Los valores vienen de una consulta agregada, no de columnas de la tabla.
 */
function toReputacionDto(fila) {
  const promedio = fila && fila.promedio_estrellas !== null
    ? Number(fila.promedio_estrellas)
    : null;

  return {
    // Redondeado a un decimal, que es como se muestra "4,3 estrellas".
    promedioEstrellas: promedio === null ? null : Math.round(promedio * 10) / 10,
    cantidadCalificaciones: Number(fila?.cantidad_calificaciones ?? 0),
    operacionesComoVendedor: Number(fila?.operaciones_vendedor ?? 0),
    operacionesComoComprador: Number(fila?.operaciones_comprador ?? 0),
  };
}

/**
 * Perfil público: lo que ve cualquier persona antes de operar con otra.
 * A propósito NO incluye email ni teléfono.
 */
function toPerfilPublicoDto(usuario, reputacion, publicacionesActivas) {
  if (!usuario) return null;

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    zona: toZonaDto(usuario),
    miembroDesde: usuario.creado_en,
    // La "antigüedad en la plataforma" del enunciado, ya calculada para que
    // la app no tenga que hacer cuentas con fechas.
    antiguedadDias: Number(usuario.antiguedad_dias ?? 0),
    reputacion: toReputacionDto(reputacion),
    publicacionesActivas: publicacionesActivas ?? [],
  };
}

/** Versión mínima del vendedor, para incrustar en una publicación. */
function toVendedorResumenDto(usuario, reputacion) {
  if (!usuario) return null;

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    zona: toZonaDto(usuario),
    reputacion: toReputacionDto(reputacion),
  };
}

function toZonaListadoDto(zona) {
  return {
    id: zona.id,
    nombre: zona.nombre,
    latitud: Number(zona.latitud),
    longitud: Number(zona.longitud),
  };
}

module.exports = {
  toUsuarioDto,
  toZonaDto,
  toReputacionDto,
  toPerfilPublicoDto,
  toVendedorResumenDto,
  toZonaListadoDto,
};
