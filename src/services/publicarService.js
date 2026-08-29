// Punto 5: alta y gestión de las publicaciones propias.
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const {
  toPublicacionListadoDto,
  toPaginaDto,
} = require('../dtos/publicacionDto');

const TITULO_MAX = 120;
const DESCRIPCION_MAX = 5000;
const PRECIO_MAX = 99999999.99; // lo que entra en DECIMAL(12,2)
const FOTOS_MAX = 10;

const ESTADOS_ARTICULO = ['NUEVO', 'COMO_NUEVO', 'USADO'];
const ESTADOS_PUBLICACION = ['ACTIVA', 'PAUSADA', 'VENDIDA'];

// Transiciones permitidas. Tenerlas como diccionario evita que se cuelen
// cambios sin sentido, como "revivir" algo que ya se vendió.
const TRANSICIONES = {
  ACTIVA: ['PAUSADA', 'VENDIDA'],
  PAUSADA: ['ACTIVA', 'VENDIDA'],
  VENDIDA: [], // una vez vendida, la publicación queda cerrada
};

// ---------------------------------------------------------------
// Validaciones del alta
// ---------------------------------------------------------------
function validarTexto(valor, campo, max, codigoVacio) {
  const limpio = String(valor ?? '').trim();
  if (limpio === '') {
    throw ApiError.badRequest(`${campo} es obligatorio`, codigoVacio);
  }
  if (limpio.length > max) {
    throw ApiError.badRequest(
      `${campo} no puede tener más de ${max} caracteres`,
      `${codigoVacio.replace('_REQUERIDO', '')}_LARGO`
    );
  }
  return limpio;
}

function validarPrecio(precio) {
  const valor = Number(precio);
  if (precio === undefined || precio === null || precio === '' || Number.isNaN(valor)) {
    throw ApiError.badRequest('El precio es obligatorio', 'PRECIO_REQUERIDO');
  }
  if (valor < 0) {
    throw ApiError.badRequest('El precio no puede ser negativo', 'PRECIO_INVALIDO');
  }
  if (valor > PRECIO_MAX) {
    throw ApiError.badRequest('El precio es demasiado alto', 'PRECIO_INVALIDO');
  }
  // Dos decimales, que es lo que guarda la columna.
  return Math.round(valor * 100) / 100;
}

function validarEstadoArticulo(estado) {
  const valor = String(estado ?? '').trim().toUpperCase();
  if (!ESTADOS_ARTICULO.includes(valor)) {
    throw ApiError.badRequest(
      `El estado del artículo debe ser uno de: ${ESTADOS_ARTICULO.join(', ')}`,
      'ESTADO_ARTICULO_INVALIDO'
    );
  }
  return valor;
}

async function validarReferencia(tabla, id, campo, codigo) {
  const valor = Number(id);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw ApiError.badRequest(`${campo} es obligatorio`, codigo);
  }
  const [filas] = await pool.query(`SELECT id FROM ${tabla} WHERE id = ? LIMIT 1`, [valor]);
  if (filas.length === 0) {
    throw ApiError.badRequest(`${campo} no existe`, codigo);
  }
  return valor;
}

function validarFotos(fotos) {
  if (fotos === undefined || fotos === null) return [];
  if (!Array.isArray(fotos)) {
    throw ApiError.badRequest('Las fotos tienen que venir en una lista', 'FOTOS_INVALIDAS');
  }
  if (fotos.length > FOTOS_MAX) {
    throw ApiError.badRequest(
      `No se pueden subir más de ${FOTOS_MAX} fotos`,
      'DEMASIADAS_FOTOS'
    );
  }
  return fotos.map((url, i) => {
    const limpio = String(url ?? '').trim();
    if (limpio === '' || limpio.length > 500) {
      throw ApiError.badRequest(`La foto ${i + 1} no es válida`, 'FOTO_INVALIDA');
    }
    return limpio;
  });
}

async function validarAlta(datos) {
  return {
    titulo: validarTexto(datos.titulo, 'El título', TITULO_MAX, 'TITULO_REQUERIDO'),
    descripcion: validarTexto(
      datos.descripcion, 'La descripción', DESCRIPCION_MAX, 'DESCRIPCION_REQUERIDA'
    ),
    precio: validarPrecio(datos.precio),
    estadoArticulo: validarEstadoArticulo(datos.estadoArticulo),
    categoriaId: await validarReferencia(
      'categorias', datos.categoriaId, 'La categoría', 'CATEGORIA_REQUERIDA'
    ),
    zonaId: await validarReferencia(
      'zonas', datos.zonaId, 'La zona de entrega', 'ZONA_REQUERIDA'
    ),
    fotos: validarFotos(datos.fotos),
  };
}

