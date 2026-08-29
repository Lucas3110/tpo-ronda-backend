# Ronda — Contexto del proyecto

> **Para el equipo y para asistentes de IA.** Este archivo es autocontenido: se puede
> pegar entero en un chat para que la IA entienda cómo funciona el proyecto antes de
> tocar nada. Todos los ejemplos de JSON son respuestas **reales** capturadas de la API
> corriendo, no inventadas.

TPO de Desarrollo de Aplicaciones. App de compra y venta entre particulares.
Son **dos repos separados**:

| Repo | Qué es | Se abre con |
|---|---|---|
| `tpo-ronda-backend` | API REST — Node.js + Express + MySQL/MariaDB | VS Code |
| `tpo-desarrollo-aplicaciones-1` | App Android nativa — Java + Views (XML) | Android Studio |

Estado: **backend con los 6 puntos completos**; **app con el Punto 1 (autenticación)
completo**, el resto en desarrollo.

---

# PARTE 1 — Levantar todo para desarrollar

## Requisitos

- Node.js 18+ (probado en 22)
- **XAMPP** para la base. Sólo hace falta el módulo MySQL; Apache no se usa.
  Usuario `root`, contraseña **vacía**, que es lo que ya trae el `.env.example`.
- Android Studio (para la app)

> Si usás MySQL Server instalado aparte también anda: poné tu contraseña en
> `DB_PASSWORD`. **No corras los dos a la vez**, ambos usan el puerto 3306.

## Backend: cinco comandos

```bash
npm install
```

```bash
cp .env.example .env
```
*(en PowerShell: `Copy-Item .env.example .env`)*

```bash
npm run db:setup
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Antes de eso: abrir el **XAMPP Control Panel** y tocar **Start** en la fila MySQL.
Eso hay que repetirlo cada vez que se prende la máquina.

### Qué hace cada script

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API en el puerto 3000 y se reinicia al guardar archivos |
| `npm start` | Igual pero sin recarga automática |
| `npm run db:setup` | Crea la base y **todas** las tablas corriendo en orden los `.sql` de `sql/`. Es idempotente: se puede repetir sin romper ni borrar nada |
| `npm run db:seed` | Carga datos de ejemplo: 3 usuarios, 12 publicaciones con fotos, operaciones calificadas |
| `npm run db:seed -- --limpiar` | Borra esos datos de ejemplo |
| `npm run postman` | Regenera la colección de Postman desde `scripts/generate-postman.js` |

### Usuarios de prueba que deja el seed

Los tres tienen la contraseña **`demo1234`** y el email ya verificado:

- `sofia.demo@ronda.app` — Palermo, 4 publicaciones, reputación 4,5 ★
- `martin.demo@ronda.app` — Quilmes, 3 publicaciones
- `carla.demo@ronda.app` — Villa Urquiza, 4 publicaciones

Para empezar a probar cualquier endpoint privado:

```bash
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"sofia.demo@ronda.app\",\"password\":\"demo1234\"}"
```

### El código OTP no llega por mail

En desarrollo `MAIL_MODE=console`: el código se **imprime en la terminal donde corre
`npm run dev`**, en un recuadro. Además, mientras `OTP_EXPOSE_IN_RESPONSE=true`, viene
en el JSON de la respuesta como `codigoDesarrollo` — que es lo que permite que la
colección de Postman lo guarde sola.

## Postman

`postman/` tiene la colección y el environment, versionados. **Import** → arrastrar los
dos archivos → seleccionar el environment **"Ronda Local"** arriba a la derecha.

47 requests en 8 carpetas (una por punto + una de casos de error). Guarda sola el token
y los ids que va necesitando, así que se corre de arriba a abajo sin copiar nada.

**No editar el JSON a mano**: se regenera con `npm run postman` desde
`scripts/generate-postman.js`.

## App Android

1. XAMPP → Start MySQL
2. `npm run dev` en el backend (dejar la terminal a la vista: ahí sale el OTP)
3. Android Studio → Run

`RetrofitClient` elige la URL base sola: si detecta emulador usa `http://10.0.2.2:3000/`
y si no, `URL_RED_LOCAL`. **Si probás en un celular físico**, hay que poner en esa
constante la IP de la PC en la WiFi — la imprime el backend al arrancar, en la línea
`Celular (WiFi) -> http://...`.

---

# PARTE 2 — Cómo está hecho el backend

## Arquitectura en capas

