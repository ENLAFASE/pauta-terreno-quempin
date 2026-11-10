# Fase 0: despliegue y prueba en los celulares

(2026-11-09) Se hace después de la guía de configuración del tenant (`2026-10-28-guia-configuracion-fase-0.md`). Con el resultado de esta prueba se decide si la PWA basta o hace falta una app nativa (diseño, §4.4).

## 1. Preparar el PC (una vez)

1. Instala **Node.js LTS** desde <https://nodejs.org> (20 o más nuevo) y abre una terminal nueva.
2. En la carpeta del repo:

   ```bash
   npm install
   npm test
   npx wrangler login
   ```

   `wrangler login` abre el navegador para autorizar la cuenta de Cloudflare.

## 2. Base de cuentas (D1)

```bash
npx wrangler d1 create terreno-quempin
```

1. Copia el `database_id` que entrega el comando a `servicio/wrangler.toml`.
2. Completa `TENANT_ID`, `CLIENT_ID`, `SITIO_ID` y `LISTA_ID` con los datos de la guía de configuración.
3. Crea las tablas:

   ```bash
   npx wrangler d1 execute terreno-quempin --remote --config servicio/wrangler.toml --file servicio/esquema.sql
   ```

## 3. Secreto y despliegue

```bash
npx wrangler secret put GRAPH_CLIENT_SECRET --config servicio/wrangler.toml
npm run desplegar
```

1. El primer comando pide el valor del secreto: pégalo **en la terminal** desde el gestor de contraseñas.
2. `desplegar` muestra la dirección del servicio (`https://terreno-quempin.<algo>.workers.dev`). Ponla en `app/config.js`, en lugar de `SUBDOMINIO`.
3. Comprueba que el servicio responde abriendo `https://terreno-quempin.<algo>.workers.dev/api/salud`. Debe decir `{"ok":true,...}`.

## 4. Cuentas de prueba

```bash
node herramientas/cuentas.mjs alta --usuario es --nombre "Enzo Saavedra" --iniciales ES --rol administrador
node herramientas/cuentas.mjs alta --usuario ev --nombre "Eric Vergara" --iniciales EV --rol tecnico
```

- Cada comando deja un `.sql` en `.usuarios/` (git lo ignora) y muestra la **clave temporal una sola vez**.
- Aplica cada `.sql` con el comando que muestra la herramienta.
- Entrega la clave en persona: se pide cambiarla en el primer ingreso.

## 5. Publicar la app

```bash
git add -A
git commit -m "Fase 0: dirección del servicio"
git push
```

En GitHub, entra a **Settings → Pages → Source** y elige **GitHub Actions** (una vez). La app queda en <https://enlafase.github.io/pauta-terreno-quempin/>.

**Instalarla en el teléfono** (obligatorio, para que el teléfono no borre las fotos guardadas):
- **Android (Chrome):** menú ⋮ → *Instalar app* o *Agregar a pantalla principal*.
- **iPhone (Safari):** botón Compartir → *Agregar a inicio*.

En el Redmi conviene además dejar la app (o Chrome) **sin restricciones de batería**: *Ajustes → Apps → Chrome → Ahorro de batería → Sin restricciones*.

## 6. Protocolo de prueba

Hazla en el Redmi Note 13 4G y, si se consigue, en un iPhone. Anota el resultado de cada punto.

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Primer ingreso con la clave temporal | Pide cambiar la clave; con la nueva, entra |
| 2 | «Tomar foto» con señal | En segundos la banda dice «Todo subido ✓» y la foto aparece en `0 Prueba app terreno/<fecha>/` con su fila en la lista |
| 3 | Modo avión, 5 fotos con «Tomar foto» y 5 con «Cámara en la app» | Banda roja «Sin señal · 10 fotos por subir». Las miniaturas se ven |
| 4 | Con las 10 pendientes, cerrar la app (quitarla de recientes) y apagar el modo avión | Al abrir la app, se suben solas. En SharePoint hay exactamente 10 fotos, sin duplicados |
| 5 | Señal mala (subterráneo o sala de calderas real) | Ninguna foto se pierde. Si algo queda pendiente, sube después |
| 6 | Calidad: la misma placa con «Tomar foto» y con «Cámara en la app» | Anotar cuál se lee mejor y cuál es más rápida con guantes |
| 7 | «Desde galería», incluida una foto de WhatsApp | Se guarda con origen «galeria» |
| 8 | Comentario con tildes y ñ | Llega igual a la lista |
| 9 | Dos teléfonos subiendo a la vez | Todo llega, con el autor correcto en cada foto |
| 10 | Salir con fotos pendientes y entrar con otra cuenta | Las fotos de la primera cuenta no se suben a nombre de la segunda |
| 11 | Abrir la app sin señal, después de haberla usado | Abre normal y se pueden tomar fotos |
| 12 | 5 claves malas seguidas | Bloqueo de 15 minutos |

Si una foto queda «No se pudo subir», usa *Guardar en el teléfono* y anota el motivo que muestra.

## 7. Al terminar

- Anota el tiempo por foto, la calidad de cada cámara y los problemas.
- Con eso se decide entre seguir con la PWA o pasar a una app nativa.
- Las fotos de `0 Prueba app terreno` se pueden borrar después.
