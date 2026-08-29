# TPO Ronda — Backend (API REST)

API REST en Node.js + Express + MySQL/MariaDB para la app **Ronda** (compra y venta
entre personas). Cubre **los 6 puntos de la consigna**.

---

## Puesta en marcha (5 comandos)

### Requisitos

| Herramienta | Versión | Verificar con |
|---|---|---|
| Node.js | 18+ (probado en 22) | `node -v` |
| Un servidor MySQL | ver abajo | — |

**Para la base recomendamos XAMPP**: se instala, se abre el Control Panel y se toca
*Start* en la fila **MySQL**. El usuario es `root` y la contraseña está **vacía**, que
es exactamente lo que el `.env.example` ya trae.

> Descarga: <https://www.apachefriends.org/es/index.html> — sólo hace falta el módulo
> MySQL, Apache no se usa.
>
> Si preferís MySQL Server instalado aparte, también funciona: poné tu contraseña de
> root en `DB_PASSWORD`. **No corras los dos a la vez**: ambos usan el puerto 3306.

### Los comandos

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

`db:setup` crea la base y **todas** las tablas corriendo en orden los archivos de
`sql/`. Es idempotente: se puede volver a correr sin romper ni borrar nada.

`db:seed` carga datos de ejemplo (3 usuarios, 12 publicaciones con fotos, operaciones
calificadas) para poder probar el listado y los filtros sin cargar todo a mano. Para
vaciarlos: `npm run db:seed -- --limpiar`.

### Lo único que conviene cambiar del `.env`

`JWT_SECRET`. Generá uno propio con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Endpoints

Base: `/api`. 🔒 = requiere `Authorization: Bearer <token>`.

### Punto 1 · Autenticación

| Método | Ruta | | Qué hace |
|---|---|---|---|
| POST | `/auth/registro` | | Crea la cuenta y envía el OTP |
| POST | `/auth/otp/enviar` | | Envía / reenvía un código (`REGISTRO` o `LOGIN`) |
| POST | `/auth/otp/verificar` | | Valida el código y devuelve el token |
| POST | `/auth/login` | | Login con email + contraseña |
| GET | `/auth/me` | 🔒 | Datos del usuario logueado |

### Punto 2 · Perfil y reputación

| Método | Ruta | | Qué hace |
|---|---|---|---|
| GET | `/zonas` | | Catálogo de zonas |
| GET | `/usuarios/me` | 🔒 | Mis datos personales |
| PUT | `/usuarios/me` | 🔒 | Editar nombre, teléfono y zona |
| GET | `/usuarios/:id/perfil` | | Perfil público: reputación, antigüedad, publicaciones activas |
| GET | `/usuarios/:id/reputacion` | | Sólo la reputación |

### Punto 3 · Explorar publicaciones

| Método | Ruta | | Qué hace |
|---|---|---|---|
| GET | `/categorias` | | Catálogo de categorías |
| GET | `/publicaciones` | | Listado paginado, con buscador, filtros y orden |

Parámetros de `/publicaciones`:

| Parámetro | Valores | Para qué |
|---|---|---|
| `pagina`, `limite` | enteros (límite tope 50) | paginado |
| `q` | texto | buscador sobre título y descripción |
| `categoriaId` | id | filtro por categoría |
| `precioMin`, `precioMax` | números | rango de precio |
| `estadoArticulo` | `NUEVO`, `COMO_NUEVO`, `USADO` (varios con coma) | condición del artículo |
| `zonaId` | id | filtro por zona |
| `vendedorId` | id | publicaciones de una persona |
| `estado` | `ACTIVA` (por defecto), `PAUSADA`, `VENDIDA`, `TODAS` | situación del aviso |
| `orden` | `recientes`, `precio_asc`, `precio_desc`, `cercania` | ordenamiento |

`orden=cercania` necesita sesión con zona configurada; si no, responde
`400 SIN_ZONA_CONFIGURADA`.

### Punto 4 · Detalle, preguntas y ofertas

| Método | Ruta | | Qué hace |
|---|---|---|---|
| GET | `/publicaciones/:id` | | Detalle + galería + vendedor + acciones disponibles |
| GET | `/publicaciones/:id/preguntas` | | Preguntas públicas |
| POST | `/publicaciones/:id/preguntas` | 🔒 | Preguntar |
| POST | `/preguntas/:id/respuesta` | 🔒 | Responder (sólo el vendedor) |
| GET | `/publicaciones/:id/ofertas` | 🔒 | El vendedor ve todas; un interesado, sólo las suyas |
| POST | `/publicaciones/:id/ofertas` | 🔒 | Ofertar |
| PATCH | `/ofertas/:id` | 🔒 | Aceptar o rechazar (sólo el vendedor) |

El detalle trae un objeto `acciones` calculado en el servidor:

```json
{ "puedePreguntar": true, "puedeOfertar": true, "puedeGuardar": true,
  "puedeGestionar": false, "requiereSesion": false }
```

### Punto 5 · Publicar