```
request HTTP
   │
   ▼
routes/          qué URL llama a qué controller
   │
   ▼
controllers/     lee req, llama al service, devuelve res.json(). SIN lógica
   │
   ▼
services/        LÓGICA DE NEGOCIO: valida, decide, consulta
   │
   ▼
dtos/            qué campos salen en el JSON
   │
   ▼
config/db.js     pool de conexiones MySQL
```

**Regla: cada capa habla sólo con la de abajo.** Nunca SQL en un controller, nunca
`res.json()` en un service.

```
src/
├── server.js               arranca: prueba la conexión y abre el puerto
├── app.js                  arma Express (cors, json, log, rutas, errores)
├── config/
│   ├── env.js              ÚNICO archivo que lee process.env
│   └── db.js               pool de conexiones
├── routes/                 authRoutes, usuarioRoutes, zonaRoutes, publicacionRoutes,
│                           categoriaRoutes, preguntaRoutes, ofertaRoutes,
│                           favoritoRoutes, busquedaRoutes, index
├── controllers/            authController, usuarioController, publicacionController,
│                           interaccionController, publicarController, favoritoController
├── services/
│   ├── authService.js         Punto 1
│   ├── usuarioService.js      Punto 2
│   ├── publicacionService.js  Punto 3 y detalle del 4
│   ├── interaccionService.js  Punto 4 (preguntas y ofertas)
│   ├── publicarService.js     Punto 5
│   ├── favoritoService.js     Punto 6
│   └── mailer.js              envío del OTP
├── dtos/                   usuarioDto, publicacionDto, interaccionDto, authDto
├── middlewares/            auth.js, authOpcional.js, errores.js
└── utils/                  ApiError.js, otp.js
sql/                        01_schema → 06_favoritos (se corren en orden)
scripts/                    setup-db.js, seed-demo.js, generate-postman.js
```

## Convenciones que hay que respetar al agregar código

**1. Un endpoint nuevo toca cuatro archivos**, en este orden:

```
src/services/xxxService.js      la lógica y las validaciones
src/dtos/xxxDto.js              la forma de la respuesta
src/controllers/xxxController.js   3 líneas: llamar al service y responder
src/routes/xxxRoutes.js         la ruta + el middleware de auth si va
```

y engancharlo en `src/routes/index.js`.

**2. Los errores se tiran, no se responden.** Nunca `res.status(400).json(...)` en un
service. Se usa:

```js
throw ApiError.badRequest('El precio no puede ser negativo', 'PRECIO_INVALIDO');
```

Los helpers son `badRequest` (400), `unauthorized` (401), `forbidden` (403),
`notFound` (404), `conflict` (409) y `tooManyRequests` (429). El middleware
`errores.js` los convierte en JSON.

**3. Todo valor del usuario va como `?`, nunca concatenado.**

```js
await pool.query('SELECT * FROM publicaciones WHERE id = ?', [id]);   // ✅
await pool.query(`SELECT * FROM publicaciones WHERE id = ${id}`);      // ❌ inyección SQL
```

Para el `ORDER BY` los `?` **no sirven**, así que ahí se usa un diccionario cerrado de
opciones válidas (ver `ORDENES` en `publicacionService.js`). Nunca interpolar texto del
usuario en un ORDER BY.

**4. La respuesta se arma en un DTO, no a mano.** La fila de la base tiene columnas que
no deben salir (`password_hash`) y nombres en `snake_case`. El DTO traduce a
`camelCase` y filtra. Si agregás una columna a una tabla, **no aparece sola** en la API:
hay que agregarla al DTO. Eso es a propósito.

**5. Los `DECIMAL` de MySQL vuelven como string.** Siempre `Number(fila.precio)` en el
DTO, o Gson del lado de Android recibe un string donde espera un double.

**6. Migraciones idempotentes.** Cada archivo de `sql/` usa
`CREATE TABLE IF NOT EXISTS` / `INSERT IGNORE`, y los `ALTER` van condicionados
mirando `information_schema`. Para agregar una tabla: archivo nuevo `07_loquesea.sql`,
`db:setup` lo toma solo por orden alfabético.

**7. Ojo con MariaDB (el motor de XAMPP), que no es idéntico a MySQL:**
- `CAST(? AS JSON)` **no existe** en MariaDB. Mandar el JSON como texto plano.
- MariaDB devuelve las columnas JSON como **string**; MySQL ya parseadas. Hay que
  normalizar al leer (ver `parsearJson()` en `publicarService.js` y `favoritoService.js`).
