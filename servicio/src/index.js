// Servicio de terreno (fase 0): cuentas propias y subida de fotos a SharePoint.
// Diseño: 2026-10-28-diseno-app-registro-fotografico.md, §4.3.

import { respuesta, listaOrigenes, cabecerasCors, leerJson } from './http.js';
import {
  DIAS_SESION, DIAS_CLAVE, MAX_INTENTOS, MINUTOS_BLOQUEO,
  hashClave, iguales, nuevaSal, nuevoToken, sha256, sumarDias,
  normalizarUsuario, validarClaveNueva, datosPublicos,
} from './cuentas.js';
import { leerRegistro, validarRegistro, rutaFoto, camposLista, esJpeg, MAX_BYTES } from './registro.js';
import { subirArchivo, agregarFila, ErrorGraph } from './graph.js';

export const VERSION = 'fase0-2026-11-09';

export default {
  async fetch(req, env) {
    const cors = cabecerasCors(req.headers.get('origin'), listaOrigenes(env.ORIGENES));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let r;
    try {
      r = await despachar(req, env, new URL(req.url));
    } catch (e) {
      console.error(e instanceof ErrorGraph ? `${e.message} ${e.detalle}` : e);
      // Un error de Graph o de la red es pasajero: 503 le dice al celular que reintente más tarde.
      r = respuesta({ error: e instanceof ErrorGraph ? 'sharepoint' : 'interno' }, e instanceof ErrorGraph ? 503 : 500);
    }
    for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
    return r;
  },
};

async function despachar(req, env, url) {
  const ruta = url.pathname.replace(/\/+$/, '');
  if (req.method === 'GET' && ruta === '/api/salud') return respuesta({ ok: true, version: VERSION });
  if (req.method === 'POST' && ruta === '/api/sesion') return iniciarSesion(req, env);

  const sesion = await sesionDe(req, env);
  if (!sesion) return respuesta({ error: 'sesion' }, 401);

  if (req.method === 'GET' && ruta === '/api/yo') return respuesta({ persona: datosPublicos(sesion) });
  if (req.method === 'POST' && ruta === '/api/salir') return cerrarSesion(env, sesion);
  if (req.method === 'POST' && ruta === '/api/clave') return cambiarClave(req, env, sesion);
  const foto = /^\/api\/fotos\/([0-9a-f-]{36})$/.exec(ruta);
  if (req.method === 'PUT' && foto) return subirFoto(req, env, foto[1], sesion);
  return respuesta({ error: 'no-existe' }, 404);
}

async function iniciarSesion(req, env) {
  const datos = await leerJson(req);
  if (!datos || typeof datos.usuario !== 'string' || typeof datos.clave !== 'string') {
    return respuesta({ error: 'datos' }, 400);
  }
  const ahora = new Date();
  const u = await env.DB.prepare('SELECT * FROM usuarios WHERE usuario = ?').bind(normalizarUsuario(datos.usuario)).first();
  if (u && u.bloqueado_hasta && new Date(u.bloqueado_hasta) > ahora) {
    return respuesta({ error: 'bloqueado', hasta: u.bloqueado_hasta }, 429);
  }
  const vigente = u && u.activo === 1 && !(u.vence_cuenta && new Date(u.vence_cuenta) <= ahora);
  const correcta = u && iguales(await hashClave(datos.clave, u.sal, u.iteraciones), u.hash);
  if (!vigente || !correcta) {
    if (u) {
      const intentos = u.intentos + 1;
      const bloqueo = intentos >= MAX_INTENTOS ? new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60000).toISOString() : null;
      await env.DB.prepare('UPDATE usuarios SET intentos = ?, bloqueado_hasta = ? WHERE usuario = ?')
        .bind(bloqueo ? 0 : intentos, bloqueo, u.usuario).run();
    }
    // El mismo mensaje para usuario inexistente, clave mala o cuenta vencida.
    return respuesta({ error: 'credenciales' }, 401);
  }

  const token = nuevoToken();
  const vence = sumarDias(ahora, DIAS_SESION).toISOString();
  const dispositivo = typeof datos.dispositivo === 'string' ? datos.dispositivo.slice(0, 64) : null;
  await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET intentos = 0, bloqueado_hasta = NULL WHERE usuario = ?').bind(u.usuario),
    env.DB.prepare('INSERT INTO sesiones (id, usuario, dispositivo, creada, vence) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(token), u.usuario, dispositivo, ahora.toISOString(), vence),
  ]);
  return respuesta({ token, vence, persona: datosPublicos(u, ahora) });
}

