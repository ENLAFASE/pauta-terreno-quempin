"""Dibuja los íconos de la app (app/iconos/) sin dependencias: fondo naranjo QUEMPIN,
un visor de cámara negro y un anillo blanco. Se corre una vez:  python herramientas/iconos.py
"""
import struct
import sys
import zlib
from pathlib import Path

NARANJO = (0xFF, 0x51, 0x00)
NEGRO = (0x11, 0x11, 0x11)
BLANCO = (0xFF, 0xFF, 0xFF)


def color(x, y, n):
    # Coordenadas relativas 0..1; el dibujo cabe en la zona segura de un ícono «maskable» (80 %).
    u, v = (x + 0.5) / n, (y + 0.5) / n
    cuerpo = 0.22 <= u <= 0.78 and 0.33 <= v <= 0.71
    visor = 0.40 <= u <= 0.56 and 0.27 <= v <= 0.34
    d = ((u - 0.5) ** 2 + (v - 0.52) ** 2) ** 0.5
    if cuerpo or visor:
        if 0.085 <= d <= 0.13:
            return BLANCO
        if d < 0.06:
            return NARANJO
        return NEGRO
    return NARANJO


def png(n):
    filas = b''.join(b'\x00' + bytes(c for x in range(n) for c in color(x, y, n)) for y in range(n))

    def trozo(tipo, datos):
        return struct.pack('>I', len(datos)) + tipo + datos + struct.pack('>I', zlib.crc32(tipo + datos) & 0xFFFFFFFF)

    return (b'\x89PNG\r\n\x1a\n' + trozo(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0))
            + trozo(b'IDAT', zlib.compress(filas, 9)) + trozo(b'IEND', b''))


if __name__ == '__main__':
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'app' / 'iconos')
    destino.mkdir(parents=True, exist_ok=True)
    for n in (192, 512):
        (destino / f'icono-{n}.png').write_bytes(png(n))
        print(f'icono-{n}.png')