- `NOW()` trunca a segundos. Para columnas `DATETIME(3)` hay que usar `NOW(3)`.

**8. Rutas fijas antes que las paramétricas.** `/publicaciones/mias` y
`/publicaciones/borrador` están declaradas **antes** de `/publicaciones/:id`. Si van
después, Express interpreta `"mias"` como un id y nunca llegan.

## Autenticación

Login y verificación de OTP devuelven un **JWT** que dura 7 días. La app lo manda en
cada request privado:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Dos middlewares:

| Middleware | Qué hace | Dónde se usa |
|---|---|---|
| `autenticar` | Exige token válido. Si falta o venció, corta con 401 | rutas privadas |
| `autenticarOpcional` | Si hay token lo lee, si no sigue igual. Deja `req.usuario` o `null` | rutas públicas que cambian según quién mira: el listado (orden por cercanía, flag `esFavorito`) y el detalle (`esMia`, `acciones`) |

## Base de datos — 13 tablas

```
usuarios ──┬─< codigos_otp
           ├─< publicaciones ──┬─< fotos_publicacion
           │                   ├─< preguntas
           │                   ├─< ofertas
           │                   └─< favoritos >── usuarios
           ├─< borradores_publicacion   (uno por usuario, datos en JSON)
           ├─< busquedas_guardadas      (filtros en JSON)
           └─< operaciones ──< calificaciones

zonas       <── usuarios, publicaciones
categorias  <── publicaciones
```

Notas que importan:

- **`estado_articulo`** (`NUEVO` / `COMO_NUEVO` / `USADO`) es la condición de la cosa.
  **`estado`** (`ACTIVA` / `PAUSADA` / `VENDIDA`) es la situación del aviso. Son
  distintos y se confunden fácil.
- **La reputación no se guarda**: se calcula con agregados sobre `calificaciones` y
  `operaciones` cada vez que se pide. Así nunca queda desactualizada.
- **`favoritos.precio_al_guardar`** es lo que permite detectar "el favorito cambió de
  precio".
- **`busquedas_guardadas.ultimo_visto_en`** es `DATETIME(3)` (milisegundos) porque con
  precisión de segundos se perdían novedades.

---

# PARTE 3 — La API

Base: `http://localhost:3000/api` · 🔒 = requiere `Authorization: Bearer <token>`

## Formato de error — siempre igual

```json
{ "error": { "codigo": "ORDEN_INVALIDO", "mensaje": "El orden debe ser uno de: recientes, precio_asc, precio_desc, cercania" } }
```

**El front decide qué mostrar según `codigo`, nunca según `mensaje`.** El código es
estable; el texto puede cambiar.

Códigos transversales: `TOKEN_FALTANTE`, `TOKEN_INVALIDO`, `TOKEN_EXPIRADO` (401) ·
`NO_SOS_EL_VENDEDOR`, `ES_TU_PUBLICACION` (403) · `RUTA_NO_ENCONTRADA`,
`PUBLICACION_NO_ENCONTRADA`, `USUARIO_NO_ENCONTRADO` (404) · `ERROR_INTERNO` (500).

## Punto 1 · Autenticación

| Método | Ruta | | |
|---|---|---|---|
| POST | `/auth/registro` | | `{ email, password, nombre }` → 201 |
| POST | `/auth/otp/enviar` | | `{ email, proposito }` — `REGISTRO` o `LOGIN` |
| POST | `/auth/otp/verificar` | | `{ email, codigo, proposito }` → token |
| POST | `/auth/login` | | `{ email, password }` → token |
| GET | `/auth/me` | 🔒 | datos del usuario logueado |

