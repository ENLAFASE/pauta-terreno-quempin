// App de terreno, fase 0: entrar, tomar fotos y subirlas sin perder ninguna.
// Diseño: 2026-10-28-diseno-app-registro-fotografico.md, §4.4 y §8.

import { API, CLAVE_PRUEBA } from './config.js';
import * as cola from './cola.js';
import {
  isoLocal, codificarRegistro, medidasReducidas, nuevoId, nuevoIdDispositivo,
  decidirTrasSubida, textoPendientes,
} from './util.js';

const $ = (id) => document.getElementById(id);

// localStorage puede fallar (modo privado, datos bloqueados): la app sigue, solo pide entrar de nuevo.
const guardado = {
  leer(clave) {
    try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; }
  },
  escribir(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
  },
  borrar(clave) {
    try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
  },
};

let sesion = guardado.leer('sesion');
let dispositivo = guardado.leer('dispositivo');
if (!dispositivo) {
  dispositivo = nuevoIdDispositivo();
  guardado.escribir('dispositivo', dispositivo);
}
let momento = 'durante';
let subiendo = false;
let sinRed = !navigator.onLine;
let flujo = null;
let tomadasEnCamara = 0;
let claveYaPedida = false;

// ---------- Pantallas ----------

function mostrar(pantalla) {
  for (const p of ['ingreso', 'clave', 'fotos']) $(`pantalla-${p}`).hidden = p !== pantalla;
  $('salir').hidden = pantalla === 'ingreso';
  $('quien').textContent = pantalla === 'ingreso' || !sesion ? '' : sesion.persona.nombre;
}

let temporizadorAviso = null;
function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { a.hidden = true; }, 3500);
}

function sesionVigente() {
  return Boolean(sesion && sesion.token && sesion.persona && new Date(sesion.vence) > new Date());
}

function api(ruta, opciones = {}) {
  const headers = { ...(opciones.headers || {}) };
  if (sesion && sesion.token) headers.authorization = `Bearer ${sesion.token}`;
  return fetch(API + ruta, { ...opciones, headers });
}

function entrar() {
  const p = sesion.persona;
  if (p.cambiarClave && !claveYaPedida) {
    claveYaPedida = true;
    $('motivo-clave').textContent = p.claveInicial
      ? 'Es tu primer ingreso o te resetearon la clave: elige una clave tuya.'
      : 'Tu clave venció. Cámbiala ahora; si estás en una visita, puedes hacerlo más tarde.';
    $('clave-despues').hidden = p.claveInicial;
    mostrar('clave');
    return;
  }
  mostrar('fotos');
  pintarAvisoClave();
  pintar();
  subirPendientes();
}

function volverAIngreso(mensaje) {
  sesion = null;
  guardado.borrar('sesion');
  claveYaPedida = false;
  $('mensaje-ingreso').textContent = mensaje || '';
  mostrar('ingreso');
}

function pintarAvisoClave() {
  const p = sesion.persona;
  const aviso = $('aviso-clave');
  if (p.diasClave <= 0) aviso.textContent = 'Tu clave venció. Cámbiala la próxima vez que entres con señal.';
  else if (p.avisoClave) aviso.textContent = `Tu clave vence en ${p.diasClave} ${p.diasClave === 1 ? 'día' : 'días'}.`;
  aviso.hidden = !(p.avisoClave || p.diasClave <= 0);
}

// ---------- Ingreso y clave ----------

