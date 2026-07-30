/**
 * SparqlStudio · the full SPARQL app (editor + results + endpoint/tab management).
 * @module SparqlStudio
 */
import { EventEmitter } from "events";
import { merge, find, isEqual } from "lodash-es";
import initializeDefaults from "./defaults";
import PersistentConfig from "./PersistentConfig";
import { default as Tab, PersistedJson as PersistedTabJson } from "./Tab";

import { EndpointSelectConfig, CatalogueItem } from "./endpointSelect";
import * as shareLink from "./linkUtils";
import TabElements from "./TabElements";
import { default as SparqlResults, Config as SparqlResultsConfig } from "@rdfjs/sparql-results";
import { addClass, removeClass } from "@rdfjs/sparql-utils";
import type { DeepPartial, IEditor, SparqlEditorFactory, RequestConfig } from "@rdfjs/sparql-utils";
import "./index.scss";
import "./darkmode.css";
import "@rdfjs/sparql-results/src/scss/global.scss";
if (window) {
  //We're storing the results class as a member of SparqlStudio, but _also_ in the window.
  //The `Yasr` name is kept for compatibility so existing Yasr plugins can register themselves to
  //both `SparqlStudio.Yasr` and the `window.Yasr` global without changes.
  if (SparqlResults) (window as any).Yasr = SparqlResults;
}
export type YasguiRequestConfig = Omit<RequestConfig<SparqlStudio>, "adjustQueryBeforeRequest"> & {
  adjustQueryBeforeRequest: RequestConfig<any>["adjustQueryBeforeRequest"];
};
export interface Config<EndpointObject extends CatalogueItem = CatalogueItem> {
  /**
   * Autofocus yasqe on load or tab switch
   */
  autofocus: boolean;
  endpointInfo: ((tab?: Tab) => Element) | undefined;
  copyEndpointOnNewTab: boolean;
  tabName: string;
  corsProxy: string | undefined;
  endpointCatalogueOptions: EndpointSelectConfig<EndpointObject>;
  //The function allows us to modify the config before we pass it on to a tab
  populateFromUrl: boolean | ((configFromUrl: PersistedTabJson) => PersistedTabJson);
  autoAddOnInit: boolean;
  persistenceId: ((sparqlStudio: SparqlStudio) => string) | string | null;
  persistenceLabelConfig: string;
  persistenceLabelResponse: string;
  persistencyExpire: number;
  /**
   * The editor factory. SparqlStudio is editor-independent: the consumer imports an editor
   * (e.g. `@rdfjs/sparql-editor-monaco` for Monaco or `@rdfjs/sparql-editor-codemirror` for CodeMirror 6) and supplies
   * a factory that builds it into `parent`, given the per-tab config SparqlStudio injects. Wire any
   * editor-specific options (theme, language server, ...) inside the factory:
   *   editor: (parent, conf) => new SparqlEditor(parent, { ...conf, lsp: { client } })
   */
  editor: SparqlEditorFactory;
  results: SparqlResultsConfig;
  requestConfig: YasguiRequestConfig;
  contextMenuContainer: HTMLElement | undefined;
  nonSslDomain?: string;
  /**
   * Called whenever the active SPARQL endpoint changes (on load, tab switch, or endpoint edit),
   * with this SparqlStudio instance and the new endpoint. Defined once here, it applies to every tab.
   * Typical use: configure the language server for that endpoint, e.g.
   *   onEndpointChange: (sparqlStudio, endpoint) => myConfigureBackend(sparqlStudio.editor?.getLanguageClient(), endpoint)
   */
  onEndpointChange?: (sparqlStudio: SparqlStudio, endpoint: string) => void;
}
export type PartialConfig = DeepPartial<Config>;

export type TabJson = PersistedTabJson;