Respuesta de `login` y de `otp/verificar` (la misma, a propósito):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "usuario": {
    "id": 51,
    "email": "sofia.demo@ronda.app",
    "nombre": "Sofía Ramírez",
    "telefono": "11 4444-1111",
    "zona": { "id": 6, "nombre": "Palermo" },
    "emailVerificado": true,
    "creadoEn": "2026-08-29T21:08:24.000Z"
  }
}
```

Reglas del alta: nombre **obligatorio**, hasta 30 caracteres, sin números, sólo letras
(con acentos y ñ), espacios, apóstrofos y guiones. Contraseña entre 6 y 40. Email
válido y hasta 255.

Códigos: `NOMBRE_REQUERIDO`, `NOMBRE_LARGO`, `NOMBRE_CON_NUMEROS`, `NOMBRE_INVALIDO`,
`PASSWORD_CORTA`, `PASSWORD_LARGA`, `EMAIL_INVALIDO`, `EMAIL_LARGO`, `EMAIL_EN_USO`,
`CREDENCIALES_INVALIDAS`, `EMAIL_NO_VERIFICADO`, `OTP_INVALIDO`, `OTP_EXPIRADO`,
`OTP_BLOQUEADO`, `OTP_INEXISTENTE`, `OTP_COOLDOWN`.

El OTP dura 10 minutos, es de un solo uso, se bloquea a los 5 intentos fallidos y hay
60 segundos de espera entre reenvíos.

## Punto 2 · Perfil y reputación

| Método | Ruta | | |
|---|---|---|---|
| GET | `/zonas` | | catálogo (18 zonas del AMBA) |
| GET | `/usuarios/me` | 🔒 | mis datos |
| PUT | `/usuarios/me` | 🔒 | `{ nombre, telefono, zonaId }` |
| GET | `/usuarios/:id/perfil` | | perfil público |
| GET | `/usuarios/:id/reputacion` | | sólo la reputación |

El email **no** se cambia por `PUT /usuarios/me`: obligaría a verificarlo de nuevo con
un OTP, así que sería otro caso de uso.

```json
{
  "perfil": {
    "id": 51,
    "nombre": "Sofía Ramírez",
    "zona": { "id": 6, "nombre": "Palermo" },
    "miembroDesde": "2026-08-29T21:08:24.000Z",
    "antiguedadDias": 0,
    "reputacion": {
      "promedioEstrellas": 4.5,
      "cantidadCalificaciones": 2,
      "operacionesComoVendedor": 2,
      "operacionesComoComprador": 0
    },
    "publicacionesActivas": [ /* items del listado */ ]
  }
}
```

`promedioEstrellas` es `null` cuando todavía no hay calificaciones — **hay que
contemplarlo en la UI**. El perfil público **no** expone email ni teléfono.

Códigos: `TELEFONO_INVALIDO`, `TELEFONO_LARGO`, `ZONA_INEXISTENTE`, `ZONA_INVALIDA`.

## Punto 3 · Explorar publicaciones

| Método | Ruta | | |
|---|---|---|---|
| GET | `/categorias` | | catálogo (12) |
| GET | `/publicaciones` | opcional 🔒 | listado paginado |

Parámetros de query, todos combinables:

| Parámetro | Valores | Para qué |
|---|---|---|
| `pagina` / `limite` | enteros, límite tope 50 (default 20) | paginado |
| `q` | texto | busca en título **y** descripción |
| `categoriaId` | id | filtro por categoría |
| `precioMin` / `precioMax` | números | rango de precio |
| `estadoArticulo` | `NUEVO`, `COMO_NUEVO`, `USADO`, varios con coma | condición |
| `zonaId` | id | filtro por zona |
| `vendedorId` | id | publicaciones de una persona |
| `estado` | `ACTIVA` (default), `PAUSADA`, `VENDIDA`, `TODAS` | situación del aviso |
| `orden` | `recientes` (default), `precio_asc`, `precio_desc`, `cercania` | ordenamiento |

```json
{
  "items": [
    {
      "id": 92,
      "titulo": "Monitor Samsung 24\" curvo",
      "precio": 175000,
      "estadoArticulo": "USADO",
      "estadoArticuloTexto": "Usado",
      "estado": "ACTIVA",
      "categoria": { "id": 2, "nombre": "Computación" },
      "zona": { "id": 9, "nombre": "Villa Urquiza" },
      "fotoPrincipal": "https://picsum.photos/seed/ronda-92-0/800/600",
      "cantidadFotos": 2,
      "creadoEn": "2026-08-28T21:08:24.000Z",
      "esFavorito": false
    }
  ],
  "pagina": 1, "limite": 20, "total": 12,
  "totalPaginas": 1, "hayMas": false
}
```

- `estadoArticuloTexto` viene ya traducido para mostrar directo.
- `esFavorito` **sólo aparece si mandás token**. Sin token no viene el campo.
- `hayMas` es lo que se usa para el scroll infinito.
- `orden=cercania` necesita sesión **con zona configurada**; si no, responde
  `400 SIN_ZONA_CONFIGURADA`.

Códigos: `ORDEN_INVALIDO`, `PAGINA_INVALIDA`, `LIMITE_INVALIDO`, `PARAMETRO_INVALIDO`,
`RANGO_PRECIO_INVALIDO`, `ESTADO_ARTICULO_INVALIDO`, `SIN_ZONA_CONFIGURADA`.

## Punto 4 · Detalle, preguntas y ofertas

| Método | Ruta | | |
|---|---|---|---|
| GET | `/publicaciones/:id` | opcional 🔒 | detalle |
| GET | `/publicaciones/:id/preguntas` | | públicas |
| POST | `/publicaciones/:id/preguntas` | 🔒 | `{ texto }` |
| POST | `/preguntas/:id/respuesta` | 🔒 | `{ respuesta }` — sólo el vendedor |
| GET | `/publicaciones/:id/ofertas` | 🔒 | |
| POST | `/publicaciones/:id/ofertas` | 🔒 | `{ monto }` |
| PATCH | `/ofertas/:id` | 🔒 | `{ estado: "ACEPTADA" \| "RECHAZADA" }` |

```json
{
  "publicacion": {
    "id": 92,
    "titulo": "Monitor Samsung 24\" curvo",
    "descripcion": "Full HD, 75Hz. Sin píxeles muertos. Incluye cables.",
    "precio": 175000,
    "estadoArticulo": "USADO", "estadoArticuloTexto": "Usado", "estado": "ACTIVA",
    "categoria": { "id": 2, "nombre": "Computación" },
    "zona": { "id": 9, "nombre": "Villa Urquiza" },
    "fotos": [
      { "id": 186, "url": "https://...", "orden": 0 },
      { "id": 187, "url": "https://...", "orden": 1 }
    ],
    "publicadoEn": "2026-08-28T21:08:24.000Z",
    "vendedor": {
      "id": 53, "nombre": "Carla Benítez",
      "zona": { "id": 9, "nombre": "Villa Urquiza" },
      "reputacion": { "promedioEstrellas": null, "cantidadCalificaciones": 0,
                      "operacionesComoVendedor": 0, "operacionesComoComprador": 1 }
    },
    "esMia": false,
    "esFavorito": false,
    "cantidadPreguntas": 0,
    "cantidadOfertas": null,
    "acciones": {
      "puedePreguntar": true, "puedeOfertar": true, "puedeGuardar": true,
      "puedeGestionar": false, "requiereSesion": false
    }
  }
}
```

**`acciones` lo calcula el backend** — la UI sólo tiene que mostrar u ocultar botones
según esos booleanos, sin repetir la regla:

| Quién mira | `puedePreguntar` | `puedeOfertar` | `puedeGuardar` | `puedeGestionar` | `requiereSesion` |
|---|---|---|---|---|---|
| sin sesión | false | false | false | false | **true** |
| interesado | true* | true* | true | false | false |
| el vendedor | false | false | false | **true** | false |

*sólo si la publicación está `ACTIVA`.

`cantidadOfertas` es `null` para todos menos el vendedor. Y un interesado, al listar
ofertas, ve **sólo las suyas**: las ajenas permitirían ofertar apenas por encima.

Reglas: una oferta pendiente por persona (volver a ofertar actualiza el monto, no
acumula), y no puede superar el precio publicado.

Códigos: `PREGUNTA_VACIA`, `RESPUESTA_VACIA`, `PREGUNTA_YA_RESPONDIDA`,
`MONTO_INVALIDO`, `OFERTA_MAYOR_AL_PRECIO`, `OFERTA_YA_RESPONDIDA`,
`ESTADO_OFERTA_INVALIDO`, `PUBLICACION_NO_ACTIVA`.

## Punto 5 · Publicar

| Método | Ruta | | |
|---|---|---|---|
| POST | `/publicaciones` | 🔒 | crear |
| PUT | `/publicaciones/:id` | 🔒 | editar |
| PATCH | `/publicaciones/:id/estado` | 🔒 | `{ estado }` |
| DELETE | `/publicaciones/:id` | 🔒 | eliminar |
| GET | `/publicaciones/mias` | 🔒 | `?estado=` opcional |
| GET | `/publicaciones/borrador` | 🔒 | recuperar |
| PUT | `/publicaciones/borrador` | 🔒 | `{ paso, datos }` |
| DELETE | `/publicaciones/borrador` | 🔒 | descartar |

Body de crear y editar:

```json
{
  "titulo": "Mesa de comedor",
  "descripcion": "Madera maciza, 6 sillas.",
  "categoriaId": 5,
  "precio": 250000,
  "estadoArticulo": "USADO",
  "zonaId": 6,
  "fotos": ["https://...", "https://..."]
}
```

Las fotos son **URLs**, no archivos. No hay endpoint de upload.

**Borrador** — es lo que resuelve "si interrumpe la carga, al volver la encuentra":
`PUT` se llama en cada paso del asistente y **no valida nada** (por definición está
incompleto); `GET` devuelve `{ "borrador": null }` cuando no hay (no es un 404); al
publicar se borra solo.

**Estados**: `ACTIVA ⇄ PAUSADA`, las dos → `VENDIDA`, y de `VENDIDA` no se vuelve. Una
publicación vendida tampoco se puede editar.

`/publicaciones/mias` agrega un `resumen` para las solapas:

```json
{ "items": [...], "pagina": 1, "limite": 20, "total": 4,
  "totalPaginas": 1, "hayMas": false,
  "resumen": { "activas": 4, "pausadas": 0, "vendidas": 0, "total": 4 } }
