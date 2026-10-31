// CAPA DE SERVICIO: punto 8 de Hallado, el punto de encuentro.
//
// Las dos reglas del enunciado, enteras:
//
//   - "Una vez aceptado un reclamo, quien tiene el objeto propone un punto
//     de encuentro, y la otra parte puede aceptarlo o sugerir uno
//     alternativo."
//   - "El punto de encuentro se debe poder visualizar con un botón 'Cómo
//     llegar' que abre Google Maps (...) con la dirección precargada en modo
//     navegación."
//
// La segunda es toda de la app: acá sólo hay que guardar la dirección (y las
// coordenadas, si las hay) y dejarlas salir en el DTO. El backend no arma
// ninguna URL de Maps: eso depende del sistema operativo del teléfono y no
// del servidor.
//
// Quién propone primero sale del tipo de la publicación, no de quién
// publicó:
//
//   - ENCONTRE (alguien encontró algo): el objeto lo tiene el PUBLICADOR, y
//     quien reclama es el dueño que dice "es mío".
//   - PERDI (alguien perdió algo): el objeto lo tiene el RECLAMANTE, que lo
//     encontró y avisó "lo encontré". El publicador es el dueño.
//
// Después de la primera propuesta los dos pueden proponer: contraproponer es
// proponer de nuevo. Lo único que no se repite es el arranque.
//
// Esto NO cierra el caso. Aceptar el reclamo es lo que lo cierra (punto 7) y
// lo que lo mete en el historial (punto 10); acá se acuerda dónde juntarse
// para concretar una devolución que el sistema ya dio por hecha. Agregar un
// estado nuevo a la publicación rompería el punto 4, que enumera exactamente
// tres: "abierta, en reclamo, resuelta".
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toEncuentroDto } = require('../dtos/halladoDto');
const { validarCoordenadas } = require('./halladoPublicarService');

const DIRECCION_MAX = 255;

// Trae el reclamo, su publicación y el punto de encuentro vigente (si hay)
// de una sola vez. El LEFT JOIN es lo que permite que "todavía no hay
// propuesta" sea un caso normal y no un error.
const SELECT_CONTEXTO = `
  SELECT r.id            AS reclamo_id,
         r.estado        AS reclamo_estado,
         r.reclamante_id,
         p.id            AS publicacion_id,
         p.tipo          AS pub_tipo,
         p.titulo        AS pub_titulo,
         p.usuario_id    AS publicador_id,
         e.propuesto_por,
         e.direccion,
         e.lat,
         e.lng,
         e.estado        AS encuentro_estado,
         e.version       AS encuentro_version
    FROM hallado_reclamos r
    JOIN hallado_publicaciones p ON p.id = r.publicacion_id
    LEFT JOIN hallado_encuentros e ON e.reclamo_id = r.id
   WHERE r.id = ?
   LIMIT 1
`;

// ---------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id del reclamo no es válido', 'ID_INVALIDO');
  }
  return id;
}

function validarDireccion(valor) {
  const limpio = String(valor ?? '').trim();
  if (limpio === '') {
    throw ApiError.badRequest(
      'Escribí la dirección del encuentro',
      'DIRECCION_REQUERIDA'
    );
  }
  if (limpio.length > DIRECCION_MAX) {
    throw ApiError.badRequest(
      `La dirección no puede tener más de ${DIRECCION_MAX} caracteres`,
      'DIRECCION_LARGA'
    );
  }
  return limpio;
}

// La app manda la versión que tenía en pantalla. 0 significa "no había
// ninguna propuesta cuando abrí esto".
function validarVersion(valor) {
  const version = Number(valor ?? 0);
  if (!Number.isInteger(version) || version < 0) {
    throw ApiError.badRequest('La versión no es válida', 'VERSION_INVALIDA');
  }
  return version;
}

// ---------------------------------------------------------------
// Quién es quién
// ---------------------------------------------------------------

