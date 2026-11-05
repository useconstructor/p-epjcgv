import "server-only";
import { createClient } from "@libsql/client";
let client: ReturnType<typeof createClient>;
export function db() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)
    throw new Error("Base de datos no configurada");
  return (client ||= createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  }));
}
let ready: Promise<void> | undefined;
export function initialize() {
  return (ready ||= db()
    .batch(
      [
        `PRAGMA foreign_keys=ON`,
        `CREATE TABLE IF NOT EXISTS bibliotecas (id TEXT PRIMARY KEY, creado_en TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS sesiones (token_hash TEXT PRIMARY KEY, biblioteca_id TEXT NOT NULL REFERENCES bibliotecas(id))`,
        `CREATE TABLE IF NOT EXISTS autores (id TEXT PRIMARY KEY,biblioteca_id TEXT NOT NULL REFERENCES bibliotecas(id),nombre TEXT NOT NULL,UNIQUE(biblioteca_id,id))`,
        `CREATE TABLE IF NOT EXISTS libros (id TEXT PRIMARY KEY,biblioteca_id TEXT NOT NULL REFERENCES bibliotecas(id),autor_id TEXT NOT NULL,titulo TEXT NOT NULL CHECK(length(trim(titulo)) BETWEEN 1 AND 200),titulo_busqueda TEXT NOT NULL,estado TEXT NOT NULL CHECK(estado IN ('pendiente','leyendo','leído')),valoracion INTEGER CHECK(valoracion IS NULL OR (typeof(valoracion)='integer' AND valoracion BETWEEN 1 AND 5)),creado_en TEXT NOT NULL,actualizado_en TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),FOREIGN KEY(biblioteca_id,autor_id) REFERENCES autores(biblioteca_id,id))`,
        // Add enforcement without rebuilding the table or rewriting existing records.
        `CREATE TRIGGER IF NOT EXISTS libros_revision_insert BEFORE INSERT ON libros WHEN typeof(NEW.revision)!='integer' OR NEW.revision<1 BEGIN SELECT RAISE(ABORT,'La revisión debe ser un entero positivo'); END`,
        `CREATE TRIGGER IF NOT EXISTS libros_revision_update BEFORE UPDATE OF revision ON libros WHEN typeof(NEW.revision)!='integer' OR NEW.revision<1 BEGIN SELECT RAISE(ABORT,'La revisión debe ser un entero positivo'); END`,
        `CREATE INDEX IF NOT EXISTS libros_estado ON libros(biblioteca_id,estado)`,
        `CREATE INDEX IF NOT EXISTS libros_busqueda ON libros(biblioteca_id,titulo_busqueda)`,
        `CREATE INDEX IF NOT EXISTS libros_actualizados ON libros(biblioteca_id,actualizado_en DESC,id)`,
        `CREATE TABLE IF NOT EXISTS marcador_semilla (biblioteca_id TEXT PRIMARY KEY REFERENCES bibliotecas(id))`,
        `CREATE TABLE IF NOT EXISTS operaciones_idempotentes (biblioteca_id TEXT NOT NULL REFERENCES bibliotecas(id),clave TEXT NOT NULL,accion TEXT NOT NULL,payload_hash TEXT NOT NULL,resultado TEXT NOT NULL,creado_en TEXT NOT NULL,PRIMARY KEY(biblioteca_id,clave))`,
      ],
      "write",
    )
    .then(() => {})
    .catch((e) => {
      ready = undefined;
      throw e;
    }));
}
