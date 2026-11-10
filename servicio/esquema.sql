-- Base D1 del servicio de terreno: solo cuentas y sesiones. Las fotos y su registro
-- viven en SharePoint. Se aplica con:
--   npx wrangler d1 execute terreno-quempin --remote --file servicio/esquema.sql

CREATE TABLE IF NOT EXISTS usuarios (
  usuario         TEXT PRIMARY KEY,   -- en minúsculas: «ev», «emerson»
  nombre          TEXT NOT NULL,      -- «Eric Vergara»
  iniciales       TEXT NOT NULL,      -- las de la Planificación: «EV» o «x-emerson»
  rol             TEXT NOT NULL CHECK (rol IN ('tecnico', 'ingeniero', 'administrador')),
  hash            TEXT NOT NULL,      -- PBKDF2-SHA256, base64url
  sal             TEXT NOT NULL,
  iteraciones     INTEGER NOT NULL,
  activo          INTEGER NOT NULL DEFAULT 1,
  vence_cuenta    TEXT,               -- contratistas: desde ese momento la cuenta no sirve
  vence_clave     TEXT NOT NULL,      -- 60 días desde el último cambio
  cambiar_clave   INTEGER NOT NULL DEFAULT 1,  -- 1 después de un alta o un reseteo
  intentos        INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT,
  creado          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  id          TEXT PRIMARY KEY,       -- sha256 del token: el token mismo no se guarda
  usuario     TEXT NOT NULL REFERENCES usuarios (usuario),
  dispositivo TEXT,
  creada      TEXT NOT NULL,
  vence       TEXT NOT NULL,
  revocada    TEXT
);

CREATE INDEX IF NOT EXISTS sesiones_usuario ON sesiones (usuario);
