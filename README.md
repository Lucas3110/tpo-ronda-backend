# TPO Ronda — Backend (API REST)

API REST en Node.js + Express + MySQL/MariaDB para la app **Ronda** (compra y venta
entre personas). Este repo cubre el **Punto 1: Autenticación y Registro de Usuarios**.

---

## Puesta en marcha (4 comandos)

### Requisitos

| Herramienta | Versión | Verificar con |
|---|---|---|
| Node.js | 18+ (probado en 22) | `node -v` |
| Un servidor MySQL | ver abajo | — |

**Para la base recomendamos XAMPP**, porque no hay que configurar nada: se instala,
se abre el Control Panel y se toca *Start* en la fila **MySQL**. El usuario es `root`
y la contraseña está **vacía**, que es exactamente lo que el `.env.example` ya trae.

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
npm run dev
```

`npm run db:setup` crea la base `ronda` y las dos tablas por vos — no necesitás el
cliente `mysql` de la terminal, ni Workbench, ni phpMyAdmin. Si algo falla, el script
te dice exactamente qué revisar.

Si todo salió bien, `npm run dev` imprime:

```
OK  Conectado a MySQL (localhost:3306/ronda)

API escuchando en el puerto 3000
  PC              -> http://localhost:3000/api/health
  Emulador Android-> http://10.0.2.2:3000/api/health
  Celular (WiFi)  -> http://192.168.0.15:3000/api/health
  Modo de mail    -> console
```

### Lo único que conviene cambiar del `.env`

`JWT_SECRET`. Generá uno propio con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Probar la API

### Con Postman (recomendado para el equipo)

La colección está versionada en `postman/`. En Postman: **Import** → arrastrá los dos
archivos → seleccioná el environment **"Ronda Local"** arriba a la derecha.

```
postman/Ronda-API.postman_collection.json
postman/Ronda-Local.postman_environment.json
```

La colección **guarda sola** el token y el código OTP en variables, así que se corre
de arriba a abajo sin copiar y pegar nada. Incluye una carpeta de **casos de error**
(400 / 401 / 409) para mostrar en la demo.

Está **generada por script**. Si agregás un endpoint, no edites el JSON a mano:

```bash
npm run postman
```

Se regenera desde `scripts/generate-postman.js`. Los IDs son deterministas, así que
el archivo sólo cambia cuando cambian los endpoints de verdad.

### Con VS Code

Alternativa sin salir del editor: instalá la extensión **REST Client** y abrí
`requests.http`. Cada bloque tiene un botón "Send Request".

---

## Endpoints

Base: `/api`

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| GET  | `/health` | — | Chequeo de vida |
| POST | `/auth/registro` | — | Crea la cuenta y envía el OTP |
| POST | `/auth/otp/enviar` | — | Envía / reenvía un código (`REGISTRO` o `LOGIN`) |
| POST | `/auth/otp/verificar` | — | Valida el código y devuelve el token |
| POST | `/auth/login` | — | Login con email + contraseña |
| GET  | `/auth/me` | Bearer | Datos del usuario logueado |

### Formato de error

Todos los errores responden con la misma forma:

```json
{ "error": { "codigo": "OTP_EXPIRADO", "mensaje": "El código venció. Pedí uno nuevo." } }
```

El campo `codigo` es estable: la app Android decide qué mostrar según ese valor, no
según el texto del mensaje.

---

## Envío del OTP por mail

Controlado por `MAIL_MODE` en el `.env`:

- **`console`** (por defecto): el código se imprime en la terminal. No requiere
  configurar nada — es el modo para desarrollar y para que el equipo levante el
  proyecto sin credenciales.
- **`smtp`**: manda un mail real con Nodemailer. Para Gmail:
  1. Activá la verificación en 2 pasos en la cuenta.
  2. Entrá a <https://myaccount.google.com/apppasswords> y generá una
     **contraseña de aplicación** (16 caracteres).
  3. Poné esa contraseña en `SMTP_PASS` y tu dirección en `SMTP_USER`.
  4. `MAIL_MODE=smtp`.

`OTP_EXPOSE_IN_RESPONSE=true` hace que la API devuelva el código dentro del JSON
(`codigoDesarrollo`). Es lo que permite que Postman lo guarde solo. **Ponelo en
`false`** antes de la demo si vas a mostrar el envío real por mail.

---

## Estructura

```
src/
├── server.js              arranque: conecta a la base y abre el puerto
├── app.js                 arma Express y engancha middlewares
├── config/
│   ├── env.js             lee el .env (único lugar que toca process.env)
│   └── db.js              pool de conexiones
├── routes/                qué URL llama a qué controller
├── controllers/           traduce HTTP <-> service
├── services/              lógica de negocio (authService, mailer)
├── dtos/                  qué campos salen en el JSON de respuesta
├── middlewares/           autenticación JWT y manejo de errores
└── utils/                 ApiError y generación de OTP
scripts/
├── setup-db.js            crea la base y las tablas
└── generate-postman.js    genera la colección de Postman
sql/
└── 01_schema.sql          base y tablas (también se puede correr a mano)
```

La regla: **routes → controllers → services → dtos → base de datos**. Ninguna capa se
saltea a la siguiente.

**Sobre los DTOs:** la fila de la tabla `usuarios` tiene `password_hash` y nombres en
snake_case. Lo que la API devuelve es otra cosa: sólo los campos públicos, en
camelCase. Esa traducción vive en `src/dtos/` — un solo lugar donde está escrito el
contrato con el front, y una garantía de que no se filtra un campo sin querer.

---

## Cómo lo consume la app Android

| Dónde corre la app | URL base |
|---|---|
| Emulador de Android Studio (Device Manager) | `http://10.0.2.2:3000/` |
| Celular físico en la misma WiFi | `http://<IP-de-tu-PC>:3000/` |

`10.0.2.2` es el alias que el emulador usa para llegar al `localhost` de la PC —
`localhost` desde el emulador apunta al propio emulador. La IP de la PC la imprime el
servidor al arrancar.

Como es HTTP (no HTTPS), Android necesita permiso explícito de tráfico en claro: ver
`network_security_config.xml` en el repo de la app.
