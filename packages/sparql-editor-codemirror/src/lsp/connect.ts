import { waitWorkerReady, waitLanguageServerReady } from "@rdfjs/sparql-utils";
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

/** Build, connect and initialise an LSPClient over `worker`. Resolves once `initialize` completes. */
export async function connectLanguageClient(worker: Worker, signal: AbortSignal): Promise<LSPClient> {
  await waitWorkerReady(worker, signal);
  const client = new LSPClient({
    extensions: [...languageServerExtensions(), pullDiagnostics(), semanticTokens()],
  }).connect(workerTransport(worker));
  const onAbort = () => client.disconnect();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw new DOMException("Editor destroyed", "AbortError");
    await waitLanguageServerReady(client.initializing, signal);
    return client;
  } catch (error) {
    client.disconnect();
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