/** Trae la publicación y verifica que sea de quien la está tocando. */
async function buscarPropia(publicacionId, usuarioId) {
  const id = Number(publicacionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de publicación no es válido', 'ID_INVALIDO');
  }
  const [filas] = await pool.query('SELECT * FROM publicaciones WHERE id = ? LIMIT 1', [id]);
  const publicacion = filas[0];
  if (!publicacion) {
    throw ApiError.notFound('La publicación no existe', 'PUBLICACION_NO_ENCONTRADA');
  }
  if (publicacion.vendedor_id !== usuarioId) {
    throw ApiError.forbidden('Esa publicación no es tuya', 'NO_SOS_EL_VENDEDOR');
  }
  return publicacion;
}

async function guardarFotos(conexion, publicacionId, fotos) {
  await conexion.query('DELETE FROM fotos_publicacion WHERE publicacion_id = ?', [publicacionId]);
  for (const [orden, url] of fotos.entries()) {
    await conexion.query(
      'INSERT INTO fotos_publicacion (publicacion_id, url, orden) VALUES (?, ?, ?)',
      [publicacionId, url, orden]
    );
  }
}

// ---------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------

// POST /api/publicaciones
async function crear(usuarioId, datos) {
  const d = await validarAlta(datos);

  // Transacción: si falla al guardar una foto, no queremos que quede la
  // publicación a medio cargar. O entra todo o no entra nada.
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [res] = await conexion.query(
      `INSERT INTO publicaciones
         (vendedor_id, titulo, descripcion, categoria_id, precio, estado_articulo, zona_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuarioId, d.titulo, d.descripcion, d.categoriaId, d.precio, d.estadoArticulo, d.zonaId]
    );
    await guardarFotos(conexion, res.insertId, d.fotos);

    // El alta terminó: el borrador ya no hace falta.
    await conexion.query('DELETE FROM borradores_publicacion WHERE usuario_id = ?', [usuarioId]);

    await conexion.commit();

    const { obtenerDetalle } = require('./publicacionService');
    return await obtenerDetalle(res.insertId, usuarioId);
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// PUT /api/publicaciones/:id
async function editar(publicacionId, usuarioId, datos) {
  const publicacion = await buscarPropia(publicacionId, usuarioId);
  if (publicacion.estado === 'VENDIDA') {
    throw ApiError.conflict('No se puede editar una publicación vendida', 'PUBLICACION_VENDIDA');
  }

  const d = await validarAlta(datos);

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    await conexion.query(
      `UPDATE publicaciones
          SET titulo = ?, descripcion = ?, categoria_id = ?, precio = ?,
              estado_articulo = ?, zona_id = ?
        WHERE id = ?`,
      [d.titulo, d.descripcion, d.categoriaId, d.precio, d.estadoArticulo, d.zonaId, publicacion.id]
    );
    await guardarFotos(conexion, publicacion.id, d.fotos);
    await conexion.commit();
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }

  const { obtenerDetalle } = require('./publicacionService');
  return await obtenerDetalle(publicacion.id, usuarioId);
}

// PATCH /api/publicaciones/:id/estado   { estado: 'PAUSADA' | 'ACTIVA' | 'VENDIDA' }
async function cambiarEstado(publicacionId, usuarioId, estado) {
  const nuevo = String(estado ?? '').trim().toUpperCase();
  if (!ESTADOS_PUBLICACION.includes(nuevo)) {
    throw ApiError.badRequest(
      `El estado debe ser uno de: ${ESTADOS_PUBLICACION.join(', ')}`,
      'ESTADO_INVALIDO'
    );
  }

  const publicacion = await buscarPropia(publicacionId, usuarioId);

  if (publicacion.estado === nuevo) {
    throw ApiError.conflict(`La publicación ya está ${nuevo.toLowerCase()}`, 'MISMO_ESTADO');
  }
  if (!TRANSICIONES[publicacion.estado].includes(nuevo)) {
    throw ApiError.conflict(
      `No se puede pasar de ${publicacion.estado} a ${nuevo}`,
      'TRANSICION_INVALIDA'
    );
  }

  await pool.query('UPDATE publicaciones SET estado = ? WHERE id = ?', [nuevo, publicacion.id]);

  return {
    mensaje: `La publicación quedó ${nuevo.toLowerCase()}`,
    id: publicacion.id,
    estado: nuevo,
  };
}

// DELETE /api/publicaciones/:id
async function eliminar(publicacionId, usuarioId) {
  const publicacion = await buscarPropia(publicacionId, usuarioId);
  // El ON DELETE CASCADE se lleva fotos, preguntas, ofertas y favoritos.
  await pool.query('DELETE FROM publicaciones WHERE id = ?', [publicacion.id]);
  return { mensaje: 'Publicación eliminada', id: publicacion.id };
}

// GET /api/publicaciones/mias
async function misPublicaciones(usuarioId, query) {
  const { SELECT_LISTADO } = require('./publicacionService');

  const pagina = Math.max(1, Number(query.pagina) || 1);
  const limite = Math.min(50, Math.max(1, Number(query.limite) || 20));
  const offset = (pagina - 1) * limite;

  const condiciones = ['p.vendedor_id = ?'];
  const parametros = [usuarioId];

  // Sin filtro se ven todas: el enunciado pide ver el estado de cada una.
  if (query.estado && String(query.estado).toUpperCase() !== 'TODAS') {
    const estado = String(query.estado).toUpperCase();
    if (!ESTADOS_PUBLICACION.includes(estado)) {
      throw ApiError.badRequest(
        `El estado debe ser uno de: ${ESTADOS_PUBLICACION.join(', ')}`,
        'ESTADO_INVALIDO'
      );
    }
    condiciones.push('p.estado = ?');
    parametros.push(estado);
  }

  const where = `WHERE ${condiciones.join(' AND ')}`;

  const [filasTotal] = await pool.query(
    `SELECT COUNT(*) AS total FROM publicaciones p ${where}`,
    parametros
  );

  const [filas] = await pool.query(
    `${SELECT_LISTADO} ${where} ORDER BY p.actualizado_en DESC LIMIT ? OFFSET ?`,
    [...parametros, limite, offset]
  );

  // Contadores por estado, para las solapas de "Mis publicaciones".
  const [resumen] = await pool.query(
    `SELECT estado, COUNT(*) AS cantidad
       FROM publicaciones WHERE vendedor_id = ? GROUP BY estado`,
    [usuarioId]
  );
  const conteo = { ACTIVA: 0, PAUSADA: 0, VENDIDA: 0 };
  for (const fila of resumen) conteo[fila.estado] = Number(fila.cantidad);

  return {
    ...toPaginaDto(filas.map(toPublicacionListadoDto), {
      pagina,
      limite,
      total: Number(filasTotal[0].total),
    }),
    resumen: {
      activas: conteo.ACTIVA,
      pausadas: conteo.PAUSADA,
      vendidas: conteo.VENDIDA,
      total: conteo.ACTIVA + conteo.PAUSADA + conteo.VENDIDA,
    },
  };
}

// ---------------------------------------------------------------
// Borrador del alta guiada
// ---------------------------------------------------------------

/**
 * Las columnas JSON no se leen igual en los dos motores: MySQL las devuelve
 * ya parseadas y MariaDB, donde JSON es un alias de LONGTEXT, las devuelve
 * como texto. Esto normaliza las dos formas.
 */
function parsearJson(valor) {
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch (error) {
    return null;
  }
}

// GET /api/publicaciones/borrador
async function obtenerBorrador(usuarioId) {
  const [filas] = await pool.query(
    'SELECT * FROM borradores_publicacion WHERE usuario_id = ? LIMIT 1',
    [usuarioId]
  );
  const borrador = filas[0];
  if (!borrador) {
    // No es un error: simplemente no hay nada guardado.
    return { borrador: null };
  }
  return {
    borrador: {
      datos: parsearJson(borrador.datos),
      paso: borrador.paso,
      actualizadoEn: borrador.actualizado_en,
    },
  };
}

// PUT /api/publicaciones/borrador
// Se llama en cada paso del asistente. No valida los campos: por definición
// el borrador está incompleto, validar es tarea del alta final.
async function guardarBorrador(usuarioId, { datos, paso }) {
  if (datos === undefined || datos === null || typeof datos !== 'object') {
    throw ApiError.badRequest(
      'Mandá los datos del borrador en un objeto',
      'BORRADOR_INVALIDO'
    );
  }
  const numeroPaso = Number(paso) || 1;

  // Se manda el JSON como texto, sin CAST: MySQL lo convierte solo al
  // insertarlo en una columna JSON, y MariaDB (el motor de XAMPP) no
  // entiende la sintaxis CAST(? AS JSON).
  await pool.query(
    `INSERT INTO borradores_publicacion (usuario_id, datos, paso)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE datos = VALUES(datos), paso = VALUES(paso)`,
    [usuarioId, JSON.stringify(datos), numeroPaso]
  );

  return { mensaje: 'Borrador guardado', paso: numeroPaso };
}

// DELETE /api/publicaciones/borrador
async function descartarBorrador(usuarioId) {
  await pool.query('DELETE FROM borradores_publicacion WHERE usuario_id = ?', [usuarioId]);
  return { mensaje: 'Borrador descartado' };
}

module.exports = {
  crear,
  editar,
  cambiarEstado,
  eliminar,
  misPublicaciones,
  obtenerBorrador,
  guardarBorrador,
  descartarBorrador,
};