// Un tercero recibe 404 y no 403: si respondiéramos "prohibido", el que
// prueba ids averiguaría cuáles existen. Misma decisión que en el resto de
// Hallado.
async function leerContexto(reclamoId, usuarioId) {
  const id = validarId(reclamoId);
  const [filas] = await pool.query(SELECT_CONTEXTO, [id]);
  const fila = filas[0];

  if (!fila) {
    throw ApiError.notFound('Reclamo no encontrado', 'RECLAMO_NO_ENCONTRADO');
  }

  const soyElReclamante = fila.reclamante_id === usuarioId;
  const soyElPublicador = fila.publicador_id === usuarioId;
  if (!soyElReclamante && !soyElPublicador) {
    throw ApiError.notFound('Reclamo no encontrado', 'RECLAMO_NO_ENCONTRADO');
  }

  if (fila.reclamo_estado !== 'ACEPTADO') {
    throw ApiError.conflict(
      'El punto de encuentro se acuerda después de aceptar el reclamo',
      'RECLAMO_NO_ACEPTADO'
    );
  }

  // "Quien tiene el objeto": el que lo tiene en la mano, que depende del
  // tipo de publicación y no de quién la escribió.
  const tieneElObjeto =
    fila.pub_tipo === 'ENCONTRE' ? fila.publicador_id : fila.reclamante_id;

  return { ...fila, usuarioId, tieneElObjeto };
}

// Qué puede hacer la persona ahora mismo. La app dibuja los botones con
// esto y no vuelve a razonar las reglas: si las decidiera por su cuenta,
// habría dos versiones de la misma regla y se irían separando.
function permisos(contexto) {
  const { usuarioId, tieneElObjeto, encuentro_estado, propuesto_por } = contexto;

  // Todavía nadie propuso: arranca el que tiene el objeto.
  if (!encuentro_estado) {
    return { puedoProponer: usuarioId === tieneElObjeto, puedoAceptar: false };
  }

  // Ya está acordado: el enunciado no pide poder cambiarlo después.
  if (encuentro_estado === 'ACEPTADO') {
    return { puedoProponer: false, puedoAceptar: false };
  }

  // Hay una propuesta esperando. La mía, a esperar; la de la otra persona,
  // a aceptarla o sugerir otra.
  const esMia = propuesto_por === usuarioId;
  return { puedoProponer: !esMia, puedoAceptar: !esMia };
}

function armarDto(contexto) {
  return toEncuentroDto(contexto, permisos(contexto));
}

// ---------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------

// GET /api/hallado/reclamos/:id/encuentro
async function obtener(reclamoId, usuarioId) {
  return armarDto(await leerContexto(reclamoId, usuarioId));
}

