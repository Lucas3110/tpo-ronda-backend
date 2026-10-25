// CAPA DE SERVICIO: punto 5 de Hallado, publicar un hallazgo o una pérdida.
//
// Los controllers sólo traducen HTTP; toda la regla de negocio vive acá.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const {
  toCategoriaDto,
  toBarrioDto,
  toPublicacionDto,
  toPublicacionPropiaDto,
} = require('../dtos/halladoDto');

const TIPOS = ['PERDI', 'ENCONTRE'];
const FRANJAS = ['MANANA', 'TARDE', 'NOCHE', 'NO_SE'];

const TITULO_MAX = 80;
const DESCRIPCION_MAX = 2000;
const PREGUNTA_MAX = 255;
const RESPUESTA_MAX = 255;
const DIRECCION_MAX = 255;
const DIAS_VIGENCIA = 30;
const MAX_FOTOS = 8;

// Hasta cuántos años para atrás aceptamos una fecha del suceso. No es un
// capricho: sin un piso, un error de tipeo mete una publicación de 1925 y el
// filtro "última semana" del punto 3 empieza a devolver cosas raras.
const ANIOS_MAX_ATRAS = 5;

// ---------------------------------------------------------------
// La publicación "efectiva" y su estado
// ---------------------------------------------------------------
//
// El estado VENCIDA no se guarda: se deduce comparando vence_en con NOW().
// Guardarlo obligaría a una tarea programada que marque las vencidas todas
// las noches, y si esa tarea no corre una vez, la app miente.
const SELECT_PUBLICACION = `
  SELECT p.*,
         c.nombre AS categoria_nombre,
         z.nombre AS barrio_nombre,
         u.nombre AS publicador_nombre,
         IF(p.estado = 'ABIERTA' AND p.vence_en < NOW(), 'VENCIDA', p.estado) AS estado_efectivo,
         GREATEST(0, DATEDIFF(p.vence_en, NOW())) AS dias_para_vencer
    FROM hallado_publicaciones p
    JOIN hallado_categorias c ON c.id = p.categoria_id
    JOIN zonas z             ON z.id = p.barrio_id
    JOIN usuarios u          ON u.id = p.usuario_id
`;

// ---------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------

function validarTipo(tipo) {
  if (!TIPOS.includes(tipo)) {
    throw ApiError.badRequest(`El tipo debe ser uno de: ${TIPOS.join(', ')}`, 'TIPO_INVALIDO');
  }
  return tipo;
}

function validarTexto(valor, { campo, codigo, max, obligatorio }) {
  const limpio = String(valor ?? '').trim();
  if (limpio === '') {
    if (obligatorio) {
      throw ApiError.badRequest(`${campo} es obligatorio`, `${codigo}_REQUERIDO`);
    }
    return null;
  }
  if (limpio.length > max) {
    throw ApiError.badRequest(
      `${campo} no puede tener más de ${max} caracteres`,
      `${codigo}_LARGO`
    );
  }
  return limpio;
}

