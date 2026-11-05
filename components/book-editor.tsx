"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertTriangle, ArrowDown, Check, ChevronDown, Loader2, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureSession, request, RequestError, trackConfirmed } from "@/lib/client";
import { estados, type Libro, type Autor, type Borrador } from "@/lib/types";
import { labelEstado } from "@/lib/branding";
import { Rail, Rating } from "@/components/library-shared";
export type Operation = {
  path: string;
  payload: Record<string, unknown>;
  event?: "libro_creado" | "estado_libro_cambiado";
};
const blank: Borrador = {
  titulo: "",
  autor_id: "",
  estado: "pendiente",
  valoracion: null,
};
function revealField(body: HTMLDivElement | null, field: HTMLElement | null) {
  if (!body || !field) return;
  const group = field.getBoundingClientRect(), frame = body.getBoundingClientRect();
  if (group.top < frame.top || group.bottom > frame.bottom)
    body.scrollTop += group.top - frame.top;
}
export function BookEditor({
  book,
  initial,
  conflict,
  onClose,
  onSaved,
}: {
  book: Libro | null;
  initial?: Borrador;
  conflict?: Libro;
  onClose: () => void;
  onSaved: (book: Libro, animate?: boolean, recovered?: boolean) => void;
}) {
  const [draft, setDraft] = useState<Borrador>(initial || book || blank),
    [authors, setAuthors] = useState<Autor[]>([]),
    [authorError, setAuthorError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState<Operation | null>(null),
    [uncertain, setUncertain] = useState(false),
    [previous, setPrevious] = useState<Operation | null>(null),
    [actual, setActual] = useState<Libro | null>(conflict || null),
    [message, setMessage] = useState(""),
    [confirmedNew, setConfirmedNew] = useState<Libro | null>(null),
    [savedBook, setSavedBook] = useState<Libro | null>(null),
    [savedMotion, setSavedMotion] = useState(false),
    [reconciledLater, setReconciledLater] = useState(false),
    [missing, setMissing] = useState(false),
    [discard, setDiscard] = useState(false),
    [moreBelow, setMoreBelow] = useState(false),
    [currentVersionBelow, setCurrentVersionBelow] = useState(false),
    [summaryHidden, setSummaryHidden] = useState(false),
    [reviewingDraft, setReviewingDraft] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null);
  const attachPanel = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    setPanelNode(node);
  }, []);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const discardReturnFocus = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const validationRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDetailsElement>(null);
  const comparisonBodyRef = useRef<HTMLDivElement>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [submittedOpen, setSubmittedOpen] = useState(false);
  const submittedDraft = operation
    ? (operation.payload.cambios || operation.payload) as Borrador
    : null;
  const base = useRef(book);
  const recovering = !savedBook && !!(message || actual || uncertain || previous);
  const dirty = !savedBook && !missing && (Object.keys(blank) as (keyof Borrador)[]).some(
    (key) => draft[key] !== (base.current || blank)[key],
  );
  useEffect(() => {
    if (!dirty && !busy && !uncertain && !previous) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, uncertain, previous]);
  useLayoutEffect(() => {
    if (savedBook) {
      panelRef.current?.scrollTo({ top: 0, behavior: "instant" });
      panelRef.current?.querySelector<HTMLButtonElement>("[data-close-saved]")?.focus({ preventScroll: true });
    }
  }, [savedBook]);
  const returnFocus = useRef<HTMLElement | null>(
    typeof document !== "undefined"
      ? (document.activeElement as HTMLElement)
      : null,
  );
  useEffect(() => {
    loadAuthors();
  }, []);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const panel = panelNode;
    if (!viewport || !panel) return;
    const fitViewport = () => {
      panel.style.setProperty("--visible-height", `${viewport.height}px`);
      panel.style.setProperty("--visible-top", `${viewport.offsetTop}px`);
      requestAnimationFrame(() => revealField(
        bodyRef.current,
        document.activeElement?.closest<HTMLElement>(".form-field") || null,
      ));
    };
    fitViewport();
    viewport.addEventListener("resize", fitViewport);
    viewport.addEventListener("scroll", fitViewport);
    return () => {
      viewport.removeEventListener("resize", fitViewport);
      viewport.removeEventListener("scroll", fitViewport);
    };
  }, [panelNode]);
  useEffect(() => {
    const panel = comparisonOpen ? comparisonBodyRef.current : bodyRef.current;
    if (!panel) return;
    const update = () => {
      const cue = panelRef.current?.querySelector<HTMLElement>(".comparison-cue");
      const cueStyle = cue && getComputedStyle(cue);
      // Measure the space available without the hint itself. Otherwise a hint
      // carried over from the form can keep an already-fitting comparison
      // clipped by consuming the space it needs.
      const cueSpace = cue && cueStyle
        ? cue.offsetHeight + parseFloat(cueStyle.marginTop) + parseFloat(cueStyle.marginBottom)
        : 0;
      setMoreBelow(panel.scrollHeight - panel.scrollTop - panel.clientHeight - cueSpace > 12);
      panelRef.current?.style.setProperty("--editor-gutter", `${panel.offsetWidth - panel.clientWidth}px`);
      const summary = validationRef.current?.getBoundingClientRect();
      const frame = panel.getBoundingClientRect();
      const currentVersion = panel.querySelector("#current-comparison-version")?.getBoundingClientRect();
      setCurrentVersionBelow(!!currentVersion && currentVersion.top >= frame.bottom - 1);
      setSummaryHidden(!!summary && (
        summary.top < Math.max(frame.top, 0) - 1 ||
        summary.bottom > Math.min(frame.bottom, window.innerHeight) + 1
      ));
    };
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    for (const child of panel.children) observer.observe(child);
    panel.addEventListener("scroll", update);
    update();
    return () => { observer.disconnect(); panel.removeEventListener("scroll", update); };
  }, [errors, authorError, authors.length, message, actual, uncertain, previous, savedBook, comparisonOpen]);
  useLayoutEffect(() => {
    if (!busy && (message || actual || uncertain || previous))
      setReviewingDraft(false);
  }, [busy, message, actual, uncertain, previous]);
  useLayoutEffect(() => {
    if (!busy && !reviewingDraft && (message || actual || uncertain || previous)) {
      const panel = panelRef.current;
      const body = bodyRef.current;
      const feedback = feedbackRef.current;
      if (panel && body && feedback) {
        // Only the body scrolls. The confirmed identity and working edge keep
        // their own space, and a short response never creates empty padding.
        const fit = () => {
          body.style.height = `${feedback.scrollHeight}px`;
          body.scrollTop = feedback.offsetTop;
        };
        fit();
        panel.scrollTop = 0;
        body.scrollTop = feedback.offsetTop;
        feedback.focus({ preventScroll: true });
        const observer = new ResizeObserver(fit);
        observer.observe(feedback);
        return () => observer.disconnect();
      }
    }
  }, [busy, message, actual, uncertain, previous, reviewingDraft]);
  async function loadAuthors() {
    setAuthorError("");
    try {
      await ensureSession();
      const d = await request<{ autores: Autor[] }>("/api/autores");
      setAuthors(d.autores);
    } catch {
      setAuthorError("No podemos cargar los autores. Tu borrador se conserva.");
    }
  }
  function validate() {
    const err: Record<string, string> = {};
    if (draft.titulo.trim().length < 1 || draft.titulo.trim().length > 200)
      err.titulo = "Escribe un título de entre 1 y 200 caracteres.";
    if (!authors.some((a) => a.id === draft.autor_id))
      err.autor_id = "Elige un autor de tu biblioteca.";
    if (!estados.includes(draft.estado)) err.estado = "Elige un estado válido.";
    if (
      draft.valoracion !== null &&
      (!Number.isInteger(draft.valoracion) ||
        draft.valoracion < 1 ||
        draft.valoracion > 5)
    )
      err.valoracion = "Elige una valoración de 1 a 5.";
    setErrors(err);
    if (Object.keys(err).length) {
      requestAnimationFrame(() => {
        const field = document.getElementById("field-" + Object.keys(err)[0]);
        field?.focus({ preventScroll: true });
        const group = field?.closest<HTMLElement>(".form-field");
        const body = bodyRef.current;
        if (body && group && body.scrollHeight > body.clientHeight) {
          const summary = validationRef.current;
          const fieldBottom = group.offsetTop + group.offsetHeight;
          // Keep the complete summary with the first invalid field when both
          // fit. At short heights, start at the field; the footer retains the
          // complete error count and a link back to the full summary.
          body.scrollTop = summary && fieldBottom - summary.offsetTop <= body.clientHeight
            ? Math.max(0, fieldBottom - body.clientHeight)
            : group.offsetTop;
        }
      });
      return false;
    }
    return true;
  }
  async function submit(overwrite = false) {
    if (busy || uncertain || !validate()) return;
    const snapshot = {
      titulo: draft.titulo,
      autor_id: draft.autor_id,
      estado: draft.estado,
      valoracion: draft.valoracion,
    };
    const revision = overwrite ? actual?.revision : base.current?.revision;
    const op: Operation = {
      path: base.current ? "/api/libros/actualizar" : "/api/libros/crear",
      payload: base.current
        ? {
            id: base.current.id,
            revision,
            cambios: snapshot,
            clave: crypto.randomUUID(),
          }
        : { ...snapshot, clave: crypto.randomUUID() },
      event: !base.current
        ? "libro_creado"
        : draft.estado !== (overwrite ? actual : base.current)?.estado
          ? "estado_libro_cambiado"
          : undefined,
    };
    setActual(null);
    setComparisonOpen(false);
    setOperation(op);
    await send(op);
  }
  function showSaved(value: Libro, animate = false, recovered = false) {
    setComparisonOpen(false);
    setSavedMotion(animate);
    setReconciledLater(recovered);
    base.current = value;
    setSavedBook(value);
    setDraft(value);
    setOperation(null);
    setMessage("");
    onSaved(value, animate, recovered);
  }
  async function send(op: Operation, old = false) {
    setBusy(true);
    setMessage("");
    setErrors({});
    try {
      const data = await request<{ libro: Libro }>(op.path, op.payload);
      let superseded = false;
      // An idempotent response records the original operation, not necessarily
      // the latest book. Reconcile recovery with an authorized current read.
      if (uncertain || old) {
        let current: { libros: Libro[] };
        try {
          current = await request<{ libros: Libro[] }>(
            "/api/libros?id=" + encodeURIComponent(data.libro.id),
          );
        } catch (error) {
          if (error instanceof RequestError && error.status === 404) {
            setMissing(true);
            setUncertain(false);
            setPrevious(null);
            setOperation(null);
            setMessage("El intento se guardó, pero el libro se eliminó después. Ya no está en tu biblioteca. Conservamos aquí tu borrador.");
            return;
          }
          throw error;
        }
        superseded = current.libros[0].revision > data.libro.revision;
        setReconciledLater(superseded);
        data.libro = current.libros[0];
      }
      if (op.event && !superseded) await trackConfirmed(String(op.payload.clave), op.event);
      if (old) {
        setPrevious(null);
        if (confirmedNew) showSaved(confirmedNew);
        else
          setMessage(
            `El intento anterior se ha recuperado: «${data.libro.titulo}». Tu nuevo borrador sigue abierto.`,
          );
      } else {
        setUncertain(false);
        if (previous) {
          setConfirmedNew(data.libro);
          setOperation(null);
          setMessage(
            "El nuevo libro se ha guardado. Recupera el intento anterior antes de cerrar esta página.",
          );
        } else showSaved(data.libro, !superseded && op.event === "estado_libro_cambiado", superseded);
      }
    } catch (e) {
      if (e instanceof RequestError && e.status < 500) {
        if (e.code === "CONFLICTO") {
          setActual(e.actual || null);
        } else if (e.errors) {
          setErrors(e.errors);
          requestAnimationFrame(() =>
            document
              .getElementById("field-" + Object.keys(e.errors!)[0])
              ?.focus(),
          );
        } else setMessage(e.message);
        setUncertain(false);
      } else {
        if (!old) setUncertain(true);
        setMessage(
          "No podemos confirmar el cambio. Recupera el intento para conocer su resultado.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (busy || uncertain || previous) return;
    if (dirty) {
      discardReturnFocus.current = document.activeElement as HTMLElement | null;
      setDiscard(true);
    }
    else onClose();
  }
  const change = (key: keyof Borrador, value: string | number | null) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const changedFields = (Object.keys(blank) as (keyof Borrador)[]).filter(
    (key) => actual && (draft[key] !== actual[key] || base.current?.[key] !== actual[key]),
  );
  const differenceCount = actual
    ? changedFields.filter((key) => key !== "titulo").length +
      titleDifferenceCount([base.current?.titulo || "", draft.titulo, actual.titulo])
    : 0;
  const fieldNames: Record<keyof Borrador, string> = {
    titulo: "Título", autor_id: "Autor", estado: "Estado", valoracion: "Valoración",
  };
  return (
    <>
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={attachPanel}
          className={`editor-dialog ${Object.keys(errors).length ? "has-validation" : ""} ${base.current ? "has-saved-identity" : ""} ${(base.current?.titulo.length || 0) > 80 ? "has-long-identity" : ""} ${recovering ? "has-response" : ""} ${savedBook ? "is-saved" : ""} ${uncertain ? "is-uncertain" : ""} ${comparisonOpen ? "comparison-is-open" : ""} ${reviewingDraft ? "reviewing-draft" : ""}`}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const target = returnFocus.current;
            if (!missing && target?.isConnected && target !== document.body) target.focus();
            else document.querySelector<HTMLButtonElement>(".collection-heading button")?.focus();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            if (discard) setDiscard(false);
            else close();
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className={`dialog-heading ${savedBook && savedBook.titulo.length > 80 && !reconciledLater ? "compact-saved-heading" : ""}`}>
            <div>
              {!savedBook && <span className={`dialog-kicker editor-state ${missing ? "historical-state" : ""}`}>
                <span className="context-tab" aria-hidden="true" />
                <span>{missing ? "Último estado: " : uncertain && base.current ? "Último confirmado: " : ""}
                  {labelEstado[base.current?.estado || "pendiente"]}
                </span>
              </span>}
              <Dialog.Title className={savedBook && !reconciledLater ? "sr-only" : undefined}>
                {missing ? "Libro eliminado" : savedBook ? reconciledLater ? "Cambio recuperado" : "Ficha del libro" : uncertain ? "Resultado sin confirmar" : base.current ? "Editar libro" : "Nuevo libro"}
              </Dialog.Title>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar diálogo"
              onClick={close}
              disabled={busy || uncertain || !!previous}
            >
              <X size={21} />
            </button>
          </div>
          {!savedBook && base.current && <details className="confirmed-identity">
            <summary>Ver título guardado</summary>
            <p>{base.current.titulo}</p>
          </details>}
          {(recovering || savedBook) && <Dialog.Description className={`dialog-description ${savedBook ? "sr-only" : ""}`} data-book-context={base.current?.id}>
            {savedBook
              ? "Estos son los datos confirmados de tu biblioteca."
              : missing && base.current
              ? `Libro seleccionado: «${base.current.titulo}».`
              : base.current
              ? `Estás editando «${base.current.titulo}».`
              : "Anota un título y encuentra su lugar en tu cuaderno."}
          </Dialog.Description>}
          {savedBook ? (
            <div className="saved-book" data-saved-book-id={savedBook.id}>
              <div className="saved-book-body">
              {reconciledLater && <p className="reconciled-note">El libro cambió después de tu envío. Esta ficha muestra los datos actuales.</p>}
              <div className={`saved-book-sheet ${savedBook.titulo.length > 80 ? "long-title-sheet" : ""}`}>
                {savedBook.titulo.length > 80 && <h3 className="wide-book-title">{savedBook.titulo}</h3>}
                <Rail estado={savedBook.estado} confirmation={savedMotion ? `${savedBook.id}:${savedBook.revision}` : undefined} />
                <div>
                  {savedBook.titulo.length <= 80 && <h3>{savedBook.titulo}</h3>}
                  <p className="book-author">{savedBook.autor}</p>
                  <Rating value={savedBook.valoracion} />
                </div>
              </div>
              </div>
              <div className="saved-book-outcome">
              <div className={`saved-book-feedback ${reconciledLater ? "recovered-feedback" : ""}`} role="status">
                {reconciledLater ? <RotateCcw size={18} /> : <Check size={18} />}
                {reconciledLater ? "Datos actuales recuperados" : "Libro guardado"}
              </div>
              <div className="dialog-actions">
                <Button variant="outline" onClick={() => {
                  setSavedBook(null);
                  setConfirmedNew(null);
                  setErrors({});
                  setReconciledLater(false);
                  requestAnimationFrame(() => titleRef.current?.focus());
                }}>Seguir editando</Button>
                <Button data-close-saved onClick={onClose}>Volver a la colección</Button>
              </div>
              </div>
            </div>
          ) : <>
          <form
            className={actual ? "has-conflict" : undefined}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div ref={bodyRef} className={`editor-body ${comparisonOpen ? "comparison-hidden" : ""}`} style={recovering ? undefined : { height: "auto" }}
              onFocusCapture={(event) => {
                const field = (event.target as HTMLElement).closest<HTMLElement>(".form-field");
                if (!field) return;
                if (recovering) setReviewingDraft(true);
                requestAnimationFrame(() => revealField(bodyRef.current, field));
              }}>
            {!recovering && <Dialog.Description className="dialog-description" data-book-context={base.current?.id}>
              {base.current
                ? `Estás editando «${base.current.titulo}».`
                : "Anota un título y encuentra su lugar en tu cuaderno."}
            </Dialog.Description>}
            {Object.keys(errors).length > 0 && (
              <div ref={validationRef} id="validation-summary" className="validation-summary" role="alert" tabIndex={-1}>
                <p>
                  <AlertTriangle size={18} />
                  Revisa los campos indicados
                </p>
                <ul>
                  {Object.entries(errors).map(([key, value]) => (
                    <li key={key}>
                      <a
                        href={"#field-" + key}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById("field-" + key)?.focus();
                        }}
                      >
                        {value}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="form-field">
              <label htmlFor="field-titulo">Título</label>
              <textarea
                ref={titleRef}
                id="field-titulo"
                value={draft.titulo}
                onChange={(e) => change("titulo", e.target.value)}
                aria-invalid={!!errors.titulo}
                aria-describedby={errors.titulo ? "error-titulo" : "title-help"}
                autoComplete="off"
                rows={1}
              />
              {!errors.titulo && (
                <span id="title-help" className="field-help">
                  Entre 1 y 200 caracteres.
                </span>
              )}
              {errors.titulo && (
                <p className="field-error" id="error-titulo">
                  {errors.titulo}
                </p>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="field-autor_id">Autor</label>
              <select
                id="field-autor_id"
                value={draft.autor_id}
                onChange={(e) => change("autor_id", e.target.value)}
                aria-invalid={!!errors.autor_id}
                aria-describedby={
                  errors.autor_id ? "error-autor_id" : undefined
                }
                disabled={!authors.length}
              >
                <option value="">
                  {authors.length
                    ? "Selecciona un autor"
                    : authorError
                      ? "Autores no disponibles"
                      : "Cargando autores…"}
                </option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              {errors.autor_id && (
                <p className="field-error" id="error-autor_id">
                  {errors.autor_id}
                </p>
              )}
              {authorError && (
                <div role="alert" className="field-error">
                  <p>{authorError}</p>
                  <Button type="button" variant="outline" onClick={loadAuthors}>
                    Reintentar autores
                  </Button>
                </div>
              )}
            </div>
            <div className="form-pair">
              <div className="form-field">
                <label htmlFor="field-estado">Estado</label>
                <select
                  id="field-estado"
                  value={draft.estado}
                  onChange={(e) => change("estado", e.target.value)}
                  aria-invalid={!!errors.estado}
                  aria-describedby={errors.estado ? "error-estado" : undefined}
                >
                  {estados.map((s) => (
                    <option key={s} value={s}>
                      {labelEstado[s]}
                    </option>
                  ))}
                </select>
                {errors.estado && (
                  <p className="field-error" id="error-estado">
                    {errors.estado}
                  </p>
                )}
              </div>
              <div className="form-field">
                <label htmlFor="field-valoracion">
                  Valoración{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </label>
                <select
                  id="field-valoracion"
                  value={draft.valoracion ?? ""}
                  onChange={(e) =>
                    change(
                      "valoracion",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  aria-invalid={!!errors.valoracion}
                  aria-describedby={
                    errors.valoracion ? "error-valoracion" : undefined
                  }
                >
                  <option value="">Sin valorar</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} de 5
                    </option>
                  ))}
                </select>
                {errors.valoracion && (
                  <p className="field-error" id="error-valoracion">
                    {errors.valoracion}
                  </p>
                )}
              </div>
            </div>
            <div ref={feedbackRef} className={`editor-feedback ${message || actual || uncertain || previous ? "has-response" : ""}`} tabIndex={-1}>
              {message && !uncertain && (
                <div className="notice warning" role="alert">
                  <AlertTriangle size={20} />
                  <p>{message}</p>
                </div>
              )}
              {actual && (
                <div className="conflict-panel" role="alert">
                  <h3>Este libro ha cambiado</h3>
                  <p>Tu borrador se conserva.</p>
                  <Comparison
                    label="Tu borrador"
                    value={draft}
                    authors={authors}
                    fields={changedFields}
                    compareTitle={actual.titulo}
                    titleVersions={[draft.titulo, base.current?.titulo || "", actual.titulo]}
                  />
                  {base.current && (
                    <Comparison
                      label="Último confirmado"
                      value={base.current}
                      authors={authors}
                      fields={changedFields}
                      compareTitle={actual.titulo}
                      titleVersions={[draft.titulo, base.current.titulo, actual.titulo]}
                    />
                  )}
                  <Comparison
                    label="Ahora en tu biblioteca"
                    value={actual}
                    authors={authors}
                    fields={changedFields}
                    compareTitle={draft.titulo}
                    titleVersions={[draft.titulo, base.current?.titulo || "", actual.titulo]}
                  />
                </div>
              )}
              {uncertain && operation && (
                <div className="recovery-panel">
                  <p className="recovery-explanation" role="alert">
                    <AlertTriangle size={20} />
                    <span>{message || "No podemos confirmar el cambio. Recupera el intento para conocer su resultado."}</span>
                  </p>
                  {submittedDraft && <div className="submitted-preview">
                    <h4>Envío original sin confirmar</h4>
                    <p>{submittedDraft.titulo}</p>
                    <p>Estado solicitado: {labelEstado[submittedDraft.estado]}</p>
                  </div>}
                  <div id="submitted-values" className="submitted-values" hidden={!submittedOpen}>
                    <dl>
                      <div><dt>Autor enviado</dt><dd>{authors.find((author) => author.id === submittedDraft?.autor_id)?.nombre || "Sin autor"}</dd></div>
                      <div><dt>Valoración enviada</dt><dd>{submittedDraft?.valoracion == null ? "Sin valorar" : `${submittedDraft.valoracion} de 5`}</dd></div>
                    </dl>
                  </div>
                </div>
              )}
              {previous && (
                <div className="recovery-panel">
                  <p>
                    Intento anterior pendiente de recuperar. El nuevo borrador se
                    conserva.
                  </p>
                </div>
              )}
              {missing && <button type="button" className="text-link draft-return deleted-draft-return" onClick={() => {
                setReviewingDraft(true);
                requestAnimationFrame(() => titleRef.current?.focus());
              }}>Revisar borrador</button>}
            </div>
            </div>
              {actual && comparisonOpen && currentVersionBelow
                ? <a href="#current-comparison-version" className="scroll-cue comparison-cue current-version-link" onClick={(event) => {
                    event.preventDefault();
                    const source = comparisonBodyRef.current?.querySelector<HTMLElement>("#current-comparison-version");
                    source?.scrollIntoView({ block: "start", behavior: "instant" });
                    source?.focus({ preventScroll: true });
                  }}><ArrowDown size={15} />Más abajo: versión actual</a>
                : actual && moreBelow && <p className="scroll-cue comparison-cue"><ArrowDown size={15} />Más abajo: continúa la comparación.</p>}
            {actual && <details ref={comparisonRef} className="comparison-details"
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setComparisonOpen(open);
                if (!open && !reviewingDraft) requestAnimationFrame(() => {
                  if (bodyRef.current && feedbackRef.current && !bodyRef.current.contains(document.activeElement))
                    bodyRef.current.scrollTop = feedbackRef.current.offsetTop;
                });
              }}>
              <summary role="button" className="comparison-shortcut"
                aria-expanded={comparisonOpen} aria-controls="complete-comparison"
                aria-label={comparisonOpen ? "Ocultar comparación completa" : "Ver comparación completa"}>
                <span className="comparison-disclosure">
                  <span>{comparisonOpen ? "Ocultar" : "Ver comparación completa"}</span>{" "}
                  <span className="difference-count">{!comparisonOpen && changedFields.length > 0 && `${changedFields.map((key) => fieldNames[key]).join(", ")} · `}{differenceCount} {differenceCount === 1 ? "diferencia" : "diferencias"}</span>
                </span>
                <ChevronDown size={14} aria-hidden="true" className={comparisonOpen ? "rotate-180" : undefined} />
              </summary>
              <div ref={comparisonBodyRef} id="complete-comparison" className="full-comparison-body" role="region" aria-label="Comparación completa de las tres versiones" tabIndex={0}>
                <Comparison label="Tu borrador" value={draft} authors={authors} complete fields={changedFields} compareTitle={actual.titulo} titleVersions={[draft.titulo, base.current?.titulo || "", actual.titulo]} />
                {base.current && <Comparison label="Última versión confirmada" value={base.current} authors={authors} complete fields={changedFields} compareTitle={actual.titulo} titleVersions={[draft.titulo, base.current.titulo, actual.titulo]} />}
                <Comparison id="current-comparison-version" label="Versión actual en tu biblioteca" value={actual} authors={authors} complete fields={changedFields} compareTitle={draft.titulo} titleVersions={[draft.titulo, base.current?.titulo || "", actual.titulo]} />
              </div>
            </details>}
            {actual && <button type="button" className="text-link draft-return conflict-inspection-action" onClick={() => {
              if (comparisonRef.current) comparisonRef.current.open = false;
              setComparisonOpen(false);
              setReviewingDraft(true);
              requestAnimationFrame(() => titleRef.current?.focus());
            }}>
              Revisar borrador
            </button>}
            <div className={`editor-footer ${recovering ? "recovery-actions" : ""}`}>
              {uncertain && operation && <button
                type="button"
                className="text-link submitted-toggle"
                aria-expanded={submittedOpen}
                aria-controls="submitted-values"
                onClick={() => {
                  setSubmittedOpen(!submittedOpen);
                  setReviewingDraft(false);
                  requestAnimationFrame(() => {
                    const values = bodyRef.current?.querySelector<HTMLElement>(".submitted-preview");
                    if (!submittedOpen && values) values.scrollIntoView({ block: "start", behavior: "instant" });
                  });
                }}
              >
                {submittedOpen ? "Ocultar datos adicionales" : "Ver todos los datos enviados"}
                <ChevronDown size={16} aria-hidden="true" className={submittedOpen ? "rotate-180" : undefined} />
              </button>}
              {!recovering && moreBelow && <p className="scroll-cue field-continuation"><ArrowDown size={15} />Más campos abajo.</p>}
              {recovering && moreBelow && !actual && <p className="scroll-cue recovery-cue"><ArrowDown size={15} />{reviewingDraft ? "Más abajo: campos y resultado del intento." : "Más abajo: continúa la explicación."}</p>}
              {actual && <div className="conflict-actions">
                  <div className="conflict-commit" role="group" aria-label="Resolver diferencias">
                    <Button type="button" variant="outline" className="whitespace-normal" onClick={() => {
                      base.current = actual;
                      setDraft(actual);
                      setActual(null);
                      setErrors({});
                      setMessage("");
                      setComparisonOpen(false);
                      requestAnimationFrame(() => {
                        panelRef.current?.scrollTo({ top: 0, behavior: "instant" });
                        bodyRef.current?.scrollTo({ top: 0, behavior: "instant" });
                        titleRef.current?.focus();
                      });
                    }}>Cargar datos actuales</Button>
                    <Button
                      type="button"
                      className="whitespace-normal"
                      onClick={() => submit(true)}
                      disabled={busy}
                    >
                      Sobrescribir con mi borrador
                    </Button>
                  </div>
                  <button type="button" className="text-link conflict-cancel" onClick={close} disabled={busy}>
                    Cancelar
                  </button>
                  </div>}
              {uncertain && operation && (
                <div className="uncertain-actions">
                  <Button
                    type="button"
                    onClick={() => send(operation)}
                    disabled={busy}
                  >
                    <RotateCcw size={16} />
                    Recuperar cambio
                  </Button>
                  {!previous && (
                    <button
                      type="button"
                      className="text-link"
                      aria-describedby="new-attempt-consequence"
                      onClick={() => {
                        setPrevious(operation);
                        setUncertain(false);
                        setOperation(null);
                        setMessage(
                          "Has iniciado otro cambio. Esto no cancela el intento anterior; puedes recuperarlo aquí.",
                        );
                      }}
                    >
                      Iniciar otro cambio
                    </button>
                  )}
                  {!previous && <p id="new-attempt-consequence" className="new-attempt-consequence">
                    El intento original puede haberse guardado. Iniciar otro cambio no lo cancela.
                  </p>}
                </div>
              )}
              {previous && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => send(previous, true)}
                  >
                    Recuperar intento anterior
                  </Button>
                </div>
              )}
            {recovering && !actual && !missing && <div className="draft-review-actions">
              <button type="button" className="text-link draft-return" onClick={() => {
                setReviewingDraft(true);
                requestAnimationFrame(() => titleRef.current?.focus());
              }}>Revisar borrador</button>
              {uncertain && reviewingDraft && <Button type="submit" disabled>{base.current ? "Guardar cambios" : "Guardar libro"}</Button>}
            </div>}
            {uncertain && reviewingDraft && <p className="unresolved-draft">Recupera el intento original antes de guardar este borrador.</p>}
            {missing ? <div className="dialog-actions deleted-actions"><Button type="button" onClick={onClose}>Volver a la colección</Button></div> : !actual && !uncertain && <div className={`dialog-actions ${Object.keys(errors).length ? "with-validation" : ""}`}>
              {!recovering && Object.keys(errors).length > 0 && (
                <div className="validation-recovery">
                  <span>{Object.keys(errors).length} {Object.keys(errors).length === 1 ? "campo por revisar" : "campos por revisar"}</span>
                  {summaryHidden && <a href="#validation-summary" className="text-link" onClick={(event) => {
                    event.preventDefault();
                    validationRef.current?.focus({ preventScroll: true });
                    validationRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
                  }}>Ver errores</a>}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={busy || uncertain || !!previous}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  uncertain ||
                  !!actual ||
                  !!confirmedNew ||
                  !authors.length
                }
              >
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" size={17} />
                    Guardando…
                  </>
                ) : (
                  base.current ? "Guardar cambios" : "Guardar libro"
                )}
              </Button>
            </div>}
            </div>
          </form>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <AlertDialog.Root open={discard} onOpenChange={setDiscard}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="delete-dialog" onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (discardReturnFocus.current?.isConnected) discardReturnFocus.current.focus();
        }} onEscapeKeyDown={(event) => {
          event.preventDefault();
          setDiscard(false);
        }}>
          <AlertDialog.Title>¿Descartar los cambios?</AlertDialog.Title>
          <AlertDialog.Description className="dialog-description delete-body">
            Tu borrador aún no se ha guardado. Puedes seguir editándolo o descartarlo.
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild><Button variant="outline">Seguir editando</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><Button onClick={onClose}>Descartar cambios</Button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    </>
  );
}
// Count separate changed regions against the confirmed title. Adjacent edits
// form one difference; edits separated by unchanged words remain distinct.
function titleDifferenceCount(versions: string[]) {
  const [reference, ...others] = versions;
  const words = reference.match(/\S+/g) || [];
  const regions: [number, number][] = [];
  for (const version of others) {
    const next = version.match(/\S+/g) || [];
    const common = Array.from({ length: words.length + 1 }, () =>
      Array<number>(next.length + 1).fill(0));
    for (let i = words.length - 1; i >= 0; i--)
      for (let j = next.length - 1; j >= 0; j--)
        common[i][j] = words[i] === next[j]
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1]);
    let i = 0, j = 0, start: number | null = null;
    while (i < words.length || j < next.length) {
      if (i < words.length && j < next.length && words[i] === next[j]) {
        if (start !== null) regions.push([start, i]);
        start = null;
        i++; j++;
      } else {
        start ??= i;
        if (i < words.length && (j === next.length || common[i + 1][j] > common[i][j + 1])) i++;
        else j++;
      }
    }
    if (start !== null) regions.push([start, i]);
  }
  regions.sort((a, b) => a[0] - b[0]);
  let count = 0, end = -1;
  for (const [start, finish] of regions) {
    if (start > end) count++;
    end = Math.max(end, finish);
  }
  return count || (versions.some((title) => title !== reference) ? 1 : 0);
}
function Comparison({
  id,
  label,
  value,
  authors,
  fields,
  compareTitle,
  titleVersions,
  complete = false,
}: {
  id?: string;
  label: string;
  value: Borrador;
  authors: Autor[];
  fields?: (keyof Borrador)[];
  compareTitle?: string;
  titleVersions?: string[];
  complete?: boolean;
}) {
  const values: Record<keyof Borrador, string> = {
    titulo: value.titulo || "Sin título",
    autor_id: authors.find((a) => a.id === value.autor_id)?.nombre || "Sin autor",
    estado: labelEstado[value.estado],
    valoracion: value.valoracion === null ? "Sin valorar" : `${value.valoracion} de 5`,
  };
  return (
    <div className="comparison" id={id} tabIndex={id ? -1 : undefined}>
      <h4>{label}</h4>
      {fields && !complete ? (
        fields.length
          ? fields.map((key) => (
              <p key={key}>
                {key === "titulo" && compareTitle !== undefined
                  ? <TitleDifference value={values[key]} other={compareTitle} versions={titleVersions} />
                  : <mark>{values[key]}</mark>}
              </p>
            ))
          : <p>Los campos coinciden; ha cambiado la revisión.</p>
      ) : <>
        <p className="comparison-title">{fields?.includes("titulo") && compareTitle !== undefined
          ? <TitleDifference value={values.titulo} other={compareTitle} versions={titleVersions} complete />
          : values.titulo}</p>
        <p>{(["autor_id", "estado", "valoracion"] as const).map((key, index) => (
          <span key={key}>{index > 0 && " · "}{fields?.includes(key) ? <mark>{values[key]}</mark> : values[key]}</span>
        ))}</p>
      </>}
    </div>
  );
}
function TitleDifference({ value, other, versions, complete = false }: { value: string; other: string; versions?: string[]; complete?: boolean }) {
  if (versions && (complete || Math.max(...versions.map((title) => title.length)) > 80)) {
    const parts = value.match(/\s+|\S+/g) || [];
    const words = parts.filter((part) => /\S/.test(part));
    const changed = new Set<number>();
    for (const source of versions.filter((title) => title !== value)) {
      const otherWords = source.match(/\S+/g) || [];
      // Align words, including repeated phrases, so edits at both ends do not
      // turn all the unchanged text between them into one large highlight.
      const common = Array.from({ length: words.length + 1 }, () =>
        Array<number>(otherWords.length + 1).fill(0),
      );
      for (let i = words.length - 1; i >= 0; i--)
        for (let j = otherWords.length - 1; j >= 0; j--)
          common[i][j] = words[i] === otherWords[j]
            ? common[i + 1][j + 1] + 1
            : Math.max(common[i + 1][j], common[i][j + 1]);
      const matched = new Set<number>();
      let i = 0, j = 0;
      while (i < words.length && j < otherWords.length) {
        if (words[i] === otherWords[j]) {
          matched.add(i);
          i++; j++;
        } else if (common[i + 1][j] > common[i][j + 1]) i++;
        else j++;
      }
      words.forEach((_, index) => { if (!matched.has(index)) changed.add(index); });
    }
    let wordIndex = -1;
    const flags = parts.map((part) => /\S/.test(part) ? changed.has(++wordIndex) : false);
    const runs: { text: string; changed: boolean }[] = [];
    parts.forEach((part, index) => {
      const highlight = flags[index] || (!/\S/.test(part) && !!flags[index - 1] && !!flags[index + 1]);
      if (runs.length && runs[runs.length - 1].changed === highlight)
        runs[runs.length - 1].text += part;
      else runs.push({ text: part, changed: highlight });
    });
    // Omit only unchanged words in the compact view; retain every changed run.
    if (!complete) return <>
      <span aria-hidden="true">
        {changed.size ? runs.map((run, index) => run.changed
          ? <mark key={index}>{run.text}</mark>
          : <span key={index}> … </span>)
          : <mark>(sin texto)</mark>}
      </span>
      <span className="sr-only">{value}</span>
    </>;
    return <>{runs.map((run, index) => run.changed
      ? <mark key={index}>{run.text}</mark>
      : <span key={index}>{run.text}</span>)}</>;
  }
  let start = 0;
  while (start < Math.min(value.length, other.length) && value[start] === other[start]) start++;
  let end = value.length;
  let otherEnd = other.length;
  while (end > start && otherEnd > start && value[end - 1] === other[otherEnd - 1]) {
    end--;
    otherEnd--;
  }
  if (start === end) return <>{value}</>;
  return <>{value.slice(0, start)}<mark>{value.slice(start, end)}</mark>{value.slice(end)}</>;
}
export function DeleteDialog({
  book,
  onClose,
  onDeleted,
}: {
  book: Libro;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [closeWarning, setCloseWarning] = useState(false),
    [deferred, setDeferred] = useState(false),
    [actual, setActual] = useState<Libro | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(
    typeof document !== "undefined"
      ? (document.activeElement as HTMLElement)
      : null,
  );
  const op = useRef({
    id: book.id,
    revision: book.revision,
    clave: crypto.randomUUID(),
  });
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, uncertain]);
  function attemptClose() {
    if (busy || uncertain) {
      setCloseWarning(true);
      requestAnimationFrame(() => retryRef.current?.focus());
    } else onClose();
  }
  async function remove(overwrite = false) {
    if (busy) return;
    if (overwrite && actual && !uncertain)
      op.current = {
        id: book.id,
        revision: actual.revision,
        clave: crypto.randomUUID(),
      };
    setBusy(true);
    setMessage("");
    try {
      await request("/api/libros/eliminar", op.current);
      onDeleted();
    } catch (e) {
      if (e instanceof RequestError && e.status < 500) {
        setMessage(e.message);
        if (e.actual) setActual(e.actual);
        setUncertain(false);
      } else {
        setMessage(
          "No podemos confirmar el cambio. Recupera el intento para saber si se eliminó el libro.",
        );
        setUncertain(true);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
    {deferred && <div className="notice warning pending-deletion" role="status">
      <AlertTriangle size={20} />
      <div>
        <p>Eliminación pendiente de confirmar: «{book.titulo}».</p>
        <p className="text-sm mt-1">El intento se conserva mientras permanezcas en esta colección. Retómalo para conocer el resultado.</p>
        <Button ref={resumeRef} variant="outline" className="mt-3" onClick={() => {
          setCloseWarning(false);
          setDeferred(false);
        }}>Retomar eliminación</Button>
      </div>
    </div>}
    <AlertDialog.Root
      open={!deferred}
      onOpenChange={(o) => {
        if (!o) attemptClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content
          onOpenAutoFocus={(e) => {
            if (uncertain) {
              e.preventDefault();
              retryRef.current?.focus();
            }
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (deferred) resumeRef.current?.focus();
            else returnFocus.current?.focus();
          }}
          className="delete-dialog"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            attemptClose();
          }}
        >
          <div className="dialog-heading">
            <div>
              <span className="dialog-kicker editor-state deletion-state">
                <span className="context-tab" aria-hidden="true" />
                {labelEstado[(actual || book).estado]}
              </span>
              <AlertDialog.Title>Eliminar libro</AlertDialog.Title>
            </div>
            <button type="button" className="icon-button" aria-label="Cerrar diálogo" disabled={busy} onClick={attemptClose}>
              <X size={21} />
            </button>
          </div>
          <div className="delete-body">
          <AlertDialog.Description>
            {uncertain
              ? `Última versión conocida: «${(actual || book).titulo}». La eliminación está pendiente de confirmar.`
              : `¿Eliminar «${book.titulo}» de tu colección? Esta lectura dejará de aparecer en tu cuaderno.`}
          </AlertDialog.Description>
          {message && (
            <div className="notice warning" role="alert">
              <AlertTriangle size={20} />
              <p>{message}</p>
            </div>
          )}
          {actual && !uncertain && (
            <div className="conflict-panel">
              <p>
                Último confirmado: {book.titulo} · {labelEstado[book.estado]} ·{" "}
                {book.valoracion ?? "Sin valorar"}
              </p>
              <p>
                Ahora: {actual.titulo} · {actual.autor} ·{" "}
                {labelEstado[actual.estado]} ·{" "}
                {actual.valoracion ?? "Sin valorar"}
              </p>
              <p>
                Tu intención: eliminar este libro. Confirma de nuevo con estos
                datos.
              </p>
            </div>
          )}
          {actual && uncertain && (
            <details className="comparison-details deletion-history">
              <summary>Ver la comparación anterior</summary>
              <p>Antes del conflicto: {book.titulo} · {labelEstado[book.estado]}</p>
              <p>Última versión conocida: {actual.titulo} · {actual.autor} · {labelEstado[actual.estado]} · {actual.valoracion ?? "Sin valorar"}</p>
            </details>
          )}
          </div>
          <div className={`delete-footer ${uncertain || closeWarning ? "deletion-exit" : ""}`}>
          {(uncertain || closeWarning) && <p id="deletion-exit-explanation" role={closeWarning ? "alert" : undefined}>
            {busy
              ? "La eliminación sigue en curso. Espera a conocer el resultado antes de salir."
              : "Volver a la colección no cancela la eliminación. Conservamos el intento para que puedas retomarlo."}
          </p>}
          <div className={`dialog-actions ${uncertain ? "uncertain-delete-actions" : ""}`}>
            {!uncertain && <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={busy}>
                Cancelar
              </Button>
            </AlertDialog.Cancel>}
            {uncertain && <Button variant="outline" disabled={busy} aria-describedby="deletion-exit-explanation" onClick={() => setDeferred(true)}>
              Volver a la colección
            </Button>}
            <Button ref={retryRef} onClick={() => remove(!!actual)} disabled={busy}>
              {busy
                ? "Eliminando…"
                : uncertain
                  ? "Recuperar cambio"
                  : actual
                    ? "Eliminar versión actual"
                    : "Eliminar libro"}
            </Button>
          </div>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    </>
  );
}
