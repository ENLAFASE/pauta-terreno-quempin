// Graph con un fetch falso: que reintentar una foto nunca la duplique.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subirArchivo, agregarFila, rutaCodificada, olvidarToken, ErrorGraph } from '../servicio/src/graph.js';

const env = { TENANT_ID: 't', CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's', SITIO_ID: 'sitio,1,2', LISTA_ID: 'lista' };

function falso(respuestas) {
  const llamadas = [];
  globalThis.fetch = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || 'GET' });
    if (String(url).includes('login.microsoftonline.com')) {
      return Response.json({ access_token: 'tok', expires_in: 3600 });
    }
    const [estado, cuerpo] = respuestas.shift();
    return typeof cuerpo === 'string' ? new Response(cuerpo, { status: estado }) : Response.json(cuerpo, { status: estado });
  };
  return llamadas;
}

test.beforeEach(() => olvidarToken());

test('rutaCodificada codifica cada parte y conserva las barras', () => {
  assert.equal(rutaCodificada(['0 Prueba app terreno/2026-11-09', 'a b#.jpg']), '0%20Prueba%20app%20terreno/2026-11-09/a%20b%23.jpg');
});

test('subirArchivo: nuevo, sin pisar nada', async () => {
  const llamadas = falso([[201, { id: 'A1', webUrl: 'https://x/a.jpg' }]]);
  const r = await subirArchivo(env, 'carpeta', 'a.jpg', new Uint8Array([1]));
  assert.deepEqual(r, { estado: 'nuevo', id: 'A1', url: 'https://x/a.jpg' });
  assert.match(llamadas[1].url, /conflictBehavior=fail/);
  assert.equal(llamadas[1].metodo, 'PUT');
});

test('subirArchivo: si ya estaba (reintento), devuelve el existente', async () => {
  falso([[409, { error: { code: 'nameAlreadyExists' } }], [200, { id: 'A1', webUrl: 'https://x/a.jpg' }]]);
  assert.equal((await subirArchivo(env, 'carpeta', 'a.jpg', new Uint8Array([1]))).estado, 'existia');
});

test('subirArchivo: un error de SharePoint es ErrorGraph', async () => {
  falso([[503, 'ocupado']]);
  await assert.rejects(subirArchivo(env, 'c', 'a.jpg', new Uint8Array([1])), ErrorGraph);
});

test('agregarFila: si choca con idRegistro único, usa la fila existente', async () => {
  falso([[400, 'duplicado'], [200, { value: [{ id: '17' }] }]]);
  assert.deepEqual(await agregarFila(env, { idRegistro: 'x' }), { estado: 'existia', id: '17' });
});

test('agregarFila: error de verdad si no existía', async () => {
  falso([[400, 'columna mala'], [200, { value: [] }]]);
  await assert.rejects(agregarFila(env, { idRegistro: 'x' }), ErrorGraph);
});

test('el token de la app se reutiliza mientras no venza', async () => {
  const llamadas = falso([[201, { id: '1' }], [201, { id: '2' }]]);
  await subirArchivo(env, 'c', 'a.jpg', new Uint8Array([1]));
  await subirArchivo(env, 'c', 'b.jpg', new Uint8Array([1]));
  assert.equal(llamadas.filter((l) => l.url.includes('login.microsoftonline.com')).length, 1);
});
