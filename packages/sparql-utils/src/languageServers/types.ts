/**
 * Editor-agnostic language server contract shared by both SparqlEditor editors (`@rdfjs/sparql-editor-monaco`,
 * Monaco-based, and `@rdfjs/sparql-editor-codemirror`, CodeMirror 6-based).
 *
 * A SPARQL language server is defined ONCE as a {@link LanguageServerDef} (a Web Worker plus
 * metadata, optional settings schema and lifecycle hooks) and the SAME descriptor is handed to
 * either editor. Each editor connects the worker with its own LSP client library and adapts that
 * client to the minimal {@link LspConnection} before invoking the hooks, so server-specific glue
 * (e.g. the qlue-ls helpers in {@link ./qlueLs}) is written once and runs in both editors.
 * @module LanguageServers
 */

/**
 * Minimal editor/transport-agnostic JSON-RPC connection handed to language server hooks. Each
 * editor adapts its native client to this: the Monaco `MonacoLanguageClient`
 * (`sendNotification`/`sendRequest`) passes through, the CodeMirror `LSPClient`
 * (`notification`/`request`) is mapped onto it.
 */
export interface LspConnection {
  /** Send a fire-and-forget JSON-RPC notification. */
  sendNotification(method: string, params?: unknown): void;
  /** Send a JSON-RPC request and resolve with its result (rejects with the JSON-RPC error). */
  sendRequest<R = unknown>(method: string, params?: unknown): Promise<R>;
}

/** A single configurable field in a {@link LanguageServerSettingsSchema}. The property key it is
 * stored under may be dotted (e.g. `format.tabSize`) to map onto a nested settings object. */
export interface SettingFieldSchema {
  /** Widget/value type: checkbox, number input, or text/select. */
  type: "boolean" | "number" | "string";
  /** Human label shown next to the field (defaults to the property key). */
  title?: string;
  /** Optional helper text shown under the field. */
  description?: string;
  /** Default value, used when no value has been applied yet and by the Reset button. */
  default?: boolean | number | string;
  /** When set, a `string` field renders as a `<select>` of these options. */
  enum?: (string | number)[];
  /** Bounds for `number` fields. */
  minimum?: number;
  maximum?: number;
  /** Optional section heading the field is grouped under (e.g. "Formatting"). */
  group?: string;
}

/** Describes the settings a language server exposes; drives the settings panel in both editors. */
export interface LanguageServerSettingsSchema {
  /** Panel heading (defaults to `<server> settings`). */
  title?: string;
  /** The configurable fields, keyed by (optionally dotted) setting path. */
  properties: Record<string, SettingFieldSchema>;
}

/**
 * A SPARQL language server the consumer makes available to an editor. Defined ONCE and usable in
 * BOTH editors. Generic over the editor instance type `Y` so the hooks get a precisely typed
 * `yasqe` argument without this module depending on either editor package.
 */
export interface LanguageServerDef<Y = any> {
  /** Short name shown in the switcher (e.g. "Qlue-ls"). */
  label: string;
  /** Optional longer description, shown dimmed next to the label. */
  description?: string;
  /**
   * The language server as an LSP `Worker`, or a factory returning one (optionally async, e.g.
   * after WASM init). This is the universal transport: Monaco connects a `MonacoLanguageClient` to
   * it, CodeMirror builds an `LSPClient` from it internally.
   */
  worker: Worker | (() => Worker | Promise<Worker>);
  /** LSP language id sent to the server. Defaults to `"sparql"`. */
  languageId?: string;
  /**
   * Document URI for this editor. Provide a function to derive a unique URI per editor (e.g. one
   * per SparqlStudio tab). Defaults to an auto-generated unique URI.
   */
  documentUri?: string | ((yasqe: Y) => string);
  /**
   * Called when this server becomes active (on load or when switched to), with an editor-agnostic
   * {@link LspConnection}. Use it for server-specific setup, e.g. pushing settings and registering
   * the SPARQL backend for the current endpoint.
   */
  onReady?: (connection: LspConnection, yasqe: Y) => void;
  /**
   * Called when the active endpoint changes, but only for the currently active server, with its
   * {@link LspConnection} and the new endpoint. Use it for server-specific endpoint handling, e.g.
   * re-registering the SPARQL backend.
   */
  onEndpointChange?: (connection: LspConnection, endpoint: string, yasqe: Y) => void;
  /**
   * Describes the server's tunable settings (a small JSON-schema subset). When present (together
   * with {@link configCallback}), a "Configure …" entry appears in the editor's language-server
   * menu and opens a modal rendered from this schema.
   */
  configSchema?: LanguageServerSettingsSchema;
  /**
   * Applies the settings collected from the {@link configSchema} panel to the running server. The
   * `config` is a nested object: dotted schema keys (e.g. `format.tabSize`) become nested fields
   * (`{ format: { tabSize: 2 } }`). For qlue-ls this is typically
   * `(conn, settings) => qlueLs.configureSettings(conn, settings)`.
   */
  configCallback?: (connection: LspConnection, config: any) => void;
}
