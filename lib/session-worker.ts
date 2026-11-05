// A SharedWorker provides one initialization queue across same-origin views
// when Web Locks are unavailable. Cookie authority stays with the server.
export {};

type Failure = { message: string; status: number; code: string };
let queue: Promise<void> = Promise.resolve();

async function readSession() {
  return fetch("/api/autores", {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}

async function failure(response: Response): Promise<Failure> {
  const data = await response.json();
  return {
    message: data.error || "No podemos abrir tu biblioteca. Vuelve a intentarlo.",
    status: response.status,
    code: data.code || "SESION",
  };
}

async function initialize() {
  const existing = await readSession();
  if (existing.ok) return;
  if (existing.status !== 401) throw await failure(existing);
  const created = await fetch("/api/sesion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!created.ok) throw await failure(created);
  const confirmed = await readSession();
  if (!confirmed.ok)
    throw {
      message: "El navegador no permite mantener tu biblioteca en este contexto. Permite las cookies o abre la aplicación fuera del marco.",
      status: 401,
      code: "COOKIES",
    } satisfies Failure;
}

const shared = self as unknown as {
  onconnect: (event: MessageEvent) => void;
};
shared.onconnect = (event) => {
  const port = event.ports[0];
  port.onmessage = () => {
    queue = queue.then(async () => {
      try {
        await initialize();
        port.postMessage({ ok: true });
      } catch (error) {
        const known = error as Partial<Failure>;
        port.postMessage({
          ok: false,
          message: known.message || "No podemos abrir tu biblioteca. Vuelve a intentarlo.",
          status: known.status || 503,
          code: known.code || "SESION",
        });
      } finally {
        port.close();
      }
    });
  };
  port.start();
};