export interface SparqlStudio {
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  on(event: "tabSelect", listener: (instance: SparqlStudio, newTabId: string) => void): this;
  emit(event: "tabSelect", instance: SparqlStudio, newTabId: string): boolean;
  on(event: "tabClose", listener: (instance: SparqlStudio, tab: Tab) => void): this;
  emit(event: "tabClose", instance: SparqlStudio, tab: Tab): boolean;
  on(event: "query", listener: (instance: SparqlStudio, tab: Tab) => void): this;
  emit(event: "query", instance: SparqlStudio, tab: Tab): boolean;
  on(event: "queryBefore", listener: (instance: SparqlStudio, tab: Tab) => void): this;
  emit(event: "queryBefore", instance: SparqlStudio, tab: Tab): boolean;
  on(event: "queryAbort", listener: (instance: SparqlStudio, tab: Tab) => void): this;
  emit(event: "queryAbort", instance: SparqlStudio, tab: Tab): boolean;
  on(event: "queryResponse", listener: (instance: SparqlStudio, tab: Tab) => void): this;
  emit(event: "queryResponse", instance: SparqlStudio, tab: Tab): boolean;
  on(event: "tabChange", listener: (instance: SparqlStudio, tab: Tab) => void): this;
  emit(event: "tabChange", instance: SparqlStudio, tab: Tab): boolean;
  on(event: "tabAdd", listener: (instance: SparqlStudio, newTabId: string) => void): this;
  emit(event: "tabAdd", instance: SparqlStudio, newTabId: string): boolean;
  on(event: "tabOrderChanged", listener: (instance: SparqlStudio, tabList: string[]) => void): this;
  emit(event: "tabOrderChanged", instance: SparqlStudio, tabList: string[]): boolean;
  on(event: "fullscreen-enter", listener: (instance: SparqlStudio) => void): this;
  emit(event: "fullscreen-enter", instance: SparqlStudio): boolean;
  on(event: "fullscreen-leave", listener: (instance: SparqlStudio) => void): this;
  emit(event: "fullscreen-leave", instance: SparqlStudio): boolean;
  on(event: "endpointHistoryChange", listener: (instance: SparqlStudio, history: string[]) => void): this;
  emit(event: "endpointHistoryChange", instance: SparqlStudio, history: string[]): boolean;
  on(event: "autocompletionShown", listener: (instance: SparqlStudio, tab: Tab, widget: any) => void): this;
  emit(event: "autocompletionShown", instance: SparqlStudio, tab: Tab, widget: any): boolean;
  on(event: "autocompletionClose", listener: (instance: SparqlStudio, tab: Tab) => void): this;
  emit(event: "autocompletionClose", instance: SparqlStudio, tab: Tab): boolean;
}
export class SparqlStudio extends EventEmitter {
  public rootEl: HTMLDivElement;
  public tabElements: TabElements;
  public _tabs: { [tabId: string]: Tab } = {};
  public tabPanelsEl: HTMLDivElement;
  public config: Config;
  public persistentConfig: PersistentConfig;
  // Single shared editor instance, built by the consumer-supplied `config.editor` factory.
  // Tabs share this instance and swap its content/endpoint on activation via syncEditorsWithTab.
  public editor: IEditor | undefined;
  private yasqeWrapperEl: HTMLDivElement | undefined;
  // The tab that initiated the in-flight query, so async query events route back to it even if the
  // user switches tabs in the meantime
  private queryingTab: Tab | undefined;
  // True while we programmatically restore a per-endpoint language server preference,
  // so the resulting languageServerChange event isn't persisted back (redundant write)
  private applyingStoredLs = false;
  public static Tab = Tab;

