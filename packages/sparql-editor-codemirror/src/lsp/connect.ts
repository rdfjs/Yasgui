/**
 * Build a connected `@codemirror/lsp-client` {@link LSPClient} from a Web Worker LSP server.
 *
 * This is the CodeMirror counterpart to the Monaco editor's `connectLanguageClient`: the editor is
 * language server agnostic and the consumer only provides a worker (see `LanguageServerDef.worker`).
 * The client is wired with the base `languageServerExtensions()` plus the reusable glue
 * ({@link ./glue}) that adds pull-diagnostics and semantic-token highlighting, so any LSP worker
 * gets full editor features. Document open + the LSP plugin are attached by the editor (it owns the
 * document URI / language id and the LSP compartment).
 */
import { LSPClient, languageServerExtensions } from "@codemirror/lsp-client";
import { workerTransport } from "./workerTransport";
import { pullDiagnostics, semanticTokens } from "./glue";

/**
 * Resolve once a freshly created LSP worker signals it is ready, so the client never sends
 * `initialize`/`didOpen` before the worker has installed its message handler. WASM-backed workers
 * (qlue-ls, swls, ...) set their handler only AFTER an async `import()` / WASM init; a client
 * connecting too early races that setup and corrupts message ordering. By convention these workers
 * post `{ type: "ready" }` (or the bare string `"ready"`) once set up. `addEventListener` (not
 * `onmessage=`) so it never clobbers the handler the client attaches later.
 */
function awaitWorkerReady(worker: Worker): Promise<void> {
  return new Promise((resolve) => {
    const onReady = (event: MessageEvent) => {
      if (event.data?.type === "ready" || event.data === "ready") {
        worker.removeEventListener("message", onReady);
        resolve();
      }
    };
    worker.addEventListener("message", onReady);
  });
}

/** Build, connect and initialise an LSPClient over `worker`. Resolves once `initialize` completes. */
export async function connectLanguageClient(worker: Worker): Promise<LSPClient> {
  await awaitWorkerReady(worker);
  const client = new LSPClient({
    extensions: [...languageServerExtensions(), pullDiagnostics(), semanticTokens()],
  }).connect(workerTransport(worker));
  await client.initializing;
  return client;
}
