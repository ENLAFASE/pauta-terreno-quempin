"""Simulador del servicio de terreno, para probar la app en el PC sin Cloudflare ni SharePoint.

    python herramientas/simulador.py

- http://localhost:5173/app/  la app (sirve la carpeta del repo).
- http://localhost:8787       un servicio falso con el mismo contrato que servicio/src/index.js.

Cuentas de prueba: «prueba» / «prueba12345» y «nuevo» / «nuevo12345» (este pide cambiar la clave).
Las fotos recibidas quedan en .simulador/fotos/ (git lo ignora).
Para probar los reintentos:  POST http://localhost:8787/simulador/modo  {"modo": "caido"}  (o "normal").
Solo usa la biblioteca estándar de Python.
"""
import base64
import json
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FOTOS = RAIZ / '.simulador' / 'fotos'
ORIGEN_APP = 'http://localhost:5173'
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')

CUENTAS = {
    'prueba': {'clave': 'prueba12345', 'nombre': 'Persona de prueba', 'iniciales': 'PR', 'inicial': False},
    'nuevo': {'clave': 'nuevo12345', 'nombre': 'Cuenta nueva', 'iniciales': 'NU', 'inicial': True},
}
SESIONES = {}
ESTADO = {'modo': 'normal'}
CANDADO = threading.Lock()


def persona(usuario):
    c = CUENTAS[usuario]
    return {'usuario': usuario, 'nombre': c['nombre'], 'iniciales': c['iniciales'], 'rol': 'tecnico',
            'diasClave': 5 if usuario == 'prueba' else 60, 'avisoClave': usuario == 'prueba',
            'claveInicial': c['inicial'], 'cambiarClave': c['inicial']}


class Servicio(BaseHTTPRequestHandler):
    def cors(self):
        if self.headers.get('origin') == ORIGEN_APP:
            self.send_header('access-control-allow-origin', ORIGEN_APP)
            self.send_header('access-control-allow-methods', 'GET, POST, PUT, OPTIONS')
            self.send_header('access-control-allow-headers', 'authorization, content-type, x-registro')

    def responder(self, estado, cuerpo):
        datos = json.dumps(cuerpo).encode()
        self.send_response(estado)
        self.cors()
        self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('content-length', str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def cuerpo(self):
        return self.rfile.read(int(self.headers.get('content-length') or 0))

    def sesion(self):
        m = re.match(r'^Bearer (\S+)$', self.headers.get('authorization', ''))
        return SESIONES.get(m.group(1)) if m else None

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/salud':
            return self.responder(200, {'ok': True, 'version': 'simulador'})
        usuario = self.sesion()
        if not usuario:
            return self.responder(401, {'error': 'sesion'})
        if self.path == '/api/yo':
            return self.responder(200, {'persona': persona(usuario)})
        self.responder(404, {'error': 'no-existe'})

    def do_POST(self):
        datos = json.loads(self.cuerpo() or b'{}')
        if self.path == '/simulador/modo':
            ESTADO['modo'] = datos.get('modo', 'normal')
            return self.responder(200, ESTADO)
        if self.path == '/api/sesion':
            usuario = str(datos.get('usuario', '')).strip().lower()
            c = CUENTAS.get(usuario)
            if not c or c['clave'] != datos.get('clave'):
                return self.responder(401, {'error': 'credenciales'})
            token = secrets.token_urlsafe(32)
            SESIONES[token] = usuario
            vence = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            return self.responder(200, {'token': token, 'vence': vence, 'persona': persona(usuario)})
        usuario = self.sesion()
        if not usuario:
            return self.responder(401, {'error': 'sesion'})
        if self.path == '/api/salir':
            SESIONES.pop(self.headers['authorization'][7:], None)
            return self.responder(200, {'ok': True})
        if self.path == '/api/clave':
            if datos.get('actual') != CUENTAS[usuario]['clave']:
                return self.responder(403, {'error': 'clave-actual'})
            if len(datos.get('nueva', '')) < 10:
                return self.responder(400, {'error': 'clave-nueva', 'mensaje': 'La clave debe tener al menos 10 caracteres.'})
            CUENTAS[usuario].update(clave=datos['nueva'], inicial=False)
            return self.responder(200, {'ok': True, 'persona': persona(usuario)})
        self.responder(404, {'error': 'no-existe'})

    def do_PUT(self):
        usuario = self.sesion()
        cuerpo = self.cuerpo()
        if not usuario:
            return self.responder(401, {'error': 'sesion'})
        if ESTADO['modo'] == 'caido':
            return self.responder(503, {'error': 'sharepoint'})
        m = re.match(r'^/api/fotos/([0-9a-f-]{36})$', self.path)
        if not m:
            return self.responder(404, {'error': 'no-existe'})
        try:
            texto = self.headers.get('x-registro', '')
            registro = json.loads(base64.urlsafe_b64decode(texto + '=' * (-len(texto) % 4)))
        except ValueError:
            return self.responder(400, {'error': 'registro', 'errores': ['x-registro']})
        if registro.get('id') != m.group(1) or not UUID.match(m.group(1)):
            return self.responder(400, {'error': 'registro', 'errores': ['id']})
        if not cuerpo.startswith(b'\xff\xd8\xff'):
            return self.responder(415, {'error': 'formato'})
        with CANDADO:
            FOTOS.mkdir(parents=True, exist_ok=True)
            archivo = FOTOS / f"{m.group(1)}.jpg"
            existia = archivo.exists()
            if not existia:
                archivo.write_bytes(cuerpo)
                registro['autor'] = CUENTAS[usuario]['iniciales']
                (FOTOS / f"{m.group(1)}.json").write_text(json.dumps(registro, ensure_ascii=False, indent=1), encoding='utf-8')
        estado = 'existia' if existia else 'nuevo'
        self.responder(200, {'ok': True, 'archivo': estado, 'fila': estado, 'url': archivo.as_uri()})

    def log_message(self, formato, *args):
        print('[servicio]', formato % args)


class Pagina(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def end_headers(self):
        self.send_header('cache-control', 'no-store')
        super().end_headers()

    def log_message(self, formato, *args):
        pass


if __name__ == '__main__':
    servicio = ThreadingHTTPServer(('127.0.0.1', 8787), Servicio)
    threading.Thread(target=servicio.serve_forever, daemon=True).start()
    print('Servicio falso en http://localhost:8787 · app en http://localhost:5173/app/')
    ThreadingHTTPServer(('127.0.0.1', 5173), Pagina).serve_forever()