  constructor(parent: HTMLElement, config: PartialConfig = {}) {
    super();
    if (!parent) throw new Error("No parent passed as argument. Dont know where to draw SparqlStudio");
    this.rootEl = document.createElement("div");
    addClass(this.rootEl, "sparql-studio");
    parent.appendChild(this.rootEl);

    this.config = merge({}, SparqlStudio.defaults, config);
    this.persistentConfig = new PersistentConfig(this);

    this.tabElements = new TabElements(this);
    this.tabPanelsEl = document.createElement("div");

    this.rootEl.appendChild(this.tabElements.drawTabsList());
    this.rootEl.appendChild(this.tabPanelsEl);
    // Create the single shared Monaco editor before any tab is drawn/shown.
    this.initGlobalEditor();
    let executeIdAfterInit: string | undefined;
    let optionsFromUrl: PersistedTabJson | undefined;
    if (this.config.populateFromUrl) {
      optionsFromUrl = shareLink.getConfigFromUrl(Tab.getDefaults(this));
      if (optionsFromUrl) {
        const tabId = this.findTabIdForConfig(optionsFromUrl);
        if (tabId) {
          // when a config is already present,
          const persistentYasr = this.persistentConfig.getTab(tabId).results;
          this.persistentConfig.getTab(tabId).results = {
            // Override the settings
            settings: optionsFromUrl.results.settings,
            // Keep the old response to save data/time
            response: persistentYasr.response,
          };
          this.persistentConfig.setActive(tabId);
          if (!persistentYasr.response) {
            //we did have a tab already open for this link, but there wasnt a response
            //probably, it's too large to put in local storage
            //so, lets make sure we execute the query
            executeIdAfterInit = tabId;
          }
        } else {
          this.persistentConfig.setTab(
            optionsFromUrl.id,
            typeof this.config.populateFromUrl === "function"
              ? this.config.populateFromUrl(optionsFromUrl)
              : optionsFromUrl,
          );
          executeIdAfterInit = optionsFromUrl.id;
        }
      }
    }
    const tabs = this.persistentConfig.getTabs();
    if (!tabs.length && this.config.autoAddOnInit) {
      const newTab = this.addTab(true);
      this.persistentConfig.setActive(newTab.getId());
      this.emit("tabChange", this, newTab);
    } else {
      for (const tabId of tabs) {
        this._tabs[tabId] = new Tab(this, this.persistentConfig.getTab(tabId));
        this._registerTabListeners(this._tabs[tabId]);
        // this.tabs[tabId].on("close", tab => this.closeTabId(tab.getId()));
        this.tabElements.drawTab(tabId);
      }
      const activeTabId = this.persistentConfig.getActiveId();
      if (activeTabId) {
        this.markTabSelected(activeTabId);
        if (executeIdAfterInit && executeIdAfterInit === activeTabId) {
          (this.getTab(activeTabId) as Tab).query().catch(() => {});
        }
        // }
      }
    }
  }
  /** Build the single shared editor (via the consumer factory) and route its events to the active tab. */
  private initGlobalEditor() {
    if (typeof this.config.editor !== "function") {
      throw new Error(
        "SparqlStudio is editor-independent: import an editor (e.g. @rdfjs/sparql-editor-monaco or @rdfjs/sparql-editor-codemirror) and " +
          "pass it as the `editor` factory, e.g. new SparqlStudio(el, { editor: (parent, conf) => new SparqlEditor(parent, conf) })",
      );
    }
    this.yasqeWrapperEl = document.createElement("div");
    // Per-tab config SparqlStudio injects into the editor. Editor-specific options (theme, language
    // server, ...) are the consumer's responsibility, wired inside their factory.
    const yasqeConf = {
      persistenceId: null, // sparqlStudio handles persistent storing, per tab
      consumeShareLink: null, // handled by the parent sparqlStudio instance, not yasqe
      createShareableLink: () => this.getActiveTab()?.getShareableLink() || "",
      requestConfig: () => (this.getActiveTab()?.getProcessedRequestConfig() ?? {}) as any,
      // SparqlStudio owns language server settings persistence (one set per server, shared across tabs).
      getLanguageServerSettings: (label: string) => this.persistentConfig.getLanguageServerSettings(label),
    };
    this.editor = this.config.editor(this.yasqeWrapperEl, yasqeConf);
    this.setupGlobalEditorListeners();
  }

  /** Notify the consumer that the active endpoint changed (single SparqlStudio-level hook for all tabs). */
  public emitEndpointChange(endpoint: string) {
    if (!endpoint) return;
    this.config.onEndpointChange?.(this, endpoint);
    const switching = this.applyStoredLanguageServer(endpoint);
    // When we switch servers, the new server's `onReady` already configures it for this endpoint;
    // otherwise fire the active server's per-entry `onEndpointChange` hook.
    if (!switching) this.editor?.notifyEndpointChange?.(endpoint);
  }