```

Códigos: `TITULO_REQUERIDO`, `DESCRIPCION_REQUERIDA`, `PRECIO_REQUERIDO`,
`PRECIO_INVALIDO`, `CATEGORIA_REQUERIDA`, `ZONA_REQUERIDA`, `DEMASIADAS_FOTOS`
(máx. 10), `FOTO_INVALIDA`, `ESTADO_INVALIDO`, `MISMO_ESTADO`, `TRANSICION_INVALIDA`,
`PUBLICACION_VENDIDA`, `BORRADOR_INVALIDO`.

## Punto 6 · Favoritos y búsquedas guardadas

| Método | Ruta | | |
|---|---|---|---|
| POST | `/publicaciones/:id/favorito` | 🔒 | guardar |
| DELETE | `/publicaciones/:id/favorito` | 🔒 | quitar |
| GET | `/favoritos` | 🔒 | mis favoritos |
| GET | `/busquedas-guardadas` | 🔒 | con contador de novedades |
| POST | `/busquedas-guardadas` | 🔒 | `{ nombre, filtros }` |
| GET | `/busquedas-guardadas/:id/resultados` | 🔒 | correrla |
| DELETE | `/busquedas-guardadas/:id` | 🔒 | borrarla |

Cada favorito trae la **novedad de precio**:

```json
{
  "items": [{
    "id": 92, "titulo": "Monitor Samsung 24\" curvo", "precio": 175000,
    "esFavorito": true,
    "guardadoEn": "2026-08-29T21:14:47.000Z",
    "novedad": { "cambioDePrecio": false, "precioAnterior": 175000, "bajoDePrecio": false }
  }],
  "total": 1, "cantidadConNovedad": 0
}
```

Búsquedas guardadas — `filtros` usa **los mismos nombres que la query del listado**, así
que se reproducen sin traducir nada. Sólo se guardan las claves conocidas (`q`,
`categoriaId`, `precioMin`, `precioMax`, `estadoArticulo`, `zonaId`, `orden`); el resto
se descarta.

```json
{
  "busquedas": [{
    "id": 11, "nombre": "Celulares baratos",
    "filtros": { "q": "iphone", "precioMax": 500000 },
    "novedades": 0,
    "ultimoVistoEn": "2026-08-29T21:14:47.631Z",
    "creadoEn": "2026-08-29T21:14:47.000Z"
  }],
  "totalNovedades": 0
}
```

`novedades` = publicaciones creadas después de `ultimoVistoEn` que además cumplen los
filtros. **Llamar a `/resultados` marca la búsqueda como vista y apaga el indicador.**

Códigos: `NO_ERA_FAVORITO`, `BUSQUEDA_SIN_FILTROS`, `NOMBRE_EN_USO`,
`DEMASIADAS_BUSQUEDAS` (máx. 20), `BUSQUEDA_NO_ENCONTRADA`.

---

# PARTE 4 — La app Android: cómo quedó el Punto 1

## Stack y convenciones

Sigue las prácticas del repo de la cátedra (`practices-android-uade`):

- **Java + Views (XML)**, no Kotlin ni Compose
- **Single Activity + Navigation Component**: una sola `MainActivity` que hospeda el
  `NavHostFragment`; cada pantalla es un `Fragment`
- **Retrofit 2.9.0 + converter-gson** para la red
- **Sin inyección de dependencias**: `RetrofitClient` es un singleton y se usa directo
  desde los Fragments
- Cuatro dependencias en total: `navigation-fragment`, `navigation-ui`, `retrofit`,
  `converter-gson`
- Paquete: `com.example.ronda`
- Unidades: **`dp`** para todo, **`sp`** sólo para texto. Nunca `px`

## Estructura

```
com.example.ronda/
├── data/
│   ├── model/          RegistroRequest, LoginRequest, OtpEnviarRequest,
│   │                   OtpVerificarRequest, UsuarioResponse, SesionResponse,
│   │                   RegistroResponse, MensajeResponse, PerfilResponse, ErrorResponse
│   ├── network/        RetrofitClient, AuthApiService, ApiErrorParser
│   └── repository/     SessionRepository
└── ui/
    ├── MainActivity           única Activity, sólo el NavHost
    ├── auth/                  LoginFragment, RegistroFragment, OtpFragment,
    │                          ValidadorRegistro
    └── home/                  HomeFragment
