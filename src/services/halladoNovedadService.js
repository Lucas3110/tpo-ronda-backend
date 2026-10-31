// CAPA DE SERVICIO: punto 9 de Hallado, el indicador de novedad.
//
// "Ambas secciones muestran un indicador visual de novedad cuando aparece
// una publicación que coincide con una alerta o cuando una publicación
// seguida cambia de estado."
//
// Las dos listas ya traen su propio indicador por fila. Esto es el resumen
// para el menú: con un solo pedido la app sabe si prender el punto de
// "Mis alertas" y el de "Seguidas", sin traer las dos listas enteras.
const { vencerReclamos } = require('./halladoReclamoService');
const alertas = require('./halladoAlertaService');
const seguimiento = require('./halladoSeguirService');

// GET /api/hallado/novedades
async function resumen(usuarioId) {
  // Igual que en la lista de seguidas: un reclamo vencido cambia el estado.
  await vencerReclamos();

  const [deAlertas, seguidasConNovedad] = await Promise.all([
    alertas.resumenDeNovedades(usuarioId),
    seguimiento.contarConNovedad(usuarioId),
  ]);

  return {
    alertas: deAlertas,
    seguidas: { conNovedad: seguidasConNovedad },
    hayNovedades: deAlertas.alertasConNovedad > 0 || seguidasConNovedad > 0,
  };
}

module.exports = { resumen };
