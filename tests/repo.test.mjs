// El repo es público: ni secretos ni datos de clientes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const IGNORAR = new Set(['.git', 'node_modules', '.wrangler', '.usuarios', '.simulador']);

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    if (IGNORAR.has(n)) return [];
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

test('.gitignore deja fuera los secretos y las cuentas', () => {
  const g = readFileSync(join(RAIZ, '.gitignore'), 'utf8');
  for (const linea of ['.dev.vars', '.usuarios/', '.simulador/', '*.pem']) assert.ok(g.includes(linea), linea);
});

test('ningún archivo trae un secreto de cliente de Entra ni un RUT', () => {
  const secretoEntra = /[A-Za-z0-9_~.-]{3}8Q~[A-Za-z0-9_~.-]{31,34}/;
  const rut = /\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/;
  for (const a of archivos(RAIZ)) {
    if (/\.(png|jpe?g)$/i.test(a)) continue;
    const texto = readFileSync(a, 'utf8');
    assert.doesNotMatch(texto, secretoEntra, relative(RAIZ, a));
    assert.doesNotMatch(texto, rut, relative(RAIZ, a));
  }
});

test('wrangler.toml no tiene el secreto de Graph', () => {
  const t = readFileSync(join(RAIZ, 'servicio', 'wrangler.toml'), 'utf8');
  assert.doesNotMatch(t, /^\s*GRAPH_CLIENT_SECRET\s*=/m);
});

// Workers trata cada export del archivo de entrada como un manejador y no arranca si hay otro (2026-11-10).
test('servicio/src/index.js solo exporta el manejador por defecto', () => {
  const t = readFileSync(join(RAIZ, 'servicio', 'src', 'index.js'), 'utf8');
  assert.deepEqual(t.match(/^export\s+(?!default\b).*/gm) || [], []);
});

test('el service worker guarda todos los archivos de la app', () => {
  const sw = readFileSync(join(RAIZ, 'app', 'sw.js'), 'utf8');
  for (const a of readdirSync(join(RAIZ, 'app')).filter((n) => /\.(js|css|html|webmanifest)$/.test(n) && n !== 'sw.js')) {
    assert.ok(sw.includes(`'./${a}'`), a);
  }
});
