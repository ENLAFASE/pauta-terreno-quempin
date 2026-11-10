// Dirección del servicio de terreno. Después del primer «npm run desplegar» se cambia
// SUBDOMINIO por el que muestra Cloudflare. Al migrar a la cuenta de la empresa se
// cambia aquí y en ORIGENES de servicio/wrangler.toml.
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API = LOCAL ? 'http://localhost:8787' : 'https://terreno-quempin.pauta-terreno-quempin.workers.dev';

// Fase 0: todas las fotos van a la carpeta de prueba con esta clave.
export const CLAVE_PRUEBA = 'prueba:fase0';
