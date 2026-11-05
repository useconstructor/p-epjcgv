"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Check,
  AlertTriangle,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Failure, Rail, Rating, Skeleton } from "@/components/library-shared";
import {
  BookEditor,
  DeleteDialog,
  type Operation,
} from "@/components/book-editor";
import {
  ensureSession,
  request,
  RequestError,
  trackConfirmed,
  resetSession,
} from "@/lib/client";
import { estados, normalizeEstadoFilter, type Libro, type Estado, type Borrador } from "@/lib/types";
import { labelEstado } from "@/lib/branding";
type CardState = {
  busy?: boolean;
  error?: string;
  uncertain?: boolean;
  operation?: Operation;
  actual?: Libro;
  draft?: Borrador;
};
export function CollectionView() {
  const router = useRouter(),
    params = useSearchParams(),
    query = params.get("q") || "",
    state = normalizeEstadoFilter(params.get("estado")),
    editReference = params.get("editar"),
    selected = params.get("libro") || editReference,
    create = params.get("accion") === "crear" || params.get("nuevo") === "1";
  const invalidOpening =
    (params.has("nuevo") && params.get("nuevo") !== "1") ||
    (params.has("accion") && params.get("accion") !== "crear") ||
    (params.has("editar") && !editReference) ||
    (create && params.has("editar"));
  const [search, setSearch] = useState(query),
    [books, setBooks] = useState<Libro[] | null>(null),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [loadedFilter, setLoadedFilter] = useState<{ query: string; state: string } | null>(null),
    [error, setError] = useState<RequestError | null>(null),
    [editor, setEditor] = useState<{
      book: Libro | null;
      initial?: Borrador;
      conflict?: Libro;
    } | null>(null),
    [deleting, setDeleting] = useState<Libro | null>(null),
    [cardStates, setCardStates] = useState<Record<string, CardState>>({}),
    [saved, setSaved] = useState<Libro | null>(null),
    [animateSaved, setAnimateSaved] = useState(false),
    [recoveredSaved, setRecoveredSaved] = useState(false),
    [deleted, setDeleted] = useState(""),
    [referenceError, setReferenceError] = useState(""),
    [reload, setReload] = useState(0);
  const focusedSelected = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null),
    addRef = useRef<HTMLButtonElement>(null),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const invalid = !!state && !estados.includes(state as Estado);
  const setUrl = useCallback(
    (changes: Record<string, string | null>, replace = false) => {
      const p = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(changes)) {
        if (value) p.set(key, value);
        else p.delete(key);
      }
      const href = "/libros" + (p.size ? "?" + p.toString() : "");
      if (replace) {
        // Closing a dialog must remove its URL action before it disappears,
        // including when the reader reloads immediately after confirmation.
        window.history.replaceState(null, "", href);
      } else {
        router.push(href, { scroll: false });
      }
    },
    [router],
  );
  useEffect(() => {
    setSearch(query);
  }, [query]);
  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => setUrl({ q: search, libro: null }), 250);
    return () => clearTimeout(timer);
  }, [search, query, setUrl]);
  useEffect(() => {
    if (create && !invalidOpening) setEditor((e) => e || { book: null });
  }, [create, invalidOpening]);
  useEffect(() => {
    if (!editReference || invalidOpening) return;
    let active = true;
    (async () => {
      try {
        await ensureSession();
        const data = await request<{ libros: Libro[] }>(
          "/api/libros?id=" + encodeURIComponent(editReference),
        );
        if (active) setEditor((current) => current || { book: data.libros[0] });
      } catch (error) {
        if (active) setReferenceError(error instanceof RequestError && error.status === 404
          ? "No se encuentra el libro seleccionado en tu biblioteca."
          : "No podemos abrir este libro ahora. Vuelve a intentarlo.");
      }
    })();
    return () => { active = false; };
  }, [editReference, invalidOpening]);
  useEffect(() => {
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setLoading(true);
    setError(null);
    setReferenceError("");
    if (!selected) focusedSelected.current = null;
    (async () => {
      try {
        await ensureSession();
        const p = new URLSearchParams();
        if (query) p.set("q", query);
        if (state) p.set("estado", state);
        const d = await request<{ libros: Libro[]; total: number }>(
          "/api/libros?" + p,
          undefined,
          controller.signal,
        );
        setBooks(d.libros);
        setTotal(d.total);
        setLoadedFilter({ query, state });
        if (selected) {
          if (!d.libros.some((b) => b.id === selected)) {
            try {
              const own = await request<{ libros: Libro[] }>(
                "/api/libros?id=" + encodeURIComponent(selected),
                undefined,
                controller.signal,
              );
              setReferenceError(
                `«${own.libros[0].titulo}» no aparece con estos filtros.`,
              );
            } catch (e) {
              if (e instanceof RequestError && e.status === 404)
                setReferenceError(
                  "No se encuentra el libro seleccionado en tu biblioteca.",
                );
              else throw e;
            }
          } else if (focusedSelected.current !== selected) {
            focusedSelected.current = selected;
            timers.current.push(
              setTimeout(
                () =>
                  document
                    .querySelector<HTMLElement>(`[data-book-id="${selected}"]`)
                    ?.focus({ preventScroll: true }),
                100,
              ),
            );
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e as RequestError);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [query, state, selected, reload]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (editor || deleting) {
      timers.current.forEach(clearTimeout);
      abort.current?.abort();
      setLoading(false);
    }
  }, [editor, deleting]);
  function refresh() {
    setReload((n) => n + 1);
  }
  function closeEditor() {
    setEditor(null);
    if (editor) refresh();
    if (create || editReference) setUrl({ accion: null, nuevo: null, editar: null }, true);
  }
  function confirm(b: Libro, animate = false, recovered = false) {
    setBooks((old) =>
      old
        ? old.some((x) => x.id === b.id)
          ? old.map((x) => (x.id === b.id ? b : x))
          : [b, ...old]
        : [b],
    );
    setSaved(b);
    setAnimateSaved(animate);
    setRecoveredSaved(recovered);
    setDeleted("");
    setCardStates((s) => ({ ...s, [b.id]: {} }));
    if (create) setUrl({ accion: null, nuevo: null }, true);
    timers.current.push(setTimeout(refresh, 650));
  }
  const excluded =
    !!saved &&
    ((!!state && saved.estado !== state) ||
      (!!query &&
        !saved.titulo
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(
            query
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase(),
          )));
  async function changeStatus(b: Libro, next: Estado, previous?: Operation) {
    timers.current.forEach(clearTimeout);
    abort.current?.abort();
    const op = previous || {
      path: "/api/libros/actualizar",
      payload: {
        id: b.id,
        revision: b.revision,
        cambios: { estado: next },
        clave: crypto.randomUUID(),
      },
      event: "estado_libro_cambiado" as const,
    };
    setSaved(null);
    setCardStates((s) => ({ ...s, [b.id]: { busy: true, operation: op } }));
    try {
      const data = await request<{ libro: Libro }>(op.path, op.payload);
      let superseded = false;
      if (previous) {
        try {
          const current = await request<{ libros: Libro[] }>("/api/libros?id=" + encodeURIComponent(b.id));
          superseded = current.libros[0].revision > data.libro.revision;
          data.libro = current.libros[0];
        } catch (error) {
          if (error instanceof RequestError && error.status === 404) {
            setCardStates((s) => ({ ...s, [b.id]: {} }));
            setReferenceError("El intento se guardó, pero el libro se eliminó después. Ya no está en tu biblioteca.");
            setBooks((old) => old?.filter((book) => book.id !== b.id) || []);
            return;
          }
          throw error;
        }
      }
      if (!superseded) await trackConfirmed(String(op.payload.clave), "estado_libro_cambiado");
      confirm(data.libro, !superseded, superseded);
    } catch (e) {
      setCardStates((s) => ({
        ...s,
        [b.id]: {
          operation: op,
          error:
            e instanceof RequestError && e.status < 500
              ? e.message
              : "No podemos confirmar el cambio.",
          uncertain: !(e instanceof RequestError) || e.status >= 500,
          actual: e instanceof RequestError && e.actual ? e.actual : undefined,
          draft: { ...b, estado: next },
        },
      }));
    }
  }
  function deleteConfirmed() {
    if (selected === deleting?.id) setUrl({ libro: null }, true);
    const index = books?.findIndex((b) => b.id === deleting?.id) ?? 0;
    const next = books?.[index + 1] || books?.[index - 1];
    setDeleted(`«${deleting?.titulo}» se ha eliminado.`);
    setBooks((old) => old?.filter((b) => b.id !== deleting?.id) || []);
    setDeleting(null);
    setSaved(null);
    refresh();
    timers.current.push(
      setTimeout(() => {
        if (next)
          document
            .querySelector<HTMLButtonElement>(
              `[data-book-id="${next.id}"] [data-edit-book]`,
            )
            ?.focus();
        else addRef.current?.focus();
      }, 100),
    );
  }
  return (
    <main id="contenido" className="page collection-page">
      <div className="collection-heading">
        <div className="collection-title">
          <h1>Tu colección</h1>
          <div className="collection-count">
          <p role="status">
            {invalid
                ? "Revisa el filtro"
                : error
                  ? books
                    ? `Última lectura: ${total} ${total === 1 ? "libro" : "libros"}`
                    : "Recuento no disponible"
                  : loading && !books
                    ? query ? "Buscando en tu cuaderno…" : "Cargando colección…"
                  : `${total} ${total === 1 ? "libro" : "libros"}`}
          </p>
          <span className="collection-refresh" role="status">
            {loading && books && !invalid && (loadedFilter?.query !== query
              ? "Buscando en tu cuaderno…"
              : loadedFilter?.state !== state
                ? "Filtrando colección…"
                : "Actualizando colección…")}
          </span>
          </div>
        </div>
        <Button
          ref={addRef}
          onClick={() => {
            setUrl({ accion: "crear" });
            setEditor({ book: null });
          }}
        >
          <Plus size={17} />
          Añadir libro
        </Button>
      </div>
      <div className="collection-controls">
        <div className="search-control">
          <label htmlFor="buscar">Buscar por título</label>
          <div className="relative">
            <Search className="search-icon" size={18} />
            <Input
              className="pl-10"
              id="buscar"
              type="search"
              placeholder="Encuentra una lectura…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="status-control">
          <label htmlFor="filtro">Estado</label>
          <select
            id="filtro"
            value={state}
            onChange={(e) => setUrl({ estado: e.target.value, libro: null })}
          >
            {invalid && <option value={state}>Estado no válido</option>}
            <option value="">Todos</option>
            {estados.map((s) => (
              <option key={s} value={s}>
                {labelEstado[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="results-line">
          {(query || state) && (
            <button
              className="text-link"
              onClick={() => {
                setSearch("");
                setUrl({ q: null, estado: null, libro: null });
              }}
            >
              <X size={14} />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>
      {invalid ? (
        <div className="notice warning" role="alert">
          <AlertTriangle size={20} />
          <div>
            <p>El estado «{state}» no está disponible.</p>
            <Button variant="outline" onClick={() => setUrl({ estado: null })}>
              Restablecer filtro
            </Button>
          </div>
        </div>
      ) : (
        error && (
          <Failure
            error={error.message}
            session={error.status === 401}
            retained={!!books}
            retry={() => {
              resetSession()
                .then(refresh)
                .catch((e) => setError(e));
            }}
          />
        )
      )}
      {(referenceError || invalidOpening) && (
        <div className="notice warning" role="alert">
          <AlertTriangle size={20} />
          <div>
            <p>{invalidOpening ? "No se reconoce la apertura solicitada. Vuelve a la colección para elegir un libro." : referenceError}</p>
            <button
              className="text-link"
              onClick={() => setUrl({ libro: null, q: null, estado: null, editar: null, nuevo: null, accion: null })}
            >
              Ver mi colección
            </button>
          </div>
        </div>
      )}
      {excluded && saved && (
        <div className={`notice ${recoveredSaved ? "recovered-feedback" : "success"}`} role="status">
          {recoveredSaved ? <RotateCcw size={19} /> : <Check size={19} />}
          <div>
            <p>
              {recoveredSaved ? "Datos actuales recuperados." : "Libro guardado."} «{saved.titulo}» está en{" "}
              {labelEstado[saved.estado]} y ya no aparece con este filtro.
            </p>
            <button
              className="text-link"
              onClick={() => {
                setSearch("");
                setUrl({ q: null, estado: null, libro: saved.id });
              }}
            >
              Mostrar libro
            </button>
          </div>
        </div>
      )}
      {deleted && (
        <div className="notice success" role="status">
          <Check size={19} />
          <p>{deleted}</p>
        </div>
      )}
      {deleting && (
        <DeleteDialog
          book={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={deleteConfirmed}
        />
      )}
      {!invalid &&
        (!books ? (
          loading ? <Skeleton /> : null
        ) : books.length ? (
          <div className="book-grid" aria-busy={loading}>
            {books.map((b) => {
              const cs = cardStates[b.id] || {};
              return (
                <article
                  data-book-id={b.id}
                  key={b.id}
                  tabIndex={-1}
                  className={`book-card ${b.titulo.length > 80 ? "long-title-card" : ""} ${selected === b.id ? "highlighted" : ""}`}
                >
                  {b.titulo.length > 80 && <h2 className="wide-book-title">{b.titulo}</h2>}
                  <div className="book-margin">
                    <Rail estado={b.estado} busy={cs.busy} confirmation={animateSaved && saved?.id === b.id ? `${b.id}:${b.revision}` : undefined} />
                  </div>
                  <div className="book-content">
                    {b.titulo.length <= 80 && <h2>{b.titulo}</h2>}
                    <p className="book-author">{b.autor}</p>
                    <Rating value={b.valoracion} />
                  </div>
                  <div className="card-feedback-slot">
                      {cs.busy && (
                        <p className="card-feedback" role="status">
                          <Loader2 size={15} className="animate-spin" />
                          Guardando estado: {labelEstado[(cs.operation?.payload.cambios as { estado: Estado }).estado]}…
                        </p>
                      )}
                      {saved?.id === b.id && !excluded && !cs.busy && !cs.error && (
                        <p className={`card-feedback ${recoveredSaved ? "recovered-feedback" : "confirmed"}`} role="status">
                          {recoveredSaved ? <RotateCcw size={16} /> : <Check size={16} />}
                          {recoveredSaved ? "Datos actuales recuperados" : "Libro guardado"}
                        </p>
                      )}
                  </div>
                  <div className="book-controls">
                    <div className="card-status">
                      <label htmlFor={"estado-" + b.id}>Cambiar estado</label>
                      <select
                        id={"estado-" + b.id}
                        value={b.estado}
                        onChange={(e) =>
                          changeStatus(b, e.target.value as Estado)
                        }
                        disabled={cs.busy || cs.uncertain || !!cs.actual || deleting?.id === b.id}
                      >
                        {estados.map((s) => (
                          <option key={s} value={s}>
                            {labelEstado[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="card-actions">
                      <button
                        data-edit-book
                        onClick={() => {
                          setSaved(null);
                          setEditor({ book: b });
                        }}
                        disabled={cs.busy || cs.uncertain || deleting?.id === b.id}
                      >
                        <Pencil size={15} />
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          setSaved(null);
                          setDeleting(b);
                        }}
                        disabled={cs.busy || cs.uncertain || !!deleting}
                      >
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </div>
                    {cs.error && (
                      <div className="card-error" role="alert">
                        <p>
                          <AlertTriangle size={16} />
                          {cs.error}
                        </p>
                        {cs.uncertain && cs.operation ? (
                          <Button
                            onClick={() =>
                              changeStatus(
                                b,
                                cs.draft?.estado || b.estado,
                                cs.operation,
                              )
                            }
                          >
                            <RotateCcw size={15} />
                            Recuperar cambio
                          </Button>
                        ) : cs.actual ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              setEditor({
                                book: b,
                                initial: cs.draft,
                                conflict: cs.actual,
                              })
                            }
                          >
                            Comparar cambios
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setCardStates((s) => ({ ...s, [b.id]: {} }));
                              refresh();
                            }}
                          >
                            Reintentar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-margin">{query || state ? "Sin coincidencias" : "Biblioteca vacía"}</span>
            <div className="empty-copy">
            <h2>
              {query || state
                ? "No hay lecturas con estos filtros"
                : "Tu primera página, en blanco"}
            </h2>
            <p>
              {query || state
                ? "Prueba otro título o vuelve a recorrer toda tu colección."
                : "Todavía no tienes libros. Añade el primero para empezar tu cuaderno."}
            </p>
            {query || state ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setUrl({ q: null, estado: null });
                }}
              >
                Limpiar filtros
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setEditor({ book: null })}>
                <Plus size={17} />
                Añadir libro
              </Button>
            )}
            </div>
          </div>
        ))}
      {editor && (
        <BookEditor
          key={editor.book?.id || "new"}
          {...editor}
          onClose={closeEditor}
          onSaved={confirm}
        />
      )}
    </main>
  );
}
