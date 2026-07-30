/**
 * SparqlEditor · the standalone Monaco-based SPARQL query editor.
 * @module SparqlEditor
 */
import { EventEmitter } from "events";
import { Storage as YStorage } from "@rdfjs/sparql-utils";
import * as queryString from "query-string";
import {
  drawSvgStringAsElement,
  addClass,
  removeClass,
  getPrefixesFromQuery,
  getQueryType,
  getQueryMode,
  // SPARQL request handling is shared across editors and lives in utils.
  executeQuery,
  getAjaxConfig,
  getUrlArguments,
  getAcceptHeader,
  getAsCurlString,
  createLspErrorNotification,
} from "@rdfjs/sparql-utils";
import { merge } from "lodash-es";
import type {
  DeepPartial,
  QueryType,
  RequestConfig,
  EditorAjaxConfig,
  RequestArgs,
  LspErrorNotification,
} from "@rdfjs/sparql-utils";

export type { QueryType, RequestConfig, PlainRequestConfig } from "@rdfjs/sparql-utils";

import * as imgs from "./imgs";
import getDefaults from "./defaults";
export { sparqlThemeDark, sparqlThemeLight } from "./editor/sparqlTheme";
import { MonacoVscodeApiWrapper } from "monaco-languageclient/vscodeApiWrapper";
import { LanguageClientWrapper } from "monaco-languageclient/lcwrapper";
import "./style/yasqe.css";
import "./style/buttons.css";
import type { editor } from "monaco-editor";
import { MonacoLanguageClient } from "monaco-languageclient";
export type { SparqlThemeOverrides } from "./editor/editorConfig";
export { qlueLs } from "@rdfjs/sparql-utils";
import { openSettingsPanel, unflatten, defaultsFromSchema } from "@rdfjs/sparql-utils";
import type {
  LanguageServerDef as SharedLanguageServerDef,
  LanguageServerSettingsSchema,
  LspConnection,
} from "@rdfjs/sparql-utils";
export type { LanguageServerSettingsSchema, SettingFieldSchema, LspConnection } from "@rdfjs/sparql-utils";

/** A language server made available to the Monaco-based SparqlEditor. The editor-agnostic descriptor with
 * its `yasqe` hook argument bound to this editor's {@link SparqlEditor}. Defined once in
 * `@rdfjs/sparql-utils` so the SAME object also works with `@rdfjs/sparql-editor-codemirror`. */
export type LanguageServerDef = SharedLanguageServerDef<SparqlEditor>;

/** Adapt a Monaco `MonacoLanguageClient` to the editor-agnostic {@link LspConnection} handed to
 * language server hooks. Cached per client so identity-based de-dup (e.g. qlue-ls's backend cache,
 * keyed on the connection object) keeps working across repeated hook calls. */
const lspConnections = new WeakMap<MonacoLanguageClient, LspConnection>();
function toLspConnection(client: MonacoLanguageClient): LspConnection {
  let conn = lspConnections.get(client);
  if (!conn) {
    conn = {
      sendNotification: (method, params) => void client.sendNotification(method, params as any),
      sendRequest: (method, params) => client.sendRequest(method, params as any) as Promise<any>,
    };
    lspConnections.set(client, conn);
  }
  return conn;
}

export interface SparqlEditor {
  on(
    eventName: "query",
    handler: (instance: SparqlEditor, req: Request, abortController?: AbortController) => void,
  ): this;
  off(
    eventName: "query",
    handler: (instance: SparqlEditor, req: Request, abortController?: AbortController) => void,
  ): this;
  on(eventName: "queryAbort", handler: (instance: SparqlEditor, req: Request) => void): this;
  off(eventName: "queryAbort", handler: (instance: SparqlEditor, req: Request) => void): this;
  on(eventName: "queryResponse", handler: (instance: SparqlEditor, response: any, duration: number) => void): this;
  off(eventName: "queryResponse", handler: (instance: SparqlEditor, response: any, duration: number) => void): this;
  on(eventName: "error", handler: (instance: SparqlEditor) => void): this;
  off(eventName: "error", handler: (instance: SparqlEditor) => void): this;
  on(eventName: "blur", handler: (instance: SparqlEditor) => void): this;
  off(eventName: "blur", handler: (instance: SparqlEditor) => void): this;
  on(eventName: "queryBefore", handler: (instance: SparqlEditor, config: EditorAjaxConfig) => void): this;
  off(eventName: "queryBefore", handler: (instance: SparqlEditor, config: EditorAjaxConfig) => void): this;
  on(eventName: "queryResults", handler: (instance: SparqlEditor, results: any, duration: number) => void): this;
  off(eventName: "queryResults", handler: (instance: SparqlEditor, results: any, duration: number) => void): this;
  on(eventName: "autocompletionShown", handler: (instance: SparqlEditor, widget: any) => void): this;
  off(eventName: "autocompletionShown", handler: (instance: SparqlEditor, widget: any) => void): this;
  on(eventName: "autocompletionClose", handler: (instance: SparqlEditor) => void): this;
  off(eventName: "autocompletionClose", handler: (instance: SparqlEditor) => void): this;
  on(eventName: "resize", handler: (instance: SparqlEditor, newSize: string) => void): this;
  off(eventName: "resize", handler: (instance: SparqlEditor, newSize: string) => void): this;
  on(
    eventName: "languageServerChange",
    handler: (instance: SparqlEditor, def: { label: string; description?: string }, index: number) => void,
  ): this;
  off(
    eventName: "languageServerChange",
    handler: (instance: SparqlEditor, def: { label: string; description?: string }, index: number) => void,
  ): this;
  on(eventName: string, handler: () => void): this;
}

