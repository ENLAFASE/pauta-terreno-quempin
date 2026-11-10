// Cola de fotos en IndexedDB. Una foto sale de aquí solo cuando el servicio confirma
// que llegó a SharePoint. Se guardan ArrayBuffer y no Blob: Safari antiguo pierde Blobs.

const BASE = 'terreno-quempin';
const ALMACEN = 'fotos';

let abierta = null;

function abrir() {
  if (abierta) return abierta;
  abierta = new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => {
      const almacen = pedido.result.createObjectStore(ALMACEN, { keyPath: 'id' });
      almacen.createIndex('creada', 'creada');
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
  return abierta;
}

async function transaccion(modo, accion) {
  const base = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = base.transaction(ALMACEN, modo);
    const resultado = accion(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolver(resultado.result);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  });
}

export function agregar(foto) {
  return transaccion('readwrite', (a) => a.put(foto));
}

export function quitar(id) {
  return transaccion('readwrite', (a) => a.delete(id));
}

export async function actualizar(id, cambios) {
  const foto = await transaccion('readonly', (a) => a.get(id));
  if (foto) await agregar({ ...foto, ...cambios });
}

export async function listar() {
  const fotos = await transaccion('readonly', (a) => a.index('creada').getAll());
  return fotos || [];
}
