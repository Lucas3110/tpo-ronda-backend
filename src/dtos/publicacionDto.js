// DTOs de publicaciones. Hay dos formas distintas a propósito:
//
//   toPublicacionListadoDto -> la fila del Home. Liviana: sólo lo que se ve
//                              en la tarjeta, sin descripción ni galería.
//   toPublicacionDetalleDto -> la pantalla de detalle. Trae todo.
//
// Separarlas importa: el listado devuelve 20 por página, y mandar la
// descripción completa y todas las fotos de cada una sería desperdiciar
// datos del celular.
const { toVendedorResumenDto } = require('./usuarioDto');

const ESTADOS_ARTICULO = {
  NUEVO: 'Nuevo',
  COMO_NUEVO: 'Como nuevo',
  USADO: 'Usado',
};

/** Texto legible del estado, para que la app no tenga que traducirlo. */
function etiquetaEstadoArticulo(estado) {
  return ESTADOS_ARTICULO[estado] ?? estado;
}

function toPublicacionListadoDto(fila) {
  return {
    id: fila.id,
    titulo: fila.titulo,
    // MySQL devuelve DECIMAL como string para no perder precisión;
    // lo pasamos a número para que Gson lo mapee a double.
    precio: Number(fila.precio),
    estadoArticulo: fila.estado_articulo,
    estadoArticuloTexto: etiquetaEstadoArticulo(fila.estado_articulo),
    estado: fila.estado,
    categoria: { id: fila.categoria_id, nombre: fila.categoria_nombre },
    zona: { id: fila.zona_id, nombre: fila.zona_nombre },
    fotoPrincipal: fila.foto_principal ?? null,
    cantidadFotos: Number(fila.cantidad_fotos ?? 0),
    creadoEn: fila.creado_en,
    vendedorId: fila.vendedor_id,
  };
}

function toFotoDto(fila) {
  return { id: fila.id, url: fila.url, orden: fila.orden };
}

/**
 * Punto de entrega (Puntos 4 y 8).
 *
 * Devuelve null cuando quien mira todavía no tiene derecho a verlo: el
 * enunciado es explícito en que la dirección exacta se revela recién con la
 * oferta aceptada. Que el filtro esté acá y no en la app importa — si lo
 * resolviera el cliente, el dato ya habría viajado por la red y cualquiera
 * podría leerlo con Postman.
 *
 * `urlMapa` viene armada desde el backend para que la app sólo tenga que
 * lanzar un Intent con esa URI, sin repetir el formato de Google Maps.
 */
function toEntregaDto(fila, visible) {
  if (!visible) return null;
  if (!fila.direccion && fila.latitud === null) return null;

  const latitud = fila.latitud === null ? null : Number(fila.latitud);
  const longitud = fila.longitud === null ? null : Number(fila.longitud);

  // Con coordenadas el pin cae exacto; si sólo hay dirección escrita, se la
  // pasamos a Google Maps como texto y que la resuelva él.
  const destino =
    latitud !== null && longitud !== null ? `${latitud},${longitud}` : fila.direccion;

  return {
    direccion: fila.direccion ?? null,
    latitud,
    longitud,
    urlMapa: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`,
  };
}

function toPublicacionDetalleDto(fila, fotos, vendedor, reputacion, extras = {}) {
  return {
    id: fila.id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    precio: Number(fila.precio),
    estadoArticulo: fila.estado_articulo,
    estadoArticuloTexto: etiquetaEstadoArticulo(fila.estado_articulo),
    estado: fila.estado,
    categoria: { id: fila.categoria_id, nombre: fila.categoria_nombre },
    zona: { id: fila.zona_id, nombre: fila.zona_nombre },
    fotos: (fotos ?? []).map(toFotoDto),
    publicadoEn: fila.creado_en,
    vendedor: toVendedorResumenDto(vendedor, reputacion),
    ...extras,
  };
}

/**
 * Envoltorio del listado paginado. La app necesita saber si hay más
 * páginas para el scroll infinito, así que el total va siempre.
 */
function toPaginaDto(items, { pagina, limite, total }) {
  return {
    items,
    pagina,
    limite,
    total,
    totalPaginas: limite > 0 ? Math.ceil(total / limite) : 0,
    hayMas: pagina * limite < total,
  };
}

function toCategoriaDto(fila) {
  return { id: fila.id, nombre: fila.nombre };
}

module.exports = {
  toPublicacionListadoDto,
  toPublicacionDetalleDto,
  toFotoDto,
  toEntregaDto,
  toPaginaDto,
  toCategoriaDto,
  etiquetaEstadoArticulo,
};