// La fecha llega como 'YYYY-MM-DD'. Comparamos en texto y no con Date para
// no meter zonas horarias en el medio: 'hoy' acá es el día del servidor, que
// es el mismo que usa MySQL con NOW().
function validarFechaSuceso(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw ApiError.badRequest(
      'La fecha del suceso tiene que venir como AAAA-MM-DD',
      'FECHA_INVALIDA'
    );
  }

  const fecha = new Date(`${texto}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) {
    throw ApiError.badRequest('Esa fecha no existe', 'FECHA_INVALIDA');
  }

  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  if (fecha > hoy) {
    throw ApiError.badRequest(
      'La fecha del suceso no puede ser futura',
      'FECHA_FUTURA'
    );
  }

  const piso = new Date();
  piso.setFullYear(piso.getFullYear() - ANIOS_MAX_ATRAS);
  if (fecha < piso) {
    throw ApiError.badRequest(
      `La fecha del suceso no puede ser de hace más de ${ANIOS_MAX_ATRAS} años`,
      'FECHA_MUY_VIEJA'
    );
  }

  return texto;
}

function validarFranja(valor) {
  const franja = String(valor ?? 'NO_SE').trim().toUpperCase();
  if (!FRANJAS.includes(franja)) {
    throw ApiError.badRequest(
      `La franja horaria debe ser una de: ${FRANJAS.join(', ')}`,
      'FRANJA_INVALIDA'
    );
  }
  return franja;
}

// O vienen las dos coordenadas o ninguna. La base también lo frena con un
// CHECK, pero acá damos un mensaje que se entiende.
function validarCoordenadas(lat, lng) {
  const hayLat = lat !== undefined && lat !== null && lat !== '';
  const hayLng = lng !== undefined && lng !== null && lng !== '';

  if (!hayLat && !hayLng) return { lat: null, lng: null };

  if (hayLat !== hayLng) {
    throw ApiError.badRequest(
      'Mandá latitud y longitud juntas, o ninguna de las dos',
      'COORDENADAS_INCOMPLETAS'
    );
  }

  const latitud = Number(lat);
  const longitud = Number(lng);

  if (!Number.isFinite(latitud) || latitud < -90 || latitud > 90) {
    throw ApiError.badRequest('La latitud tiene que estar entre -90 y 90', 'LATITUD_INVALIDA');
  }
  if (!Number.isFinite(longitud) || longitud < -180 || longitud > 180) {
    throw ApiError.badRequest('La longitud tiene que estar entre -180 y 180', 'LONGITUD_INVALIDA');
  }

  return { lat: latitud, lng: longitud };
}

// La pregunta de verificación es el mecanismo que evita que cualquiera
// reclame lo que no es suyo, así que es obligatoria en las de tipo ENCONTRE
// y no tiene sentido en las de tipo PERDI (ahí la carga el que encontró).
function validarVerificacion(tipo, pregunta, respuesta) {
  if (tipo === 'ENCONTRE') {
    return {
      pregunta: validarTexto(pregunta, {
        campo: 'La pregunta de verificación',
        codigo: 'PREGUNTA',
        max: PREGUNTA_MAX,
        obligatorio: true,
      }),
      respuesta: normalizarRespuesta(
        validarTexto(respuesta, {
          campo: 'La respuesta de verificación',
          codigo: 'RESPUESTA',
          max: RESPUESTA_MAX,
          obligatorio: true,
        })
      ),
    };
  }

  if (String(pregunta ?? '').trim() !== '' || String(respuesta ?? '').trim() !== '') {
    throw ApiError.badRequest(
      'La pregunta de verificación es sólo para publicaciones de algo encontrado',
      'VERIFICACION_NO_CORRESPONDE'
    );
  }

  return { pregunta: null, respuesta: null };
}

// Se guarda normalizada para que después se pueda comparar sin que una
// mayúscula o un espacio de más den "respuesta incorrecta".
function normalizarRespuesta(valor) {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca los acentos
    .replace(/\s+/g, ' ');
}

function validarFotos(fotos) {
  if (fotos === undefined || fotos === null) return [];
  if (!Array.isArray(fotos)) {
    throw ApiError.badRequest('Las fotos tienen que venir en una lista', 'FOTOS_INVALIDAS');
  }
  if (fotos.length > MAX_FOTOS) {
    throw ApiError.badRequest(`Hasta ${MAX_FOTOS} fotos por publicación`, 'DEMASIADAS_FOTOS');
  }

  return fotos.map((url) => {
    const limpia = String(url ?? '').trim();
    if (limpia === '') {
      throw ApiError.badRequest('Hay una foto sin URL', 'FOTO_VACIA');
    }
    // Sólo http(s): un "javascript:" o un "file:" en un <Image> no sirve para
    // nada bueno, y la URL la termina abriendo la app de otra persona.
    if (!/^https?:\/\//i.test(limpia)) {
      throw ApiError.badRequest('Las fotos tienen que ser URLs http o https', 'FOTO_URL_INVALIDA');
    }
    return limpia;
  });
}

async function validarCategoria(categoriaId) {
  const [filas] = await pool.query('SELECT id FROM hallado_categorias WHERE id = ?', [categoriaId]);
  if (filas.length === 0) {
    throw ApiError.badRequest('Esa categoría no existe', 'CATEGORIA_INVALIDA');
  }
  return filas[0].id;
}

async function validarBarrio(barrioId) {
  const [filas] = await pool.query('SELECT id FROM zonas WHERE id = ?', [barrioId]);
  if (filas.length === 0) {
    throw ApiError.badRequest('Ese barrio no existe', 'BARRIO_INVALIDO');
  }
  return filas[0].id;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

async function buscarFotos(publicacionIds) {
  if (publicacionIds.length === 0) return new Map();
  const [filas] = await pool.query(
    `SELECT id, publicacion_id, url
       FROM hallado_fotos
      WHERE publicacion_id IN (?)
      ORDER BY publicacion_id, orden, id`,
    [publicacionIds]
  );
  const porPublicacion = new Map();
  for (const fila of filas) {
    if (!porPublicacion.has(fila.publicacion_id)) porPublicacion.set(fila.publicacion_id, []);
    porPublicacion.get(fila.publicacion_id).push(fila);
  }
  return porPublicacion;
}

async function buscarPublicacion(id) {
  const [filas] = await pool.query(`${SELECT_PUBLICACION} WHERE p.id = ? LIMIT 1`, [id]);
  return filas[0] || null;
}

// Varias operaciones empiezan igual: traer la publicación y chequear que sea
// de quien la pide.
async function buscarPropia(id, usuarioId) {
  const publicacion = await buscarPublicacion(id);
  if (!publicacion) {
    throw ApiError.notFound('Esa publicación no existe', 'PUBLICACION_NO_ENCONTRADA');
  }
  if (publicacion.usuario_id !== usuarioId) {
    throw ApiError.forbidden('Esa publicación no es tuya', 'NO_SOS_EL_PUBLICADOR');
  }
  return publicacion;
}

async function reemplazarFotos(publicacionId, urls) {
  await pool.query('DELETE FROM hallado_fotos WHERE publicacion_id = ?', [publicacionId]);
  if (urls.length === 0) return;
  await pool.query(
    'INSERT INTO hallado_fotos (publicacion_id, url, orden) VALUES ?',
    [urls.map((url, indice) => [publicacionId, url, indice])]
  );
}

// ---------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------

// GET /api/hallado/categorias
async function listarCategorias() {
  const [filas] = await pool.query('SELECT id, nombre FROM hallado_categorias ORDER BY orden, nombre');
  return { categorias: filas.map(toCategoriaDto) };
}

// GET /api/hallado/barrios
// Son las zonas de siempre. Lo exponemos con el nombre que usa el enunciado
// nuevo para que la app no tenga que saber que por detrás son "zonas".
async function listarBarrios() {
  const [filas] = await pool.query('SELECT id, nombre FROM zonas ORDER BY nombre');
  return { barrios: filas.map(toBarrioDto) };
}

// POST /api/hallado/publicaciones
async function crear(usuarioId, datos) {
  const tipo = validarTipo(datos.tipo);
  const titulo = validarTexto(datos.titulo, {
    campo: 'El título',
    codigo: 'TITULO',
    max: TITULO_MAX,
    obligatorio: true,
  });
  const descripcion = validarTexto(datos.descripcion, {
    campo: 'La descripción',
    codigo: 'DESCRIPCION',
    max: DESCRIPCION_MAX,
    obligatorio: false,
  });
  const direccion = validarTexto(datos.direccion, {
    campo: 'La dirección',
    codigo: 'DIRECCION',
    max: DIRECCION_MAX,
    obligatorio: false,
  });

  const fechaSuceso = validarFechaSuceso(datos.fechaSuceso);
  const franja = validarFranja(datos.franjaHoraria);
  const { lat, lng } = validarCoordenadas(datos.lat, datos.lng);
  const verificacion = validarVerificacion(tipo, datos.preguntaVerificacion, datos.respuestaVerificacion);
  const fotos = validarFotos(datos.fotos);

  const categoriaId = await validarCategoria(datos.categoriaId);
  const barrioId = await validarBarrio(datos.barrioId);

  const [resultado] = await pool.query(
    `INSERT INTO hallado_publicaciones
       (usuario_id, tipo, categoria_id, titulo, descripcion, fecha_suceso,
        franja_horaria, barrio_id, direccion, lat, lng,
        pregunta_verificacion, respuesta_verificacion, vence_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [
      usuarioId, tipo, categoriaId, titulo, descripcion, fechaSuceso,
      franja, barrioId, direccion, lat, lng,
      verificacion.pregunta, verificacion.respuesta, DIAS_VIGENCIA,
    ]
  );

  await reemplazarFotos(resultado.insertId, fotos);
  return obtenerPropia(resultado.insertId, usuarioId);
}

