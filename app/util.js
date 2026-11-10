// Funciones sin pantalla de la app de terreno (las prueban los tests en Node).

// Hora local con su desfase, como la espera el servicio: «2026-11-09T10:15:30-03:00».
export function isoLocal(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const desfase = -fecha.getTimezoneOffset();
  const signo = desfase >= 0 ? '+' : '-';
  const a = Math.abs(desfase);
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}` +
    `T${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}` +
    `${signo}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

// El registro viaja en la cabecera X-Registro: JSON en UTF-8, en base64url.
export function codificarRegistro(registro) {
  const bytes = new TextEncoder().encode(JSON.stringify(registro));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Lado largo de 2048 px como máximo (diseño, §10). Nunca agranda.
export function medidasReducidas(ancho, alto, maximo = 2048) {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

// crypto.randomUUID falta en navegadores antiguos (Safari < 15.4).
export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nuevoIdDispositivo() {
  const letras = 'abcdefghijkmnpqrstuvwxyz23456789';
  const azar = crypto.getRandomValues(new Uint8Array(10));
  return [...azar].map((b) => letras[b % letras.length]).join('');
}

// Qué hacer con la respuesta del servicio a una foto.
export function decidirTrasSubida(estado) {
  if (estado >= 200 && estado < 300) return 'subida';
  if (estado === 401) return 'sesion';
  if (estado === 408 || estado === 429 || estado >= 500) return 'reintentar';
  return 'rechazada';
}

export function textoPendientes(n) {
  if (n === 0) return 'Todo subido';
  return n === 1 ? '1 foto por subir' : `${n} fotos por subir`;
}
