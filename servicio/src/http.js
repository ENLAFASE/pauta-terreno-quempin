// Respuestas JSON y CORS del servicio de terreno.

export function respuesta(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// ORIGENES (wrangler.toml) es una lista separada por comas: solo esas páginas pueden llamar al servicio.
export function listaOrigenes(texto) {
  return (texto || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function cabecerasCors(origen, permitidos) {
  if (!origen || !permitidos.includes(origen)) return {};
  return {
    'access-control-allow-origin': origen,
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-registro',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

export async function leerJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