// PATCH /api/hallado/publicaciones/:id
//
// Sólo se edita lo que no cambia la identidad de la publicación. El tipo no
// se puede cambiar: una pérdida que se convierte en hallazgo invalidaría los
// reclamos que ya tenga encima.
async function editar(id, usuarioId, datos) {
  const actual = await buscarPropia(id, usuarioId);

  if (actual.estado_efectivo === 'RESUELTA') {
    throw ApiError.conflict(
      'Una publicación resuelta ya no se edita',
      'PUBLICACION_RESUELTA'
    );
  }
  if (datos.tipo !== undefined && datos.tipo !== actual.tipo) {
    throw ApiError.badRequest(
      'El tipo de la publicación no se puede cambiar',
      'TIPO_NO_EDITABLE'
    );
  }

  const campos = {};

  if (datos.titulo !== undefined) {
    campos.titulo = validarTexto(datos.titulo, {
      campo: 'El título', codigo: 'TITULO', max: TITULO_MAX, obligatorio: true,
    });
  }
  if (datos.descripcion !== undefined) {
    campos.descripcion = validarTexto(datos.descripcion, {
      campo: 'La descripción', codigo: 'DESCRIPCION', max: DESCRIPCION_MAX, obligatorio: false,
    });
  }
  if (datos.direccion !== undefined) {
    campos.direccion = validarTexto(datos.direccion, {
      campo: 'La dirección', codigo: 'DIRECCION', max: DIRECCION_MAX, obligatorio: false,
    });
  }
  if (datos.fechaSuceso !== undefined) {
    campos.fecha_suceso = validarFechaSuceso(datos.fechaSuceso);
  }
  if (datos.franjaHoraria !== undefined) {
    campos.franja_horaria = validarFranja(datos.franjaHoraria);
  }
  if (datos.lat !== undefined || datos.lng !== undefined) {
    const coordenadas = validarCoordenadas(datos.lat, datos.lng);
    campos.lat = coordenadas.lat;
    campos.lng = coordenadas.lng;
  }
  if (datos.categoriaId !== undefined) {
    campos.categoria_id = await validarCategoria(datos.categoriaId);
  }
  if (datos.barrioId !== undefined) {
    campos.barrio_id = await validarBarrio(datos.barrioId);
  }
  if (datos.preguntaVerificacion !== undefined || datos.respuestaVerificacion !== undefined) {
    const verificacion = validarVerificacion(
      actual.tipo,
      datos.preguntaVerificacion ?? actual.pregunta_verificacion,
      datos.respuestaVerificacion ?? actual.respuesta_verificacion
    );
    campos.pregunta_verificacion = verificacion.pregunta;
    campos.respuesta_verificacion = verificacion.respuesta;
  }

  const nombres = Object.keys(campos);
  if (nombres.length > 0) {
    await pool.query(
      `UPDATE hallado_publicaciones SET ${nombres.map((n) => `${n} = ?`).join(', ')} WHERE id = ?`,
      [...nombres.map((n) => campos[n]), id]
    );
  }

  if (datos.fotos !== undefined) {
    await reemplazarFotos(id, validarFotos(datos.fotos));
  }

  return obtenerPropia(id, usuarioId);
}

