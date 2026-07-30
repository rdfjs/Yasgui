/**
 * SparqlEditor (CodeMirror 6 edition) · the standalone CodeMirror-based SPARQL query editor.
 *
 * SparqlEditor is language server agnostic. The embedder supplies each server as a Web `Worker` (the
 * universal LS transport, identical to the Monaco-based `@rdfjs/sparql-editor-monaco`) via
 * `config.languageServers`; SparqlEditor builds the `@codemirror/lsp-client` `LSPClient` internally. All
 * language features (highlighting, diagnostics, completion, hover, formatting) come from the active
 * server; SparqlEditor ships no SPARQL grammar of its own. When two or more servers are configured, a
 * switcher dropdown lets the user pick between them at runtime ({@link SparqlEditor.setLanguageServer}).
 * @module YasqeCodeMirror
 */
import "./style/yasqe.css";
import "./style/buttons.css";
import "./style/codemirrorMods.css";

import { EventEmitter } from "events";
import { merge } from "lodash-es";
import * as queryString from "query-string";

import { EditorState, Extension, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  lineNumbers,
  highlightActiveLineGutter,
  ViewUpdate,
} from "@codemirror/view";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  codeFolding,
  foldGutter,
  foldService,
  foldEffect,
  foldKeymap,
} from "@codemirror/language";
import { indentWithTab, defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { LSPPlugin, type LSPClient } from "@codemirror/lsp-client";

import {
  Storage as YStorage,
  drawSvgStringAsElement,
  addClass,
  removeClass,
  getQueryType,
  getQueryMode,
  getPrefixesFromQuery,
  getSparqlBlockFoldingRanges,
  executeQuery,
  getAjaxConfig,
  getUrlArguments,
  getAcceptHeader,
  getAsCurlString,
  createLspErrorNotification,
  openSettingsPanel,
  unflatten,
  defaultsFromSchema,
} from "@rdfjs/sparql-utils";
import type {
  DeepPartial,
  QueryType,
  RequestConfig,
  IEditor,
  Prefixes,
  EditorAjaxConfig,
  RequestArgs,
  LspErrorNotification,
  LanguageServerDef as SharedLanguageServerDef,
  LanguageServerSettingsSchema,
  LspConnection,
} from "@rdfjs/sparql-utils";
export type { QueryType, RequestConfig, PlainRequestConfig, Prefixes } from "@rdfjs/sparql-utils";
export type { LanguageServerSettingsSchema, SettingFieldSchema, LspConnection } from "@rdfjs/sparql-utils";
import { connectLanguageClient } from "./lsp/connect";
import { clearSemanticTokens } from "./lsp/glue";
import { sparqlFallbackHighlight } from "./lsp/sparqlHighlight";

/** A language server made available to the CodeMirror-based SparqlEditor. The editor-agnostic descriptor
 * with its `yasqe` hook argument bound to this editor's {@link SparqlEditor}. Defined once in
 * `@rdfjs/sparql-utils` so the SAME object also works with `@rdfjs/sparql-editor-monaco` (Monaco). */
export type LanguageServerDef = SharedLanguageServerDef<SparqlEditor>;

/** Adapt a CodeMirror `LSPClient` to the editor-agnostic {@link LspConnection} handed to
 * language server hooks. Cached per client so identity-based de-dup (e.g. qlue-ls's backend cache,
 * keyed on the connection object) keeps working across repeated hook calls. */
const lspConnections = new WeakMap<LSPClient, LspConnection>();
function toLspConnection(client: LSPClient): LspConnection {
  let conn = lspConnections.get(client);
  if (!conn) {
    conn = {
      sendNotification: (method, params) => client.notification(method, params),
      sendRequest: (method, params) => client.request(method, params) as Promise<any>,
    };
    lspConnections.set(client, conn);
  }
  return conn;
}

import getDefaults from "./defaults";
import * as imgs from "./imgs";

// Editor chrome (background, gutter, selection, cursor) per theme. Both are applied as CodeMirror
// themes so the editor always has an explicit background matching its own theme, regardless of the
// surrounding page. Colors mirror the Monaco SPARQL theme (see yasqe/src/editor/sparqlTheme.ts) so
// the two editors look identical. Token colors are driven by CSS (see style/codemirrorMods.css,
// `.cm-st-*` and the `[data-theme="dark"]` overrides) so semantic-token highlighting follows too.
const lightTheme = EditorView.theme({
  "&": { color: "#586e75", backgroundColor: "#f7f7f7" },
  ".cm-content": { caretColor: "#002b36" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#002b36" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#eee8d5",
  },
  ".cm-activeLine": { backgroundColor: "#fdf6e3" },
  ".cm-gutters": { backgroundColor: "#f7f7f7", color: "#93a1a1", border: "none" },
  ".cm-activeLineGutter": { backgroundColor: "#fdf6e3" },
});
const darkTheme = EditorView.theme(
  {
    "&": { color: "#839496", backgroundColor: "#002b36" },
    ".cm-content": { caretColor: "#fdf6e3" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#fdf6e3" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#073642",
    },
    ".cm-activeLine": { backgroundColor: "#073642" },
    ".cm-gutters": { backgroundColor: "#002b36", color: "#586e75", border: "none" },
    ".cm-activeLineGutter": { backgroundColor: "#073642" },
    ".cm-matchhighlight": { backgroundColor: "#3a3d41" },
    ".cm-selectionMatch": { backgroundColor: "#3a3d41" },
  },
  { dark: true },
);

// Detect the leading SPARQL prologue (the contiguous run of PREFIX/BASE declarations) for folding
function prologueFoldRange(state: EditorState): { headFrom: number; from: number; to: number } | null {
  const doc = state.doc;
  let first = 0;
  let last = 0;
  for (let n = 1; n <= doc.lines; n++) {
    const t = doc.line(n).text.trim();
    if (/^(PREFIX|BASE)\b/i.test(t)) {
      if (!first) first = n;
      last = n;
    } else if (t === "" || t.startsWith("#")) {
      // blank / comment line: skip leading ones, tolerate ones interleaved in the prologue
      continue;
    } else {
      break; // first real (non-prologue) line ends the prologue
    }
  }
  if (!first || last <= first) return null; // need at least two declaration lines to fold
  const firstLine = doc.line(first);
  return { headFrom: firstLine.from, from: firstLine.to, to: doc.line(last).to };
}

// Fold service that offers to fold the prologue block when a fold is requested on its first line
const prologueFoldService = foldService.of((state, lineStart) => {
  const range = prologueFoldRange(state);
  if (!range || range.headFrom !== lineStart) return null;
  return { from: range.from, to: range.to };
});

// Fold service for the brace-delimited blocks (WHERE / SERVICE / OPTIONAL / sub-SELECT, …)
const blockFoldService = foldService.of((state, lineStart, lineEnd) => {
  let best: { from: number; to: number } | null = null;
  for (const r of getSparqlBlockFoldingRanges(state.doc.toString())) {
    const bracePos = r.innerFrom - 1; // position of the opening `{`
    if (bracePos < lineStart || bracePos > lineEnd) continue;
    // Prefer the largest block when several open on the same line (e.g. nested `{ { … } }`).
    if (!best || r.innerTo - r.innerFrom > best.to - best.from) best = { from: r.innerFrom, to: r.innerTo };
  }
  return best;
});

export class SparqlEditor extends EventEmitter implements IEditor {
  private static storageNamespace = "triply";
  public rootEl: HTMLDivElement;
  private editorEl: HTMLDivElement;
  public cm!: EditorView;
  public config: Config;
  public storage: YStorage;
  public persistentConfig: PersistentConfig | undefined;
  public autocompleters: { [name: string]: any } = {}; // reserved for future LSP-based completion
  public queryValid = true;
  public lastQueryDuration: number | undefined;
  private queryType: QueryType | undefined;
  private req: Request | undefined;
  private abortController: AbortController | undefined;
  private queryStatus: "valid" | "error" | undefined;
  private queryBtn: HTMLButtonElement | undefined;
  private resizeWrapper?: HTMLDivElement;
  private readOnlyCompartment = new Compartment();
  private extensionsCompartment = new Compartment();
  private themeCompartment = new Compartment();
  // Holds the active language server's CM6 extension (lint gutter + LSP plugin); reconfigured on switch.
  private lspCompartment = new Compartment();
  // Static SPARQL highlighting, enabled only while the active server emits no semantic tokens.
  private fallbackHighlightCompartment = new Compartment();
  private static uriCounter = 0;
  private documentUri?: string;
  /** Index of the active language server in `config.languageServers`, or -1 when none is active. */
  public activeLanguageServerIndex = -1;
  /** The currently active LSPClient (used by format() and diagnostics). */
  private activeClient?: LSPClient;
  /** Resolved LSPClient per server index, so switching back is instant (clients are heavy/WASM). */
  private lsClients = new Map<number, LSPClient>();
  /** Serializes language server switches so concurrent calls (init + a restored preference) don't race. */
  private lsSwitchQueue: Promise<void> = Promise.resolve();
  /** Index of the most recently requested language server. A queued activation whose index no longer
   * matches this has been superseded (e.g. the constructor's default 0 followed by a restored
   * preference); it bails before any client setup so we never start a server just to dispose it. */
  private requestedLanguageServerIndex = -1;
  /** The language server switcher button (only drawn when 2+ servers are configured). */
  private lsSelectEl?: HTMLButtonElement;
  /** Document-level click handler that closes the open switcher menu (removed on destroy). */
  private lsMenuOutsideClick?: (e: MouseEvent) => void;
  /** Dispose handle for an open settings panel, so a second open (or a server switch) closes the first. */
  private lsSettingsPanelDispose?: () => void;

  constructor(parent: HTMLElement, conf: PartialConfig = {}) {
    super();
    if (!parent) throw new Error("No parent passed as argument. Dont know where to draw YASQE");
    this.rootEl = document.createElement("div");
    this.rootEl.className = "sparql-editor";
    parent.appendChild(this.rootEl);
    this.editorEl = document.createElement("div");
    this.editorEl.className = "sparql-editor_editor";
    this.rootEl.appendChild(this.editorEl);

    // `languageServers` (carrying Worker instances / factory + callback functions) and
    // `extensions` (opaque CM6 objects) must not be deep-merged by lodash, which would clone away
    // their prototypes / identity. Assign them by reference.
    // (cast to `any` to avoid the deep type instantiation lodash.merge triggers over DeepPartial)
    const rawConf = conf as any;
    const { languageServers, extensions } = rawConf;
    const mergeableConf = { ...rawConf };
    delete mergeableConf.languageServers;
    delete mergeableConf.extensions;
    this.config = merge({}, SparqlEditor.defaults, mergeableConf) as Config;
    if (extensions) this.config.extensions = extensions as Extension[];
    if (languageServers) this.config.languageServers = languageServers as Config["languageServers"];
    this.storage = new YStorage(SparqlEditor.storageNamespace);

    // Restore persisted query
    let initialValue = this.config.value ?? "";
    const storageId = this.getStorageId();
    if (storageId) {
      const persConf = this.storage.get<any>(storageId);
      if (persConf && typeof persConf === "string") {
        this.persistentConfig = { query: persConf, editorHeight: this.config.editorHeight };
      } else {
        this.persistentConfig = persConf;
      }
      if (!this.persistentConfig) {
        this.persistentConfig = { query: initialValue, editorHeight: this.config.editorHeight };
      }
      if (this.persistentConfig.query) initialValue = this.persistentConfig.query;
    }

    this.cm = new EditorView({
      parent: this.editorEl,
      state: EditorState.create({
        doc: initialValue,
        extensions: this.buildExtensions(),
      }),
    });

    if (this.config.collapsePrefixesOnLoad) {
      const range = prologueFoldRange(this.cm.state);
      if (range) this.cm.dispatch({ effects: foldEffect.of({ from: range.from, to: range.to }) });
    }

    this.drawButtons();

    // Activate the first configured language server (the consumer may switch between several).
    if (this.config.languageServers?.length) void this.setLanguageServer(0);

    if (this.config.consumeShareLink) {
      this.config.consumeShareLink(this);
      window.addEventListener("hashchange", this.handleHashChange);
    }

    this.checkSyntax();

    const height = this.persistentConfig?.editorHeight || this.config.editorHeight;
    if (height) this.editorEl.style.height = height;

    if (this.config.resizeable) this.drawResizer();
  }

  private buildExtensions(): Extension[] {
    const c = this.config;
    const base: Extension[] = [];
    if (c.lineNumbers) base.push(lineNumbers());
    if (c.highlightActiveLine) {
      base.push(highlightActiveLineGutter());
      base.push(highlightActiveLine());
    }
    base.push(highlightSpecialChars());
    base.push(history());
    base.push(codeFolding());
    base.push(prologueFoldService);
    base.push(blockFoldService);
    if (c.foldGutter) base.push(foldGutter());
    base.push(drawSelection());
    base.push(dropCursor());
    base.push(EditorState.allowMultipleSelections.of(true));
    base.push(indentOnInput());
    base.push(syntaxHighlighting(defaultHighlightStyle, { fallback: true }));
    if (c.matchBrackets) base.push(bracketMatching());
    base.push(closeBrackets());
    base.push(autocompletion());
    base.push(rectangularSelection());
    base.push(crosshairCursor());
    base.push(highlightSelectionMatches());
    base.push(
      keymap.of([
        // Custom bindings first so they take precedence over the default ones
        {
          key: "Mod-Enter",
          run: () => {
            this.query().catch(() => {});
            return true;
          },
        },
        {
          key: "Ctrl-Enter",
          run: () => {
            this.query().catch(() => {});
            return true;
          },
        },
        {
          key: "Mod-/",
          run: () => {
            this.commentLines();
            return true;
          },
        },
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            this.saveQuery();
            return true;
          },
        },
        {
          key: "Shift-Alt-f",
          preventDefault: true,
          run: () => {
            void this.format();
            return true;
          },
        },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
    );
    base.push(search({ top: true }));
    // The active language server (lint gutter + LSP plugin) lives in a compartment so it can be
    // swapped at runtime via setLanguageServer. Starts empty; the first server is activated below.
    base.push(this.lspCompartment.of([]));
    // Static SPARQL highlighting on by default; switched off once a semantic-token server activates.
    base.push(this.fallbackHighlightCompartment.of(sparqlFallbackHighlight));
    if (c.lineWrapping) base.push(EditorView.lineWrapping);
    base.push(
      EditorView.updateListener.of((u: ViewUpdate) => {
        if (u.docChanged) {
          this.emit("change");
          this.emit("changes");
          this.checkSyntax();
          this.updateQueryButton();
        }
        if (u.selectionSet) {
          this.emit("cursorActivity");
        }
        if (u.focusChanged) {
          if (this.cm.hasFocus) this.emit("focus");
          else {
            this.saveQuery();
            this.emit("blur");
          }
        }
      }),
    );
    base.push(this.themeCompartment.of(c.theme === "dark" ? darkTheme : lightTheme));
    base.push(this.readOnlyCompartment.of(EditorState.readOnly.of(!!c.readOnly)));
    base.push(this.extensionsCompartment.of(c.extensions ?? []));
    return base;
  }

  /* Value & document */
  public getValue(): string {
    return this.cm.state.doc.toString();
  }
  public setValue(value: string) {
    this.cm.dispatch({ changes: { from: 0, to: this.cm.state.doc.length, insert: value } });
  }
  public dispatch(...specs: Parameters<EditorView["dispatch"]>) {
    return this.cm.dispatch(...specs);
  }
  public focus() {
    this.cm.focus();
  }
  public refresh() {
    this.cm.requestMeasure();
  }
  public getWrapperElement(): HTMLElement {
    return this.cm.dom;
  }

  /**
   * Switch the editor theme. Sets the global `[data-theme]` attribute (which CSS, including the
   * semantic-token colors, keys off) and swaps the CodeMirror editor-chrome theme.
   */
  public setTheme(theme: "light" | "dark") {
    this.config.theme = theme;
    document.documentElement.dataset.theme = theme;
    this.cm.dispatch({ effects: this.themeCompartment.reconfigure(theme === "dark" ? darkTheme : lightTheme) });
  }

  /**
   * The LSP document URI for this editor. Stable across server switches. Derived from the active
   * server's `documentUri` (string or factory), falling back to an auto-generated unique URI so
   * that several editors sharing one client (e.g. SparqlStudio tabs) get distinct URIs.
   */
  public getDocumentUri(def?: LanguageServerDef): string {
    if (this.documentUri) return this.documentUri;
    const conf = def?.documentUri;
    if (typeof conf === "function") this.documentUri = conf(this);
    else if (typeof conf === "string") this.documentUri = conf;
    else this.documentUri = `file:///query${++SparqlEditor.uriCounter}.rq`;
    return this.documentUri;
  }

  /* Language servers */
  /** The configured language servers, as `{ label, description }` (the switcher-facing subset). */
  public getLanguageServers(): { label: string; description?: string }[] {
    return (this.config.languageServers ?? []).map((s) => ({ label: s.label, description: s.description }));
  }
  /** Index of the active language server in `config.languageServers`, or -1 when none is active. */
  public getActiveLanguageServer(): number {
    return this.activeLanguageServerIndex;
  }
  /** The active `LSPClient`, or undefined when no language server is active. */
  public getLanguageClient(): LSPClient | undefined {
    return this.activeClient;
  }
  /**
   * Notify the active language server that the endpoint changed, firing only its `onEndpointChange`
   * (with the active `LSPClient`). SparqlStudio calls this on endpoint changes; standalone consumers can
   * call it themselves. No-op when no server is active or it defines no handler.
   */
  public notifyEndpointChange(endpoint: string): void {
    const def = this.config.languageServers?.[this.activeLanguageServerIndex];
    if (def?.onEndpointChange && this.activeClient && endpoint) {
      def.onEndpointChange(toLspConnection(this.activeClient), endpoint, this);
    }
  }
  /**
   * Activate a language server by label or index. Resolves (and caches) the target client, runs its
   * `onReady`, swaps it into the editor via the LSP compartment, refreshes the switcher button and
   * emits `languageServerChange`. The query/document is preserved.
   */
  public setLanguageServer(target: string | number): Promise<void> {
    const servers = this.config.languageServers ?? [];
    const index = typeof target === "number" ? target : servers.findIndex((s) => s.label === target);
    if (index < 0 || index >= servers.length) {
      console.warn("Unknown language server:", target);
      return Promise.resolve();
    }
    this.requestedLanguageServerIndex = index;
    // Swallow a prior switch's failure so it doesn't block this one (the chain is reused).
    this.lsSwitchQueue = this.lsSwitchQueue.catch(() => {}).then(() => this.activateLanguageServer(index));
    return this.lsSwitchQueue;
  }

  private async activateLanguageServer(index: number): Promise<void> {
    const servers = this.config.languageServers ?? [];
    if (!servers.length) return;
    if (index !== this.requestedLanguageServerIndex) return;
    if (index === this.activeLanguageServerIndex && this.activeClient) return;
    const def = servers[index];
    // A settings panel belongs to the outgoing server; close it before switching.
    this.lsSettingsPanelDispose?.();
    this.lsSettingsPanelDispose = undefined;
    // Resolve (and cache) the target client. The consumer provides a Worker, we build the `LSPClient`
    //  from it internally. Cached clients make switching back instant
    let client = this.lsClients.get(index);
    if (!client) {
      const worker = typeof def.worker === "function" ? await def.worker() : def.worker;
      if (!worker) {
        console.warn("Language server provided no worker:", def.label);
        return;
      }
      // Bail if a newer switch superseded this one while the worker/client was starting.
      if (index !== this.requestedLanguageServerIndex) return;
      client = await connectLanguageClient(worker);
      this.lsClients.set(index, client);
    }
    if (index !== this.requestedLanguageServerIndex) return;
    this.setupLanguageServerErrorNotifications(client);
    // Each entry has its own worker/client, so a switch always changes the active client; attach
    // its LSP plugin (lint gutter + document sync + the moved diagnostics/semantic-token glue).
    const clientChanged = client !== this.activeClient;
    this.activeClient = client;
    this.activeLanguageServerIndex = index;
    if (clientChanged) {
      const uri = this.getDocumentUri(def);
      this.cm.dispatch({
        effects: this.lspCompartment.reconfigure([lintGutter(), client.plugin(uri, def.languageId ?? "sparql")]),
      });
    }
    const hasSemanticTokens = !!client.serverCapabilities?.semanticTokensProvider;
    this.cm.dispatch({
      effects: hasSemanticTokens
        ? this.fallbackHighlightCompartment.reconfigure([])
        : [this.fallbackHighlightCompartment.reconfigure(sparqlFallbackHighlight), clearSemanticTokens],
    });
    if (def.onReady) def.onReady(toLspConnection(client), this);
    this.applyPersistedLanguageServerSettings(def, client);
    this.updateLanguageServerDropdown();
    this.emit("languageServerChange", { label: def.label, description: def.description }, index);
  }

  /**
   * Open the schema-driven settings panel for the active language server. No-op when no server is
   * active or it exposes no `configSchema`/`configCallback`. On Apply, the collected values are
   * de-flattened (dotted keys become nested objects) and handed to the server's `configCallback`.
   */
  public openLanguageServerSettings(): void {
    this.lsSettingsPanelDispose?.();
    this.lsSettingsPanelDispose = undefined;
    const def = this.config.languageServers?.[this.activeLanguageServerIndex];
    const client = this.activeClient;
    if (!def?.configSchema || !def.configCallback || !client) return;
    const schema = def.configSchema as LanguageServerSettingsSchema;
    const current = this.getLanguageServerSettings(def.label) ?? defaultsFromSchema(schema);
    this.lsSettingsPanelDispose = openSettingsPanel({
      root: this.rootEl,
      schema,
      serverLabel: def.label,
      current,
      onApply: (values) => {
        this.setLanguageServerSettings(def.label, values);
        def.configCallback!(toLspConnection(client), unflatten(values));
      },
    });
  }

  /**
   * Persisted settings panel values for a language server (by label), or undefined if none stored.
   * A consumer-supplied store (`config.getLanguageServerSettings`, used by SparqlStudio) takes precedence
   * over yasqe's own persistentConfig (used in standalone mode).
   */
  private getLanguageServerSettings(label: string): Record<string, unknown> | undefined {
    return this.config.getLanguageServerSettings?.(label) ?? this.persistentConfig?.languageServerSettings?.[label];
  }

  /**
   * Store the settings panel values for a language server (by label). Persists to yasqe's own local
   * storage when enabled (standalone), and emits `languageServerSettingsChange` so a consumer (e.g.
   * SparqlStudio) can own persistence, mirroring the `languageServerChange` bridge.
   */
  private setLanguageServerSettings(label: string, values: Record<string, unknown>): void {
    if (this.persistentConfig) {
      (this.persistentConfig.languageServerSettings ??= {})[label] = values;
      this.saveQuery();
    }
    this.emit("languageServerSettingsChange", label, values);
  }

  /** Re-apply any persisted settings to a freshly connected client, so they survive reloads/switches. */
  private applyPersistedLanguageServerSettings(def: LanguageServerDef, client: LSPClient): void {
    if (!def.configCallback) return;
    const stored = this.getLanguageServerSettings(def.label);
    if (stored && Object.keys(stored).length) def.configCallback(toLspConnection(client), unflatten(stored));
  }

  /* Events */
  /**
   * Emit an event, always passing this SparqlEditor instance as the first argument to listeners (the
   * documented `(instance, ...payload)` API), so callers emit only the payload. Matches the Monaco
   * editor and lets the shared SPARQL module (in utils) emit without knowing the instance.
   */
  public emit(event: string | symbol, ...data: any[]): boolean {
    return super.emit(event, this, ...data);
  }
  // Alias for backwards compatibility with CM5-style `signal`
  public signal(event: string, ...args: any[]) {
    this.emit(event, ...args);
  }

  /* Query button & buttons */
  private handleHashChange = () => {
    this.config.consumeShareLink?.(this);
  };

  public getStorageId(getter?: Config["persistenceId"]): string | undefined {
    const persistenceId = getter || this.config.persistenceId;
    if (!persistenceId) return undefined;
    if (typeof persistenceId === "string") return persistenceId;
    return persistenceId(this);
  }
  public saveQuery() {
    const storageId = this.getStorageId();
    if (!storageId || !this.persistentConfig) return;
    this.persistentConfig.query = this.getValue();
    this.storage.set(storageId, this.persistentConfig, this.config.persistencyExpire, this.handleLocalStorageQuotaFull);
  }
  public handleLocalStorageQuotaFull(_e: any) {
    console.warn("Localstorage quota exceeded. Clearing all queries");
    SparqlEditor.clearStorage();
  }

  /* Query type */
  public getQueryType(): QueryType | undefined {
    return this.queryType;
  }
  public getQueryMode(): "update" | "query" {
    return getQueryMode(this.queryType);
  }
  /** Re-detect the query type (shared detector) and refresh the run button. Runs on every edit. */
  public checkSyntax() {
    this.queryType = getQueryType(this.getValue());
    this.updateQueryButton();
  }

  /* Comment / duplicate / format helpers */
  public commentLines() {
    const state = this.cm.state;
    const sel = state.selection.main;
    const fromLine = state.doc.lineAt(sel.from).number;
    const toLine = state.doc.lineAt(sel.to).number;
    const lines: { line: number; text: string }[] = [];
    let allCommented = true;
    for (let i = fromLine; i <= toLine; i++) {
      const l = state.doc.line(i);
      lines.push({ line: i, text: l.text });
      if (l.text.length === 0 || l.text.charAt(0) !== "#") allCommented = false;
    }
    const changes = lines.map(({ line }) => {
      const l = state.doc.line(line);
      return allCommented ? { from: l.from, to: l.from + 1, insert: "" } : { from: l.from, to: l.from, insert: "#" };
    });
    this.cm.dispatch({ changes });
  }
  public duplicateLine() {
    const state = this.cm.state;
    const sel = state.selection.main;
    const line = state.doc.lineAt(sel.head);
    this.cm.dispatch({ changes: { from: line.to, to: line.to, insert: "\n" + line.text } });
  }
  /**
   * Pretty-print the query via the language server's `textDocument/formatting` request and apply
   * the returned edits. No-op when no language server is connected (SparqlEditor ships no formatter).
   */
  public async format(): Promise<void> {
    const client = this.activeClient;
    const plugin = LSPPlugin.get(this.cm);
    if (!client || !plugin) return;
    // Make sure the server has the latest document before asking it to format.
    plugin.client.sync();
    try {
      const edits: any[] = await client.request("textDocument/formatting", {
        textDocument: { uri: plugin.uri },
        options: { tabSize: 2, insertSpaces: true },
      });
      if (!Array.isArray(edits) || edits.length === 0) return;
      // Clamp LSP positions to the document: qlue-ls returns a whole-document replacement whose end
      // is the `u32::MAX` (4294967295) sentinel, which `plugin.fromPosition` would map out of range.
      const doc = this.cm.state.doc;
      const toOffset = (p: { line: number; character: number }) => {
        const line = doc.line(Math.min(p.line + 1, doc.lines));
        return line.from + Math.min(p.character, line.length);
      };
      // LSP edits are non-overlapping; map each range to document offsets and apply in one dispatch.
      const changes = edits.map((e) => ({
        from: toOffset(e.range.start),
        to: toOffset(e.range.end),
        insert: e.newText,
      }));
      this.cm.dispatch({ changes });
    } catch (e) {
      console.warn("Formatting failed:", e);
    }
  }

  /* Prefixes */
  /** Extract the PREFIX declarations from the current query (delegates to the shared util). */
  public getPrefixesFromQuery(): Prefixes {
    return getPrefixesFromQuery(this.getValue());
  }
  /** Prepend missing PREFIX declarations, from a `"prefix: <iri>"` string or a `{ prefix: iri }` map. */
  public addPrefixes(prefixes: string | Prefixes): void {
    if (typeof prefixes === "string") {
      this.addPrefixAsString(prefixes);
      return;
    }
    const existing = this.getPrefixesFromQuery();
    for (const pref in prefixes) {
      if (!(pref in existing)) this.addPrefixAsString(pref + ": <" + prefixes[pref] + ">");
    }
  }
  private addPrefixAsString(prefixString: string): void {
    this.dispatch({ changes: { from: 0, to: 0, insert: "PREFIX " + prefixString + "\n" } });
  }
  /** Remove the given PREFIX declarations from the query. */
  public removePrefixes(prefixes: Prefixes): void {
    const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    let value = this.getValue();
    for (const pref in prefixes) {
      value = value.replace(
        new RegExp("PREFIX\\s*" + pref + ":\\s*" + escapeRegex("<" + prefixes[pref] + ">") + "\\s*", "ig"),
        "",
      );
    }
    this.setValue(value);
  }
  public collapsePrefixes(_collapse = true) {
    // Folding by syntax tree may be added later; no-op for now.
  }

  /* TODO: remove autocompleter stubs */
  public enableCompleter(_name: string): Promise<void> {
    return Promise.resolve();
  }
  public disableCompleter(_name: string): void {}
  public autocomplete(_fromAutoShow = false): void {}

  /* Buttons */
  private drawButtons() {
    const buttons = document.createElement("div");
    buttons.className = "sparql-editor_buttons";
    this.rootEl.appendChild(buttons);

    // Language-server switcher, leftmost in the button bar (only when 2+ servers are configured).
    this.drawLanguageServerDropdown(buttons);

    if (this.config.pluginButtons) {
      const pluginButtons = this.config.pluginButtons();
      if (pluginButtons) {
        if (Array.isArray(pluginButtons)) {
          for (const b of pluginButtons) buttons.append(b);
        } else {
          buttons.appendChild(pluginButtons);
        }
      }
    }

    // Format button: pretty-print the query via the language server (no-op without one).
    {
      const svgFormat = drawSvgStringAsElement(imgs.format);
      const formatBtn = document.createElement("button");
      formatBtn.className = "sparql-editor_format";
      formatBtn.title = "Format query (Shift+Alt+F)";
      formatBtn.setAttribute("aria-label", "Format query");
      formatBtn.appendChild(svgFormat);
      formatBtn.addEventListener("click", () => void this.format());
      buttons.appendChild(formatBtn);
    }

    if (this.config.createShareableLink) {
      const svgShare = drawSvgStringAsElement(imgs.share);
      const shareLinkWrapper = document.createElement("button");
      shareLinkWrapper.className = "sparql-editor_share";
      shareLinkWrapper.title = "Share query";
      shareLinkWrapper.setAttribute("aria-label", "Share query");
      shareLinkWrapper.appendChild(svgShare);
      buttons.appendChild(shareLinkWrapper);
      const showSharePopup = (event: MouseEvent | KeyboardEvent) => {
        event.stopPropagation();
        let popup: HTMLDivElement | undefined = document.createElement("div");
        popup.className = "sparql-editor_sharePopup";
        buttons.appendChild(popup);
        document.body.addEventListener(
          "click",
          (e) => {
            if (popup && e.target !== popup && !popup.contains(e.target as any)) {
              popup.remove();
              popup = undefined;
            }
          },
          true,
        );
        const input = document.createElement("input");
        input.type = "text";
        input.value = this.config.createShareableLink!(this);
        input.onfocus = () => input.select();
        const inputWrapper = document.createElement("div");
        inputWrapper.className = "inputWrapper";
        inputWrapper.appendChild(input);
        popup.appendChild(inputWrapper);

        const popupInputButtons: HTMLButtonElement[] = [];
        const createShortLink = this.config.createShortLink;
        if (createShortLink) {
          popup.className += " enableShort";
          const shortBtn = document.createElement("button");
          popupInputButtons.push(shortBtn);
          shortBtn.innerHTML = "Shorten";
          shortBtn.className = "sparql-editor_btn sparql-editor_btn-sm shorten";
          popup.appendChild(shortBtn);
          shortBtn.onclick = () => {
            popupInputButtons.forEach((b) => (b.disabled = true));
            createShortLink(this, input.value).then(
              (v) => {
                input.value = v;
                input.focus();
              },
              (err) => {
                const errSpan = document.createElement("span");
                errSpan.className = "shortlinkErr";
                let textContent = "An error has occurred";
                if (typeof err === "string" && err.length !== 0) textContent = err;
                else if (err?.message?.length) textContent = err.message;
                errSpan.textContent = textContent;
                input.replaceWith(errSpan);
              },
            );
          };
        }
        const curlBtn = document.createElement("button");
        popupInputButtons.push(curlBtn);
        curlBtn.innerText = "cURL";
        curlBtn.className = "sparql-editor_btn sparql-editor_btn-sm curl";
        popup.appendChild(curlBtn);
        curlBtn.onclick = () => {
          popupInputButtons.forEach((b) => (b.disabled = true));
          input.value = this.getAsCurlString();
          input.focus();
        };
        const svgPos = svgShare.getBoundingClientRect();
        popup.style.top = svgShare.offsetTop + svgPos.height + "px";
        popup.style.left = svgShare.offsetLeft + svgShare.clientWidth - popup.clientWidth + "px";
        input.focus();
      };
      shareLinkWrapper.addEventListener("click", showSharePopup);
      shareLinkWrapper.addEventListener("keydown", (e) => {
        if (e.code === "Enter") showSharePopup(e);
      });
    }

    if (this.config.showQueryButton) {
      this.queryBtn = document.createElement("button");
      addClass(this.queryBtn, "sparql-editor_queryButton");
      const queryEl = drawSvgStringAsElement(imgs.query);
      addClass(queryEl, "queryIcon");
      this.queryBtn.appendChild(queryEl);
      const warningIcon = drawSvgStringAsElement(imgs.warning);
      addClass(warningIcon, "warningIcon");
      this.queryBtn.appendChild(warningIcon);
      this.queryBtn.onclick = () => {
        if (this.config.queryingDisabled) return;
        if (this.req) this.abortQuery();
        else this.query().catch(() => {});
      };
      this.queryBtn.title = "Run query";
      this.queryBtn.setAttribute("aria-label", "Run query");
      buttons.appendChild(this.queryBtn);
      this.updateQueryButton();
    }
  }
  private updateQueryButton(status?: "valid" | "error") {
    if (!this.queryBtn) return;
    if (this.config.queryingDisabled) {
      addClass(this.queryBtn, "query_disabled");
      this.queryBtn.title = this.config.queryingDisabled;
    } else {
      removeClass(this.queryBtn, "query_disabled");
      this.queryBtn.title = "Run query";
      this.queryBtn.setAttribute("aria-label", "Run query");
    }
    if (!status) status = this.queryValid ? "valid" : "error";
    if (status !== this.queryStatus) {
      removeClass(this.queryBtn, "query_" + this.queryStatus);
      addClass(this.queryBtn, "query_" + status);
      this.queryStatus = status;
    }
    if (this.req && this.queryBtn.className.indexOf("busy") < 0) {
      this.queryBtn.className += " busy";
    }
    if (!this.req && this.queryBtn.className.indexOf("busy") >= 0) {
      this.queryBtn.className = this.queryBtn.className.replace("busy", "");
    }
  }

  /**
   * Draw the language server switcher: a labelled dropdown button (showing the active server's
   * label) that, when clicked, opens a menu listing each server with its label and a dimmed
   * description. Only drawn when two or more servers are configured.
   */
  private drawLanguageServerDropdown(buttons: HTMLElement) {
    const servers = this.config.languageServers ?? [];
    // Show the dropdown to switch servers (2+) or to expose a single server's settings panel.
    const hasConfigurable = servers.some((s) => s.configSchema && s.configCallback);
    if (servers.length < 2 && !hasConfigurable) return;
    const select = document.createElement("button");
    select.className = "sparql-editor_btn sparql-editor_lsSelect";
    select.title = "Select language server";
    select.setAttribute("aria-label", "Select language server");
    this.lsSelectEl = select;
    buttons.appendChild(select);

    let menu: HTMLDivElement | undefined;
    const closeMenu = () => {
      menu?.remove();
      menu = undefined;
    };
    const openMenu = () => {
      menu = document.createElement("div");
      menu.className = "sparql-editor_lsMenu";
      servers.forEach((s, i) => {
        const item = document.createElement("button");
        item.className = "sparql-editor_lsMenuItem" + (i === this.activeLanguageServerIndex ? " active" : "");
        const label = document.createElement("span");
        label.className = "sparql-editor_lsMenuLabel";
        label.textContent = s.label;
        item.appendChild(label);
        if (s.description) {
          const desc = document.createElement("span");
          desc.className = "sparql-editor_lsMenuDesc";
          desc.textContent = s.description;
          item.appendChild(desc);
        }
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          closeMenu();
          void this.setLanguageServer(i);
        });
        menu!.appendChild(item);
      });
      // "Configure <active server>…" only when the active server exposes a settings schema.
      const active = servers[this.activeLanguageServerIndex];
      if (active?.configSchema && active.configCallback) {
        const configItem = document.createElement("button");
        configItem.className = "sparql-editor_lsMenuItem sparql-editor_lsMenuConfigure";
        const label = document.createElement("span");
        label.className = "sparql-editor_lsMenuLabel";
        label.textContent = `Configure ${active.label}…`;
        configItem.appendChild(label);
        configItem.addEventListener("click", (e) => {
          e.stopPropagation();
          closeMenu();
          this.openLanguageServerSettings();
        });
        menu!.appendChild(configItem);
      }
      buttons.appendChild(menu);
    };
    select.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menu) closeMenu();
      else openMenu();
    });
    this.lsMenuOutsideClick = (e: MouseEvent) => {
      if (menu && e.target !== select && !menu.contains(e.target as Node)) closeMenu();
    };
    document.body.addEventListener("click", this.lsMenuOutsideClick, true);
    this.updateLanguageServerDropdown();
  }

  /** Refresh the switcher button label to reflect the active server. */
  private updateLanguageServerDropdown() {
    if (!this.lsSelectEl) return;
    const active = (this.config.languageServers ?? [])[this.activeLanguageServerIndex];
    this.lsSelectEl.textContent = active?.label ?? "Language server";
  }

  /* Resizer */
  private drawResizer() {
    if (this.resizeWrapper) return;
    this.resizeWrapper = document.createElement("div");
    addClass(this.resizeWrapper, "resizeWrapper");
    const chip = document.createElement("div");
    addClass(chip, "resizeChip");
    this.resizeWrapper.appendChild(chip);
    this.resizeWrapper.addEventListener("mousedown", this.initDrag, false);
    this.resizeWrapper.addEventListener("dblclick", this.expandEditor);
    this.rootEl.appendChild(this.resizeWrapper);
  }
  private initDrag = () => {
    document.documentElement.addEventListener("mousemove", this.doDrag, false);
    document.documentElement.addEventListener("mouseup", this.stopDrag, false);
  };
  private doDrag = (event: MouseEvent) => {
    let parentOffset = 0;
    if (this.rootEl.offsetParent) parentOffset = (this.rootEl.offsetParent as HTMLElement).offsetTop;
    let scrollOffset = 0;
    let parentEl = this.rootEl.parentElement;
    while (parentEl) {
      scrollOffset += parentEl.scrollTop;
      parentEl = parentEl.parentElement;
    }
    const newHeight = event.clientY - parentOffset - this.rootEl.offsetTop + scrollOffset;
    this.editorEl.style.height = newHeight + "px";
  };
  private stopDrag = () => {
    document.documentElement.removeEventListener("mousemove", this.doDrag, false);
    document.documentElement.removeEventListener("mouseup", this.stopDrag, false);
    this.emit("resize", this.editorEl.style.height);
    if (this.getStorageId() && this.persistentConfig) {
      this.persistentConfig.editorHeight = this.editorEl.style.height;
      this.saveQuery();
    }
    this.refresh();
  };
  public expandEditor = () => {
    this.editorEl.style.height = "100%";
  };

  /**
   * Set the editor wrapper size. Mirrors the Monaco editor's `setSize` so SparqlStudio can drive both
   * editors identically (it loads each tab's persisted height through this).
   */
  public setSize(height?: string, width?: string) {
    if (height) this.editorEl.style.height = height;
    if (width) this.rootEl.style.width = width;
    this.refresh();
  }

  /* Query lifecycle */
  public query(config?: EditorAjaxConfig) {
    if (this.config.queryingDisabled) return Promise.reject("Querying is disabled.");
    this.abortQuery();
    // Wire request emission to internal state via listeners
    const onQuery = (_y: SparqlEditor, req: Request, abort?: AbortController) => {
      this.req = req;
      this.abortController = abort;
      this.updateQueryButton();
    };
    const onResponse = (_y: SparqlEditor, _resp: any, duration: number) => {
      this.lastQueryDuration = duration;
      this.req = undefined;
      this.updateQueryButton();
      this.off("query", onQuery);
      this.off("queryResponse", onResponse);
      this.off("queryAbort", onAbort);
    };
    const onAbort = (_y: SparqlEditor) => {
      this.req = undefined;
      this.updateQueryButton();
      this.off("query", onQuery);
      this.off("queryResponse", onResponse);
      this.off("queryAbort", onAbort);
    };
    this.on("query", onQuery);
    this.on("queryResponse", onResponse);
    this.on("queryAbort", onAbort);
    return executeQuery(this, config);
  }
  public abortQuery() {
    if (this.req) {
      this.abortController?.abort();
      this.emit("queryAbort", this.req);
    }
  }
  public getAsCurlString(config?: EditorAjaxConfig): string {
    return getAsCurlString(this, config);
  }

  /** Build the SPARQL request arguments for the current query against the given request config. */
  public getUrlArguments(requestConfig: EditorAjaxConfig): RequestArgs {
    return getUrlArguments(this, requestConfig);
  }

  /* URL params */
  public getUrlParams(): queryString.ParsedQuery {
    let urlParams: queryString.ParsedQuery = {};
    if (window.location.hash.length > 1) {
      urlParams = queryString.parse(location.hash);
    }
    if ((!urlParams || !("query" in urlParams)) && window.location.search.length > 1) {
      urlParams = queryString.parse(window.location.search);
    }
    return urlParams;
  }
  public configToQueryParams(): queryString.ParsedQuery {
    const urlParams: any = window.location.hash.length > 1 ? queryString.parse(window.location.hash) : {};
    urlParams["query"] = this.getValue();
    return urlParams;
  }
  public queryParamsToConfig(params: queryString.ParsedQuery) {
    if (params && params.query && typeof params.query === "string") {
      this.setValue(params.query);
    }
  }

  /* Misc helpers preserved from old API */
  public getValueWithoutComments(): string {
    return this.getValue().replace(/#[^\n]*/g, "");
  }
  public getQueryWithValues(values: string | { [k: string]: string } | Array<{ [k: string]: string }>): string {
    if (!values) return this.getValue();
    let injectString: string;
    if (typeof values === "string") {
      injectString = values;
    } else {
      const arr = Array.isArray(values) ? values : [values];
      const vars: { [k: string]: true } = {};
      arr.forEach((v) => Object.keys(v).forEach((k) => (vars[k] = true)));
      const varArray = Object.keys(vars);
      if (!varArray.length) return this.getValue();
      injectString = "VALUES (" + varArray.join(" ") + ") {\n";
      arr.forEach((v) => {
        injectString += "( ";
        varArray.forEach((variable) => {
          injectString += (v[variable] ?? "UNDEF") + " ";
        });
        injectString += ")\n";
      });
      injectString += "}\n";
    }
    return this.getValue().replace(/(\bSELECT\b[\s\S]*?{)/i, (m) => m + "\n" + injectString);
  }
  /** @deprecated Diagnostics are provided by the language server; this flag is no longer used. */
  public setCheckSyntaxErrors(isEnabled: boolean) {
    this.config.syntaxErrorCheck = isEnabled;
  }
  public getVariablesFromQuery(): string[] {
    const set = new Set<string>();
    const re = /[?$]([A-Za-z_][\w]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.getValue())) !== null) set.add(m[1]);
    return Array.from(set).sort();
  }

  /* Notifications */
  private notificationEls: { [key: string]: HTMLDivElement } = {};
  public showNotification(key: string, message: string) {
    if (!this.notificationEls[key]) {
      const notificationContainer = document.createElement("div");
      addClass(notificationContainer, "notificationContainer");
      this.rootEl.appendChild(notificationContainer);
      this.notificationEls[key] = document.createElement("div");
      addClass(this.notificationEls[key], "notification", "notif_" + key);
      notificationContainer.appendChild(this.notificationEls[key]);
    }
    for (const id in this.notificationEls) if (id !== key) this.hideNotification(id);
    const el = this.notificationEls[key];
    addClass(el, "active");
    el.innerText = message;
  }
  public hideNotification(key: string) {
    if (this.notificationEls[key]) removeClass(this.notificationEls[key], "active");
  }
  private lsErrorNotification?: LspErrorNotification;

  /**
   * Surface language server errors in the shared bottom-right notification (see
   * `createLspErrorNotification` in `@rdfjs/sparql-utils`). SparqlEditor is language server agnostic, so
   * this only understands generic JSON-RPC: `LSPClient.request` rejects with the raw `error` object
   * of a JSON-RPC error response. The client is usually shared across tabs, so `request` is wrapped
   * only once and a per-instance notifier is kept in a listener list
   */
  private setupLanguageServerErrorNotifications(client: LSPClient) {
    const notify = (message: string) => {
      if (!this.lsErrorNotification) this.lsErrorNotification = createLspErrorNotification(this.rootEl);
      this.lsErrorNotification.show(message);
    };
    const tapped = client as LSPClient & { __yasqeErrorListeners?: ((message: string) => void)[] };
    if (tapped.__yasqeErrorListeners) {
      tapped.__yasqeErrorListeners.push(notify);
      return;
    }
    const listeners: ((message: string) => void)[] = [notify];
    tapped.__yasqeErrorListeners = listeners;
    // Expected-during-typing codes (qlue-ls uses string codes; standard LSP uses these numbers), plus
    // MethodNotFound (-32601): a server legitimately lacking an optional feature (e.g. swls has no
    // formatting / pull diagnostics) should not surface as an error popup.
    const ignoredCodes = new Set<number | string>([
      -32800,
      -32801,
      -32601,
      "RequestCancelled",
      "ContentModified",
      "MethodNotFound",
    ]);
    const original = client.request.bind(client);
    client.request = function (method: string, params: unknown) {
      return original(method, params).catch((error: any) => {
        const code = error?.code;
        const hasCode = typeof code === "number" || (typeof code === "string" && code.length > 0);
        if (hasCode && typeof error?.message === "string" && !ignoredCodes.has(code)) {
          // qlue-ls puts the detail in `message` (often a quoted blob) but it may also arrive in
          // `data`; append it so the description is surfaced either way.
          let message: string = error.message;
          if (typeof error.data === "string" && error.data && !message.includes(error.data)) {
            message += "\n" + error.data;
          }
          for (const l of listeners) l(message);
        }
        throw error;
      });
    } as typeof client.request;
  }

  /* Destroy */
  public destroy() {
    this.abortQuery();
    this.removeAllListeners();
    this.resizeWrapper?.removeEventListener("mousedown", this.initDrag, false);
    this.resizeWrapper?.removeEventListener("dblclick", this.expandEditor);
    window.removeEventListener("hashchange", this.handleHashChange);
    if (this.lsMenuOutsideClick) document.body.removeEventListener("click", this.lsMenuOutsideClick, true);
    this.cm.destroy();
    this.rootEl.remove();
  }

  /* Statics */
  static Sparql = { executeQuery, getAjaxConfig, getUrlArguments, getAcceptHeader, getAsCurlString };
  static defaults = getDefaults();
  static Autocompleters: { [name: string]: any } = {};
  static registerAutocompleter(_value: any, _enable = true): void {
    // No-op: autocomplete is now provided by the language server (see `config.languageServers`).
  }
  static forkAutocompleter(_from: string, _to: { name: string } & any, _enable = true): void {
    // No-op: autocomplete is now provided by the language server (see `config.languageServers`).
  }
  static clearStorage() {
    const storage = new YStorage(SparqlEditor.storageNamespace);
    storage.removeNamespace();
  }
}