// POST /api/hallado/reclamos/:id/encuentro
//   { direccion, lat?, lng?, version }
//
// Sirve para la primera propuesta y para cada contrapropuesta: las dos
// escriben la misma fila. Lo que cambia es quién tiene permiso.
async function proponer(reclamoId, usuarioId, datos = {}) {
  const contexto = await leerContexto(reclamoId, usuarioId);
  const direccion = validarDireccion(datos.direccion);
  const { lat, lng } = validarCoordenadas(datos.lat, datos.lng);
  const version = validarVersion(datos.version);

  const { puedoProponer } = permisos(contexto);
  if (!puedoProponer) {
    const [mensaje, codigo] = motivoParaNoProponer(contexto);
    throw ApiError.forbidden(mensaje, codigo);
  }

  // La versión que vio la app tiene que ser la que está guardada. Si no, el
  // otro cambió algo mientras ésta miraba: se rechaza y la app recarga.
  const actual = contexto.encuentro_version ?? 0;
  if (version !== actual) {
    throw ApiError.conflict(
      'El punto de encuentro cambió mientras lo mirabas. Actualizá para ver la propuesta nueva.',
      'ENCUENTRO_CAMBIO'
    );
  }

  // Una sola sentencia para crear o reemplazar. El UNIQUE de reclamo_id es
  // lo que decide cuál de las dos ramas corre, así que dos propuestas
  // simultáneas no pueden dejar dos filas: la segunda actualiza la primera.
  //
  // La condición del WHERE del UPDATE no se puede poner acá, y por eso se
  // valida la versión arriba: entre esa lectura y este INSERT hay una
  // ventana mínima en la que los dos podrían escribir. El caso es inocuo
  // (queda la propuesta del que llegó último, que es lo mismo que pasaría
  // si hubiera tocado el botón medio segundo después) y lo que importa, que
  // es no cerrar un acuerdo sobre un lugar que nadie está viendo, lo cubre
  // el chequeo de aceptar.
  await pool.query(
    `INSERT INTO hallado_encuentros
       (reclamo_id, propuesto_por, direccion, lat, lng, estado, version)
     VALUES (?, ?, ?, ?, ?, 'PROPUESTO', 1)
     ON DUPLICATE KEY UPDATE
       propuesto_por = VALUES(propuesto_por),
       direccion     = VALUES(direccion),
       lat           = VALUES(lat),
       lng           = VALUES(lng),
       estado        = 'PROPUESTO',
       version       = version + 1`,
    [contexto.reclamo_id, usuarioId, direccion, lat, lng]
  );

  return armarDto(await leerContexto(reclamoId, usuarioId));
}

// Por qué no puede proponer, en palabras que la app pueda mostrar tal cual.
function motivoParaNoProponer(contexto) {
  if (contexto.encuentro_estado === 'ACEPTADO') {
    return ['El punto de encuentro ya está acordado', 'ENCUENTRO_ACORDADO'];
  }
  if (contexto.encuentro_estado === 'PROPUESTO') {
    return [
      'Tu propuesta está esperando respuesta',
      'ENCUENTRO_ESPERA_RESPUESTA',
    ];
  }
  return [
    'La primera propuesta la hace quien tiene el objeto',
    'NO_TENES_EL_OBJETO',
  ];
}

// POST /api/hallado/reclamos/:id/encuentro/aceptar   { version }
//
// Sólo acepta la otra parte, y sólo la propuesta que tenía en pantalla.
async function aceptar(reclamoId, usuarioId, datos = {}) {
  const contexto = await leerContexto(reclamoId, usuarioId);
  const version = validarVersion(datos.version);

  if (!contexto.encuentro_estado) {
    throw ApiError.conflict(
      'Todavía no hay un punto de encuentro propuesto',
      'ENCUENTRO_INEXISTENTE'
    );
  }
  if (contexto.encuentro_estado === 'ACEPTADO') {
    throw ApiError.conflict(
      'El punto de encuentro ya está acordado',
      'ENCUENTRO_ACORDADO'
    );
  }
  if (contexto.propuesto_por === usuarioId) {
    throw ApiError.forbidden(
      'Tu propia propuesta la acepta la otra persona',
      'PROPUESTA_PROPIA'
    );
  }

  // El UPDATE lleva la versión en el WHERE: si entre la lectura de arriba y
  // esta línea la otra persona contrapropuso, no toca ninguna fila y se
  // responde el conflicto. Esto es lo que hace que aceptar sea seguro.
  const [resultado] = await pool.query(
    `UPDATE hallado_encuentros
        SET estado = 'ACEPTADO', version = version + 1
      WHERE reclamo_id = ? AND version = ? AND estado = 'PROPUESTO'`,
    [contexto.reclamo_id, version]
  );

  if (resultado.affectedRows === 0) {
    throw ApiError.conflict(
      'El punto de encuentro cambió mientras lo mirabas. Actualizá para ver la propuesta nueva.',
      'ENCUENTRO_CAMBIO'
    );
  }

  return armarDto(await leerContexto(reclamoId, usuarioId));
}

module.exports = { obtener, proponer, aceptar };
