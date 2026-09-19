# Ronda · lo que se sumó al backend para la consigna de 10 puntos

Este documento cubre **lo nuevo**. Lo que ya estaba (auth, perfil, home,
detalle, publicar, favoritos) sigue igual y está en `CONTEXTO.md`.

Léelo si vas a hacer el front de los Puntos 7, 8, 9 o 10, o si tocás perfil o
publicar.

---

## Índice

- [Arrancar el proyecto](#arrancar-el-proyecto)
- [Configurar la IP para tu máquina](#configurar-la-ip-para-tu-máquina)
- [Qué endpoints hay ahora](#qué-endpoints-hay-ahora)
- [Punto 2 · foto de perfil](#punto-2--foto-de-perfil)
- [Puntos 4, 5 y 8 · dirección de entrega](#puntos-4-5-y-8--dirección-de-entrega)
- [Punto 7 · negociación](#punto-7--negociación)
- [Punto 9 · historial y calificaciones](#punto-9--historial-y-calificaciones)
- [Punto 10 · favoritos](#punto-10--favoritos)
- [El OTP por email](#el-otp-por-email)
- [Convenciones al agregar código](#convenciones-al-agregar-código)

---

## Arrancar el proyecto

Hace falta **XAMPP con el módulo MySQL prendido** (Apache no, salvo que
quieras phpMyAdmin). Después:

```bash
npm install
npm run db:setup     # crea/actualiza las tablas — se puede correr mil veces
npm run db:seed      # datos de prueba
npm run dev          # levanta la API en el puerto 3000
```

Los scripts disponibles:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API con recarga automática |
| `npm run db:setup` | Corre las migraciones de `sql/` en orden |
| `npm run db:seed` | Carga 3 usuarios, 12 publicaciones y 3 operaciones |
| `npm run test:api` | **100 checks** contra la API corriendo |
| `npm run test:mail` | Verifica el envío del OTP por email |
| `npm run postman` | Regenera la colección de Postman |

Usuarios de prueba, todos con contraseña `demo1234`:

- `sofia.demo@ronda.app` — tiene reputación, ventas y publicaciones vendidas
- `martin.demo@ronda.app`
- `carla.demo@ronda.app`

**Antes de pedir un PR, corré `npm run test:api`.** Tarda 20 segundos y
atrapa lo que si no se descubre en la demo.

---

## Configurar la IP para tu máquina

Esto es del **front**, pero va acá porque es lo que más nos hizo perder
tiempo: ya van dos veces que alguien commitea la IP de su PC y le rompe el
entorno al resto.

### Cómo funciona ahora

La dirección del backend **ya no está en el código**. Sale de
`BuildConfig.BASE_URL`, que se define en `app/build.gradle.kts`:

```kotlin
val urlDelBackend: String =
    (project.findProperty("ronda.baseUrl") as String?) ?: "http://10.0.2.2:3000/"
```

O sea: si no configurás nada, apunta a `http://10.0.2.2:3000/`.

### ¿Por qué 10.0.2.2 y no localhost?

Porque el emulador **es otra máquina**. Si desde adentro pedís `localhost`,
te estás pidiendo a vos mismo, no a la PC. `10.0.2.2` es el alias que el
emulador redirige al localhost de la máquina que lo hospeda.

### Si usás el emulador

**No hagas nada.** Ya funciona.

### Si usás un celular físico

El celular tiene que estar en **la misma WiFi** que tu PC. Necesitás la IP de
tu máquina: la imprime el backend al arrancar.

```
API escuchando en el puerto 3000
  PC              -> http://localhost:3000/api/health
  Emulador Android-> http://10.0.2.2:3000/api/health
  Celular (WiFi)  -> http://192.168.0.153:3000/api/health     <-- esta
```

Abrí `local.properties` (está en la raíz del proyecto del front, al lado de
`gradlew`) y agregá al final:

```properties
ronda.baseUrl=http://192.168.0.153:3000/
```

Con **tu** IP, no la del ejemplo. Después *Sync Project with Gradle Files* en
Android Studio y volvé a compilar.

**`local.properties` está en el `.gitignore`**, así que tu IP nunca se sube.
Ese es todo el punto: cada uno configura la suya y nadie pisa a nadie.

Para volver al emulador, borrá esa línea.

### Cosas que te van a pasar

**"No pudimos conectarnos con el servidor" en un emulador con Android 16 o
más nuevo.** Android 16 estrenó la *Local Network Protection*: el permiso
`INTERNET` ya no alcanza para conectarse a una dirección de red local. La app
ya declara `ACCESS_LOCAL_NETWORK` y lo pide al arrancar, pero si tenías una
versión vieja instalada, **desinstalala y reinstalá** para que aparezca el
diálogo de permiso.

Lo confuso es cómo falla si el permiso no está: las requests no dan un error
de permisos, se **cuelgan hasta el timeout** como si el servidor no
existiera.

**La IP cambia al cambiar de red.** Casa, facultad y hotspot dan IPs
distintas. Si dejás de conectar desde el celular, revisá `local.properties`.

---

## Qué endpoints hay ahora

**41 rutas.** Las que ya conocías siguen igual. Estas son las nuevas:

```
P7   GET    /api/ofertas/mias                  ?tipo=ENVIADAS|RECIBIDAS
P7   POST   /api/ofertas/:id/contraoferta      { monto, mensaje? }
P9   GET    /api/operaciones                   ?tipo=COMPRA|VENTA&desde=&hasta=
P9   GET    /api/operaciones/pendientes-calificar
P9   POST   /api/operaciones/:id/calificacion  { estrellas, comentario? }
P9   GET    /api/usuarios/:id/calificaciones   (público)
```

Y cambiaron estas, sin romper lo que ya andaba:

```
P2   PUT    /api/usuarios/me                   ahora acepta fotoUrl
P5   POST   /api/publicaciones                 ahora acepta direccion, latitud, longitud
P5   PUT    /api/publicaciones/:id             idem
P4   GET    /api/publicaciones/:id             ahora devuelve entrega y entregaVisible
P7   POST   /api/publicaciones/:id/ofertas     ahora acepta mensaje
```

---

## Punto 2 · foto de perfil

Se guarda **la URL, no el archivo**. Subir binarios a la base es caro y
complica el backup.

```jsonc
PUT /api/usuarios/me
{ "nombre": "...", "telefono": "...", "zonaId": 6,
  "fotoUrl": "content://media/external/images/media/42" }
```

Se aceptan tres formas, porque la app puede referenciar una imagen de
cualquiera de ellas:

- `https://...` — una imagen alojada afuera
- `content://...` — la Uri que devuelve la galería de Android
- `file://...` — un archivo del almacenamiento interno

Mandar `null` o cadena vacía borra la foto. Cualquier otro esquema devuelve
`400 FOTO_URL_INVALIDA`.

`fotoUrl` viaja en **los tres DTOs de usuario**: el propio, el perfil público
y el resumen del vendedor. O sea que la foto también aparece en el detalle de
la publicación sin pedir nada extra.

---

## Puntos 4, 5 y 8 · dirección de entrega

Tres puntos distintos apoyados en las mismas columnas.

### Al publicar (Punto 5)

```jsonc
POST /api/publicaciones
{ ...,
  "direccion": "Av. Santa Fe 3253",
  "latitud": -34.5881,
  "longitud": -58.4106 }
```

Los tres son **opcionales**, pero `latitud` y `longitud` van **de a par**: con
una sola no se puede poner un pin en el mapa, así que mandar una sin la otra
devuelve `400 COORDENADAS_INCOMPLETAS`.

Ojo con la diferencia entre esto y la `zona`: la zona es la ubicación
aproximada y **pública**, la que se ve en el listado. Esto es la dirección
precisa.

### En el detalle (Punto 4)

El enunciado dice: *"no se puede ver la dirección exacta hasta que no se
efectúe la oferta del articulo"*. El detalle devuelve:

```jsonc
"entrega": {
  "direccion": "Av. Santa Fe 3253",
  "latitud": -34.5881,
  "longitud": -58.4106,
  "urlMapa": "https://www.google.com/maps/dir/?api=1&destination=-34.5881%2C-58.4106"
},
"entregaVisible": true
```

**`entrega` viene en `null` mientras no corresponda verla.** La ve sólo:

- el vendedor (la cargó él), o
- quien tenga una oferta **ACEPTADA** en esa publicación

El filtro está en el backend a propósito. Si lo hiciera la app, el dato ya
habría viajado por la red y se leería con Postman.

`entregaVisible` viaja aparte para que la pantalla pueda mostrar *"vas a ver
la dirección cuando acepten tu oferta"* en vez de un hueco sin explicación.

### El mapa (Punto 8)

`urlMapa` ya viene armada. Desde la app alcanza con:

```java
Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(pub.getEntrega().getUrlMapa()));
startActivity(intent);
```

Si hay coordenadas el pin cae exacto; si sólo hay dirección escrita, se la
pasa a Google Maps como texto y la resuelve él.

---

## Punto 7 · negociación

El más grande de los nuevos. Conviene leerlo entero antes de tocar la
pantalla de ofertas.

### Los estados

`PENDIENTE` · `ACEPTADA` · `RECHAZADA` · `VENCIDA`

El DTO trae `estadoTexto` ya traducido ("Pendiente", "Vencida"…), así que la
app no tiene que mapear nada.

### Mensaje opcional

```jsonc
POST /api/publicaciones/:id/ofertas
{ "monto": 150000, "mensaje": "Te lo pago hoy en efectivo" }
```

`mensaje` es opcional, máximo 500 caracteres.

### Contraoferta

```jsonc
POST /api/ofertas/:id/contraoferta
{ "monto": 160000, "mensaje": "Te lo dejo en este precio" }
```

Sólo el vendedor. **La oferta original pasa a `RECHAZADA` y nace una fila
nueva** con `origen: "VENDEDOR"` y `contraofertaDeId` apuntando a la
anterior.

Se modela como fila nueva y no como un UPDATE del monto para conservar el
historial del regateo: siguiendo la cadena se reconstruye toda la
negociación.

### Quién responde qué

Esto es lo que más confunde. **Depende de quién propuso el monto**, y lo dice
el campo `origen`:

| `origen` | Quién puede aceptar o rechazar |
|---|---|
| `COMPRADOR` | el vendedor |
| `VENDEDOR` (contraoferta) | el comprador |

Si te equivocás de lado, la API devuelve `403 NO_TE_CORRESPONDE`.

No hace falta que calcules esto en la app: **`GET /api/ofertas/mias` te da
`esperaMiRespuesta` ya resuelto por fila.**

### Vencimiento

Cada oferta nace con `expiraEn`, 72 horas por defecto (configurable con
`OFERTA_VIGENCIA_HORAS` en el `.env`).

Las pendientes que pasaron la fecha se marcan `VENCIDA` sola, con un barrido
perezoso antes de cada lectura. No hay un cron: es un proceso menos que
mantener y hace imposible leer una oferta "pendiente" que en realidad venció
hace un rato.

Una vencida no se puede aceptar: `409 OFERTA_VENCIDA`.

### "Mis ofertas"

```jsonc
GET /api/ofertas/mias
GET /api/ofertas/mias?tipo=ENVIADAS
GET /api/ofertas/mias?tipo=RECIBIDAS

{
  "enviadas":  [ { ...oferta } ],
  "recibidas": [ { ...oferta } ]
}
```

Cada fila trae el contexto listo para dibujar la pantalla sin pedir el
detalle de cada publicación:

```jsonc
{
  "id": 7, "monto": 150000, "mensaje": "...",
  "estado": "PENDIENTE", "estadoTexto": "Pendiente",
  "origen": "VENDEDOR", "esContraoferta": true, "contraofertaDeId": 6,
  "expiraEn": "2026-09-22T13:42:16.000Z",
  "publicacion": { "id": 92, "titulo": "...", "precio": 175000,
                   "estado": "ACTIVA", "fotoPrincipal": "https://..." },
  "contraparte": { "id": 53, "nombre": "Carla Benítez" },
  "esperaMiRespuesta": true
}
```

"Enviadas" son las que propuso esta persona: sus ofertas como compradora más
las contraofertas que hizo como vendedora. "Recibidas" es el espejo.

### Aceptar cierra el trato

Al aceptar una oferta, en **una sola transacción**:

1. se registra la **operación** (de ahí vive el historial del Punto 9),
2. la publicación pasa a `VENDIDA`,
3. las demás ofertas de esa publicación se rechazan solas,
4. el comprador **pasa a ver la dirección de entrega**.

O sea que aceptar una oferta dispara los Puntos 8 y 9. Tenelo en cuenta al
probar.

### Reglas que ya aplica el backend

- Una oferta pendiente por persona: volver a ofertar **actualiza** el monto y
  reinicia el plazo, no acumula.
- La oferta no puede superar el precio publicado →
  `400 OFERTA_MAYOR_AL_PRECIO`.
- Un interesado, al listar ofertas de una publicación, ve **las suyas y las
  contraofertas que le hicieron**. Nunca las de otros: saberlas permitiría
  ofertar apenas por encima.
- Sólo se puede ofertar en publicaciones `ACTIVA` →
  `400 PUBLICACION_NO_ACTIVA`.

### Códigos de error

`MONTO_INVALIDO`, `MENSAJE_LARGO`, `OFERTA_MAYOR_AL_PRECIO`,
`OFERTA_YA_RESPONDIDA`, `OFERTA_VENCIDA`, `ESTADO_OFERTA_INVALIDO`,
`NO_TE_CORRESPONDE`, `NO_SOS_EL_VENDEDOR`, `YA_ES_CONTRAOFERTA`,
`CONTRAOFERTA_MISMO_MONTO`, `PUBLICACION_NO_ACTIVA`, `ES_TU_PUBLICACION`.

---

## Punto 9 · historial y calificaciones

### El historial

```jsonc
GET /api/operaciones
GET /api/operaciones?tipo=VENTA
GET /api/operaciones?desde=2026-09-01&hasta=2026-09-30

{ "compras": [ ... ], "ventas": [ ... ] }
```

Las fechas van en formato `AAAA-MM-DD`; otra cosa devuelve
`400 FECHA_INVALIDA`.

Cada fila:

```jsonc
{
  "id": 12,
  "tipo": "COMPRA",
  "fecha": "2026-09-16T18:30:00.000Z",
  "montoFinal": 185000,
  "articulo": { "id": 92, "titulo": "Bicicleta rodado 29",
                "fotoPrincipal": "https://..." },
  "contraparte": { "id": 53, "nombre": "Sofía Ramírez" },
  "calificacion": {
    "puedeCalificar": true,
    "yaCalifique": false,
    "diasRestantes": 6,
    "misEstrellas": null,
    "estrellasRecibidas": null
  }
}
```

**El punto de vista lo resuelve el backend.** La misma operación es `COMPRA`
para uno y `VENTA` para el otro, y `contraparte` sale calculada. La app no
tiene que saber de qué lado estuvo el usuario.

### Calificar

El enunciado da **7 días desde la entrega**. El bloque `calificacion` de cada
fila ya te dice si se puede, cuántos días quedan y si ya calificaste.

```jsonc
POST /api/operaciones/:id/calificacion
{ "estrellas": 5, "comentario": "Todo perfecto" }
```

- `estrellas` de 1 a 5, obligatorio
- `comentario` opcional, máximo 500

**El rol no se manda.** Si sos el comprador estás calificando al vendedor, y
al revés; el backend lo deduce. Mandarlo sería dejar que la app decida algo
que el backend ya sabe.

Para el aviso de "tenés 2 operaciones por calificar", sin bajarte el
historial entero:

```jsonc
GET /api/operaciones/pendientes-calificar
{ "operaciones": [ ... ], "total": 2 }
```

### En el perfil público

```jsonc
GET /api/usuarios/:id/calificaciones      // público, sin token
{ "calificaciones": [
  { "id": 3, "estrellas": 5, "comentario": "...",
    "rolCalificado": "VENDEDOR", "fecha": "...",
    "autor": { "id": 54, "nombre": "Martín Sosa" },
    "articulo": "Notebook Lenovo IdeaPad" } ] }
```

Es público a propósito: se consulta antes de operar con alguien.

Las calificaciones alimentan la reputación que ya devolvían
`/api/usuarios/:id/perfil` y `/api/usuarios/:id/reputacion` — no hay que
hacer nada extra.

### Códigos de error

`ESTRELLAS_INVALIDAS`, `COMENTARIO_LARGO`, `YA_CALIFICADA`, `PLAZO_VENCIDO`,
`NO_SOS_PARTE`, `OPERACION_NO_ENCONTRADA`, `FECHA_INVALIDA`,
`RANGO_FECHAS_INVALIDO`, `TIPO_INVALIDO`.

---

## Punto 10 · favoritos

**Este punto no necesita backend nuevo: está completo desde el 29/08.** Era
el viejo Punto 6 y la consigna sólo lo renumeró.

```
GET    /api/favoritos
POST   /api/publicaciones/:id/favorito
DELETE /api/publicaciones/:id/favorito
GET    /api/busquedas-guardadas
POST   /api/busquedas-guardadas          { nombre, filtros }
GET    /api/busquedas-guardadas/:id/resultados
DELETE /api/busquedas-guardadas/:id
```

El indicador de novedad del enunciado ya viene resuelto: cada favorito trae
un campo `novedad` que avisa si bajó de precio, y cada búsqueda guardada
cuenta las publicaciones nuevas que coinciden.

---

## El OTP por email

Ya está implementado. Tiene dos modos, con `MAIL_MODE` en el `.env`:

| Modo | Qué hace |
|---|---|
| `console` | Imprime el código en la terminal. **Es el que usamos.** |
| `smtp` | Manda un mail de verdad |

En modo `console` el código sale así en la ventana de `npm run dev`:

```
=============== CÓDIGO OTP (modo consola) ===============
  Para:      alguien@ejemplo.com
  Código:    482913
=========================================================
```

Para el modo `smtp` hace falta una **contraseña de aplicación de Google**
(no la contraseña de la cuenta: Google bloquea el SMTP con esa). Se genera en
`myaccount.google.com/apppasswords`, con la verificación en dos pasos
activada, y va en `SMTP_PASS`. Podés pegarla con espacios, el código se los
saca.

Verificalo con `npm run test:mail` antes de probar desde la app.

Al arrancar, el server prueba la conexión y lo dice en el banner. Si falla,
en desarrollo el código igual sale por consola: una caída del SMTP no deja al
equipo sin poder entrar.

---

## Convenciones al agregar código

Si vas a tocar el backend, respetá esto para que no quede un Frankenstein:

**Las capas.** `routes → controllers → services → dtos → config/db`. El
controller no tiene lógica: lee el request y llama al service. El service no
sabe que existe HTTP.

**Los errores se tiran, no se responden.** Nunca `res.status(400)` en un
service. Va `throw ApiError.badRequest('mensaje', 'CODIGO')` y el middleware
central lo convierte en respuesta. El código en MAYÚSCULAS es el que la app
usa para reaccionar.

**Todo valor del usuario va como `?`.** Nunca concatenado. La única excepción
es el `ORDER BY`, donde los parámetros no funcionan: ahí se elige de un
diccionario cerrado. Ese es exactamente el lugar por donde se cuela una
inyección SQL.

**Las migraciones son numeradas e idempotentes.** Un archivo nuevo en `sql/`
con el número siguiente, y los `ALTER` condicionados con
`information_schema`. Tiene que poder correrse mil veces sin fallar: si
ponés un `ALTER TABLE` pelado, el segundo `npm run db:setup` de tus
compañeros explota.

**Nada de tocar tablas desde un service que no sea el suyo.** Si el Punto 9
necesita algo de publicaciones, se pide por una función del service de
publicaciones.

**Los DTOs traducen.** La base habla `snake_case` y la app espera
`camelCase`. Esa traducción vive en `src/dtos/`, en un solo lugar, y es lo
que evita que se filtre una columna nueva sin querer.

**Corré `npm run test:api` antes del PR.**