res/
├── layout/       activity_main, fragment_login, fragment_registro, fragment_otp, fragment_home
├── navigation/   nav_graph (raíz) → auth_nav_graph + home_nav_graph
└── xml/          network_security_config
```

## Navegación

```
nav_graph (raíz)
├── auth_nav_graph  (startDestination)
│   ├── loginFragment ──action_login_to_registro──► registroFragment
│   │                 ──action_login_to_otp──────► otpFragment (proposito=LOGIN)
│   │                 ──action_auth_to_home─────► home_nav_graph
│   ├── registroFragment ──action_registro_to_otp──► otpFragment (proposito=REGISTRO)
│   └── otpFragment ──action_otp_to_home──► home_nav_graph
└── home_nav_graph
    └── homeFragment ──action_home_to_auth──► auth_nav_graph
```

Las acciones que entran al Home usan `popUpTo="@id/auth_nav_graph"` +
`popUpToInclusive="true"`: desde el Home, "atrás" cierra la app en vez de volver al
login.

**`otpFragment` recibe dos argumentos**: `email` y `proposito` (`REGISTRO` o `LOGIN`).
La misma pantalla sirve para confirmar la cuenta y para ingresar con código.

**`homeFragment` recibe `volverAlLogin`** (boolean, default false). En `true` muestra
una bienvenida animada y a los 2,6 s vuelve solo al login — es el camino de "confirmé
mi cuenta recién creada". En `false` es el Home de verdad, con el botón de cerrar
sesión. **Los Puntos 2 a 6 cuelgan sus pantallas de `home_nav_graph`.**

## Las piezas reutilizables

### `RetrofitClient` — el cliente HTTP

Elige la URL base sola según dónde corra:

```java
private static final String URL_EMULADOR  = "http://10.0.2.2:3000/";
private static final String URL_RED_LOCAL = "http://192.168.0.153:3000/"; // ← actualizar