  /**
   * Apply the stored per-endpoint language server preference to the shared editor, if any.
   * Returns true when it triggered a switch to a *different* server.
   */
  private applyStoredLanguageServer(endpoint: string): boolean {
    const yasqe = this.editor;
    if (!yasqe?.setLanguageServer || !yasqe.getLanguageServers) return false;
    const label = this.persistentConfig.getLanguageServerForEndpoint(endpoint);
    if (!label) return false;
    const servers = yasqe.getLanguageServers();
    // Only switch if that server is configured and is not already the active one.
    if (!servers.some((s) => s.label === label)) return false;
    const activeIdx = yasqe.getActiveLanguageServer?.() ?? -1;
    if (activeIdx >= 0 && servers[activeIdx]?.label === label) return false;
    this.applyingStoredLs = true;
    void Promise.resolve(yasqe.setLanguageServer(label)).finally(() => {
      this.applyingStoredLs = false;
    });
    return true;
  }

  private setupGlobalEditorListeners() {
    const editor = this.editor;
    if (!editor) return;
    // SparqlEditor events are emitted instance-first: (yasqe, ...payload). We route them to the active tab.
    editor.on("blur", () => this.getActiveTab()?.handleBlur(editor));
    editor.on("query", () => {
      const tab = this.getActiveTab();
      this.queryingTab = tab;
      tab?.handleQuery(editor);
    });
    editor.on("queryBefore", () => this.getActiveTab()?.handleQueryBefore());
    editor.on("queryAbort", () => {
      (this.queryingTab || this.getActiveTab())?.handleQueryAbort();
      this.queryingTab = undefined;
    });
    editor.on("resize", (_yasqe: any, newSize: any) => this.getActiveTab()?.handleResize(editor, newSize));
    editor.on("autocompletionShown", (_yasqe: any, widget: any) =>
      this.getActiveTab()?.handleAutocompletionShown(editor, widget),
    );
    editor.on("autocompletionClose", () => this.getActiveTab()?.handleAutocompletionClose(editor));
    editor.on("queryResponse", (_yasqe: any, response: any, duration: any) => {
      (this.queryingTab || this.getActiveTab())?.handleQueryResponse(editor, response, duration);
      this.queryingTab = undefined;
    });
    // Remember the user's language server choice per endpoint
    editor.on("languageServerChange", (_yasqe: any, def: { label: string }) => {
      if (this.applyingStoredLs) return;
      const endpoint = this.getActiveTab()?.getEndpoint();
      if (endpoint && def?.label) this.persistentConfig.setLanguageServerForEndpoint(endpoint, def.label);
    });
    // Remember the settings the user applies in a language server's settings panel (one set per server)
    editor.on("languageServerSettingsChange", (_yasqe: any, label: string, values: Record<string, unknown>) => {
      if (label) this.persistentConfig.setLanguageServerSettings(label, values);
    });
  }

  public getActiveTab(): Tab | undefined {
    return this.getTab();
  }

  /**
   * Move the shared Monaco editor into the given tab's container and load that tab's content.
   * Called when a tab becomes active so we reuse one editor instead of initializing many.
   */
  public syncEditorsWithTab(tab: Tab, yasqeContainer: HTMLElement) {
    if (this.yasqeWrapperEl?.parentNode) {
      this.yasqeWrapperEl.parentNode.removeChild(this.yasqeWrapperEl);
    }
    if (this.yasqeWrapperEl) yasqeContainer.appendChild(this.yasqeWrapperEl);
    this.updateEditorsContent(tab);
  }

  /** Load a tab query, request config and endpoint backend into the shared editor. */
  public updateEditorsContent(tab: Tab) {
    if (!this.editor) return;
    const tabConfig = tab.getPersistedJson();
    this.editor.setValue(tabConfig.editor.value);
    this.editor.setSize(tabConfig.editor.editorHeight || this.editor.config.editorHeight);
    this.editor.config.requestConfig = () => tab.getProcessedRequestConfig() as any;
    this.editor.config.createShareableLink = () => tab.getShareableLink();
    this.emitEndpointChange(tab.getEndpoint());
  }

