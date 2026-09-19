// DTOs del Punto 9: historial de operaciones y calificaciones.

/**
 * Una fila del historial.
 *
 * El enunciado pide exactamente "fecha, artículo, monto final y contraparte",
 * más el tipo para poder separar compras de ventas. Todo eso viaja resuelto:
 * la app no tiene que saber si el usuario era el vendedor o el comprador para
 * saber a quién mostrar del otro lado.
 */
function toOperacionDto(fila) {
  return {
    id: fila.id,
    tipo: fila.tipo, // COMPRA | VENTA, desde el punto de vista de quien consulta
    fecha: fila.concretada_en,
    montoFinal: Number(fila.monto),
    articulo: {
      // publicacion_id queda NULL si la publicación se borró después.
      id: fila.publicacion_id,
      titulo: fila.publicacion_titulo ?? null,
      fotoPrincipal: fila.foto_principal ?? null,
    },
    contraparte: {
      id: fila.contraparte_id,
      nombre: fila.contraparte_nombre,
    },
    // Estado de la calificación, que es lo que la pantalla necesita para
    // decidir si muestra el botón "Calificar", las estrellas que puse, o nada.
    calificacion: {
      puedeCalificar: Boolean(fila.puede_calificar),
      yaCalifique: Boolean(fila.ya_califique),
      diasRestantes: fila.dias_restantes === null ? null : Number(fila.dias_restantes),
      misEstrellas: fila.mis_estrellas === null ? null : Number(fila.mis_estrellas),
      // Lo que la contraparte me puso a mí, si ya lo hizo.
      estrellasRecibidas:
        fila.estrellas_recibidas === null ? null : Number(fila.estrellas_recibidas),
    },
  };
}

/** Una calificación tal como se muestra en el perfil público. */
function toCalificacionDto(fila) {
  return {
    id: fila.id,
    estrellas: Number(fila.estrellas),
    comentario: fila.comentario ?? null,
    // COMPRADOR o VENDEDOR: por qué papel se lo califica.
    rolCalificado: fila.rol_calificado,
    fecha: fila.creado_en,
    autor: {
      id: fila.calificador_id,
      nombre: fila.calificador_nombre,
    },
    articulo: fila.publicacion_titulo ?? null,
  };
}

module.exports = { toOperacionDto, toCalificacionDto };