private static String getBaseUrl() {
    return esEmulador() ? URL_EMULADOR : URL_RED_LOCAL;
}
```

**Para agregar endpoints nuevos**, crear la interfaz y usarla así:

```java
PublicacionApiService api = RetrofitClient.getInstance().create(PublicacionApiService.class);
```

### `SessionRepository` — el token

```java
SessionRepository sesion = new SessionRepository(requireContext());
sesion.getBearer();     // "Bearer eyJhbGci..." — listo para el header
sesion.haySesion();
sesion.getEmail();
sesion.cerrarSesion();
```

### `ApiErrorParser` — leer los errores de la API

⚠️ **El `errorBody` de Retrofit es un stream de una sola lectura.** Leerlo dos veces
devuelve null y se pierde el error real. Por eso el uso correcto es parsear **una vez**:

```java
ErrorResponse.Detalle error = ApiErrorParser.parse(response);
String codigo  = ApiErrorParser.codigo(error);
String mensaje = ApiErrorParser.mensaje(error, getString(R.string.error_generico));
```

### `ValidadorRegistro` — validaciones locales

Reutilizable para el "editar perfil" del Punto 2. Devuelve un `Resultado` con el id del
string de error:

```java
ValidadorRegistro.Resultado r = ValidadorRegistro.validarEmail(email);
if (!r.esValido()) { etEmail.setError(getString(r.getMensajeError())); return; }
```

## El patrón de una llamada a la API

Todos los Fragments siguen esta forma. **Copiarla al agregar pantallas nuevas:**

```java
mostrarCargando(true);

