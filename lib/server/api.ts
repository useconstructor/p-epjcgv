import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, initialize } from "@/lib/db";
import { estados, normalizeEstadoFilter, type Libro } from "@/lib/types";
import type { Transaction } from "@libsql/client";
const cookie = "lino_sesion";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const select = `SELECT l.id,l.autor_id,a.nombre AS autor,l.titulo,l.estado,l.valoracion,l.revision,l.creado_en,l.actualizado_en FROM libros l JOIN autores a ON a.id=l.autor_id AND a.biblioteca_id=l.biblioteca_id`;
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function origin(req: NextRequest) {
  const allowed = [
    process.env.APP_ORIGIN,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ]
    .filter(Boolean)
    .map((v) => new URL(v!).origin);
  if (
    !req.headers.get("origin") ||
    !allowed.includes(req.headers.get("origin")!)
  )
    throw new ApiError(
      403,
      "ORIGEN",
      "No se permite esta solicitud. Abre la biblioteca desde su dirección habitual.",
    );
}
async function owner(req: NextRequest) {
  const token = req.cookies.get(cookie)?.value;
  if (!token)
    throw new ApiError(401, "SESION", "No se ha podido abrir tu biblioteca.");
  const r = await db().execute({
    sql: "SELECT biblioteca_id FROM sesiones WHERE token_hash=?",
    args: [hash(token)],
  });
  if (!r.rows.length)
    throw new ApiError(401, "SESION", "No se ha podido abrir tu biblioteca.");
  return String(r.rows[0].biblioteca_id);
}
async function book(tx: Transaction, id: string, library: string) {
  const r = await tx.execute({
    sql: `${select} WHERE l.id=? AND l.biblioteca_id=?`,
    args: [id, library],
  });
  return r.rows[0] as unknown as Libro | undefined;
}
function canonical(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return JSON.stringify(o.map(canonical));
  return (
    "{" +
    Object.entries(o as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
async function session(req: NextRequest) {
  try {
    await owner(req);
    return json({ ok: true });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
  }
  const token = randomBytes(32).toString("base64url"),
    library = randomUUID(),
    now = new Date().toISOString();
  const tx = await db().transaction("write");
  try {
    await tx.execute({
      sql: "INSERT INTO bibliotecas(id,creado_en) VALUES(?,?)",
      args: [library, now],
    });
    await tx.execute({
      sql: "INSERT INTO sesiones(token_hash,biblioteca_id) VALUES(?,?)",
      args: [hash(token), library],
    });
    const authors = [randomUUID(), randomUUID(), randomUUID()];
    for (const [i, n] of [
      "Alma Cerezo",
      "Julián Olmeda",
      "Vera Salcedo",
    ].entries())
      await tx.execute({
        sql: "INSERT INTO autores(id,biblioteca_id,nombre) VALUES(?,?,?)",
        args: [authors[i], library, n],
      });
    const samples = [
      ["La casa de las mareas", 0, "leyendo", null],
      ["Cartas del invierno lento", 0, "leído", 4],
      ["El mapa de los domingos", 1, "pendiente", null],
      ["Jardines de bolsillo", 1, "leído", 5],
      ["Donde descansan los trenes", 2, "leyendo", null],
      ["Una ventana al mediodía", 2, "pendiente", null],
    ] as const;
    for (const [title, a, status, rating] of samples)
      await tx.execute({
        sql: "INSERT INTO libros(id,biblioteca_id,autor_id,titulo,titulo_busqueda,estado,valoracion,creado_en,actualizado_en,revision) VALUES(?,?,?,?,?,?,?,?,?,1)",
        args: [
          randomUUID(),
          library,
          authors[a],
          title,
          normalize(title),
          status,
          rating,
          now,
          now,
        ],
      });
    await tx.execute({
      sql: "INSERT INTO marcador_semilla(biblioteca_id) VALUES(?)",
      args: [library],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
  const res = json({ ok: true });
  const secure = new URL(process.env.APP_ORIGIN!).protocol === "https:";
  res.cookies.set(cookie, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
async function read(req: NextRequest, kind: string, library: string) {
  if (kind === "autores") {
    const r = await db().execute({
      sql: "SELECT id,nombre FROM autores WHERE biblioteca_id=? ORDER BY nombre",
      args: [library],
    });
    return json({ autores: r.rows });
  }
  if (kind === "resumen") {
    const [r, books] = await db().batch([{
      sql: `SELECT COUNT(*) total,COALESCE(SUM(estado='pendiente'),0) pendientes,COALESCE(SUM(estado='leyendo'),0) leyendo,COALESCE(SUM(estado='leído'),0) leidos,AVG(valoracion) media FROM libros WHERE biblioteca_id=?`,
      args: [library],
    }, {
      sql: `${select} WHERE l.biblioteca_id=? ORDER BY l.actualizado_en DESC,l.id`,
      args: [library],
    }], "read");
    return json({
      ...r.rows[0],
      lecturas: books.rows.filter((b) => b.estado === "leyendo"),
      terminados: books.rows.filter((b) => b.estado === "leído"),
      proximos: books.rows.filter((b) => b.estado === "pendiente"),
    });
  }
  const state = normalizeEstadoFilter(req.nextUrl.searchParams.get("estado")),
    q = req.nextUrl.searchParams.get("q") || "",
    id = req.nextUrl.searchParams.get("id");
  if (state && !estados.includes(state as (typeof estados)[number]))
    throw new ApiError(400, "FILTRO", "Este estado no está disponible.", {
      errors: { estado: "Elige Pendiente, Leyendo o Leído." },
    });
  let sql = `${select} WHERE l.biblioteca_id=?`;
  const args: string[] = [library];
  if (state) {
    sql += " AND l.estado=?";
    args.push(state);
  }
  if (q) {
    sql += ` AND l.titulo_busqueda LIKE ? ESCAPE '\\'`;
    args.push("%" + normalize(q).replace(/[\\%_]/g, "\\$&") + "%");
  }
  if (id) {
    sql += " AND l.id=?";
    args.push(id);
  }
  sql += " ORDER BY l.creado_en DESC,l.titulo";
  const r = await db().execute({ sql, args });
  if (id && !r.rows.length)
    throw new ApiError(404, "NO_ENCONTRADO", "No se encuentra este libro.");
  return json({ libros: r.rows, total: r.rows.length });
}
async function mutate(req: NextRequest, action: string, library: string, routeId?: string) {
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    throw new ApiError(400, "JSON", "La solicitud no es válida.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ApiError(400, "JSON", "La solicitud no es válida.");
  if (routeId) {
    if (input.id !== undefined && input.id !== routeId)
      throw new ApiError(400, "REFERENCIA", "La referencia del libro no coincide.");
    input = { ...input, id: routeId };
  }
  const allowedInput = action === "crear"
    ? ["titulo", "autor_id", "estado", "valoracion", "clave"]
    : action === "eliminar"
      ? ["id", "revision", "clave"]
      : ["id", "revision", "cambios", "clave"];
  if (Object.keys(input).some((key) => !allowedInput.includes(key)))
    throw new ApiError(400, "CAMPOS", "La solicitud contiene campos no admitidos.");
  const { clave, id, revision } = input;
  if (typeof clave !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(clave))
    throw new ApiError(
      400,
      "CLAVE",
      "No se reconoce este intento. Vuelve a abrir el formulario.",
    );
  if (
    action !== "crear" &&
    (typeof id !== "string" ||
      !Number.isInteger(revision) ||
      Number(revision) < 1)
  )
    throw new ApiError(400, "REVISION", "Falta la revisión del libro.");
  const tx = await db().transaction("write");
  try {
    const payloadHash = hash(canonical(input));
    const old = await tx.execute({
      sql: "SELECT accion,payload_hash,resultado FROM operaciones_idempotentes WHERE biblioteca_id=? AND clave=?",
      args: [library, clave],
    });
    if (old.rows.length) {
      if (
        old.rows[0].accion !== action ||
        old.rows[0].payload_hash !== payloadHash
      )
        throw new ApiError(
          409,
          "CLAVE_REUTILIZADA",
          "Este intento corresponde a otros datos. Inicia otro cambio.",
        );
      await tx.commit();
      return json(JSON.parse(String(old.rows[0].resultado)));
    }
    const current =
      action === "crear" ? undefined : await book(tx, id as string, library);
    if (action !== "crear" && !current)
      throw new ApiError(404, "NO_ENCONTRADO", "No se encuentra este libro.");
    if (current && current.revision !== revision)
      throw new ApiError(409, "CONFLICTO", "Este libro ha cambiado.", {
        actual: current,
      });
    const now = new Date().toISOString();
    let result: Record<string, unknown>;
    if (action === "eliminar") {
      await tx.execute({
        sql: "DELETE FROM libros WHERE id=? AND biblioteca_id=? AND revision=?",
        args: [id as string, library, revision as number],
      });
      result = { id, eliminado: true, operacion: clave };
    } else {
      const raw = action === "crear" ? input : input.cambios;
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new ApiError(400, "CAMPOS", "Indica los campos del libro.");
      const changes = raw as Record<string, unknown>;
      const allowed =
        action === "crear"
          ? ["titulo", "autor_id", "estado", "valoracion", "clave"]
          : ["titulo", "autor_id", "estado", "valoracion"];
      if (Object.keys(changes).some((k) => !allowed.includes(k)))
        throw new ApiError(
          400,
          "CAMPOS",
          "La solicitud contiene campos no admitidos.",
        );
      const values = { ...current, ...changes };
      const errors: Record<string, string> = {};
      if (
        typeof values.titulo !== "string" ||
        values.titulo.trim().length < 1 ||
        values.titulo.trim().length > 200
      )
        errors.titulo = "Escribe un título de entre 1 y 200 caracteres.";
      if (
        typeof values.estado !== "string" ||
        !estados.includes(values.estado as (typeof estados)[number])
      )
        errors.estado = "Elige un estado válido.";
      if (
        values.valoracion !== null &&
        (!Number.isInteger(values.valoracion) ||
          Number(values.valoracion) < 1 ||
          Number(values.valoracion) > 5)
      )
        errors.valoracion = "La valoración debe ser un número entero de 1 a 5.";
      if (typeof values.autor_id !== "string")
        errors.autor_id = "Elige un autor.";
      else {
        const author = await tx.execute({
          sql: "SELECT id FROM autores WHERE id=? AND biblioteca_id=?",
          args: [values.autor_id, library],
        });
        if (!author.rows.length)
          errors.autor_id = "Elige un autor de tu biblioteca.";
      }
      if (Object.keys(errors).length)
        throw new ApiError(400, "VALIDACION", "Revisa los campos indicados.", {
          errors,
        });
      const title = (values.titulo as string).trim(),
        bookId = current?.id || randomUUID();
      if (action === "crear")
        await tx.execute({
          sql: "INSERT INTO libros(id,biblioteca_id,autor_id,titulo,titulo_busqueda,estado,valoracion,creado_en,actualizado_en,revision) VALUES(?,?,?,?,?,?,?,?,?,1)",
          args: [
            bookId,
            library,
            values.autor_id as string,
            title,
            normalize(title),
            values.estado as string,
            values.valoracion as number | null,
            now,
            now,
          ],
        });
      else
        await tx.execute({
          sql: "UPDATE libros SET autor_id=?,titulo=?,titulo_busqueda=?,estado=?,valoracion=?,actualizado_en=?,revision=revision+1 WHERE id=? AND biblioteca_id=? AND revision=?",
          args: [
            values.autor_id as string,
            title,
            normalize(title),
            values.estado as string,
            values.valoracion as number | null,
            now,
            bookId,
            library,
            revision as number,
          ],
        });
      result = { libro: await book(tx, bookId, library), operacion: clave };
    }
    await tx.execute({
      sql: "INSERT INTO operaciones_idempotentes(biblioteca_id,clave,accion,payload_hash,resultado,creado_en) VALUES(?,?,?,?,?,?)",
      args: [library, clave, action, payloadHash, JSON.stringify(result), now],
    });
    await tx.commit();
    return json(result);
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
export async function handle(req: NextRequest, kind: string, routeId?: string) {
  try {
    if (req.method === "POST") origin(req);
    await initialize();
    if (kind === "sesion") return await session(req);
    const library = await owner(req);
    return req.method === "GET"
      ? await read(req, kind, library)
      : await mutate(req, kind, library, routeId);
  } catch (e) {
    if (e instanceof ApiError)
      return json({ error: e.message, code: e.code, ...e.extra }, e.status);
    console.error("Biblioteca API:", e instanceof Error ? e.message : "Error");
    return json(
      {
        error: "No podemos acceder a tu biblioteca ahora. Vuelve a intentarlo.",
        code: "SERVIDOR",
      },
      503,
    );
  }
}
