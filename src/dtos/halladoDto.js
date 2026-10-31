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

// El detalle del punto 4: la publicación completa más los datos de quien la
// publicó. Es la misma publicación que en los resultados, con el publicador
// ampliado: ahí alcanza con el nombre, acá hace falta la reputación y lo que
// se necesita para ir a su perfil público.
function toDetalleDto(fila, fotos, { verDireccion = false, publicador, reputacion, seguimiento, reclamos } = {}) {
  return {
    ...toPublicacionDto(fila, fotos, { verDireccion }),
    publicador: toPublicadorDto(publicador, reputacion),
    // Para pintar el botón de seguir sin otro pedido.
    laSigo: Boolean(seguimiento?.laSigo),
    seguidores: Number(seguimiento?.seguidores ?? 0),
    // Punto 7: el último reclamo de quien mira sobre esta publicación,
    // cuántos intentos le quedan y, para el publicador, cuántos esperan.
    miReclamo: reclamos?.miReclamo ? toReclamoResumenDto(reclamos.miReclamo) : null,
    intentosRestantes: Number(reclamos?.intentosRestantes ?? 0),
    reclamosPendientes: Number(reclamos?.pendientes ?? 0),
  };
}

// Un reclamo completo, como lo ven las dos partes. Quién mira decide los
// flags del final: la app los usa para saber qué botones pintar.
function toReclamoDto(fila, usuarioId = null) {
  const soyElReclamante = usuarioId !== null && fila.reclamante_id === usuarioId;
  const soyElPublicador = usuarioId !== null && fila.publicador_id === usuarioId;

  return {
    id: fila.id,
    tipo: fila.tipo,
    estado: fila.estado,

    descripcion: fila.descripcion,
    fotoUrl: fila.foto_url,
    barrio: fila.barrio_id ? { id: fila.barrio_id, nombre: fila.barrio_nombre } : null,

    // Lo que contestó a la pregunta de verificación. La respuesta CORRECTA
    // sigue sin salir: esto es lo que escribió quien reclama.
    respuesta: fila.respuesta,
    respuestaCorrecta: fila.respuesta_correcta === null ? null : Boolean(fila.respuesta_correcta),

    motivo: fila.motivo,
    automatico: Boolean(fila.automatico),

    creadoEn: fila.creado_en,
    venceEn: fila.vence_en,
    respondidoEn: fila.respondido_en,
    // Para "vence en 36 h" sin que la app haga cuentas con zonas horarias.
    horasParaVencer:
      fila.estado === 'PENDIENTE' ? Math.ceil(Number(fila.minutos_para_vencer) / 60) : null,

    publicacion: {
      id: fila.publicacion_id,
      tipo: fila.pub_tipo,
      titulo: fila.pub_titulo,
      estado: fila.pub_estado,
      portada: fila.pub_portada ?? null,
    },
    reclamante: { id: fila.reclamante_id, nombre: fila.reclamante_nombre },
    publicador: { id: fila.publicador_id, nombre: fila.publicador_nombre },

    soyElReclamante,
    soyElPublicador,
    esperaMiRespuesta: soyElPublicador && fila.estado === 'PENDIENTE',

    contacto: toContactoDto(fila, { soyElReclamante, soyElPublicador }),
  };
}

// Punto 2: "La persona decide si su teléfono es visible para la otra parte
// una vez aceptado un reclamo, o si prefiere comunicarse solo a través de
// la app."
//
// Sólo existe con el reclamo ACEPTADO y sólo para las dos partes: un
// tercero, o un reclamo pendiente, no ve nada. Y aun así el teléfono de la
// otra persona viaja únicamente si ella eligió mostrarlo; si no, va null y
// la app explica que se comunica por la app.
function toContactoDto(fila, { soyElReclamante, soyElPublicador }) {
  if (fila.estado !== 'ACEPTADO' || (!soyElReclamante && !soyElPublicador)) return null;

  const prefijo = soyElReclamante ? 'publicador' : 'reclamante';
  const visible = Boolean(fila[`${prefijo}_telefono_visible`]);
  return {
    telefono: visible ? fila[`${prefijo}_telefono`] ?? null : null,
  };
}