export class SparqlEditor extends EventEmitter {
  private static storageNamespace = "triply";
  public rootEl: HTMLDivElement;
  public storage: YStorage = new YStorage(SparqlEditor.storageNamespace);
  public config: Config;
  public persistentConfig?: PersistentConfig;
  public queryValid = true;
  public lastQueryDuration?: number;
  public languageClientWrapper?: LanguageClientWrapper;
  public vscodeApi?: MonacoVscodeApiWrapper;
  public editor?: editor.IStandaloneCodeEditor;
  /** Resolves once the Monaco editor has finished initializing (rejects if init fails). */
  public ready: Promise<void>;
  /** Index of the active language server in `config.languageServers`, or -1 when none is active. */
  public activeLanguageServerIndex = -1;
  /** Disposables for the context-menu language server entries (re-created on every switch). */
  private lsMenuDisposables: { dispose(): void }[] = [];
  /** Glyph-margin diagnostic icons (mirrors model markers into the left margin) + its marker listener. */
  private diagnosticGlyphs?: editor.IEditorDecorationsCollection;
  private markerListener?: { dispose(): void };
  /** Serializes language server switches so concurrent calls (init + a restored preference) don't race. */
  private lsSwitchQueue: Promise<void> = Promise.resolve();
  /** Index of the most recently requested language server. A queued activation whose index no longer
   * matches this has been superseded (e.g. the constructor's default 0 followed by a restored
   * preference); it bails before any worker/client setup so we never start a server just to dispose it. */
  private requestedLanguageServerIndex = -1;
  /** Monaco's internal menu API, used to render the nested "Language servers" right-click submenu.
   * `undefined` = not loaded yet, `null` = unavailable (then we fall back to flat context-menu actions). Loaded once, lazily.
   */
  private lsMenuApi: { MenuRegistry: any; MenuId: any; CommandsRegistry: any; ContextKeyExpr: any } | null | undefined;
  private lsMenuApiLoading = false;
  private lsSubmenuId?: any;
  /** Dispose handle for an open settings panel, so a second open (or a server switch) closes the first. */
  private lsSettingsPanelDispose?: () => void;
  private static menuInstanceCounter = 0;
  private readonly menuInstanceId = SparqlEditor.menuInstanceCounter++;
  /** The `.sparql-editor_buttons` container; the share popup is appended to and positioned within it. */
  private buttonsEl?: HTMLDivElement;

  private req?: Request;
  private abortController?: AbortController;
  private queryStatus?: "valid" | "error";
  private queryBtn?: HTMLButtonElement;
  private resizeWrapper?: HTMLDivElement;
  /** Value requested via setValue() before the async editor finished initializing */
  private pendingValue?: string;
  /** Last height requested via setSize() */
  private currentHeight?: string;

  /**
   * Initializes the Monaco editor in the given element.
   * @param el HTMLElement to initialize the editor in
   * @param conf configuration for the editor
   */
  public async initEditor(el: HTMLElement, conf: PartialConfig = {}) {
    try {
      const { startMonacoEditor } = await import("./editor/editorConfig");
      // Language servers are provided by the consumer (yasqe is LS-agnostic). The editor is built
      // here without a server; the active language client is connected separately (see
      // setLanguageServer) so the consumer can configure several and switch between them. With none
      // configured the editor still works with Monarch syntax highlighting only.
      const result = await startMonacoEditor(
        el,
        this.config.value,
        this.config.theme,
        this.config.editorOptions,
        this.config.themes,
      );
      this.editor = result.editorApp.getEditor();
      this.vscodeApi = result.apiWrapper;

      // Apply any value set via setValue() before the editor finished initializing
      if (this.pendingValue !== undefined) {
        this.editor?.setValue(this.pendingValue);
        this.pendingValue = undefined;
      }

      const monaco = await import("monaco-editor");
      // Run the query on Cmd/Ctrl+Enter
      this.editor?.addAction({
        id: "sparql-editor-run-query",
        label: "Run SPARQL Query",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        // Show it in the right-click context menu, at the top
        contextMenuGroupId: "navigation",
        contextMenuOrder: 0,
        run: () => {
          this.query().catch(() => {}); // catch to avoid unhandled rejection
        },
      });

      // Share the query URL on Cmd/Ctrl+S (also persists the query and prevents the browser's
      // "save page" dialog). Shown in the right-click menu right under "Run SPARQL Query".
      this.editor?.addAction({
        id: "sparql-editor-share-query",
        label: "Share query URL",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        contextMenuGroupId: "navigation",
        contextMenuOrder: 1,
        run: () => {
          this.saveQuery();
          this.openSharePopup();
        },
      });

      // Register event listeners first, before setting up Monaco editor events
      this.registerEventListeners();

      // Listen for changes in the editor
      this.editor?.getModel()?.onDidChangeContent(() => {
        this.emit("change");
        this.emit("changes");
      });
      // Listen for cursor position changes
      this.editor?.onDidChangeCursorPosition(() => {
        this.emit("cursorActivity");
      });
      // Listen for blur events
      this.editor?.onDidBlurEditorText(() => {
        this.emit("blur");
      });

      // Mirror LSP diagnostics into the left glyph margin (Monaco only shows squiggles by default)
      this.setupDiagnosticGlyphs(monaco);

      // Do some post processing, init storage
      this.drawButtons();

      const storageId = this.getStorageId();
      if (storageId) {
        const persConf = this.storage.get<any>(storageId);
        if (persConf && typeof persConf === "string") {
          this.persistentConfig = { query: persConf, editorHeight: this.config.editorHeight };
        } else {
          this.persistentConfig = persConf;
        }
        if (!this.persistentConfig)
          this.persistentConfig = { query: this.getValue(), editorHeight: this.config.editorHeight };
        if (this.persistentConfig && this.persistentConfig.query) this.setValue(this.persistentConfig.query);
      }

      if (this.config.consumeShareLink) {
        this.config.consumeShareLink(this);
        window.addEventListener("hashchange", this.handleHashChange);
      }
      // Add beforeunload event to save query when tab/window changes
      window.addEventListener("beforeunload", this.handleBeforeUnload);
      // Add visibility change event to save query when tab becomes hidden
      document.addEventListener("visibilitychange", this.handleVisibilityChange);

      // Apply the editor height. A height requested before the editor was ready (e.g. a tab's
      // persisted height set via setSize()) wins over the configured default, so reloads keep
      // the user's resized height instead of snapping back to the default.
      this.setSize(this.currentHeight ?? this.persistentConfig?.editorHeight ?? this.config.editorHeight);
      if (this.config.resizeable) this.drawResizer();
    } catch (error) {
      console.error("Failed to initialize Monaco editor:", error);
      // Fallback to show error message in the element
      el.innerHTML = `<div style="color: red; padding: 10px; border: 1px solid red; background: #ffebee;">
        Error initializing SPARQL editor: ${error instanceof Error ? error.message : String(error)}
      </div>`;
      throw error;
    }
  }