$('form-ingreso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = e.submitter || e.target.querySelector('button');
  boton.disabled = true;
  $('mensaje-ingreso').textContent = '';
  try {
    const r = await fetch(`${API}/api/sesion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usuario: $('usuario').value, clave: $('clave').value, dispositivo }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      sesion = j;
      guardado.escribir('sesion', sesion);
      $('clave').value = '';
      entrar();
    } else if (r.status === 429) {
      $('mensaje-ingreso').textContent = 'Demasiados intentos. Espera 15 minutos y vuelve a probar.';
    } else if (r.status === 401) {
      $('mensaje-ingreso').textContent = 'Usuario o clave incorrectos.';
    } else {
      $('mensaje-ingreso').textContent = 'El servicio no responde. Intenta de nuevo en un rato.';
    }
  } catch {
    $('mensaje-ingreso').textContent = 'Sin señal. Para entrar necesitas conexión (las fotos guardadas no se pierden).';
  } finally {
    boton.disabled = false;
  }
});

$('form-clave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nueva = $('clave-nueva').value;
  if (nueva !== $('clave-repetir').value) {
    $('mensaje-clave').textContent = 'Las dos claves nuevas no coinciden.';
    return;
  }
  const boton = e.submitter || e.target.querySelector('button[type=submit]');
  boton.disabled = true;
  $('mensaje-clave').textContent = '';
  try {
    const r = await api('/api/clave', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actual: $('clave-actual').value, nueva }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      sesion.persona = j.persona;
      guardado.escribir('sesion', sesion);
      for (const id of ['clave-actual', 'clave-nueva', 'clave-repetir']) $(id).value = '';
      avisar('Clave cambiada.');
      entrar();
    } else if (r.status === 401) {
      volverAIngreso('Tu sesión venció. Entra de nuevo.');
    } else if (j.error === 'clave-actual') {
      $('mensaje-clave').textContent = 'La clave actual no es correcta.';
    } else {
      $('mensaje-clave').textContent = j.mensaje || 'No se pudo cambiar la clave.';
    }
  } catch {
    $('mensaje-clave').textContent = 'Sin señal. Intenta cuando tengas conexión.';
  } finally {
    boton.disabled = false;
  }
});

$('clave-despues').addEventListener('click', () => {
  mostrar('fotos');
  pintarAvisoClave();
  pintar();
  subirPendientes();
});

$('salir').addEventListener('click', async () => {
  const mias = (await cola.listar()).filter((f) => sesion && f.usuario === sesion.persona.usuario);
  if (mias.length && !confirm(`Hay ${textoPendientes(mias.length).replace('por subir', 'sin subir')}. ` +
    'Quedan guardadas en este teléfono y se suben cuando vuelvas a entrar con tu cuenta. ¿Salir igual?')) return;
  api('/api/salir', { method: 'POST' }).catch(() => {});
  volverAIngreso('');
});

// ---------- Tomar y guardar fotos ----------

for (const b of document.querySelectorAll('[data-momento]')) {
  b.addEventListener('click', () => elegirMomento(b.dataset.momento));
}
function elegirMomento(m) {
  momento = m;
  for (const b of document.querySelectorAll('[data-momento]')) b.setAttribute('aria-pressed', String(b.dataset.momento === m));
}
elegirMomento(momento);

async function decodificar(origen) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(origen, { imageOrientation: 'from-image' });
    } catch { /* se prueba con <img> */ }
  }
  const url = URL.createObjectURL(origen);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function medidas(fuente) {
  return {
    ancho: fuente.naturalWidth || fuente.videoWidth || fuente.width,
    alto: fuente.naturalHeight || fuente.videoHeight || fuente.height,
  };
}

function aJpeg(fuente, maximo, calidad) {
  const { ancho, alto } = medidas(fuente);
  const destino = medidasReducidas(ancho, alto, maximo);
  const lienzo = document.createElement('canvas');
  lienzo.width = destino.ancho;
  lienzo.height = destino.alto;
  lienzo.getContext('2d').drawImage(fuente, 0, 0, destino.ancho, destino.alto);
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('jpeg'))), 'image/jpeg', calidad);
  });
}

function comoDataUrl(blob) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(blob);
  });
}

// El comentario escrito vale para la foto (o el grupo de fotos de la galería) que sigue, y se borra.
async function guardarFoto(fuente, origen, tomada, comentario) {
  const foto = await aJpeg(fuente, 2048, 0.8);
  const miniatura = await comoDataUrl(await aJpeg(fuente, 240, 0.6));
  if (fuente.close) fuente.close();
  const id = nuevoId();
  const registro = { id, clave: CLAVE_PRUEBA, tomada, momento, origen, dispositivo };
  if (comentario) registro.comentario = comentario;
  await cola.agregar({
    id,
    usuario: sesion.persona.usuario,
    registro,
    bytes: await foto.arrayBuffer(),
    miniatura,
    creada: Date.now(),
    estado: 'pendiente',
    intentos: 0,
  });
}

async function guardarArchivos(archivos, origen) {
  const comentario = $('comentario').value.trim();
  let guardadas = 0;
  for (const archivo of archivos) {
    try {
      const fuente = await decodificar(archivo);
      // Desde la cámara del teléfono la foto es de ahora; desde la galería, la fecha del archivo.
      const tomada = isoLocal(origen === 'galeria' && archivo.lastModified ? new Date(archivo.lastModified) : new Date());
      await guardarFoto(fuente, origen, tomada, comentario);
      guardadas++;
    } catch (e) {
      console.error(e);
      avisar('No se pudo leer una foto (formato no compatible). Prueba con «Tomar foto».');
    }
  }
  if (guardadas) $('comentario').value = '';
  if (guardadas) avisar(guardadas === 1 ? 'Foto guardada.' : `${guardadas} fotos guardadas.`);
  await pintar();
  subirPendientes();
}

$('archivo-camara').addEventListener('change', async (e) => {
  await guardarArchivos([...e.target.files], 'camara');
  e.target.value = '';
});
$('archivo-galeria').addEventListener('change', async (e) => {
  await guardarArchivos([...e.target.files], 'galeria');
  e.target.value = '';
});

// Cámara dentro de la app: más rápida para muchas fotos seguidas. Si el teléfono permite
// ImageCapture se toma la foto a resolución completa; si no, el cuadro del video.
$('abrir-camara').addEventListener('click', async () => {
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false,
    });
  } catch {
    avisar('No se pudo abrir la cámara. Usa «Tomar foto».');
    return;
  }
  tomadasEnCamara = 0;
  $('tomadas').textContent = '';
  $('video').srcObject = flujo;
  $('camara').hidden = false;
  await $('video').play().catch(() => {});
});

$('disparar').addEventListener('click', async () => {
  const video = $('video');
  if (!flujo || !video.videoWidth) return;
  $('camara').classList.add('destello');
  setTimeout(() => $('camara').classList.remove('destello'), 120);
  const tomada = isoLocal();
  try {
    let fuente = null;
    if ('ImageCapture' in window) {
      try {
        fuente = await decodificar(await new ImageCapture(flujo.getVideoTracks()[0]).takePhoto());
      } catch { /* se usa el cuadro del video */ }
    }
    await guardarFoto(fuente || video, 'camara', tomada, $('comentario').value.trim());
    $('comentario').value = '';
    tomadasEnCamara++;
    $('tomadas').textContent = `${tomadasEnCamara} ${tomadasEnCamara === 1 ? 'foto' : 'fotos'}`;
  } catch (e) {
    console.error(e);
    avisar('No se pudo guardar la foto.');
  }
});

$('cerrar-camara').addEventListener('click', async () => {
  if (flujo) for (const t of flujo.getTracks()) t.stop();
  flujo = null;
  $('camara').hidden = true;
  if (tomadasEnCamara) avisar(`${tomadasEnCamara} ${tomadasEnCamara === 1 ? 'foto guardada' : 'fotos guardadas'}.`);
  await pintar();
  subirPendientes();
});

// ---------- Subida ----------

async function subirPendientes() {
  if (subiendo || !sesionVigente()) return;
  subiendo = true;
  pintar();
  try {
    const fotos = (await cola.listar()).filter((f) => f.usuario === sesion.persona.usuario && f.estado !== 'rechazada');
    for (const f of fotos) {
      let r;
      try {
        r = await api(`/api/fotos/${f.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'image/jpeg', 'x-registro': codificarRegistro(f.registro) },
          body: f.bytes,
        });
      } catch {
        sinRed = true; // sin señal: se reintenta al volver la conexión
        break;
      }
      sinRed = false;
      const decision = decidirTrasSubida(r.status);
      if (decision === 'subida') {
        await cola.quitar(f.id);
        guardado.escribir('subidas', (guardado.leer('subidas') || 0) + 1);
      } else if (decision === 'sesion') {
        volverAIngreso('Tu sesión venció. Entra de nuevo: las fotos guardadas se suben después.');
        break;
      } else if (decision === 'rechazada') {
        const j = await r.json().catch(() => ({}));
        await cola.actualizar(f.id, { estado: 'rechazada', error: [j.error, ...(j.errores || [])].filter(Boolean).join(', ') || `HTTP ${r.status}` });
      } else {
        await cola.actualizar(f.id, { intentos: f.intentos + 1, error: `HTTP ${r.status}` });
        break;
      }
      await pintar();
    }
  } finally {
    subiendo = false;
    pintar();
  }
}

