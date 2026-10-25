// DTOs de Hallado. Cada función de acá define, literalmente, el JSON que va
// a recibir la app.
//
// Hay dos reglas de privacidad que viven acá y en ningún otro lado:
//
//   1. La respuesta de verificación NUNCA sale. Si saliera, cualquiera que
//      mire el detalle de una publicación podría contestar bien el reclamo y
//      quedarse con algo que no es suyo. No hay un solo caso de uso en el
//      enunciado que la necesite del lado del cliente: la comparación la
//      hace el backend (punto 7).
//
//   2. La dirección exacta sólo sale si quien mira tiene derecho a verla. El
//      enunciado lo marca como importante: "la dirección exacta no se muestra
//      hasta que el reclamo sea aceptado". Eso se decide con el parámetro
//      `verDireccion`, y el default es NO mostrarla — si alguien se olvida de
//      pasarlo, se filtra de menos y no de más.

function toCategoriaDto(fila) {
  return { id: fila.id, nombre: fila.nombre };
}

function toBarrioDto(fila) {
  return { id: fila.id, nombre: fila.nombre };
}

// Las fotos vienen de una consulta aparte y se pasan ya armadas.
function toPublicacionDto(fila, fotos = [], { verDireccion = false } = {}) {
  return {
    id: fila.id,
    tipo: fila.tipo,
    titulo: fila.titulo,
    descripcion: fila.descripcion,

    categoria: { id: fila.categoria_id, nombre: fila.categoria_nombre },
    barrio: { id: fila.barrio_id, nombre: fila.barrio_nombre },

    fechaSuceso: formatearFecha(fila.fecha_suceso),
    franjaHoraria: fila.franja_horaria,

    // Coordenadas aproximadas: viajan siempre porque el listado del punto 3
    // las muestra y ordena por cercanía con ellas. La dirección escrita, que
    // es la que realmente identifica el lugar, es la que se protege.
    coordenadas:
      fila.lat === null || fila.lng === null
        ? null
        : { lat: Number(fila.lat), lng: Number(fila.lng) },

    direccion: verDireccion ? fila.direccion : null,
    direccionOculta: !verDireccion && fila.direccion !== null,

    // En las de tipo ENCONTRE la pregunta se muestra (quien reclama tiene que
    // leerla para contestarla). La respuesta no sale nunca.
    preguntaVerificacion: fila.pregunta_verificacion,

    estado: fila.estado_efectivo ?? fila.estado,
    venceEn: fila.vence_en,
    creadoEn: fila.creado_en,

    publicador: {
      id: fila.usuario_id,
      nombre: fila.publicador_nombre,
    },

    fotos: fotos.map((f) => ({ id: f.id, url: f.url })),
  };
}

// Lo que ve la persona en "Mis publicaciones". Es más corto que el detalle:
// acá no hace falta el publicador (es ella misma) ni la galería entera.
function toPublicacionPropiaDto(fila, fotos = []) {
  return {
    id: fila.id,
    tipo: fila.tipo,
    titulo: fila.titulo,
    categoria: { id: fila.categoria_id, nombre: fila.categoria_nombre },
    barrio: { id: fila.barrio_id, nombre: fila.barrio_nombre },
    fechaSuceso: formatearFecha(fila.fecha_suceso),
    estado: fila.estado_efectivo ?? fila.estado,
    venceEn: fila.vence_en,
    // Para poder mostrar "vence en 3 días" sin que la app tenga que hacer la
    // cuenta con zonas horarias distintas a las del servidor.
    diasParaVencer: fila.dias_para_vencer,
    puedeRenovarse: (fila.estado_efectivo ?? fila.estado) !== 'RESUELTA',
    portada: fotos.length > 0 ? fotos[0].url : null,
    cantidadFotos: fotos.length,
  };
}

// MySQL devuelve un Date para las columnas DATE. Lo pasamos a 'YYYY-MM-DD'
// usando los getters locales y no toISOString(), que convierte a UTC y puede
// correr la fecha un día para atrás.
function formatearFecha(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  const anio = valor.getFullYear();
  const mes = String(valor.getMonth() + 1).padStart(2, '0');
  const dia = String(valor.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

module.exports = {
  toCategoriaDto,
  toBarrioDto,
  toPublicacionDto,
  toPublicacionPropiaDto,
};