  public getValue(): string {
    if (this.editor) return this.editor.getValue() || "";
    return this.pendingValue ?? this.config.value ?? "";
  }

  public setValue(newValue: string) {
    if (this.editor) {
      this.editor.setValue(newValue);
    } else {
      // Editor not ready yet, remember and apply once initEditor completes
      this.pendingValue = newValue;
    }
  }

  /** Re-layout the Monaco editor (replaces CodeMirror's refresh). */
  public refresh() {
    this.editor?.layout();
  }

  /** Focus the editor input. */
  public focus() {
    this.editor?.focus();
  }

  /**
   * Extract the PREFIX declarations from the current query as a `{ prefix: iri }` map.
   * Used by SparqlResults to resolve prefixed names in results.
   */
  public getPrefixesFromQuery(): { [prefix: string]: string } {
    return getPrefixesFromQuery(this.getValue());
  }

  /**
   * The active monaco-languageclient `LanguageClient`, or undefined if no language server is
   * active. Use it to send server-specific requests/notifications (yasqe stays LS-agnostic).
   */
  public getLanguageClient(): MonacoLanguageClient | undefined {
    return this.languageClientWrapper?.getLanguageClient?.();
  }

  /** The configured language servers, as `{ label, description }` (the switcher-facing subset). */
  public getLanguageServers(): { label: string; description?: string }[] {
    return (this.config.languageServers ?? []).map((s) => ({ label: s.label, description: s.description }));
  }

  /** Index of the active language server in `config.languageServers`, or -1 when none is active. */
  public getActiveLanguageServer(): number {
    return this.activeLanguageServerIndex;
  }

  /**
   * Notify the active language server that the endpoint changed, firing only its `onEndpointChange`
   * (with the active `LanguageClient`). SparqlStudio calls this on endpoint changes; standalone consumers
   * can call it themselves. No-op when no server is active or it defines no handler.
   */
  public notifyEndpointChange(endpoint: string): void {
    const def = this.config.languageServers?.[this.activeLanguageServerIndex];
    const client = this.getLanguageClient();
    if (def?.onEndpointChange && client && endpoint) def.onEndpointChange(toLspConnection(client), endpoint, this);
  }

  /**
   * Activate a language server by label or index. Disposes the current language client (its worker
   * is terminated), resolves and connects the target server's worker, runs its `onReady`, refreshes
   * the context-menu switcher and emits `languageServerChange`. The query/editor model is preserved.
   * Switches are serialized so concurrent calls (e.g. init + a restored preference) run in order.
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
    // Wait for the editor before touching language clients / context-menu actions.
    await this.ready.catch(() => {});
    const servers = this.config.languageServers ?? [];
    if (!servers.length) return;
    if (index !== this.requestedLanguageServerIndex) return;
    if (index === this.activeLanguageServerIndex && this.languageClientWrapper) return;
    const def = servers[index];
    // A settings panel belongs to the outgoing server; close it before switching.
    this.lsSettingsPanelDispose?.();
    this.lsSettingsPanelDispose = undefined;
    // Tear down the current client (restartOptions.keepWorker is false, so its worker is terminated)
    if (this.languageClientWrapper) {
      try {
        await this.languageClientWrapper.dispose();
      } catch (error) {
        console.warn("Failed to dispose the previous language client:", error);
      }
      this.languageClientWrapper = undefined;
    }
    // Resolve the target server's worker (instance or factory) and connect a language client to it.
    const worker = typeof def.worker === "function" ? await def.worker() : def.worker;
    if (!worker) {
      console.warn("Language server provided no worker:", def.label);
      return;
    }
    this.setupLanguageServerErrorNotifications(worker);
    const { connectLanguageClient } = await import("./editor/editorConfig");
    this.languageClientWrapper = await connectLanguageClient(worker);
    this.activeLanguageServerIndex = index;
    const client = this.getLanguageClient();
    if (client && def.onReady) def.onReady(toLspConnection(client), this);
    if (client) this.applyPersistedLanguageServerSettings(def, client);
    this.updateLanguageServerMenu();
    this.emit("languageServerChange", { label: def.label, description: def.description }, index);
  }

  // /**
  //  * Force Monaco to discard the previous language server's semantic tokens and re-pull from the now
  //  * active client. Disposing a language client does not clear the tokens it already painted, so
  //  * after a switch the old server's colors linger (and a server without semantic tokens never
  //  * clears them). Bouncing the model language to `plaintext` and back resets the model's
  //  * tokenization, which re-opens the document on the new client and re-requests its tokens (or
  //  * leaves the Monarch fallback when the new server provides none).
  //  */
  // private async refreshSemanticTokens(): Promise<void> {
  //   const model = this.editor?.getModel();
  //   if (!model) return;
  //   const languageId = model.getLanguageId();
  //   if (languageId === "plaintext") return;
  //   try {
  //     const monaco = await import("monaco-editor");
  //     monaco.editor.setModelLanguage(model, "plaintext");
  //     monaco.editor.setModelLanguage(model, languageId);
  //   } catch (error) {
  //     console.warn("Failed to refresh semantic tokens after language server switch:", error);
  //   }
  // }

