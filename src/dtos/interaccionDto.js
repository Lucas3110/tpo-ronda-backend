// DTOs de preguntas y ofertas (Punto 4).

function toPreguntaDto(fila) {
  return {
    id: fila.id,
    texto: fila.texto,
    respuesta: fila.respuesta,
    respondida: Boolean(fila.respuesta),
    respondidaEn: fila.respondida_en,
    creadoEn: fila.creado_en,
    autor: {
      id: fila.usuario_id,
      nombre: fila.autor_nombre,
    },
  };
}

function toOfertaDto(fila) {
  return {
    id: fila.id,
    monto: Number(fila.monto),
    estado: fila.estado,
    respondidaEn: fila.respondida_en,
    creadoEn: fila.creado_en,
    // Al vendedor le interesa saber quién ofertó; al que ofertó, no le
    // decimos quiénes son los demás (el service filtra qué ofertas ve cada uno).
    autor: {
      id: fila.usuario_id,
      nombre: fila.autor_nombre,
    },
  };
}

/**
 * Qué puede hacer quien está mirando la publicación.
 *
 * El enunciado lo pide explícitamente: "acciones disponibles según quién esté
 * mirando". Calcularlo en el backend evita que cada pantalla de la app tenga
 * que repetir la misma lógica, y que un cliente viejo muestre un botón que
 * ya no corresponde.
 */
function toAccionesDto({ esVendedor, autenticado, publicacionActiva }) {
  if (!autenticado) {
    // Visitante sin sesión: sólo puede mirar.
    return {
      puedePreguntar: false,
      puedeOfertar: false,
      puedeGuardar: false,
      puedeGestionar: false,
      requiereSesion: true,
    };
  }

  if (esVendedor) {
    // El dueño no se pregunta ni se oferta a sí mismo: gestiona.
    return {
      puedePreguntar: false,
      puedeOfertar: false,
      puedeGuardar: false,
      puedeGestionar: true,
      requiereSesion: false,
    };
  }

  return {
    puedePreguntar: publicacionActiva,
    puedeOfertar: publicacionActiva,
    puedeGuardar: true, // guardar un aviso pausado o vendido es válido
    puedeGestionar: false,
    requiereSesion: false,
  };
}

module.exports = { toPreguntaDto, toOfertaDto, toAccionesDto };
