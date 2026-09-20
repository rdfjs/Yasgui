const workerReadiness = new WeakMap<Worker, Promise<void>>();

/** @internal Wait for server startup without hanging after unmount or a worker failure. */
export function waitWorkerReady(worker: Worker, signal: AbortSignal): Promise<void> {
  const existing = workerReadiness.get(worker);
  if (existing) return existing;
  const ready = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = (error?: Error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data === "ready" || event.data?.type === "ready") finish();
    };
    const onError = (event: ErrorEvent) => finish(new Error(event.message || "Language server worker failed"));
    const onAbort = () => finish(new DOMException("Editor destroyed", "AbortError"));
    const timer = setTimeout(
      () => finish(new Error("Language server worker did not become ready within 30 seconds")),
      30000,
    );
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  workerReadiness.set(worker, ready);
  ready.catch(() => workerReadiness.delete(worker));
  return ready;
}

/** @internal Bound the LSP initialize request and cancel it when the editor is destroyed. */
export function waitLanguageServerReady<T>(initializing: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(new DOMException("Editor destroyed", "AbortError"));
    const timer = setTimeout(() => fail(new Error("Language server initialization timed out after 30 seconds")), 30000);
    signal.addEventListener("abort", onAbort, { once: true });
    initializing.then((value) => {
      cleanup();
      resolve(value);
    }, fail);
    if (signal.aborted) onAbort();
  });
}
