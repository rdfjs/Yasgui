/**
 * qlue-ls helpers (Monaco) · the `monaco-languageclient`-specific glue for the qlue-ls SPARQL
 * language server (https://github.com/IoannisNezis/Qlue-ls).
 *
 * The editor-agnostic core (types, settings, prefix maps, completion query templates, backend
 * builder) now lives in `@zazuko/yasgui-utils` and is re-exported here so `@zazuko/yasqe`'s `qlueLs`
 * namespace keeps its full surface. Only the functions that talk to a concrete `MonacoLanguageClient`
 * (sending `qlueLs/*` notifications) remain here.
 *
 * Yasqe is language-server agnostic: it only receives a ready LSP `Worker` (via the
 * `languageServerWorker` config) and hands back the resulting `MonacoLanguageClient` through
 * `onLanguageClientReady`. These helpers drive qlue-ls over that client.
 *
 * @module languageServers/qlue-ls
 */
import type { MonacoLanguageClient } from "monaco-languageclient";
import { createBackendConf, defaultSettings } from "@zazuko/yasgui-utils";
import type { Settings, BackendOptions } from "@zazuko/yasgui-utils";

// Re-export the editor-agnostic qlue-ls helpers (now in @zazuko/yasgui-utils) so existing
// `import { qlueLs } from "@zazuko/yasqe"` consumers keep access to them.
export type {
  SparqlEngine,
  PrefixMap,
  CompletionTemplate,
  CompletionQueries,
  BackendConfiguration,
  FormatSettings,
  CompletionSettings,
  PrefixesSettings,
  Settings,
  BackendOptions,
} from "@zazuko/yasgui-utils";
export {
  defaultSettings,
  fallbackPrefixMap,
  defaultCompletionQueries,
  fetchPrefixMap,
  createBackendConf,
} from "@zazuko/yasgui-utils";

/** Push qlue-ls server settings via the `qlueLs/changeSettings` notification. */
export function configureSettings(languageClient: MonacoLanguageClient, settings: Settings = defaultSettings): void {
  void languageClient.sendNotification("qlueLs/changeSettings", settings);
}

// Avoid re-registering the same backend repeatedly when configureBackend is called on every change.
let lastBackendEndpoint: string | undefined;

/**
 * Register a SPARQL endpoint with the qlue-ls language client and make it the default backend.
 * Safe to call repeatedly (e.g. from `onLanguageClientReady` or an endpoint-change handler): the
 * same endpoint is only registered once.
 */
export async function configureBackend(
  languageClient: MonacoLanguageClient | undefined,
  endpoint: string,
  options: BackendOptions = {},
): Promise<void> {
  if (!languageClient || !endpoint || endpoint === lastBackendEndpoint) return;
  lastBackendEndpoint = endpoint;
  try {
    const backend = await createBackendConf(endpoint, options);
    void languageClient.sendNotification("qlueLs/addBackend", backend);
    void languageClient.sendNotification("qlueLs/updateDefaultBackend", { backendName: backend.name });
  } catch (error) {
    lastBackendEndpoint = undefined; // allow retry
    console.error("Failed to configure qlue-ls backend for", endpoint, error);
  }
}