  /**
   * Build the right-click "Language servers" switcher. Only shown when two or more servers are
   * configured. Renders as a nested submenu (a single "Language servers" entry that expands to the
   * right, with a native checkmark on the active server) when Monaco's internal menu API is
   * reachable; otherwise falls back to a flat list of actions.
   */
  private updateLanguageServerMenu() {
    for (const d of this.lsMenuDisposables) {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    }
    this.lsMenuDisposables = [];
    const servers = this.config.languageServers ?? [];
    if (!this.editor || servers.length < 2) return;
    if (this.lsMenuApi === undefined) {
      // Menu API not resolved yet: render the flat fallback now, then upgrade to the nested submenu
      // once the (lazy, one-time) import resolves. Subsequent calls are synchronous.
      this.buildFlatLanguageServerActions(servers);
      if (!this.lsMenuApiLoading) {
        this.lsMenuApiLoading = true;
        void this.loadMenuApi().then((api) => {
          this.lsMenuApi = api;
          this.updateLanguageServerMenu();
        });
      }
      return;
    }
    if (this.lsMenuApi) {
      try {
        this.buildLanguageServerSubmenu(this.lsMenuApi, servers);
        return;
      } catch (error) {
        console.warn("Language-server submenu unavailable, using a flat menu:", error);
      }
    }
    this.buildFlatLanguageServerActions(servers);
  }

  /** Lazily import Monaco's internal menu API (shared singleton); null when it isn't reachable. */
  private async loadMenuApi(): Promise<{
    MenuRegistry: any;
    MenuId: any;
    CommandsRegistry: any;
    ContextKeyExpr: any;
  } | null> {
    try {
      const actions: any = await import("@codingame/monaco-vscode-api/vscode/src/vs/platform/actions/common/actions");
      const commands: any =
        await import("@codingame/monaco-vscode-api/vscode/src/vs/platform/commands/common/commands");
      const contextkey: any =
        await import("@codingame/monaco-vscode-api/vscode/src/vs/platform/contextkey/common/contextkey");
      if (
        actions?.MenuRegistry &&
        actions?.MenuId?.EditorContext &&
        commands?.CommandsRegistry &&
        contextkey?.ContextKeyExpr?.true
      ) {
        return {
          MenuRegistry: actions.MenuRegistry,
          MenuId: actions.MenuId,
          CommandsRegistry: commands.CommandsRegistry,
          ContextKeyExpr: contextkey.ContextKeyExpr,
        };
      }
    } catch {
      // not reachable; caller falls back to flat actions
    }
    return null;
  }

  /** Native nested submenu in right click menu to choose language server */
  private buildLanguageServerSubmenu(
    api: { MenuRegistry: any; MenuId: any; CommandsRegistry: any; ContextKeyExpr: any },
    servers: LanguageServerDef[],
  ) {
    const { MenuRegistry, MenuId, CommandsRegistry, ContextKeyExpr } = api;
    if (!this.lsSubmenuId) this.lsSubmenuId = new MenuId(`yasqeLanguageServers_${this.menuInstanceId}`);
    const submenu = this.lsSubmenuId;
    // Parent entry under the editor context menu; its title is the category label.
    this.lsMenuDisposables.push(
      MenuRegistry.appendMenuItem(MenuId.EditorContext, {
        submenu,
        title: "Language server",
        group: "navigation",
        order: 2,
      }),
    );
    servers.forEach((s, i) => {
      const active = i === this.activeLanguageServerIndex;
      const id = `yasqe.languageServer.${this.menuInstanceId}.${i}`;
      this.lsMenuDisposables.push(
        CommandsRegistry.registerCommand(id, () => {
          this.setLanguageServer(i).catch(() => {});
        }),
      );
      this.lsMenuDisposables.push(
        MenuRegistry.appendMenuItem(submenu, {
          command: {
            id,
            title: s.description ? `${s.label}  ·  ${s.description}` : s.label,
            // A constant-true condition makes the active server render with a native checkmark.
            toggled: active ? ContextKeyExpr.true() : undefined,
          },
          group: "navigation",
          order: i,
        }),
      );
    });
    // "Configure <active server>..." only when the active server exposes a settings schema.
    const activeServer = servers[this.activeLanguageServerIndex];
    if (activeServer?.configSchema && activeServer.configCallback) {
      const configId = `yasqe.languageServer.${this.menuInstanceId}.configure`;
      this.lsMenuDisposables.push(CommandsRegistry.registerCommand(configId, () => this.openLanguageServerSettings()));
      this.lsMenuDisposables.push(
        MenuRegistry.appendMenuItem(submenu, {
          command: { id: configId, title: `Configure ${activeServer.label}…` },
          group: "zz_configure",
          order: 0,
        }),
      );
    }
  }

  /** Fallback flat list of editor actions (active marked with "· "), when the submenu API is absent. */
  private buildFlatLanguageServerActions(servers: LanguageServerDef[]) {
    servers.forEach((s, i) => {
      const active = i === this.activeLanguageServerIndex;
      const label = `${active ? "✓ " : ""}${s.label}${s.description ? "  ·  " + s.description : ""}`;
      const action = this.editor?.addAction({
        id: `sparql-editor-language-server-${i}`,
        label,
        contextMenuGroupId: "navigation",
        contextMenuOrder: 2 + i,
        run: () => {
          this.setLanguageServer(i).catch(() => {});
        },
      });
      if (action) this.lsMenuDisposables.push(action);
    });
    const activeServer = servers[this.activeLanguageServerIndex];
    if (activeServer?.configSchema && activeServer.configCallback) {
      const action = this.editor?.addAction({
        id: `sparql-editor-language-server-configure`,
        label: `Configure ${activeServer.label}…`,
        contextMenuGroupId: "navigation",
        contextMenuOrder: 2 + servers.length,
        run: () => this.openLanguageServerSettings(),
      });
      if (action) this.lsMenuDisposables.push(action);
    }
  }

