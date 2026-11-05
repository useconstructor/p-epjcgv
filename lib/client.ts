"use client";
import type { Libro } from "./types";
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public errors?: Record<string, string>,
    public actual?: Libro | null,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new RequestError(
      data.error || "No podemos confirmar el cambio.",
      response.status,
      data.code,
      data.errors,
      data.actual,
    );
  return data;
}
let opening: Promise<void> | undefined;
function initializeWithSharedWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof SharedWorker === "undefined") {
      reject(new RequestError(
        "Este navegador no permite coordinar la apertura entre pestañas. Abre la aplicación en un navegador actualizado y vuelve a intentarlo.",
        401,
        "SESION",
      ));
      return;
    }
    const worker = new SharedWorker(new URL("./session-worker.ts", import.meta.url), {
      name: "biblioteca-lino-inicio",
    });
    const finish = (error?: RequestError) => {
      clearTimeout(timeout);
      worker.port.close();
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => finish(new RequestError(
      "No podemos abrir tu biblioteca ahora. Vuelve a intentarlo.",
      503,
      "SESION",
    )), 50000);
    worker.onerror = () => finish(new RequestError(
      "No podemos abrir tu biblioteca ahora. Vuelve a intentarlo.",
      503,
      "SESION",
    ));
    worker.port.onmessage = ({ data }) => finish(data.ok
      ? undefined
      : new RequestError(data.message, data.status, data.code));
    worker.port.start();
    worker.port.postMessage("initialize");
  });
}
export function ensureSession() {
  return (opening ||= (async () => {
    const initialize = async () => {
      try {
        await request("/api/autores");
        return;
      } catch (e) {
        if (!(e instanceof RequestError) || e.status !== 401) throw e;
      }
      await request("/api/sesion", {});
      try {
        await request("/api/autores");
      } catch {
        throw new RequestError(
          "El navegador no permite mantener tu biblioteca en este contexto. Permite las cookies o abre la aplicación fuera del marco.",
          401,
          "COOKIES",
        );
      }
    };
    if (navigator.locks)
      await navigator.locks.request("biblioteca-lino-inicio", initialize);
    else {
      try {
        await request("/api/autores");
      } catch (error) {
        if (!(error instanceof RequestError) || error.status !== 401) throw error;
        await initializeWithSharedWorker();
      }
    }
  })().catch((e) => {
    opening = undefined;
    throw e;
  }));
}
export function resetSession() {
  opening = undefined;
  return ensureSession();
}
declare global {
  interface Window {
    constructorTrack?: (event: string) => void;
  }
}
export async function trackConfirmed(
  key: string,
  event: "libro_creado" | "estado_libro_cambiado",
) {
  if (navigator.doNotTrack === "1" || !window.constructorTrack) return;
  const emit = () => {
    try {
      const storage = "lino_event_" + key;
      if (localStorage.getItem(storage)) return;
      localStorage.setItem(storage, "1");
      window.constructorTrack?.(event);
    } catch {
      /* Analytics is optional when browser storage is unavailable. */
    }
  };
  if (navigator.locks) await navigator.locks.request("lino_analytics", emit);
  else emit();
}