  public hasFullscreen(fullscreen: boolean) {
    if (fullscreen) {
      this.emit("fullscreen-enter", this);
      addClass(this.rootEl, "hasFullscreen");
    } else {
      this.emit("fullscreen-leave", this);
      removeClass(this.rootEl, "hasFullscreen");
    }
  }
  public getStorageId(label: string, getter?: Config["persistenceId"]): string | undefined {
    const persistenceId = getter || this.config.persistenceId;
    if (!persistenceId) return undefined;
    if (typeof persistenceId === "string") return persistenceId + "_" + label;
    return persistenceId(this) + "_" + label;
  }
  public createTabName(name?: string, i: number = 0) {
    if (!name) name = this.config.tabName;
    var fullName = name + (i > 0 ? " " + i : "");
    if (this.tabNameTaken(fullName)) fullName = this.createTabName(name, i + 1);
    return fullName;
  }
  public tabNameTaken(name: string) {
    return find(this._tabs, (tab) => tab.getName() === name);
  }
  public getTab(tabId?: string): Tab | undefined {
    if (tabId) {
      return this._tabs[tabId];
    }
    const currentTabId = this.persistentConfig.currentId();
    if (currentTabId) return this._tabs[currentTabId];
  }

  //only handle UI interaction, don't emit or store anything
  private markTabSelected(tabId: string): boolean {
    if (!this.persistentConfig.getTab(tabId)) {
      //there is no tab config for this id. We _probably_ deleted a tab by pressing 'x', which fires the 'selectTab'
      //event after. I.e., nothing to select anymore, and we should just ignore this
      return false;
    }
    //mark tab active
    this.tabElements.selectTab(tabId);

    //draw tab content
    if (!this._tabs[tabId]) {
      this._tabs[tabId] = new Tab(this, Tab.getDefaults(this));
    }
    this._tabs[tabId].show();
    for (const otherTabId in this._tabs) {
      if (otherTabId !== tabId) this._tabs[otherTabId].hide();
    }
    return true;
  }
  public selectTabId(tabId: string) {
    const tab = this.getTab();
    if (tab && tab.getId() !== tabId) {
      if (this.markTabSelected(tabId)) {
        //emit
        this.emit("tabSelect", this, tabId);
        this.persistentConfig.setActive(tabId);
      }
    }
    return tab;
  }
  /**
   * Checks if two persistent tab configuration are the same based.
   * It isnt a strict equality, as falsy values (e.g. a header that isnt set in one tabjson) isnt taken into consideration
   * Things like the sparqlResults response are also not taken into consideration
   * @param tab1 Base comparable object
   * @param tab2 Second comparable object
   */
  private tabConfigEquals(tab1: PersistedTabJson, tab2: PersistedTabJson): boolean {
    let sameRequest = true;

    /**
     * Check request config
     */
    let key: keyof RequestConfig<SparqlStudio>;
    for (key in tab1.requestConfig) {
      if (!tab1.requestConfig[key]) continue;
      if (!isEqual(tab2.requestConfig[key], tab1.requestConfig[key])) {
        sameRequest = false;
      }
    }
    /**
     * Check yasqe settings
     */
    if (sameRequest) {
      sameRequest = (<Array<keyof PersistedTabJson["editor"]>>["endpoint", "value"]).every(
        (key) => tab1.editor[key] === tab2.editor[key],
      );
    }

    /**
     * Check sparqlResults settings
     */
    if (sameRequest) {
      sameRequest =
        tab1.results.settings.selectedPlugin === tab2.results.settings.selectedPlugin &&
        isEqual(
          tab1.results.settings.pluginsConfig?.[tab1.results.settings?.selectedPlugin || ""],
          tab2.results.settings.pluginsConfig?.[tab2.results.settings?.selectedPlugin || ""],
        );
    }

    return sameRequest && tab1.name === tab2.name;
  }
  private findTabIdForConfig(tabConfig: PersistedTabJson) {
    return this.persistentConfig.getTabs().find((tabId) => {
      const tab = this.persistentConfig.getTab(tabId);
      return this.tabConfigEquals(tab, tabConfig);
    });
  }

