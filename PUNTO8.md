# Punto 8: devolución y encuentro

Ejecutar `npm ci`, configurar `.env` y correr `npm run db:setup`. La migración
`18_hallado_encuentros.sql` crea la tabla sin modificar los casos anteriores.

## Contrato HTTP

Todas las rutas requieren token y pertenecen a `/api/hallado/reclamos/:id`.
Sólo pueden usarlas el publicador y el reclamante de un reclamo aceptado.

| Método y ruta | Cuerpo | Efecto |
| --- | --- | --- |
| GET `/encuentro` | — | Consulta propuesta, estado y permisos |
| POST `/encuentro` | `{direccion, lat?, lng?, version}` | Propone o contrapropone |
| POST `/encuentro/aceptar` | `{version}` | Acepta el lugar |
| POST `/encuentro/concretar` | `{version}` | Registra la devolución |

`version` comienza en 0 cuando no hay propuesta. Cada cambio incrementa la
versión. Una versión antigua responde 409 `ENCUENTRO_CAMBIO`; volver a consultar
antes de actuar. No se reenvían escrituras automáticamente.

La primera propuesta pertenece a quien tiene el objeto: publicador en ES_MIO,
reclamante en LO_ENCONTRE. Después responde la otra parte, aceptando o sugiriendo
otro lugar. La propuesta acordada queda fija. Cualquiera de las dos partes puede
confirmar la entrega, después de una confirmación explícita en la app.

## Integración con los puntos 7, 10 y 2

Aceptar el reclamo deja la publicación EN_RECLAMO. Los demás pendientes se rechazan
y no se permiten nuevos reclamos. El proceso que vence reclamos no reabre una
publicación con un reclamo aceptado.

Confirmar la entrega cambia encuentro a CONCRETADO y publicación a RESUELTA,
con `resuelto_en`, en una transacción. El historial, la reputación y el plazo de
valoraciones usan esa entrega. No se crea una segunda tabla de casos: el historial
existente continúa identificando cada caso por el ID de reclamo.

Los casos históricos que ya estaban RESUELTA conservan sus fechas y valoraciones.
No se intenta adivinar si esas entregas antiguas ocurrieron físicamente.

## Pruebas

- `npm run test:encuentros`: abre su propio servidor HTTP temporal, usa la base
  configurada, crea usuarios de prueba y los elimina al finalizar. Verifica ambos
  tipos, privacidad, validación, alternativas, concurrencia, historial y plazo.
- `npm run db:seed` y luego `npm run test:api`: regresión general con la API en
  puerto 3000. El seed reinicia los datos de demostración de Ronda.
- `npm run db:seed:encuentros`: reinicia sólo las dos cuentas de demo del punto 8.

La aplicación debe actualizarse junto con este backend: el botón nuevo está en
el detalle del reclamo aceptado. No requiere librerías nuevas.
