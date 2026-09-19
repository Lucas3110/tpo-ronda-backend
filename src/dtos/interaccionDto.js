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

const ESTADOS_OFERTA = {
  PENDIENTE: 'Pendiente',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  VENCIDA: 'Vencida',
};

function toOfertaDto(fila) {
  return {
    id: fila.id,
    monto: Number(fila.monto),
    // Punto 7: "acompañado de un mensaje breve opcional".
    mensaje: fila.mensaje ?? null,
    estado: fila.estado,
    estadoTexto: ESTADOS_OFERTA[fila.estado] ?? fila.estado,
    // Quién propuso este monto. En una contraoferta es el vendedor, y eso
    // cambia de qué lado está el botón de aceptar.
    origen: fila.origen ?? 'COMPRADOR',
    esContraoferta: fila.contraoferta_de_id !== null && fila.contraoferta_de_id !== undefined,
    contraofertaDeId: fila.contraoferta_de_id ?? null,
    respondidaEn: fila.respondida_en,
    expiraEn: fila.expira_en ?? null,
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
 * Fila de "Mis ofertas" (Punto 7). Es la oferta más el contexto mínimo de la
 * publicación, para que la pantalla se dibuje sin pedir el detalle de cada una.
 */
function toOfertaConPublicacionDto(fila) {
  return {
    ...toOfertaDto(fila),
    publicacion: {
      id: fila.publicacion_id,
      titulo: fila.publicacion_titulo,
      precio: Number(fila.publicacion_precio),
      estado: fila.publicacion_estado,
      fotoPrincipal: fila.foto_principal ?? null,
    },
    contraparte: {
      id: fila.contraparte_id,
      nombre: fila.contraparte_nombre,
    },
    // true = me toca responder a mí. Lo calcula el backend para que la app
    // no tenga que cruzar origen, estado y quién soy en cada fila.
    esperaMiRespuesta: Boolean(fila.espera_mi_respuesta),
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

module.exports = {
  toPreguntaDto,
  toOfertaDto,
  toOfertaConPublicacionDto,
  toAccionesDto,
};
