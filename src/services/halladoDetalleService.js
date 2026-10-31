// CAPA DE SERVICIO: punto 4 de Hallado, el detalle de una publicación.
//
// Es la pantalla a la que se llega desde los resultados del punto 3, y desde
// la que salen los reclamos del punto 7. Lo que devuelve depende de QUIÉN
// está mirando:
//
//   - el publicador ve la dirección exacta y accede a la gestión;
//   - un tercero ve todo menos la dirección, y puede reclamar;
//   - sin sesión se ve lo mismo que un tercero, pero sin acciones.
//
// La regla que el enunciado marca como importante: "la dirección exacta no
// se muestra hasta que el reclamo sea aceptado". Acá se resuelve con
// `verDireccion`: la ve el publicador y quien tenga un reclamo ACEPTADO
// sobre esta publicación (punto 7). Nadie más.
const ApiError = require('../utils/ApiError');
const { toDetalleDto } = require('../dtos/halladoDto');
const { pool } = require('../config/db');
const { SELECT_PUBLICACION, buscarFotos } = require('./halladoPublicarService');
const { obtenerReputacion } = require('./halladoReputacionService');
const { estadoDeSeguimiento, marcarVista } = require('./halladoSeguirService');
const reclamos = require('./halladoReclamoService');

// Sólo se puede reclamar sobre algo que todavía está en juego. Una RESUELTA
// ya encontró a su dueño y una VENCIDA quedó sin renovar.
const ESTADOS_RECLAMABLES = ['ABIERTA', 'EN_RECLAMO'];

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de la publicación no es válido', 'ID_INVALIDO');
  }
  return id;
}

async function buscarPublicador(usuarioId) {
  const [filas] = await pool.query(
    'SELECT id, nombre, foto_url, creado_en FROM usuarios WHERE id = ? LIMIT 1',
    [usuarioId]
  );
  return filas[0] || null;
}

// GET /api/hallado/publicaciones/:id
//
// usuarioId puede ser null: la ruta es pública, con token opcional.
async function obtenerDetalle(publicacionId, usuarioId = null) {
  const id = validarId(publicacionId);

  // Antes de leer, lo que venció se marca: si no, el detalle mostraría un
  // reclamo pendiente que ya no lo está.
  await reclamos.vencerReclamos();

  const [filas] = await pool.query(`${SELECT_PUBLICACION} WHERE p.id = ? LIMIT 1`, [id]);
  const publicacion = filas[0];
  if (!publicacion) {
    throw ApiError.notFound('Esa publicación no existe', 'PUBLICACION_NO_ENCONTRADA');
  }

  const esPublicador = usuarioId !== null && publicacion.usuario_id === usuarioId;

  // Las fotos, el publicador, su reputación y los reclamos no dependen entre sí: van en
  // paralelo y la respuesta tarda lo que tarda la más lenta, no la suma.
  const [fotosPorPublicacion, publicador, reputacion, seguimiento, misReclamos] = await Promise.all([
    buscarFotos([id]),
    buscarPublicador(publicacion.usuario_id),
    obtenerReputacion(publicacion.usuario_id),
    estadoDeSeguimiento(id, usuarioId),
    reclamos.resumenParaDetalle(id, usuarioId),
  ]);

  const estado = publicacion.estado_efectivo ?? publicacion.estado;

  // Punto 9: abrir una publicación seguida es ver su novedad. Desde acá el
  // estado actual pasa a ser el visto y el indicador de "Seguidas" se apaga.
  await marcarVista(id, usuarioId, estado);

  // Las acciones se deciden acá y no en la app: si la app las calculara
  // sola, un cambio de regla (por ejemplo, el tope de intentos del punto 7)
  // habría que repetirlo en los dos lados y se desincronizarían.
  const acciones = {
    esPublicador,
    // Punto 7: además de que la publicación esté en juego, hacen falta
    // intentos y no tener ya un reclamo esperando respuesta.
    puedeReclamar:
      usuarioId !== null
      && !esPublicador
      && ESTADOS_RECLAMABLES.includes(estado)
      && misReclamos.intentosRestantes > 0
      && misReclamos.miReclamo?.estado !== 'PENDIENTE',
    // Qué dice el botón: en algo encontrado un tercero indica "Es mío"; en
    // algo perdido, "Lo encontré". Viaja siempre, aunque no se pueda
    // reclamar, para que la app sepa qué texto mostrar atenuado.
    reclamo: publicacion.tipo === 'ENCONTRE' ? 'ES_MIO' : 'LO_ENCONTRE',
    // Seguir lo propio no tiene sentido: las novedades ya le llegan por
    // ser el publicador.
    puedeSeguir: usuarioId !== null && !esPublicador,
  };

  return {
    publicacion: toDetalleDto(publicacion, fotosPorPublicacion.get(id) ?? [], {
      verDireccion: esPublicador || misReclamos.miReclamo?.estado === 'ACEPTADO',
      publicador,
      reputacion,
      seguimiento,
      reclamos: misReclamos,
    }),
    acciones,
  };
}

module.exports = { obtenerDetalle };
