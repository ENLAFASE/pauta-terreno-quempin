import test from 'node:test';
import assert from 'node:assert/strict';
import { leerRegistro, validarRegistro, rutaFoto, camposLista, esJpeg } from '../servicio/src/registro.js';
import {
  codificarRegistro, isoLocal, medidasReducidas, nuevoId, decidirTrasSubida, textoPendientes,
} from '../app/util.js';

const valido = () => ({
  id: '3f2a9c1e-7b4d-4e2a-9f10-1a2b3c4d5e6f',
  clave: 'prueba:fase0',
  tomada: '2026-11-09T10:15:30-03:00',
  momento: 'antes',
  origen: 'camara',
  dispositivo: 'ya9y17cjka',
  comentario: 'Placa del quemador — ñandú «ok»',
});

test('el registro que codifica la app lo lee el servicio, con tildes y eñes', () => {
  const r = valido();
  assert.deepEqual(leerRegistro(codificarRegistro(r)), r);
  assert.equal(leerRegistro('no-es-base64-json'), null);
  assert.equal(leerRegistro(codificarRegistro([1, 2])), null);
  assert.equal(leerRegistro(''), null);
});

test('validarRegistro acepta uno bueno y nombra cada campo malo', () => {
  const ahora = new Date('2026-11-09T14:00:00Z');
  assert.deepEqual(validarRegistro(valido(), ahora), []);
  const malo = { ...valido(), id: 'x', tomada: '09-11-2026', momento: 'luego', origen: 'web', dispositivo: 'a', clave: 'sin-tipo' };
  assert.deepEqual(validarRegistro(malo, ahora), ['id', 'tomada', 'momento', 'origen', 'dispositivo', 'clave']);
  assert.deepEqual(validarRegistro({ ...valido(), comentario: 'x'.repeat(2001) }, ahora), ['comentario']);
  assert.deepEqual(validarRegistro({ ...valido(), tomada: '2026-11-12T10:00:00-03:00' }, ahora), ['tomada']);
  assert.deepEqual(validarRegistro({ ...valido(), clave: 'req:289' }, ahora), []);
  assert.deepEqual(validarRegistro({ ...valido(), clave: 'tag:../../x' }, ahora), ['clave']);
});

test('rutaFoto: carpeta por día y nombre fijo con la hora local', () => {
  const { carpeta, nombre } = rutaFoto('0 Prueba app terreno', valido(), 'EV');
  assert.equal(carpeta, '0 Prueba app terreno/2026-11-09');
  assert.equal(nombre, '20261109-101530_EV_3f2a9c1e-7b4d-4e2a-9f10-1a2b3c4d5e6f.jpg');
  assert.equal(rutaFoto('x', valido(), 'x-emerson').nombre.split('_')[1], 'x-emerson');
  assert.equal(rutaFoto('x', valido(), '../EV').nombre.split('_')[1], 'EV');
});

test('camposLista usa la persona de la sesión, no lo que diga el celular', () => {
  const c = camposLista({ ...valido(), autor: 'NB' }, { iniciales: 'EV' }, { id: 'abc' });
  assert.equal(c.autor, 'EV');
  assert.equal(c.idRegistro, valido().id);
  assert.equal(c.visita, '2026-11-09');
  assert.equal(c.tomada, '2026-11-09T13:15:30.000Z');
  assert.equal(c.archivo, 'abc');
});

test('esJpeg', () => {
  assert.equal(esJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(esJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
});

test('isoLocal produce lo que valida el servicio', () => {
  const s = isoLocal(new Date());
  assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.ok(Math.abs(Date.parse(s) - Date.now()) < 2000);
  assert.deepEqual(validarRegistro({ ...valido(), tomada: s }), []);
});

test('medidasReducidas: lado largo 2048, nunca agranda', () => {
  assert.deepEqual(medidasReducidas(4000, 3000), { ancho: 2048, alto: 1536 });
  assert.deepEqual(medidasReducidas(3000, 4000), { ancho: 1536, alto: 2048 });
  assert.deepEqual(medidasReducidas(800, 600), { ancho: 800, alto: 600 });
});

test('nuevoId es un UUID que acepta el servicio', () => {
  assert.deepEqual(validarRegistro({ ...valido(), id: nuevoId() }), []);
});

test('qué hace la app con cada respuesta', () => {
  assert.equal(decidirTrasSubida(200), 'subida');
  assert.equal(decidirTrasSubida(401), 'sesion');
  assert.equal(decidirTrasSubida(503), 'reintentar');
  assert.equal(decidirTrasSubida(429), 'reintentar');
  assert.equal(decidirTrasSubida(400), 'rechazada');
  assert.equal(decidirTrasSubida(415), 'rechazada');
  assert.equal(textoPendientes(0), 'Todo subido');
  assert.equal(textoPendientes(1), '1 foto por subir');
  assert.equal(textoPendientes(3), '3 fotos por subir');
});