  /**
   * Open the schema-driven settings panel for the active language server. No-op when no server is
   * active or it exposes no `configSchema`/`configCallback`. On Apply, the collected values are
   * de-flattened (dotted keys become nested objects) and handed to the server's `configCallback`.
   */
  public openLanguageServerSettings(): void {
    this.lsSettingsPanelDispose?.();
    this.lsSettingsPanelDispose = undefined;
    const index = this.activeLanguageServerIndex;
    const def = this.config.languageServers?.[index];
    const client = this.getLanguageClient();
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
  private applyPersistedLanguageServerSettings(def: LanguageServerDef, client: MonacoLanguageClient): void {
    if (!def.configCallback) return;
    const stored = this.getLanguageServerSettings(def.label);
    if (stored && Object.keys(stored).length) def.configCallback(toLspConnection(client), unflatten(stored));
  }

  /**
   * Switch the theme of the Monaco editor
   * @param theme - The theme to switch to ('light' or 'dark')
   */
  public async setTheme(theme: "light" | "dark"): Promise<void> {
    document.documentElement.dataset.theme = theme;
    // Classic mode: switch theme via the standalone Monaco API (themes registered in editorConfig.ts)
    try {
      const { SPARQL_THEME_DARK, SPARQL_THEME_LIGHT } = await import("./editor/editorConfig");
      const monaco = await import("monaco-editor");
      monaco.editor.setTheme(theme === "dark" ? SPARQL_THEME_DARK : SPARQL_THEME_LIGHT);
    } catch (error) {
      console.error("Failed to switch theme:", error);
    }
  }

  public getWrapperElement(): HTMLDivElement {
    return this.rootEl;
  }

  constructor(parent: HTMLElement, conf: PartialConfig = {}) {
    super();
    if (!parent) throw new Error("No parent passed as argument. Dont know where to draw YASQE");
    this.rootEl = document.createElement("div");
    this.rootEl.className = "sparql-editor";
    parent.appendChild(this.rootEl);

    // `languageServers` carry Worker instances / factory + callback functions that lodash.merge
    // would deep-clone (mangling their prototypes / identity). Assign them by reference instead.
    const rawConf = conf as any;
    const languageServers = rawConf.languageServers;
    const mergeableConf = { ...rawConf };
    delete mergeableConf.languageServers;
    this.config = merge({}, SparqlEditor.defaults, mergeableConf);
    if (languageServers) this.config.languageServers = languageServers as LanguageServerDef[];

    // Initialize the editor and then setup everything else. Exposed as `ready` so consumers can
    // await initialization; swallow here to avoid an unhandled rejection when they don't.
    this.ready = this.initEditor(this.rootEl);
    this.ready.catch(() => {});

    // Activate the first configured language server. Queued now (the activation itself waits for the
    // editor to be ready) so a later restored-preference switch is guaranteed to run after this one.
    if (this.config.languageServers?.length) void this.setLanguageServer(0);
  }

  private handleBeforeUnload = () => {
    this.saveQuery();
  };

  private handleVisibilityChange = () => {
    if (document.hidden) this.saveQuery();
  };

  private handleHashChange = () => {
    this.config.consumeShareLink?.(this);
  };
  private handleChange() {
    this.updateQueryButton();
    this.saveQuery(); // Save query on every change
  }
  private handleBlur() {
    this.saveQuery();
  }
  private handleChanges() {
    // e.g. handle blur
    this.updateQueryButton();
    this.saveQuery();
  }
  private handleCursorActivity() {
    // this.autocomplete(true);
  }
  private handleQuery(_yasqe: SparqlEditor, req: Request, abortController?: AbortController) {
    this.req = req;
    this.abortController = abortController;
    this.updateQueryButton();
  }
  private handleQueryResponse(_yasqe: SparqlEditor, _response: any, duration: number) {
    this.lastQueryDuration = duration;
    this.req = undefined;
    this.updateQueryButton();
  }
  private handleQueryAbort(_yasqe: SparqlEditor, _req: Request) {
    this.req = undefined;
    this.updateQueryButton();
  }

  private registerEventListeners() {
    /**
     * Register listeners
     */
    this.on("change", this.handleChange);
    this.on("blur", this.handleBlur);
    this.on("changes", this.handleChanges);
    this.on("cursorActivity", this.handleCursorActivity);

    this.on("query", this.handleQuery);
    this.on("queryResponse", this.handleQueryResponse);
    this.on("queryAbort", this.handleQueryAbort);
  }

  private unregisterEventListeners() {
    this.off("change" as any, this.handleChange);
    this.off("blur", this.handleBlur);
    this.off("changes" as any, this.handleChanges);
    this.off("cursorActivity" as any, this.handleCursorActivity);

    this.off("query", this.handleQuery);
    this.off("queryResponse", this.handleQueryResponse);
    this.off("queryAbort", this.handleQueryAbort);
  }
  /**
   * Emit an event, always passing this SparqlEditor instance as the first argument to listeners
   * (matches the documented `on(event, (instance, ...data) => ...)` API). So callers emit only the
   * payload, e.g. `this.emit("queryResponse", response, duration)`.
   */
  public emit(event: string | symbol, ...data: any[]): boolean {
    return super.emit(event, this, ...data);
  }

  public getStorageId(getter?: Config["persistenceId"]): string | undefined {
    const persistenceId = getter || this.config.persistenceId;
    if (!persistenceId) return undefined;
    if (typeof persistenceId === "string") return persistenceId;
    return persistenceId(this);
  }
  /**
   * Open the "share query" popup (link input + Shorten/cURL buttons). Triggered from the right-click
   * menu / Cmd+Ctrl+S, since the Monaco editor has no share button. No-op without `createShareableLink`.
   */
  public openSharePopup() {
    const buttons = this.buttonsEl;
    if (!this.config.createShareableLink || !buttons) return;
    // Toggle: a second invocation closes an open popup.
    const existing = buttons.querySelector(".sparql-editor_sharePopup");
    if (existing) {
      existing.remove();
      return;
    }
    let popup: HTMLDivElement | undefined = document.createElement("div");
    popup.className = "sparql-editor_sharePopup";
    buttons.appendChild(popup);
    document.body.addEventListener(
      "click",
      (event) => {
        if (popup && event.target !== popup && !popup.contains(<any>event.target)) {
          popup.remove();
          popup = undefined;
        }
      },
      true,
    );
    const input = document.createElement("input");
    input.type = "text";
    input.value = this.config.createShareableLink(this);
    input.onfocus = function () {
      input.select();
    };
    // Work around Chrome's little problem
    input.onmouseup = function () {
      return false;
    };

    const inputWrapper = document.createElement("div");
    inputWrapper.className = "inputWrapper";
    inputWrapper.appendChild(input);
    popup.appendChild(inputWrapper);

    // We need to track which buttons are drawn here since the two implementations don't play nice together
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
        popupInputButtons.forEach((button) => (button.disabled = true));
        createShortLink(this, input.value).then(
          (value) => {
            input.value = value;
            input.focus();
          },
          (err) => {
            const errSpan = document.createElement("span");
            errSpan.className = "shortlinkErr";
            let textContent = "An error has occurred";
            if (typeof err === "string" && err.length !== 0) {
              textContent = err;
            } else if (err.message && err.message.length !== 0) {
              textContent = err.message;
            }
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
      popupInputButtons.forEach((button) => (button.disabled = true));
      input.value = this.getAsCurlString();
      input.focus();
      popup?.appendChild(curlBtn);
    };

    // Position below the buttons row, right-aligned to it (anchor on the query button when present).
    const anchor: HTMLElement = this.queryBtn ?? buttons;
    popup.style.top = anchor.offsetTop + anchor.offsetHeight + "px";
    popup.style.left = anchor.offsetLeft + anchor.clientWidth - popup.clientWidth + "px";
    input.focus();
  }

  private drawButtons() {
    const buttons = document.createElement("div");
    buttons.className = "sparql-editor_buttons";
    this.buttonsEl = buttons;
    this.getWrapperElement().appendChild(buttons);

    if (this.config.pluginButtons) {
      const pluginButtons = this.config.pluginButtons();
      if (!pluginButtons) return;
      if (Array.isArray(pluginButtons)) {
        for (const button of pluginButtons) {
          buttons.append(button);
        }
      } else {
        buttons.appendChild(pluginButtons);
      }
    }

    /**
     * Draw query btn
     */
    if (this.config.showQueryButton) {
      this.queryBtn = document.createElement("button");
      addClass(this.queryBtn, "sparql-editor_queryButton");

      /**
       * Add busy/valid/error btns
       */
      const queryEl = drawSvgStringAsElement(imgs.query);
      addClass(queryEl, "queryIcon");
      this.queryBtn.appendChild(queryEl);

      const warningIcon = drawSvgStringAsElement(imgs.warning);
      addClass(warningIcon, "warningIcon");
      this.queryBtn.appendChild(warningIcon);

      this.queryBtn.onclick = () => {
        if (this.config.queryingDisabled) return; // Don't do anything
        if (this.req) {
          this.abortQuery();
        } else {
          this.query().catch(() => {}); //catch this to avoid unhandled rejection
        }
      };
      this.queryBtn.title = "Run query";
      this.queryBtn.setAttribute("aria-label", "Run query");

      buttons.appendChild(this.queryBtn);
      this.updateQueryButton();
    }
  }
  private drawResizer() {
    if (this.resizeWrapper) return;
    this.resizeWrapper = document.createElement("div");
    addClass(this.resizeWrapper, "resizeWrapper");
    const chip = document.createElement("div");
    addClass(chip, "resizeChip");
    this.resizeWrapper.appendChild(chip);
    this.resizeWrapper.addEventListener("mousedown", this.initDrag.bind(this), false);
    this.resizeWrapper.addEventListener("dblclick", this.expandEditor.bind(this));
    this.rootEl.appendChild(this.resizeWrapper);
  }
  private boundDoDrag = (event: MouseEvent) => this.doDrag(event);
  private boundStopDrag = () => this.stopDrag();
  private initDrag(event: MouseEvent) {
    event.preventDefault();
    document.documentElement.addEventListener("mousemove", this.boundDoDrag, false);
    document.documentElement.addEventListener("mouseup", this.boundStopDrag, false);
  }
  private calculateDragOffset(event: MouseEvent, rootEl: HTMLElement) {
    const rect = rootEl.getBoundingClientRect();
    return event.clientY - rect.top;
  }
  private doDrag(event: MouseEvent) {
    event.preventDefault();
    const newHeight = this.calculateDragOffset(event, this.rootEl);
    const minHeight = 100; // Minimum height in pixels
    const maxHeight = window.innerHeight - 100; // Maximum height
    const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
    this.getWrapperElement().style.height = constrainedHeight + "px";
    // Resize the Monaco editor to fit the new container size
    if (this.editor) {
      this.editor.layout();
    }
  }
  private stopDrag() {
    document.documentElement.removeEventListener("mousemove", this.boundDoDrag, false);
    document.documentElement.removeEventListener("mouseup", this.boundStopDrag, false);
    this.emit("resize", this.getWrapperElement().style.height);
    if (this.getStorageId() && this.persistentConfig) {
      // If there is no storage id there is no persistency wanted
      this.persistentConfig.editorHeight = this.getWrapperElement().style.height;
      this.saveQuery();
    }
    // Refresh the editor to make sure the 'hidden' lines are rendered
    if (this.editor) {
      this.editor.layout();
    }
  }

  private updateQueryButton(status?: "valid" | "error") {
    if (!this.queryBtn) return;

    /**
     * Set query status (valid vs invalid)
     */
    if (this.config.queryingDisabled) {
      addClass(this.queryBtn, "query_disabled");
      this.queryBtn.title = this.config.queryingDisabled;
    } else {
      removeClass(this.queryBtn, "query_disabled");
      this.queryBtn.title = "Run query";
      this.queryBtn.setAttribute("aria-label", "Run query");
    }
    if (!status) {
      status = this.queryValid ? "valid" : "error";
    }
    if (status != this.queryStatus) {
      //reset query status classnames
      removeClass(this.queryBtn, "query_" + this.queryStatus);
      addClass(this.queryBtn, "query_" + status);
      this.queryStatus = status;
    }

    /**
     * Set/remove spinner if needed
     */
    if (this.req && this.queryBtn.className.indexOf("busy") < 0) {
      this.queryBtn.className = this.queryBtn.className += " busy";
    }
    if (!this.req && this.queryBtn.className.indexOf("busy") >= 0) {
      this.queryBtn.className = this.queryBtn.className.replace("busy", "");
    }
  }
  public handleLocalStorageQuotaFull(_e: any) {
    console.warn("Localstorage quota exceeded. Clearing all queries");
    SparqlEditor.clearStorage();
  }

  public saveQuery() {
    const storageId = this.getStorageId();
    if (!storageId || !this.persistentConfig) return;
    this.persistentConfig.query = this.getValue();
    this.storage.set(storageId, this.persistentConfig, this.config.persistencyExpire, this.handleLocalStorageQuotaFull);
  }

  /**
   * Detect the SPARQL query form by scanning the query text. Comments and the PREFIX/BASE prologue
   * are skipped so the first real keyword (SELECT, CONSTRUCT, INSERT, ...) is what's matched.
   * Defaults to "SELECT" when nothing matches (e.g. an empty or still-typed query).
   */
  public getQueryType(): QueryType {
    // Defaults to "SELECT" when nothing matches (e.g. an empty or still-typed query).
    return getQueryType(this.getValue()) ?? "SELECT";
  }
  public getQueryMode(): "update" | "query" {
    return getQueryMode(this.getQueryType());
  }

  /**
   * Notification management
   */
  private notificationEls: { [key: string]: HTMLDivElement } = {};
  private lsErrorNotification?: LspErrorNotification;

  /**
   * Surface language server errors in the shared bottom-right notification (see
   * `createLspErrorNotification` in `@rdfjs/sparql-utils`). SparqlEditor is language server agnostic, so
   * this only understands generic JSON-RPC: any server->client message carrying an `error` (i.e. a
   * JSON-RPC error response) is shown. Transient errors (request cancelled / content modified) are
   * ignored. The qlue-ls helpers send no `window/showMessage`, so this is the only channel through
   * which its errors (e.g. "No Backend defined") reach the user.
   */
  private setupLanguageServerErrorNotifications(worker: Worker) {
    // Expected-during-typing codes (qlue-ls uses string codes; standard LSP uses these numbers).
    const ignoredCodes = new Set<number | string>([-32800, -32801, "RequestCancelled", "ContentModified"]);
    worker.addEventListener("message", (event: MessageEvent) => {
      let data: any = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const error = data?.error;
      const code = error?.code;
      const hasCode = typeof code === "number" || (typeof code === "string" && code.length > 0);
      if (!error || !hasCode || typeof error.message !== "string" || ignoredCodes.has(code)) return;
      // qlue-ls puts the detail in `message` (often with a quoted blob) but it may also arrive in `data`
      let message: string = error.message;
      if (typeof error.data === "string" && error.data && !message.includes(error.data)) {
        message += "\n" + error.data;
      }
      if (!this.lsErrorNotification) this.lsErrorNotification = createLspErrorNotification(this.rootEl);
      this.lsErrorNotification.show(message);
    });
  }

  /**
   * Shows notification
   * @param key reference to the notification
   * @param message the message to display
   */
  public showNotification(key: string, message: string) {
    if (!this.notificationEls[key]) {
      // We create one wrapper for each notification, since there is no interactivity with the container (yet) we don't need to keep a reference
      const notificationContainer = document.createElement("div");
      addClass(notificationContainer, "notificationContainer");
      this.getWrapperElement().appendChild(notificationContainer);

      // Create the actual notification element
      this.notificationEls[key] = document.createElement("div");
      addClass(this.notificationEls[key], "notification", "notif_" + key);
      notificationContainer.appendChild(this.notificationEls[key]);
    }
    // Hide others
    for (const notificationId in this.notificationEls) {
      if (notificationId !== key) this.hideNotification(notificationId);
    }
    const el = this.notificationEls[key];
    addClass(el, "active");
    el.innerText = message;
  }
  /**
   * Hides notification
   * @param key the identifier of the notification to hide
   */
  public hideNotification(key: string) {
    if (this.notificationEls[key]) {
      removeClass(this.notificationEls[key], "active");
    }
  }

  /**
   * Querying
   */
  public query(config?: EditorAjaxConfig) {
    if (this.config.queryingDisabled) return Promise.reject("Querying is disabled.");
    // Abort previous request
    this.abortQuery();
    return executeQuery(this, config);
  }

  public getUrlParams() {
    //first try hash
    let urlParams: queryString.ParsedQuery = {};
    if (window.location.hash.length > 1) {
      //firefox does some decoding if we're using window.location.hash (e.g. the + sign in contentType settings)
      //Don't want this. So simply get the hash string ourselves
      urlParams = queryString.parse(location.hash);
    }
    if ((!urlParams || !("query" in urlParams)) && window.location.search.length > 1) {
      //ok, then just try regular url params
      urlParams = queryString.parse(window.location.search);
    }
    return urlParams;
  }

  public configToQueryParams(): queryString.ParsedQuery {
    //extend existing link, so first fetch current arguments
    let urlParams: queryString.ParsedQuery = {};
    if (window.location.hash.length > 1) urlParams = queryString.parse(window.location.hash);
    urlParams["query"] = this.getValue();
    return urlParams;
  }

  public queryParamsToConfig(params: queryString.ParsedQuery) {
    if (params && params.query && typeof params.query === "string") {
      this.setValue(params.query);
    }
  }

  public getAsCurlString(config?: EditorAjaxConfig): string {
    return getAsCurlString(this, config);
  }

  /** Build the SPARQL request arguments for the current query against the given request config. */
  public getUrlArguments(requestConfig: EditorAjaxConfig): RequestArgs {
    return getUrlArguments(this, requestConfig as any);
  }

  public abortQuery() {
    if (this.req) {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.emit("queryAbort", this.req);
    }
  }

  public expandEditor() {
    this.setSize("60vh", "100%");
  }

  public setSize(height?: string, width?: string) {
    if (height) {
      this.currentHeight = height;
      this.getWrapperElement().style.height = height;
    }
    if (width) this.getWrapperElement().style.width = width;
    // Resize the Monaco editor to fit the new container size
    if (this.editor) this.editor.layout();
  }

  /**
   * Mirror the model's LSP diagnostics into the left glyph margin as severity icons. Monaco renders
   * markers only as inline squiggles (the overview ruler is disabled here), so there is no gutter
   * cue by default. Keeps one icon per line, using the most severe diagnostic on that line and
   * collecting every message on it as the hover.
   */
  private setupDiagnosticGlyphs(monaco: typeof import("monaco-editor")) {
    const ed = this.editor;
    const model = ed?.getModel();
    if (!ed || !model) return;
    this.diagnosticGlyphs = ed.createDecorationsCollection();
    const severityClass: Record<number, string> = {
      [monaco.MarkerSeverity.Error]: "sparql-editor-glyph-error",
      [monaco.MarkerSeverity.Warning]: "sparql-editor-glyph-warning",
      [monaco.MarkerSeverity.Info]: "sparql-editor-glyph-info",
      [monaco.MarkerSeverity.Hint]: "sparql-editor-glyph-info",
    };
    const refresh = () => {
      const byLine = new Map<number, { severity: number; messages: string[] }>();
      for (const m of monaco.editor.getModelMarkers({ resource: model.uri })) {
        const entry = byLine.get(m.startLineNumber);
        if (!entry) byLine.set(m.startLineNumber, { severity: m.severity, messages: [m.message] });
        else {
          entry.messages.push(m.message);
          if (m.severity > entry.severity) entry.severity = m.severity;
        }
      }
      const decorations: editor.IModelDeltaDecoration[] = [];
      for (const [line, { severity, messages }] of byLine) {
        decorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            glyphMarginClassName: severityClass[severity] ?? "sparql-editor-glyph-info",
            glyphMarginHoverMessage: messages.map((value) => ({ value })),
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }
      this.diagnosticGlyphs?.set(decorations);
    };
    refresh();
    // onDidChangeMarkers fires with the affected resource URIs; refresh when ours is among them.
    this.markerListener = monaco.editor.onDidChangeMarkers((uris) => {
      if (uris.some((u) => u.toString() === model.uri.toString())) refresh();
    });
  }

  public destroy() {
    // Abort running query
    this.markerListener?.dispose();
    this.diagnosticGlyphs?.clear();
    this.abortQuery();
    this.unregisterEventListeners();
    this.resizeWrapper?.removeEventListener("mousedown", this.initDrag.bind(this), false);
    this.resizeWrapper?.removeEventListener("dblclick", this.expandEditor.bind(this));
    // Clean up any remaining drag listeners
    document.documentElement.removeEventListener("mousemove", this.doDrag.bind(this), false);
    document.documentElement.removeEventListener("mouseup", this.stopDrag.bind(this), false);
    window.removeEventListener("hashchange", this.handleHashChange);
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.rootEl.remove();
  }

  /**
   * Statics
   */
  static Sparql = { executeQuery, getAjaxConfig, getUrlArguments, getAcceptHeader, getAsCurlString };
  static clearStorage() {
    const storage = new YStorage(SparqlEditor.storageNamespace);
    storage.removeNamespace();
  }
  static defaults = getDefaults();
}

export type PartialConfig = DeepPartial<Config>;
export interface Config {
  /** Initial query value. */
  value: string;
  /**
   * Show a button with which users can create a link to this query. Set this value to null to disable this functionality.
   * By default, this feature is enabled, and the only the query value is appended to the link.
   * ps. This function should return an object which is parseable by jQuery.param (http://api.jquery.com/jQuery.param/)
   */
  createShareableLink: (yasqe: SparqlEditor) => string;
  createShortLink: ((yasqe: SparqlEditor, longLink: string) => Promise<string>) | undefined;
  consumeShareLink: ((yasqe: SparqlEditor) => void) | undefined | null;
  /**
   * Change persistency settings for the YASQE query value. Setting the values
   * to null, will disable persistancy: nothing is stored between browser
   * sessions Setting the values to a string (or a function which returns a
   * string), will store the query in localstorage using the specified string.
   * By default, the ID is dynamically generated using the closest dom ID, to avoid collissions when using multiple YASQE items on one
   * page
   */
  persistenceId: ((yasqe: SparqlEditor) => string) | string | undefined | null;
  persistencyExpire: number; //seconds
  showQueryButton: boolean;
  requestConfig: RequestConfig<SparqlEditor> | ((yasqe: SparqlEditor) => RequestConfig<SparqlEditor>);
  pluginButtons: (() => HTMLElement[] | HTMLElement) | undefined;
  resizeable: boolean;
  editorHeight: string;
  queryingDisabled: string | undefined; // The string will be the message displayed when hovered
  theme: "light" | "dark";
  /**
   * Custom Monaco editor options (IStandaloneEditorConstructionOptions), deep-merged over yasqe defaults.
   * Use this to fully configure the editor, e.g. `{ lineNumbers: "off", wordWrap: "on",
   * fontSize: 16, minimap: { enabled: true } }`.
   */
  editorOptions: Record<string, any>;
  /**
   * Custom SPARQL theme overrides, deep-merged over the built-in light/dark themes. Use this to
   * tweak editor colors, e.g. `{ dark: { colors: { "editor.background": "#000" } },
   * light: { semanticTokenColors: { keyword: "#005" } } }`.
   */
  themes: { light?: Record<string, any>; dark?: Record<string, any> };
  /**
   * The language servers the consumer makes available (yasqe is language server agnostic). The
   * first is activated on load; when two or more are configured a switcher appears in the editor's
   * right-click context menu. Servers are started lazily (the worker is resolved only when a server
   * is first activated). When empty, the editor runs with Monarch syntax highlighting only.
   */
  languageServers: LanguageServerDef[];
  /**
   * Optional consumer-owned store for language server settings panel values, keyed by server label.
   * When provided (e.g. by SparqlStudio, which persists them globally per server), it is the source of
   * truth for pre-filling the settings panel and re-applying settings when a server (re)starts.
   * Pairs with the `languageServerSettingsChange` event emitted when the user applies settings. When
   * omitted, yasqe falls back to its own local-storage persistence.
   */
  getLanguageServerSettings?: (label: string) => Record<string, unknown> | undefined;
}

export interface PersistentConfig {
  query: string;
  editorHeight: string;
  /** Last-applied settings panel values per language server label (flat dotted keys), so they
   * survive reloads and are re-applied to the server when it restarts. */
  languageServerSettings?: { [label: string]: Record<string, unknown> };
}

export default SparqlEditor;
