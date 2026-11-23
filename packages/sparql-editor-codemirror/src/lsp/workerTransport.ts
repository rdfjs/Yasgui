/**
 * A `@codemirror/lsp-client` {@link Transport} backed by a Web Worker LSP server.
 *
 * `@codemirror/lsp-client` speaks JSON-RPC as strings; the SparqlStudio LSP workers (qlue-ls, swls,
 * traqula) exchange parsed JSON objects over `postMessage` (the same shape `monaco-languageclient`
 * uses), with their own framing handled internally. This bridge converts between the two and
 * swallows the worker's `{type:"ready"}` startup signal so it never reaches the JSON-RPC layer.
 */
import type { Transport } from "@codemirror/lsp-client";

export function workerTransport(worker: Worker): Transport {
  let handlers: ((value: string) => void)[] = [];
  worker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    // Startup handshake, not a JSON-RPC message.
    if (data && typeof data === "object" && (data as any).type === "ready") return;
    if (data === "ready") return;
    // Some servers (e.g. swls) stamp `publishDiagnostics` with `version: 0` instead of echoing the
    // document version. `@codemirror/lsp-client` drops diagnostics whose version != the current doc
    // version, so after the first edit they would never render.
    if (data && typeof data === "object" && (data as any).method === "textDocument/publishDiagnostics") {
      const params = (data as any).params;
      if (params && "version" in params) delete params.version;
    }
    const str = typeof data === "string" ? data : JSON.stringify(data);
    for (const h of handlers) h(str);
  });
  return {
    // CM hands us JSON-RPC strings; the workers expect objects (they stringify/frame internally).
    send(message: string) {
      worker.postMessage(JSON.parse(message));
    },
    subscribe(handler) {
      handlers.push(handler);
    },
    unsubscribe(handler) {
      handlers = handlers.filter((h) => h !== handler);
    },
  };
}