window.addEventListener('online', () => { sinRed = false; subirPendientes(); });
window.addEventListener('offline', () => { sinRed = true; pintar(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') subirPendientes();
});
setInterval(() => {
  if (document.visibilityState === 'visible') subirPendientes();
}, 30000);
$('subir-ahora').addEventListener('click', () => subirPendientes());

// ---------- Lista y estado ----------

const NOMBRE_MOMENTO = { antes: 'Antes', durante: 'Durante', despues: 'Después', otro: 'Otro' };

function guardarEnTelefono(f) {
  const url = URL.createObjectURL(new Blob([f.bytes], { type: 'image/jpeg' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `terreno-${f.registro.tomada.slice(0, 10)}-${f.id.slice(0, 8)}.jpg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function pintar() {
  if (!sesion || $('pantalla-fotos').hidden) return;
  const fotos = await cola.listar();
  const mias = fotos.filter((f) => f.usuario === sesion.persona.usuario);
  const pendientes = mias.filter((f) => f.estado !== 'rechazada').length;

  const estado = $('estado');
  if (sinRed && pendientes) {
    estado.textContent = `Sin señal · ${textoPendientes(pendientes)}`;
    estado.className = 'estado sinred';
  } else if (pendientes) {
    estado.textContent = subiendo ? `Subiendo… ${textoPendientes(pendientes)}` : textoPendientes(pendientes);
    estado.className = 'estado espera';
  } else {
    estado.textContent = sinRed ? 'Sin señal · nada pendiente' : 'Todo subido ✓';
    estado.className = 'estado ok';
  }

  const lista = $('lista');
  lista.replaceChildren();
  if (!mias.length) {
    const li = document.createElement('li');
    li.className = 'vacia';
    li.textContent = 'No hay fotos esperando.';
    lista.append(li);
  }
  for (const f of mias.slice().reverse()) {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = f.miniatura;
    img.alt = '';
    const detalle = document.createElement('div');
    detalle.className = 'detalle';
    const titulo = document.createElement('b');
    titulo.textContent = `${f.registro.tomada.slice(11, 16)} · ${NOMBRE_MOMENTO[f.registro.momento]}`;
    const linea = document.createElement('span');
    if (f.estado === 'rechazada') {
      linea.className = 'rechazada';
      linea.textContent = `No se pudo subir (${f.error}). Guárdala y avisa al ingeniero.`;
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'boton secundario';
      boton.textContent = 'Guardar en el teléfono';
      boton.addEventListener('click', () => guardarEnTelefono(f));
      detalle.append(titulo, linea, boton);
    } else {
      linea.textContent = f.registro.comentario ? f.registro.comentario : 'Esperando para subir';
      detalle.append(titulo, linea);
    }
    li.append(img, detalle);
    lista.append(li);
  }

  const otras = fotos.length - mias.length;
  $('otras').hidden = otras === 0;
  $('otras').textContent = `${otras} ${otras === 1 ? 'foto es' : 'fotos son'} de otra cuenta: se suben cuando esa persona entre en este teléfono.`;
  const subidas = guardado.leer('subidas') || 0;
  $('contador').textContent = `Subidas desde este teléfono: ${subidas}.`;
}

// ---------- Inicio ----------

async function refrescarPersona() {
  try {
    const r = await api('/api/yo');
    if (r.status === 401) {
      volverAIngreso('Tu sesión venció. Entra de nuevo: las fotos guardadas se suben después.');
      return;
    }
    if (!r.ok) return;
    const j = await r.json();
    sesion.persona = j.persona;
    guardado.escribir('sesion', sesion);
    if (!$('pantalla-fotos').hidden) {
      if (j.persona.cambiarClave && !claveYaPedida) entrar();
      else pintarAvisoClave();
    }
  } catch { /* sin señal: se sigue con lo guardado */ }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if (sesionVigente()) {
  entrar();
  refrescarPersona();
} else {
  volverAIngreso(sesion ? 'Tu sesión venció. Entra de nuevo: las fotos guardadas se suben después.' : '');
}