  private _registerTabListeners(tab: Tab) {
    tab.on("change", (tab) => this.emit("tabChange", this, tab));
    tab.on("query", (tab) => this.emit("query", this, tab));
    tab.on("queryBefore", (tab) => this.emit("queryBefore", this, tab));
    tab.on("queryAbort", (tab) => this.emit("queryAbort", this, tab));
    tab.on("queryResponse", (tab) => this.emit("queryResponse", this, tab));
    tab.on("autocompletionShown", (tab, widget) => this.emit("autocompletionShown", this, tab, widget));
    tab.on("autocompletionClose", (tab) => this.emit("autocompletionClose", this, tab));
  }
  public _setPanel(panelId: string, panel: HTMLDivElement) {
    for (const id in this._tabs) {
      if (id !== panelId) this._tabs[id].hide();
    }
    this.tabPanelsEl.appendChild(panel);
  }
  public _removePanel(panel: HTMLDivElement | undefined) {
    if (panel) this.tabPanelsEl.removeChild(panel);
  }
  /**
   * Adds a tab to SPARQL Studio
   * @param setActive if the tab should become active when added
   * @param [partialTabConfig]  config to add to the Tab
   * @param [opts] extra options, atIndex, at which position the tab should be added, avoidDuplicateTabs: if the config already exists make that tab active
   *
   * @returns tab
   */
  public addTab(
    setActive: boolean,
    partialTabConfig?: Partial<PersistedTabJson>,
    opts: { atIndex?: number; avoidDuplicateTabs?: boolean } = {},
  ): Tab {
    const tabConfig = merge({}, Tab.getDefaults(this), partialTabConfig);
    if (tabConfig.id && this.getTab(tabConfig.id)) {
      throw new Error("Duplicate tab ID");
    }
    // Check if we should copy the endpoint in the new tab and only copy if the tabConfig doesn't contain an endpoint
    if (this.config.copyEndpointOnNewTab && !partialTabConfig?.requestConfig?.endpoint) {
      const currentTab = this.getTab();
      if (currentTab) {
        tabConfig.requestConfig.endpoint = currentTab.getEndpoint();
      }
    }
    if (opts.avoidDuplicateTabs) {
      const foundTabId = this.findTabIdForConfig(tabConfig);
      if (foundTabId) {
        return this.selectTabId(foundTabId) as Tab;
      }
    }
    const tabId = tabConfig.id;
    const index = opts.atIndex;
    this.persistentConfig.addToTabList(tabId, index);
    this.emit("tabAdd", this, tabId);
    this._tabs[tabId] = new Tab(this, tabConfig);
    this.emit("tabChange", this, this._tabs[tabId]); //do emit, so the default config is persisted

    this.tabElements.addTab(tabId, index);
    this._registerTabListeners(this._tabs[tabId]);
    if (setActive) {
      this.persistentConfig.setActive(tabId);
      this._tabs[tabId].show();
    }
    return this._tabs[tabId];
  }
  public restoreLastTab() {
    const config = this.persistentConfig.retrieveLastClosedTab();
    if (config) {
      this.addTab(true, config.tab, { atIndex: config.index });
    }
  }
  public destroy() {
    this.removeAllListeners();
    this.tabElements.destroy();
    for (const tabId in this._tabs) {
      const tab = this._tabs[tabId];
      tab.destroy();
    }
    this._tabs = {};

    while (this.rootEl.firstChild) this.rootEl.firstChild.remove();
  }
  public static linkUtils = shareLink;
  /** The results-viewer class, for registering result-view plugins. Prefer `Results`; `Yasr` is the same class, kept as an alias for compatibility with existing Yasr plugins. */
  public static Results = SparqlResults;
  public static Yasr = SparqlResults;
  public static defaults = initializeDefaults();
  public static corsEnabled: { [endpoint: string]: boolean } = {};
}

export function getRandomId() {
  return Math.random().toString(36).substring(7);
}

export default SparqlStudio;
