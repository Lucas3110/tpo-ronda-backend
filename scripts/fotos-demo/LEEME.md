# Fotos para el seed de la demo

Poné acá las fotos que querés que aparezcan en las publicaciones de ejemplo.
`npm run db:seed:hallado` las copia a `uploads/` y las sirve el propio
backend, así que durante la grabación **no dependen de internet**.

## Cómo se nombran

`<clave>.jpg`, o `<clave>-1.jpg`, `<clave>-2.jpg`… si querés varias para el
mismo objeto (la galería del punto 4 se luce con dos o tres).

Sirven `.jpg`, `.jpeg`, `.png` y `.webp`.

## Las claves que usa el seed

| Clave | Qué tiene que mostrar | Dónde se ve |
|---|---|---|
| `llaves` | un llavero con llaves | 3 publicaciones |
| `billetera` | una billetera | 3 |
| `perro` | un perro | 2 |
| `gato` | un gato | 2 |
| `campera` | una campera | 3 |
| `auriculares` | auriculares | 2 |
| `celular` | un celular | 1 (pide 3 fotos) |
| `anteojos` | anteojos | 1 |
| `mochila` | una mochila | 1 (pide 2 fotos) |
| `bufanda` | una bufanda | 1 |
| `reloj` | un reloj | 1 |
| `paraguas` | un paraguas | 1 |
| `sube` | una tarjeta SUBE | 1 |
| `dni` | un DNI | ninguna hoy (esa publicación va sin foto a propósito) |

No hace falta ponerlas todas. **La que no esté cae en una imagen aleatoria**,
que es como funcionaba antes, así que podés empezar por las que más se ven en
el video: `llaves`, `billetera`, `perro`, `gato` y `campera`.

Si una publicación pide más fotos de las que hay (el celular pide 3), repite
las que encuentre dando la vuelta.

## De dónde sacarlas

Cualquier foto tuya sirve, y es lo más simple. Si no, bancos de imágenes
gratis como Unsplash, Pexels o Pixabay permiten descargar y usar sin
atribución. **No hace falta que sean buenas**: alcanza con que se entienda qué
objeto es.

No las achiques: el seed las copia tal cual. Con que entren en unos cientos de
KB va bien.

## Estos archivos sí van al repo

A diferencia de `uploads/`, que está en el `.gitignore`, esta carpeta se
commitea: así cualquiera del equipo corre el seed y ve las mismas fotos.
