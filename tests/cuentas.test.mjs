import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aBase64url, deBase64url, hashClave, iguales, nuevaSal, nuevoToken, sha256,
  validarClaveNueva, diasHasta, datosPublicos,
} from '../servicio/src/cuentas.js';
import { generar, claveTemporal, texto, venceCuenta } from '../herramientas/cuentas.mjs';

test('base64url ida y vuelta, con todos los largos de relleno', () => {
  for (let n = 0; n < 20; n++) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    assert.deepEqual(deBase64url(aBase64url(bytes)), bytes);
  }
});

test('hashClave es determinista y depende de la sal', async () => {
  const sal = nuevaSal();
  const a = await hashClave('una clave larga', sal, 1000);
  assert.equal(a, await hashClave('una clave larga', sal, 1000));
  assert.notEqual(a, await hashClave('una clave larga', nuevaSal(), 1000));
  assert.notEqual(a, await hashClave('otra clave larga', sal, 1000));
});

test('iguales compara sin atajos', () => {
  assert.equal(iguales('abc', 'abc'), true);
  assert.equal(iguales('abc', 'abd'), false);
  assert.equal(iguales('abc', 'abcd'), false);
  assert.equal(iguales(null, 'abc'), false);
});

test('token y sha256', async () => {
  assert.match(nuevoToken(), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('reglas de la clave nueva', () => {
  assert.match(validarClaveNueva('corta', 'ev'), /10 caracteres/);
  assert.match(validarClaveNueva('emerson-2026-terreno', 'emerson'), /usuario/);
  assert.equal(validarClaveNueva('clave-nueva-2026', 'ev'), null);
  assert.equal(validarClaveNueva('caldera-marmita-9', 'emerson'), null);
});

test('datosPublicos: aviso a 7 días, cambio si venció o si es clave inicial', () => {
  const ahora = new Date('2026-11-09T12:00:00Z');
  const base = { usuario: 'ev', nombre: 'Eric', iniciales: 'EV', rol: 'tecnico', cambiar_clave: 0, hash: 'x', sal: 'y' };
  const enDiez = datosPublicos({ ...base, vence_clave: '2026-11-19T12:00:00Z' }, ahora);
  assert.equal(enDiez.diasClave, 10);
  assert.equal(enDiez.avisoClave, false);
  assert.equal(enDiez.cambiarClave, false);
  assert.equal('hash' in enDiez, false);
  assert.equal(datosPublicos({ ...base, vence_clave: '2026-11-15T12:00:00Z' }, ahora).avisoClave, true);
  const vencida = datosPublicos({ ...base, vence_clave: '2026-11-01T12:00:00Z' }, ahora);
  assert.equal(vencida.cambiarClave, true);
  assert.equal(vencida.claveInicial, false);
  assert.equal(datosPublicos({ ...base, cambiar_clave: 1, vence_clave: '2027-01-01T00:00:00Z' }, ahora).claveInicial, true);
  assert.equal(diasHasta('2026-11-10T12:00:00Z', ahora), 1);
});

test('herramienta de cuentas: clave temporal y SQL', async () => {
  assert.match(claveTemporal(), /^[a-km-zA-HJ-NP-Z2-9]{12}$/);
  assert.equal(texto("O'Higgins"), "'O''Higgins'");
  assert.equal(texto(null), 'NULL');
  assert.equal(venceCuenta('2026-12-31'), '2027-01-01T02:59:59.000Z');
  const { clave, sql } = await generar('alta', { usuario: 'EV', nombre: 'Eric Vergara', iniciales: 'EV', rol: 'tecnico' });
  assert.equal(clave.length, 12);
  assert.match(sql, /^INSERT INTO usuarios .*'ev', 'Eric Vergara', 'EV', 'tecnico'/);
  assert.ok(!sql.includes(clave), 'la clave nunca va en el SQL');
  await assert.rejects(generar('alta', { usuario: 'x', nombre: 'X', iniciales: 'EV', rol: 'tecnico' }), /--usuario/);
  await assert.rejects(generar('alta', { usuario: 'emerson', nombre: 'E', iniciales: 'Emerson', rol: 'tecnico' }), /--iniciales/);
  assert.match((await generar('baja', { usuario: 'emerson' })).sql, /activo = 0[\s\S]*revocada/);
  assert.match((await generar('resetear', { usuario: 'ev' })).sql, /cambiar_clave = 1[\s\S]*UPDATE sesiones/);
});