// GET /api/hallado/publicaciones/mias
async function listarMias(usuarioId, { estado } = {}) {
  const condiciones = ['p.usuario_id = ?'];
  const parametros = [usuarioId];

  if (estado) {
    const buscado = String(estado).trim().toUpperCase();
    const permitidos = ['ABIERTA', 'EN_RECLAMO', 'RESUELTA', 'VENCIDA'];
    if (!permitidos.includes(buscado)) {
      throw ApiError.badRequest(
        `El estado debe ser uno de: ${permitidos.join(', ')}`,
        'ESTADO_INVALIDO'
      );
    }
    // Se filtra por el estado efectivo, no por la columna: si no, pedir las
    // VENCIDAS no devolvería ninguna, porque en la columna siguen ABIERTAS.
    condiciones.push(
      "IF(p.estado = 'ABIERTA' AND p.vence_en < NOW(), 'VENCIDA', p.estado) = ?"
    );
    parametros.push(buscado);
  }

  const [filas] = await pool.query(
    `${SELECT_PUBLICACION} WHERE ${condiciones.join(' AND ')} ORDER BY p.creado_en DESC`,
    parametros
  );

  const fotosPorPublicacion = await buscarFotos(filas.map((f) => f.id));

  // El resumen cuenta TODAS las publicaciones de la persona, no las que
  // quedaron después del filtro. Es lo que la app necesita para las solapas:
  // si contara lo filtrado, al pararse en "Vencidas" diría "Abiertas: 0" y
  // parecería que no tiene ninguna.
  const [todas] = await pool.query(
    `SELECT IF(estado = 'ABIERTA' AND vence_en < NOW(), 'VENCIDA', estado) AS estado_efectivo
       FROM hallado_publicaciones
      WHERE usuario_id = ?`,
    [usuarioId]
  );

  return {
    publicaciones: filas.map((fila) =>
      toPublicacionPropiaDto(fila, fotosPorPublicacion.get(fila.id) ?? [])
    ),
    resumen: contarPorEstado(todas),
  };
}

