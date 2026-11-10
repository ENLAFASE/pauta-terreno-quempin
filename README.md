# Pauta de terreno QUEMPIN

App de registro fotográfico para técnicos en terreno y, más adelante, la **Pauta de terreno** de los ingenieros en el grupo *Control y finanzas* del Portal QUEMPIN.

> **Estado: fase 0 (prueba técnica).** Una pantalla para entrar, tomar fotos y subirlas a una carpeta de prueba de SharePoint, con una cola que funciona sin señal. El diseño completo está en `2026-10-28-diseno-app-registro-fotografico.md`, en la carpeta Gerencia/Ventas de SharePoint.

## Cómo funciona

```
Celular (app/, PWA en GitHub Pages)
   │  usuario y clave de la app (sin cuentas de Microsoft)
   ▼
Servicio de terreno (servicio/, Cloudflare Workers + D1 para las cuentas)
   │  Microsoft Graph, permiso Sites.Selected (solo los sitios autorizados)
   ▼
SharePoint · sitio Gestión de Proyectos
   ├─ 0 Prueba app terreno/<AAAA-MM-DD>/<hora>_<iniciales>_<id>.jpg
   └─ lista «Registro de terreno»: una fila por foto
```

- **No se pierden fotos:** cada foto queda en el teléfono (IndexedDB) hasta que el servicio confirma que llegó a SharePoint.
- **No se duplican:** cada foto lleva un id que se crea en el teléfono. El nombre del archivo sale de ese id y la subida usa `conflictBehavior=fail`; además, `idRegistro` es único en la lista. Reintentar es seguro.
- **Cuentas:** sesión de 30 días por teléfono y clave que vence a los 60 días. Con la clave vencida se siguen aceptando fotos.

## Carpetas

| Carpeta | Qué hay |
|---|---|
| `app/` | La PWA: `app.js` (pantallas), `cola.js` (IndexedDB), `util.js` (funciones con tests), `sw.js` (para abrir sin señal), `config.js` (dirección del servicio) |
| `servicio/` | El Worker: `src/index.js` (rutas), `cuentas.js` (claves y sesiones), `registro.js` (validación y nombres), `graph.js` (SharePoint), `esquema.sql` (D1) y `wrangler.toml` |
| `herramientas/` | `cuentas.mjs` (alta, reseteo y baja de cuentas), `simulador.py` (servicio falso para probar en el PC), `iconos.py` |
| `tests/` | `npm test` (Node 20 o más nuevo) |
| `docs/` | `fase-0.md`: despliegue y protocolo de prueba en los celulares |

## Probar en el PC sin nada configurado

```bash
python herramientas/simulador.py
```

Abre <http://localhost:5173/app/> y entra con `prueba` / `prueba12345`.

## Reglas

- **El repo es público:** no van secretos, ni fotos, ni datos de clientes. `tests/repo.test.mjs` lo revisa.
- El secreto de Graph va solo en Cloudflare (`wrangler secret put`) o en `servicio/.dev.vars`, que git ignora.
- Todo en español de Chile, con documentación fechada.
