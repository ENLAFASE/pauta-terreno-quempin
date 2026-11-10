// Alta, reseteo y baja de cuentas de terreno mientras no exista la pantalla «Personas»
// de la web (fase 2). Genera un .sql en .usuarios/ (git lo ignora) y muestra la clave
// temporal UNA vez, para entregarla en persona. Después se aplica con wrangler.
//
//   node herramientas/cuentas.mjs alta --usuario ev --nombre "Eric Vergara" --iniciales EV --rol tecnico
//   node herramientas/cuentas.mjs alta --usuario emerson --nombre "Emerson" --iniciales x-emerson --rol tecnico --vence 2026-12-31
//   node herramientas/cuentas.mjs resetear --usuario ev
//   node herramientas/cuentas.mjs baja --usuario emerson
//   npx wrangler d1 execute terreno-quempin --remote --config servicio/wrangler.toml --file .usuarios/<archivo>.sql

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { hashClave, nuevaSal, normalizarUsuario, sumarDias, ITERACIONES, DIAS_CLAVE } from '../servicio/src/cuentas.js';

const ROLES = ['tecnico', 'ingeniero', 'administrador'];
const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function claveTemporal(largo = 12) {
  const salida = [];
  while (salida.length < largo) {
    const [b] = crypto.getRandomValues(new Uint8Array(1));
    if (b < 256 - (256 % LETRAS.length)) salida.push(LETRAS[b % LETRAS.length]); // sin sesgo
  }
  return salida.join('');
}

export function texto(valor) {
  return valor == null ? 'NULL' : `'${String(valor).replace(/'/g, "''")}'`;
}

export function venceCuenta(fecha) {
  if (!fecha) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('--vence va como AAAA-MM-DD');
  return new Date(`${fecha}T23:59:59-03:00`).toISOString(); // vale todo ese día en Chile
}

async function nuevaClave() {
  const clave = claveTemporal();
  const sal = nuevaSal();
  return { clave, sal, hash: await hashClave(clave, sal) };
}

export async function generar(accion, op, ahora = new Date()) {
  const usuario = normalizarUsuario(op.usuario);
  if (!/^[a-z0-9._-]{2,40}$/.test(usuario)) throw new Error('--usuario: letras, números, punto o guion (2 a 40)');
  const iso = ahora.toISOString();
  const venceClave = sumarDias(ahora, DIAS_CLAVE).toISOString();

  if (accion === 'alta') {
    if (!op.nombre) throw new Error('falta --nombre');
    if (!/^([A-Z]{2,3}|x-[a-z0-9-]{2,40})$/.test(op.iniciales || '')) {
      throw new Error('--iniciales: las de la Planificación, como EV, o x-<nombre> para alguien de fuera');
    }
    if (!ROLES.includes(op.rol)) throw new Error(`--rol: ${ROLES.join(', ')}`);
    const { clave, sal, hash } = await nuevaClave();
    const sql = 'INSERT INTO usuarios (usuario, nombre, iniciales, rol, hash, sal, iteraciones, activo, vence_cuenta, ' +
      'vence_clave, cambiar_clave, intentos, bloqueado_hasta, creado) VALUES (' +
      [texto(usuario), texto(op.nombre), texto(op.iniciales), texto(op.rol), texto(hash), texto(sal), ITERACIONES, 1,
        texto(venceCuenta(op.vence)), texto(venceClave), 1, 0, 'NULL', texto(iso)].join(', ') + ');';
    return { usuario, clave, sql };
  }
  if (accion === 'resetear') {
    const { clave, sal, hash } = await nuevaClave();
    const sql = `UPDATE usuarios SET hash = ${texto(hash)}, sal = ${texto(sal)}, iteraciones = ${ITERACIONES}, ` +
      `vence_clave = ${texto(venceClave)}, cambiar_clave = 1, intentos = 0, bloqueado_hasta = NULL, activo = 1 ` +
      `WHERE usuario = ${texto(usuario)};\n` +
      `UPDATE sesiones SET revocada = ${texto(iso)} WHERE usuario = ${texto(usuario)} AND revocada IS NULL;`;
    return { usuario, clave, sql };
  }
  if (accion === 'baja') {
    const sql = `UPDATE usuarios SET activo = 0 WHERE usuario = ${texto(usuario)};\n` +
      `UPDATE sesiones SET revocada = ${texto(iso)} WHERE usuario = ${texto(usuario)} AND revocada IS NULL;`;
    return { usuario, clave: null, sql };
  }
  throw new Error('acción: alta, resetear o baja');
}

async function principal() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      usuario: { type: 'string' }, nombre: { type: 'string' }, iniciales: { type: 'string' },
      rol: { type: 'string' }, vence: { type: 'string' },
    },
  });
  const { usuario, clave, sql } = await generar(positionals[0], values);
  const carpeta = resolve('.usuarios');
  mkdirSync(carpeta, { recursive: true });
  const archivo = resolve(carpeta, `${new Date().toISOString().slice(0, 10)}-${positionals[0]}-${usuario}.sql`);
  writeFileSync(archivo, `${sql}\n`);
  console.log(`SQL en ${archivo}`);
  console.log(`Aplícalo con:\n  npx wrangler d1 execute terreno-quempin --remote --config servicio/wrangler.toml --file "${archivo}"`);
  if (clave) console.log(`\nClave temporal de «${usuario}» (entrégala en persona; se pide cambiarla al entrar): ${clave}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