| Método | Ruta | | Qué hace |
|---|---|---|---|
| POST | `/publicaciones` | 🔒 | Crear |
| PUT | `/publicaciones/:id` | 🔒 | Editar |
| PATCH | `/publicaciones/:id/estado` | 🔒 | Pausar / reactivar / marcar vendida |
| DELETE | `/publicaciones/:id` | 🔒 | Eliminar |
| GET | `/publicaciones/mias` | 🔒 | Mis publicaciones + resumen por estado |
| GET | `/publicaciones/borrador` | 🔒 | Recuperar la carga interrumpida |
| PUT | `/publicaciones/borrador` | 🔒 | Guardar el paso actual |
| DELETE | `/publicaciones/borrador` | 🔒 | Descartarlo |

### Punto 6 · Favoritos y búsquedas guardadas

| Método | Ruta | | Qué hace |
|---|---|---|---|
| POST | `/publicaciones/:id/favorito` | 🔒 | Guardar en favoritos |
| DELETE | `/publicaciones/:id/favorito` | 🔒 | Quitar |
| GET | `/favoritos` | 🔒 | Mis favoritos, con la novedad de cambio de precio |
| GET | `/busquedas-guardadas` | 🔒 | Con el contador de novedades |
| POST | `/busquedas-guardadas` | 🔒 | Guardar filtros con un nombre |
| GET | `/busquedas-guardadas/:id/resultados` | 🔒 | Correrla (apaga el indicador) |
| DELETE | `/busquedas-guardadas/:id` | 🔒 | Borrarla |

### Formato de error

Todos los errores responden con la misma forma:

```json
{ "error": { "codigo": "OTP_EXPIRADO", "mensaje": "El código venció. Pedí uno nuevo." } }
```

El campo `codigo` es estable: la app decide qué mostrar según ese valor, no según el
texto del mensaje.

---

## Probar la API

### Con Postman

La colección está versionada en `postman/`: **47 requests en 8 carpetas**, una por
punto de la consigna más una de casos de error. En Postman: **Import** → arrastrá los
dos archivos → seleccioná el environment **"Ronda Local"**.

Guarda sola el token y los ids que va necesitando, así que se corre de arriba a abajo
sin copiar y pegar nada.

Está **generada por script**. Si agregás un endpoint, no edites el JSON a mano:

```bash
npm run postman
```

### Con VS Code

Alternativa sin salir del editor: extensión **REST Client** y abrir `requests.http`.

---

## Envío del OTP por mail

Controlado por `MAIL_MODE` en el `.env`:

- **`console`** (por defecto): el código se imprime en la terminal. No requiere
  configurar nada — es el modo para desarrollar.
- **`smtp`**: manda un mail real con Nodemailer. Para Gmail, activá la verificación en
  2 pasos, generá una **contraseña de aplicación** en
  <https://myaccount.google.com/apppasswords>, y ponela en `SMTP_PASS`.

`OTP_EXPOSE_IN_RESPONSE=true` hace que la API devuelva el código dentro del JSON.
Es lo que permite que Postman lo guarde solo. **Ponelo en `false`** antes de la demo si
vas a mostrar el envío real.

---

## Estructura

```
src/
├── server.js              arranque: conecta a la base y abre el puerto
├── app.js                 arma Express y engancha middlewares
├── config/                env.js (lee el .env) y db.js (pool de conexiones)
├── routes/                qué URL llama a qué controller
├── controllers/           traduce HTTP <-> service
├── services/              lógica de negocio
│   ├── authService        Punto 1
│   ├── usuarioService     Punto 2
│   ├── publicacionService Punto 3 y 4 (lectura)
│   ├── interaccionService Punto 4 (preguntas y ofertas)
│   ├── publicarService    Punto 5
│   └── favoritoService    Punto 6
├── dtos/                  qué campos salen en el JSON de respuesta
├── middlewares/           auth, authOpcional y manejo de errores
└── utils/                 ApiError y generación de OTP
scripts/
├── setup-db.js            crea la base y las tablas
├── seed-demo.js           datos de ejemplo
└── generate-postman.js    genera la colección
sql/
├── 01_schema.sql          usuarios y códigos OTP
├── 02_perfil.sql          zonas, operaciones, calificaciones
├── 03_publicaciones.sql   categorías, publicaciones, fotos
├── 04_detalle.sql         preguntas, ofertas
├── 05_publicar.sql        borradores
└── 06_favoritos.sql       favoritos, búsquedas guardadas
```

La regla: **routes → controllers → services → dtos → base de datos**. Ninguna capa se
saltea a la siguiente.

**Sobre los DTOs:** la fila de la base tiene columnas que no deben salir
(`password_hash`) y nombres en snake_case. Lo que la API devuelve es otra cosa: sólo
los campos públicos, en camelCase. Esa traducción vive en `src/dtos/` — un solo lugar
donde está escrito el contrato con el front.

---

## Cómo lo consume la app Android

| Dónde corre la app | URL base |
|---|---|
| Emulador de Android Studio | `http://10.0.2.2:3000/` |
| Celular físico en la misma WiFi | `http://<IP-de-tu-PC>:3000/` |

`10.0.2.2` es el alias que el emulador usa para llegar al `localhost` de la PC. La IP
de la PC la imprime el servidor al arrancar.

Como es HTTP (no HTTPS), Android necesita permiso explícito de tráfico en claro: ver
`network_security_config.xml` en el repo de la app.
