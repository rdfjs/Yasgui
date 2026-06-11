/**
 * Helpers to quickly set up SPARQL language servers with Yasqe.
 *
 * Yasqe is language-server agnostic (it only receives a ready LSP `Worker`); these modules provide
 * the server-specific plumbing (settings, types, endpoint/backend registration) so consumers don't
 * have to reimplement it. Each supported server is exposed under its own namespace.
 *
 * @example
 * import { qlueLs } from "@zazuko/yasqe/languageServers";
 * new Yasqe(el, {
 *   languageServerWorker: createQlueLsWorker, // consumer-provided WASM worker
 *   onLanguageClientReady: (client) => {
 *     qlueLs.configureSettings(client);
 *     qlueLs.configureBackend(client, "https://sparql.dblp.org/sparql");
 *   },
 * });
 *
 * @module languageServers
 */
export * as qlueLs from "./qlue-ls";
