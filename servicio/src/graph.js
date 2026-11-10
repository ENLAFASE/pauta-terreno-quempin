// Microsoft Graph con permiso de aplicación Sites.Selected: el servicio solo ve los
// sitios a los que se le dio acceso (guía de configuración, paso 3).

const GRAPH = 'https://graph.microsoft.com/v1.0';

export class ErrorGraph extends Error {
  constructor(paso, estado, detalle) {
    super(`Graph ${paso}: ${estado}`);
    this.paso = paso;
    this.estado = estado;
    this.detalle = String(detalle || '').slice(0, 500);
  }
}

let cache = { token: null, vence: 0 };

export function olvidarToken() {
  cache = { token: null, vence: 0 };
}

export async function tokenApp(env, ahora = Date.now()) {
  if (cache.token && cache.vence - 60000 > ahora) return cache.token;
  const r = await fetch(`https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.CLIENT_ID,
      client_secret: env.GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!r.ok) throw new ErrorGraph('token', r.status, await r.text());
  const j = await r.json();
  cache = { token: j.access_token, vence: ahora + j.expires_in * 1000 };
  return cache.token;
}

async function llamar(env, metodo, ruta, { cuerpo, tipo, cabeceras } = {}) {
  const headers = { authorization: `Bearer ${await tokenApp(env)}`, ...cabeceras };
  if (tipo) headers['content-type'] = tipo;
  return fetch(GRAPH + ruta, { method: metodo, headers, body: cuerpo });
}

export function rutaCodificada(partes) {
  return partes
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

// Sube la foto sin pisar nada (conflictBehavior=fail). Si ya estaba, la foto ya llegó
// en un intento anterior: se devuelve la existente. Graph crea las carpetas que falten.
export async function subirArchivo(env, carpeta, nombre, bytes) {
  const ruta = `/sites/${env.SITIO_ID}/drive/root:/${rutaCodificada([carpeta, nombre])}`;
  const r = await llamar(env, 'PUT', `${ruta}:/content?@microsoft.graph.conflictBehavior=fail`, {
    cuerpo: bytes,
    tipo: 'image/jpeg',
  });
  if (r.status === 200 || r.status === 201) {
    const j = await r.json();
    return { estado: 'nuevo', id: j.id, url: j.webUrl };
  }
  if (r.status === 409) {
    const g = await llamar(env, 'GET', `${ruta}?$select=id,webUrl`);
    if (g.ok) {
      const j = await g.json();
      return { estado: 'existia', id: j.id, url: j.webUrl };
    }
    throw new ErrorGraph('buscar archivo', g.status, await g.text());
  }
  throw new ErrorGraph('subir', r.status, await r.text());
}

export async function buscarFila(env, idRegistro) {
  const filtro = encodeURIComponent(`fields/idRegistro eq '${idRegistro}'`);
  const r = await llamar(env, 'GET', `/sites/${env.SITIO_ID}/lists/${env.LISTA_ID}/items?$filter=${filtro}&$select=id&$top=1`, {
    cabeceras: { prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  });
  if (!r.ok) throw new ErrorGraph('buscar fila', r.status, await r.text());
  const j = await r.json();
  return j.value && j.value.length ? j.value[0].id : null;
}

// idRegistro es único en la lista: si la fila ya existe (un reintento), no se repite.
export async function agregarFila(env, campos) {
  const r = await llamar(env, 'POST', `/sites/${env.SITIO_ID}/lists/${env.LISTA_ID}/items`, {
    cuerpo: JSON.stringify({ fields: campos }),
    tipo: 'application/json',
  });
  if (r.ok) {
    const j = await r.json();
    return { estado: 'nuevo', id: j.id };
  }
  const detalle = await r.text();
  if (r.status >= 400 && r.status < 500) {
    const existente = await buscarFila(env, campos.idRegistro);
    if (existente) return { estado: 'existia', id: existente };
  }
  throw new ErrorGraph('agregar fila', r.status, detalle);
}
