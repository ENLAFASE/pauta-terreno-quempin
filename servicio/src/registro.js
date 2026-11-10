// El «registro» de una foto: lo que el celular manda junto a ella (cabecera X-Registro,
// JSON en base64url) y cómo se convierte en archivo de SharePoint y fila de la lista
// «Registro de terreno» (guía de configuración, paso 4).

import { deBase64url } from './cuentas.js';

export const MOMENTOS = ['antes', 'durante', 'despues', 'otro'];
export const ORIGENES_FOTO = ['camara', 'galeria'];
export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_COMENTARIO = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Hora local del celular con su desfase: «2026-11-09T10:15:30-03:00». El nombre del archivo usa la hora local.
const FECHA_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const DISPOSITIVO = /^[A-Za-z0-9_-]{4,64}$/;
const CLAVE = /^(req|tag|pro|otra|prueba):[^\s/\\]{1,80}$/;

export function leerRegistro(cabecera) {
  if (!cabecera || cabecera.length > 16000) return null;
  try {
    const r = JSON.parse(new TextDecoder().decode(deBase64url(cabecera)));
    return r && typeof r === 'object' && !Array.isArray(r) ? r : null;
  } catch {
    return null;
  }
}

export function validarRegistro(r, ahora = new Date()) {
  const errores = [];
  if (!UUID.test(r.id || '')) errores.push('id');
  if (!FECHA_LOCAL.test(r.tomada || '') || Number.isNaN(Date.parse(r.tomada))) errores.push('tomada');
  else if (Date.parse(r.tomada) > ahora.getTime() + 24 * 60 * 60 * 1000) errores.push('tomada');
  if (!MOMENTOS.includes(r.momento)) errores.push('momento');
  if (!ORIGENES_FOTO.includes(r.origen)) errores.push('origen');
  if (!DISPOSITIVO.test(r.dispositivo || '')) errores.push('dispositivo');
  if (!CLAVE.test(r.clave || '')) errores.push('clave');
  if (r.comentario != null && (typeof r.comentario !== 'string' || r.comentario.length > MAX_COMENTARIO)) {
    errores.push('comentario');
  }
  return errores;
}

// Siempre el mismo nombre para la misma foto: así reintentar nunca la duplica.
export function rutaFoto(carpetaBase, r, iniciales) {
  const [, a, m, d, h, mi, s] = FECHA_LOCAL.exec(r.tomada);
  const autor = String(iniciales).replace(/[^A-Za-z0-9-]/g, '');
  return {
    carpeta: `${carpetaBase}/${a}-${m}-${d}`,
    nombre: `${a}${m}${d}-${h}${mi}${s}_${autor}_${r.id}.jpg`,
  };
}

export function camposLista(r, persona, archivo) {
  return {
    Title: r.id,
    idRegistro: r.id,
    clase: 'foto',
    clave: r.clave,
    visita: r.tomada.slice(0, 10),
    momento: r.momento,
    archivo: archivo.id,
    autor: persona.iniciales,
    subidoPor: persona.iniciales,
    dispositivo: r.dispositivo,
    tomada: new Date(r.tomada).toISOString(),
    origen: r.origen,
    comentario: r.comentario || '',
  };
}

export function esJpeg(bytes) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