function contarPorEstado(filas) {
  const resumen = { abiertas: 0, enReclamo: 0, resueltas: 0, vencidas: 0 };
  for (const fila of filas) {
    if (fila.estado_efectivo === 'ABIERTA') resumen.abiertas += 1;
    else if (fila.estado_efectivo === 'EN_RECLAMO') resumen.enReclamo += 1;
    else if (fila.estado_efectivo === 'RESUELTA') resumen.resueltas += 1;
    else if (fila.estado_efectivo === 'VENCIDA') resumen.vencidas += 1;
  }
  return resumen;
}

// Devuelve una publicación propia, con la dirección a la vista: es de quien
// la pide, así que no hay nada que ocultarle.
async function obtenerPropia(id, usuarioId) {
  const publicacion = await buscarPropia(id, usuarioId);
  const fotos = (await buscarFotos([id])).get(id) ?? [];
  return { publicacion: toPublicacionDto(publicacion, fotos, { verDireccion: true }) };
}

// POST /api/hallado/publicaciones/:id/renovar
//
// "Las publicaciones vencen a los 30 días y pueden renovarse." Renovar es
// correr el vencimiento 30 días desde ahora, no desde el vencimiento viejo:
// si no, renovar una que venció hace dos meses la dejaría vencida igual.
async function renovar(id, usuarioId) {
  const publicacion = await buscarPropia(id, usuarioId);

  if (publicacion.estado_efectivo === 'RESUELTA') {
    throw ApiError.conflict(
      'Esa publicación ya está resuelta, no hace falta renovarla',
      'PUBLICACION_RESUELTA'
    );
  }

  await pool.query(
    'UPDATE hallado_publicaciones SET vence_en = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?',
    [DIAS_VIGENCIA, id]
  );

  return obtenerPropia(id, usuarioId);
}

// DELETE /api/hallado/publicaciones/:id
async function eliminar(id, usuarioId) {
  const publicacion = await buscarPropia(id, usuarioId);

  // Con un reclamo encima hay otra persona esperando una respuesta. Borrarla
  // la dejaría sin saber qué pasó.
  if (publicacion.estado_efectivo === 'EN_RECLAMO') {
    throw ApiError.conflict(
      'Esa publicación tiene un reclamo pendiente: respondelo antes de borrarla',
      'PUBLICACION_EN_RECLAMO'
    );
  }

  await pool.query('DELETE FROM hallado_publicaciones WHERE id = ?', [id]);
  return { mensaje: 'Publicación eliminada' };
}

module.exports = {
  listarCategorias,
  listarBarrios,
  crear,
  editar,
  listarMias,
  obtenerPropia,
  renovar,
  eliminar,
  // Para que el punto 3 y el 4 reusen la misma consulta y el mismo DTO.
  SELECT_PUBLICACION,
  buscarFotos,
  normalizarRespuesta,
};
