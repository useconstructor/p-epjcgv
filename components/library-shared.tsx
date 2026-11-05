"use client";
import { useEffect, useRef } from "react";
import { AlertTriangle, RotateCcw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelEstado } from "@/lib/branding";
import { estados, type Estado } from "@/lib/types";
export function Rating({ value }: { value: number | null }) {
  return (
    <span
      className="rating"
      aria-label={value ? `Valoración: ${value} de 5` : "Sin valorar"}
    >
      <span>{value ? `${value} de 5` : "Sin valorar"}</span>
    </span>
  );
}
export function Rail({
  estado,
  busy = false,
  confirmation,
}: {
  estado: Estado;
  busy?: boolean;
  confirmation?: string;
}) {
  const tab = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!confirmation || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = tab.current?.animate(
      [{ translate: "0 0" }, { translate: "6px 0", offset: 0.5 }, { translate: "0 0" }],
      { duration: 180, easing: "ease-in-out" },
    );
    return () => animation?.cancel();
  }, [confirmation]);
  return (
    <div
      className="reading-rail"
      aria-label={`Estado confirmado: ${labelEstado[estado]}`}
    >
      <div className="rail-line" />
      <span
        ref={tab}
        data-reading-tab
        className={`reading-tab ${busy ? "is-pending" : ""}`}
        style={{ transform: `translateY(${estados.indexOf(estado) * 36}px)` }}
        aria-hidden="true"
      />
      {estados.map((s) => (
        <span
          key={s}
          className={`rail-label ${estado === s ? "selected" : ""}`}
          data-label={labelEstado[s]}
        >
          <span>{labelEstado[s]}</span>
        </span>
      ))}
    </div>
  );
}
export function Failure({
  error,
  retry,
  session = false,
  retained = false,
  compact = false,
}: {
  error: string;
  retry: () => void;
  session?: boolean;
  retained?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`notice warning reading-failure ${compact ? "summary-refresh" : ""}`} role="alert">
      <AlertTriangle size={20} />
      <div className="failure-content">
        <div className="failure-copy">
        <p>{error}</p>
        {retained && (
          <p className="text-sm mt-1">
            Conservamos la última lectura confirmada; todavía no se ha
            actualizado.
          </p>
        )}
        </div>
        <div className="failure-actions">
          <Button variant="outline" onClick={retry}>
            <RotateCcw size={16} />
            Reintentar
          </Button>
          {session && (
            <a
              className="text-link"
              href={
                typeof window !== "undefined"
                  ? window.location.origin + "/libros"
                  : "/libros"
              }
              target="_blank"
              rel="noopener"
            >
              Abrir fuera del marco
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
export function Skeleton() {
  return (
    <div aria-label="Cargando libros" role="status" className="skeleton-grid">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-rail" aria-hidden="true"><span /><span /><span /></div>
          <div className="skeleton-copy" aria-hidden="true"><span /><span /><span /></div>
          <div className="skeleton-controls" aria-hidden="true"><span /><i /><i /></div>
        </div>
      ))}
    </div>
  );
}