export interface Position {
  line: number;
  ch: number;
}
export interface Token {
  start: number;
  end: number;
  string: string;
  type: string | null;
  state: { prefixes: Prefixes; queryType?: QueryType; variables?: { [k: string]: boolean } };
}

export type PartialConfig = DeepPartial<Config>;

export interface Config {
  /** Initial editor content */
  value: string;
  /** Show line numbers gutter */
  lineNumbers: boolean;
  /** Soft-wrap long lines */
  lineWrapping: boolean;
  /** Highlight the current line */
  highlightActiveLine: boolean;
  /** Show fold gutter (folds the leading PREFIX / BASE prologue block) */
  foldGutter: boolean;
  /** Highlight matching brackets */
  matchBrackets: boolean;
  /** Editor starts as read-only */
  readOnly: boolean;
  /** Editor theme. Switch at runtime with {@link SparqlEditor.setTheme}. */
  theme: "light" | "dark";
  /** @deprecated No-op. Diagnostics come from the language server (`languageServers`); SparqlEditor ships no built-in syntax checker. */
  syntaxErrorCheck: boolean;
  /** Extra CodeMirror 6 extensions (advanced) */
  extensions: Extension[];
  /**
   * Language Server Protocol integration. SparqlEditor ships no SPARQL grammar of its own, all language
   * features (highlighting, diagnostics, completion, hover, formatting) come from the server. The
   * embedder supplies each server as a Web `Worker` (the universal LS transport, identical to the
   * Monaco-based `@rdfjs/sparql-editor-monaco`, the SAME `languageServers` array works for either editor); SparqlEditor
   * builds the `LSPClient` internally and wires diagnostics + semantic-token highlighting. The first
   * is activated on load; when two or more are configured a switcher dropdown appears. qlue-ls (or
   * any SPARQL server) lives in the embedder, never in SparqlEditor's dependencies. When empty, SparqlEditor is a
   * plain text editor.
   */
  languageServers: LanguageServerDef[];
  /**
   * Optional store for language server settings panel values, keyed by server label. When provided
   * (e.g. by SparqlStudio, to persist per endpoint), it is the source of truth for pre-filling the panel
   * and re-applying settings when a server (re)starts. Pairs with the `languageServerSettingsChange`
   * event. When omitted, SparqlEditor falls back to its own local-storage persistence.
   */
  getLanguageServerSettings?: (label: string) => Record<string, unknown> | undefined;