async function sesionDe(req, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  const s = await env.DB.prepare(
    `SELECT s.id AS sesion, s.vence AS sesion_vence, s.revocada, u.*
       FROM sesiones s JOIN usuarios u ON u.usuario = s.usuario WHERE s.id = ?`,
  ).bind(await sha256(m[1])).first();
  const ahora = new Date();
  if (!s || s.revocada || new Date(s.sesion_vence) <= ahora || s.activo !== 1) return null;
  if (s.vence_cuenta && new Date(s.vence_cuenta) <= ahora) return null;
  return s;
}

async function cerrarSesion(env, sesion) {
  await env.DB.prepare('UPDATE sesiones SET revocada = ? WHERE id = ?').bind(new Date().toISOString(), sesion.sesion).run();
  return respuesta({ ok: true });
}

// Cambiar la clave no cierra la sesión de este celular, pero sí las de los demás.
async function cambiarClave(req, env, sesion) {
  const datos = await leerJson(req);
  if (!datos || typeof datos.actual !== 'string' || typeof datos.nueva !== 'string') return respuesta({ error: 'datos' }, 400);
  if (!iguales(await hashClave(datos.actual, sesion.sal, sesion.iteraciones), sesion.hash)) {
    return respuesta({ error: 'clave-actual' }, 403);
  }
  const problema = validarClaveNueva(datos.nueva, sesion.usuario);
  if (problema) return respuesta({ error: 'clave-nueva', mensaje: problema }, 400);
  if (iguales(await hashClave(datos.nueva, sesion.sal, sesion.iteraciones), sesion.hash)) {
    return respuesta({ error: 'clave-nueva', mensaje: 'La clave nueva debe ser distinta de la actual.' }, 400);
  }
  const ahora = new Date();
  const sal = nuevaSal();
  const hash = await hashClave(datos.nueva, sal);
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE usuarios SET hash = ?, sal = ?, iteraciones = 100000, vence_clave = ?, cambiar_clave = 0 WHERE usuario = ?',
    ).bind(hash, sal, sumarDias(ahora, DIAS_CLAVE).toISOString(), sesion.usuario),
    env.DB.prepare('UPDATE sesiones SET revocada = ? WHERE usuario = ? AND id <> ? AND revocada IS NULL')
      .bind(ahora.toISOString(), sesion.usuario, sesion.sesion),
  ]);
  const u = await env.DB.prepare('SELECT * FROM usuarios WHERE usuario = ?').bind(sesion.usuario).first();
  return respuesta({ ok: true, persona: datosPublicos(u, ahora) });
}

// Con la clave vencida igual se aceptan fotos: nunca se corta una visita a medias (2026-10-28).
async function subirFoto(req, env, id, sesion) {
  const r = leerRegistro(req.headers.get('x-registro'));
  if (!r || r.id !== id) return respuesta({ error: 'registro', errores: ['x-registro'] }, 400);
  const errores = validarRegistro(r);
  if (errores.length) return respuesta({ error: 'registro', errores }, 400);
  if ((req.headers.get('content-type') || '').split(';')[0].trim() !== 'image/jpeg') {
    return respuesta({ error: 'formato' }, 415);
  }
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) return respuesta({ error: 'tamano' }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return respuesta({ error: 'tamano' }, 413);
  if (!esJpeg(bytes)) return respuesta({ error: 'formato' }, 415);

  const { carpeta, nombre } = rutaFoto(env.CARPETA_BASE, r, sesion.iniciales);
  const archivo = await subirArchivo(env, carpeta, nombre, bytes);
  const fila = await agregarFila(env, camposLista(r, sesion, archivo));
  return respuesta({ ok: true, archivo: archivo.estado, fila: fila.estado, url: archivo.url });
}
