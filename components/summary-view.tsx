"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Plus, Star } from "lucide-react";
import {
  ensureSession,
  request,
  RequestError,
  resetSession,
} from "@/lib/client";
import type { Resumen } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Failure, Rail, Rating, Skeleton } from "@/components/library-shared";
import { TextLink } from "@/components/shell";
export function SummaryView() {
  const [data, setData] = useState<Resumen | null>(null),
    [error, setError] = useState<RequestError | null>(null),
    [loading, setLoading] = useState(true);
  function load() {
    return ensureSession()
      .then(() => request<Resumen>("/api/resumen"))
      .then((summary) => {
        setData(summary);
        setError(null);
      })
      .catch((e: RequestError) => setError(e))
      .finally(() => setLoading(false));
  }
  function retry() {
    setLoading(true);
    resetSession().then(load).catch((e) => {
      setError(e);
      setLoading(false);
    });
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        setLoading(true);
        load();
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  return (
    <main id="contenido" className={`page summary-page ${data?.total === 0 ? "summary-empty" : ""}`}>
      <div className="page-heading">
        <div>
          <h1>Tu cuaderno{" "}<span className="summary-title-break">de lecturas</span></h1>
          <div className="summary-intro">
            <p>Un lugar para volver a tus libros.</p>
            <Button asChild className="summary-add">
              <Link href="/libros?nuevo=1">
                <Plus size={17} />
                Añadir libro
              </Link>
            </Button>
          </div>
        </div>
      </div>
      {error && !data && (
        <Failure
          error={error.message}
          session={error.status === 401}
          retry={retry}
        />
      )}
      {!data ? (
        loading ? <>
          <div className="metric-loading" aria-label="Cargando resumen" />
          <Skeleton />
        </> : null
      ) : (
        <>
          <section
            className={`metrics ${error ? "has-refresh-warning" : ""}`}
            aria-label="Resumen de lecturas"
            aria-busy={loading}
          >
            {[
              { n: data.total, label: "En tu colección", href: "/libros" },
              {
                n: data.pendientes,
                label: "Pendientes",
                href: "/libros?estado=pendiente",
              },
              {
                n: data.leyendo,
                label: "Leyendo",
                href: "/libros?estado=leyendo",
              },
            { n: data.leidos, label: "Leídos", href: "/libros?estado=le%C3%ADdo" },
            ].map((m) => (
              <Link href={m.href} key={m.label} className="metric">
                <span>{m.n}</span>
                <span>{m.label}</span>
              </Link>
            ))}
            <div className="metric average">
              <span>
                {data.media === null
                  ? "—"
                  : data.media.toLocaleString("es", {
                      maximumFractionDigits: 1,
                    })}
                {data.media !== null && <StarSmall />}
              </span>
              <span>
                {data.media === null ? "Sin valoraciones" : "Valoración media"}
              </span>
            </div>
          </section>
          {error && <Failure
            error={error.message}
            session={error.status === 401}
            retained
            compact
            retry={retry}
          />}
          <div className="reading-layout">
          <section className="active-section">
            <div className="section-heading">
              <div>
                <h2>Entre tus páginas</h2>
                {data.total > 0 && <p>Las historias que tienes entre manos.</p>}
              </div>
              {data.total > 0 && <TextLink href="/libros?estado=leyendo">Ver lecturas</TextLink>}
            </div>
            {data.lecturas.length ? (
              <div className="active-readings">
                {data.lecturas.map((b) => (
                  <article
                    key={b.id}
                    className="active-reading"
                    data-book-id={b.id}
                  >
                    <Rail estado={b.estado} />
                    <div className="active-copy">
                      <h3>{b.titulo}</h3>
                      <p>{b.autor}</p>
                      <Rating value={b.valoracion} />
                    </div>
                    <div className="summary-book-actions">
                      <Link className="summary-edit" data-edit-book href={`/libros?editar=${b.id}`}>
                        <Pencil size={15} /> Editar
                      </Link>
                      <Link href={`/libros?libro=${b.id}`} className="text-link summary-book-link">
                        Ver libro <ArrowRight size={16} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-margin">{data.total ? "En pausa" : "Biblioteca vacía"}</span>
                <div className="empty-copy">
                <h3>
                  {data.total
                    ? "Una pausa entre lecturas"
                    : "Tu cuaderno empieza aquí"}
                </h3>
                <p>
                  {data.total
                    ? "No tienes ninguna lectura en curso. Puedes volver a tus pendientes cuando quieras."
                    : "Todavía no tienes libros. Añade el primero para empezar tu cuaderno."}
                </p>
                <Button asChild variant="outline">
                  <Link
                    href={
                      data.total
                        ? "/libros?estado=pendiente"
                        : "/libros?nuevo=1"
                    }
                  >
                    {data.total ? "Ver pendientes" : "Añadir libro"}
                    <ArrowRight size={16} />
                  </Link>
                </Button>
                </div>
              </div>
            )}
          </section>
          {data.total > 0 && <section className="finished-section">
            <div className="section-heading">
              <div>
                <h2>Lecturas terminadas</h2>
                <p>Lo que ya forma parte de tu cuaderno.</p>
              </div>
            </div>
            {data.terminados.length ? (
              <div className="finished-list">
                {data.terminados.map((b) => (
                  <article
                    key={b.id}
                    className="finished-row"
                    data-book-id={b.id}
                  >
                    <div>
                      <h3>{b.titulo}</h3>
                      <p>{b.autor}</p>
                    </div>
                    <Rating value={b.valoracion} />
                    <div className="finished-actions">
                      <Link className="summary-edit" data-edit-book href={`/libros?editar=${b.id}`}>
                        <Pencil size={15} /> Editar
                      </Link>
                      <Link className="finished-action text-link" href={`/libros?libro=${b.id}`}>
                        Ver libro <ArrowRight size={16} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="quiet-empty">
                Tus lecturas terminadas aparecerán aquí.
              </p>
            )}
            <div className="finished-all">
                  <TextLink href="/libros?estado=le%C3%ADdo">Ver leídos</TextLink>
            </div>
          </section>}
          </div>
        </>
      )}
    </main>
  );
}
function StarSmall() {
  return <Star className="average-star" size={18} aria-hidden="true" />;
}
