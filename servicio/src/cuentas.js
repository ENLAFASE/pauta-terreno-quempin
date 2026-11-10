// Claves, sesiones y reglas de las cuentas de terreno (decisión del 2026-10-28:
// sesión de 30 días, clave que vence a los 60, aviso 7 días antes).
// Funciona igual en Cloudflare Workers, en el navegador y en Node 20+ (WebCrypto).

export const ITERACIONES = 100000; // el máximo que acepta PBKDF2 en Cloudflare Workers
export const DIAS_SESION = 30;
export const DIAS_CLAVE = 60;
export const DIAS_AVISO_CLAVE = 7;
export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
export const LARGO_MINIMO_CLAVE = 10;

const DIA = 24 * 60 * 60 * 1000;
const codificador = new TextEncoder();

export function aBase64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64url(texto) {
  const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function nuevaSal() {
  return aBase64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashClave(clave, sal, iteraciones = ITERACIONES) {
  const llave = await crypto.subtle.importKey('raw', codificador.encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: deBase64url(sal), iterations: iteraciones },
    llave,
    256,
  );
  return aBase64url(new Uint8Array(bits));
}

// Comparación en tiempo constante, para no dar pistas por el tiempo de respuesta.
export function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function sha256(texto) {
  const bits = await crypto.subtle.digest('SHA-256', codificador.encode(texto));
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// El token va solo al celular; en la base queda su sha256, así una copia de la base no abre sesiones.
export function nuevoToken() {
  return aBase64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function normalizarUsuario(usuario) {
  return String(usuario || '').trim().toLowerCase();
}

export function validarClaveNueva(clave, usuario) {
  if (typeof clave !== 'string' || clave.length < LARGO_MINIMO_CLAVE) {
    return `La clave debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  }
  if (clave.length > 128) return 'La clave es demasiado larga.';
  // Con usuarios de 2 o 3 letras («ev») la regla rechazaría claves comunes («nueva»): se aplica desde 4.
  const u = normalizarUsuario(usuario);
  if (u.length >= 4 && normalizarUsuario(clave).includes(u)) return 'La clave no puede contener el usuario.';
  return null;
}

export function sumarDias(fecha, dias) {
  return new Date(fecha.getTime() + dias * DIA);
}

export function diasHasta(fechaIso, ahora = new Date()) {
  return Math.ceil((new Date(fechaIso).getTime() - ahora.getTime()) / DIA);
}

// Lo que el celular puede saber de la persona: nunca el hash ni los intentos.
// claveInicial: la clave la puso un administrador (alta o reseteo) y hay que cambiarla sí o sí.
// Una clave vencida también pide cambio, pero la app deja seguir tomando fotos.
export function datosPublicos(u, ahora = new Date()) {
  const diasClave = diasHasta(u.vence_clave, ahora);
  return {
    usuario: u.usuario,
    nombre: u.nombre,
    iniciales: u.iniciales,
    rol: u.rol,
    diasClave,
    avisoClave: diasClave <= DIAS_AVISO_CLAVE,
    claveInicial: u.cambiar_clave === 1,
    cambiarClave: u.cambiar_clave === 1 || diasClave <= 0,
  };
}