// Un caso del historial (punto 10): un reclamo aceptado visto desde uno de
// sus dos lados. "Fecha, objeto y contraparte", como pide el enunciado.
function toCasoDto(fila, usuarioId, { valoraciones = [], plazoDias = 7 } = {}) {
  const soyElReclamante = fila.reclamante_id === usuarioId;
  const mia = valoraciones.find((v) => v.autor_id === usuarioId) ?? null;
  const recibida = valoraciones.find((v) => v.destinatario_id === usuarioId) ?? null;
  const diasPasados = Number(fila.dias_desde_respuesta ?? 0);

  return {
    id: fila.id,
    rol: fila.rol,
    fecha: fila.respondido_en,
    publicacion: {
      id: fila.publicacion_id,
      tipo: fila.pub_tipo,
      titulo: fila.pub_titulo,
      portada: fila.pub_portada ?? null,
    },
    contraparte: soyElReclamante
      ? { id: fila.publicador_id, nombre: fila.publicador_nombre }
      : { id: fila.reclamante_id, nombre: fila.reclamante_nombre },

    // Punto 10: la valoración que dejé y la que me dejaron, y si todavía
    // estoy a tiempo de valorar. El agradecimiento sólo lo puede dejar
    // quien recuperó.
    valoracion: {
      mia: toValoracionDto(mia),
      recibida: toValoracionDto(recibida),
      puedoValorar: mia === null && diasPasados <= plazoDias,
      diasParaValorar: Math.max(0, plazoDias - diasPasados),
      puedoAgradecer: fila.rol === 'RECUPERE',
    },
  };
}

// Lo mínimo del reclamo para el detalle de la publicación.
function toReclamoResumenDto(fila) {
  return {
    id: fila.id,
    tipo: fila.tipo,
    estado: fila.estado,
    motivo: fila.motivo,
    creadoEn: fila.creado_en,
    venceEn: fila.vence_en,
  };
}

// Quién publicó. A propósito NO lleva email ni teléfono: el enunciado dice que
// el teléfono se muestra recién con un reclamo aceptado, y eso lo decide la
// configuración del punto 2.
function toPublicadorDto(usuario, reputacion) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    fotoUrl: usuario.foto_url ?? null,
    miembroDesde: usuario.creado_en,
    reputacion: toReputacionDto(reputacion),
  };
}

// La reputación de Hallado. Cuenta casos cerrados, no estrellas: en esta app
// no se califica con puntaje sino con una valoración positiva o negativa
// (punto 10), que se va a sumar acá cuando exista.
function toReputacionDto(fila) {
  return {
    devoluciones: Number(fila?.devoluciones ?? 0),
    recuperos: Number(fila?.recuperos ?? 0),
    valoracionesPositivas: Number(fila?.valoraciones_positivas ?? 0),
    valoracionesNegativas: Number(fila?.valoraciones_negativas ?? 0),
    agradecimientos: Number(fila?.agradecimientos ?? 0),
  };
}

// El perfil público (punto 2): reputación, insignias y antigüedad. A
// propósito NO lleva teléfono, email, barrio ni publicaciones.
function toPerfilPublicoDto(usuario, reputacion, insignias) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    fotoUrl: usuario.foto_url ?? null,
    miembroDesde: usuario.creado_en,
    // Ya calculada, para que la app no tenga que hacer cuentas con fechas.
    antiguedadDias: Number(usuario.antiguedad_dias ?? 0),
    reputacion: toReputacionDto(reputacion),
    insignias,
  };
}

// Una valoración entre las dos partes de un caso.
function toValoracionDto(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    tipo: fila.tipo,
    mensaje: fila.mensaje,
    agradecimiento: fila.agradecimiento,
    creadoEn: fila.creado_en,
    autor: { id: fila.autor_id, nombre: fila.autor_nombre },
    destinatario: { id: fila.destinatario_id, nombre: fila.destinatario_nombre },
  };
}

// Un agradecimiento público, como se ve en el perfil de quien devolvió.
// Sin el tipo ni el mensaje privado: eso queda entre las dos partes.
function toAgradecimientoDto(fila) {
  return {
    id: fila.id,
    texto: fila.agradecimiento,
    fecha: fila.creado_en,
    de: { id: fila.autor_id, nombre: fila.autor_nombre },
    publicacion: { id: fila.publicacion_id, titulo: fila.pub_titulo },
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
  toDetalleDto,
  toPublicadorDto,
  toReputacionDto,
  toPerfilPublicoDto,
  toReclamoDto,
  toReclamoResumenDto,
  toCasoDto,
  toValoracionDto,
  toAgradecimientoDto,
};