RetrofitClient.getAuthApi().login(new LoginRequest(email, password))
        .enqueue(new Callback<SesionResponse>() {

    @Override
    public void onResponse(@NonNull Call<SesionResponse> call,
                           @NonNull Response<SesionResponse> response) {
        if (!estaVivo()) return;            // el Fragment puede haberse destruido
        mostrarCargando(false);

        if (response.isSuccessful() && response.body() != null) {
            // camino feliz
        } else {
            ErrorResponse.Detalle error = ApiErrorParser.parse(response);
            // decidir según ApiErrorParser.codigo(error)
        }
    }

    @Override
    public void onFailure(@NonNull Call<SesionResponse> call, @NonNull Throwable t) {
        // acá NO hubo respuesta: sin red, backend apagado o URL mal
        if (!estaVivo()) return;
        mostrarCargando(false);
        Toast.makeText(requireContext(), R.string.error_sin_conexion, Toast.LENGTH_LONG).show();
    }
});
```

Cuatro cosas que hay que respetar:

1. **`enqueue()`, nunca `execute()`.** `execute()` bloquea el hilo principal y tira
   `NetworkOnMainThreadException`.
2. **`estaVivo()`** (`isAdded() && getView() != null`) antes de tocar la UI: la
   respuesta puede llegar cuando el usuario ya se fue de la pantalla.
3. **`onFailure` es sólo para errores de red.** Un 404 o un 409 entran por
   `onResponse` con `isSuccessful() == false`.
4. **`onCreateView` sólo infla el layout**; las vistas se buscan en `onViewCreated`.

## Detalles de red que ya están resueltos

- `<uses-permission android:name="android.permission.INTERNET" />` en el manifest.
- `network_security_config.xml`: Android bloquea HTTP sin cifrar desde la API 28, y el
  backend de desarrollo es `http://`. La versión de `app/src/main/` permite sólo
  `10.0.2.2` y `localhost`; la de **`app/src/debug/`** permite cualquier host, así no
  hay que agregar la IP a mano cada vez que se cambia de red. La build de release
  mantiene la lista restrictiva.

---

# PARTE 5 — Trabajar en equipo

## Git

- **App (`tpo-desarrollo-aplicaciones-1`)**: se evalúa. Todo va por
  `feature/app-loquesea` y **Pull Request a `main`**, nunca push directo. `main` tiene
  la protección activada, así que un push directo es rechazado.
- **Backend (`tpo-ronda-backend`)**: no se evalúa, se puede pushear directo a `main`.
  Igual conviene una branch por tema para que el historial se lea.

Mensajes de commit en formato Conventional Commits: `feat(...)`, `fix(...)`,
`chore(...)`.

## Si hace falta cambiar el backend

Es esperable: al construir una pantalla suele aparecer que falta un campo o un filtro.
Antes de pedirlo, chequear que no esté ya:

- ¿El campo ya viene? Mirar el DTO en `src/dtos/`.
- ¿El filtro ya existe? Mirar la tabla de parámetros del Punto 3 acá arriba.
- ¿Necesitás publicaciones de una persona? `GET /publicaciones?vendedorId=X`.

Si de verdad falta algo, lo que conviene pedir es: **qué pantalla lo necesita, qué dato
falta y con qué forma**. Con eso se agrega en el DTO o como parámetro nuevo.

## Antes de la entrega

1. `MAIL_MODE=smtp` con un App Password de Gmail, y `OTP_EXPOSE_IN_RESPONSE=false`.
2. `npm run db:seed -- --limpiar` para que no queden datos de prueba en la demo.
3. Revisar que `URL_RED_LOCAL` en `RetrofitClient` apunte a la IP correcta si se
   demuestra en un celular físico.

## Lo que NO existe (para no asumirlo)

- **Subida de fotos como archivo.** Las publicaciones guardan URLs. No hay endpoint de
  upload ni almacenamiento.
- **Notificaciones push.** Las novedades se consultan pidiendo `/favoritos` y
  `/busquedas-guardadas`.
- **Refresh tokens.** El JWT dura 7 días y listo.
- **Chat entre usuarios.** Están preguntas y ofertas, que es lo que pide la consigna.
- **Recuperar contraseña olvidada.** El "recupero de acceso" del enunciado es el reenvío
  del OTP, que sí está.
