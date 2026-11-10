# CLAUDE.md: Pauta de terreno QUEMPIN

Instrucciones para Claude Code en este repo. El diseño vive fuera del repo: `2026-10-28-diseno-app-registro-fotografico.md` (SharePoint, Gerencia/Ventas). Antes de cambiar la arquitectura, léelo.

## Decisiones que no se cambian sin pedirlo

- (2026-10-28) **Opción A:** el personal de terreno no usa cuentas de Microsoft. Las cuentas viven en D1 y el servicio sube a SharePoint con una app de Entra que tiene `Sites.Selected`: escritura en el sitio Gestión de Proyectos y lectura en Formulación de proyectos.
- (2026-10-28) Sesión de 30 días; clave que vence a los 60 días, con aviso a 7; con la clave vencida se siguen aceptando fotos. Administradores: NB, ES, CM y LC.
- (2026-10-28) Hospedaje en Cloudflare Workers. Código en `ENLAFASE/pauta-terreno-quempin`, que se migrará a una cuenta de la empresa: las direcciones están solo en `app/config.js` y en `ORIGENES` de `servicio/wrangler.toml`.
- Debe funcionar en cualquier Android o iPhone. El de referencia es el Redmi Note 13 4G (Chrome).
- **Una foto nunca se borra del teléfono antes de que el servicio confirme.** Reintentar nunca duplica: el nombre del archivo sale del id de la foto, la subida usa `conflictBehavior=fail` y `idRegistro` es único en la lista.
- El autor de una foto es siempre el de la sesión, nunca lo que diga el teléfono.

## Convenciones

- Español de Chile en el código, los mensajes y la documentación. Comentarios que explican el porqué, con fecha cuando registran una decisión.
- Sin paso de compilación: la app es JavaScript con módulos ES servido tal cual. Si se agrega un archivo a `app/`, también va en `ARCHIVOS` de `app/sw.js` (lo revisa un test), y se sube `VERSION` en `sw.js` en cada cambio de la app.
- Las funciones sin pantalla van en `app/util.js` o en `servicio/src/*.js` y llevan su test en `tests/`. `npm test` corre con `node --test`.
- El repo es público: ni secretos, ni fotos, ni RUT, ni nombres de contactos de clientes. Los tests usan datos inventados.
- `herramientas/simulador.py` imita el contrato del servicio: si cambia una ruta o una respuesta en `servicio/src/index.js`, se cambia también ahí.

## Comandos

```bash
npm test                     # tests (Node 20+)
python herramientas/simulador.py   # app en http://localhost:5173/app/ con un servicio falso
npm run servicio             # el Worker de verdad en el PC (necesita servicio/.dev.vars)
npm run desplegar            # publica el Worker en Cloudflare
```