  /** Show button to run the query */
  showQueryButton: boolean;
  /** Show resize handle below the editor */
  resizeable: boolean;
  /** Initial editor height (CSS value) */
  editorHeight: string;
  /** Disable querying (also disables the run button); the string is shown as tooltip */
  queryingDisabled: string | undefined;
  /** Pre-fold the leading PREFIX / BASE prologue block on load */
  collapsePrefixesOnLoad: boolean;
  /** Legacy autocompleter names; ignored for now */
  autocompleters: string[];
  /** Legacy hint config; ignored for now */
  hintConfig: any;

  createShareableLink: (yasqe: SparqlEditor) => string;
  createShortLink: ((yasqe: SparqlEditor, longLink: string) => Promise<string>) | undefined;
  consumeShareLink: ((yasqe: SparqlEditor) => void) | undefined | null;
  persistenceId: ((yasqe: SparqlEditor) => string) | string | undefined | null;
  persistencyExpire: number;
  requestConfig: RequestConfig<SparqlEditor> | ((yasqe: SparqlEditor) => RequestConfig<SparqlEditor>);
  pluginButtons: (() => HTMLElement[] | HTMLElement) | undefined;
  prefixCcApi: string;
}

export interface PersistentConfig {
  query: string;
  editorHeight: string;
  /** Last-applied settings panel values per language server label (flat dotted keys), so they
   * survive reloads and are re-applied to the server when it restarts. */
  languageServerSettings?: { [label: string]: Record<string, unknown> };
}

export interface HintConfig {
  [k: string]: any;
}

export default SparqlEditor;
