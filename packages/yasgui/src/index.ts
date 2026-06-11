/**
 * Yasgui · the full SPARQL app (editor + results + endpoint/tab management).
 * @module Yasgui
 */
import { EventEmitter } from "events";
import { merge, find, isEqual } from "lodash-es";
import initializeDefaults from "./defaults";
import PersistentConfig from "./PersistentConfig";
import { default as Tab, PersistedJson as PersistedTabJson } from "./Tab";

import { EndpointSelectConfig, CatalogueItem } from "./endpointSelect";
import * as shareLink from "./linkUtils";
import TabElements from "./TabElements";
import { default as Yasqe, PartialConfig as YasqeConfig, RequestConfig } from "@zazuko/yasqe";
import { default as Yasr, Config as YasrConfig } from "@zazuko/yasr";
import { addClass, removeClass } from "@zazuko/yasgui-utils";
import type { DeepPartial } from "@zazuko/yasgui-utils";
import "./index.scss";
import "./darkmode.css";
import "@zazuko/yasr/src/scss/global.scss";
if (window) {
  //We're storing yasqe and yasr as a member of Yasgui, but _also_ in the window
  //That way, we dont have to tweak e.g. pro plugins to register themselves to both
  //Yasgui.Yasr _and_ Yasr.
  if (Yasqe) (window as any).Yasqe = Yasqe;
  if (Yasr) (window as any).Yasr = Yasr;
}
export { qlueLs } from "@zazuko/yasqe";
export type YasguiRequestConfig = Omit<RequestConfig<Yasgui>, "adjustQueryBeforeRequest"> & {
  adjustQueryBeforeRequest: RequestConfig<Yasqe>["adjustQueryBeforeRequest"];
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
  persistenceId: ((yasr: Yasgui) => string) | string | null;
  persistenceLabelConfig: string;
  persistenceLabelResponse: string;
  persistencyExpire: number;
  yasqe: Partial<YasqeConfig>;
  yasr: YasrConfig;
  requestConfig: YasguiRequestConfig;
  contextMenuContainer: HTMLElement | undefined;
  nonSslDomain?: string;
  /**
   * Language server for the editor, provided by the consumer (yasgui/yasqe are LS-agnostic).
   * A ready `Worker` or a factory returning one. Forwarded to the shared Yasqe instance.
   */
  languageServerWorker?: Worker | (() => Worker | Promise<Worker>);
  /**
   * Called whenever the active SPARQL endpoint changes (on load, tab switch, or endpoint edit),
   * with this Yasgui instance and the new endpoint. Defined once here, it applies to every tab.
   * Typical use: configure the language server for that endpoint, e.g.
   *   onEndpointChange: (yasgui, endpoint) => myConfigureBackend(yasgui.yasqe?.getLanguageClient(), endpoint)
   */
  onEndpointChange?: (yasgui: Yasgui, endpoint: string) => void;
}
export type PartialConfig = DeepPartial<Config>;

export type TabJson = PersistedTabJson;

export interface Yasgui {
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  on(event: "tabSelect", listener: (instance: Yasgui, newTabId: string) => void): this;
  emit(event: "tabSelect", instance: Yasgui, newTabId: string): boolean;
  on(event: "tabClose", listener: (instance: Yasgui, tab: Tab) => void): this;
  emit(event: "tabClose", instance: Yasgui, tab: Tab): boolean;
  on(event: "query", listener: (instance: Yasgui, tab: Tab) => void): this;
  emit(event: "query", instance: Yasgui, tab: Tab): boolean;
  on(event: "queryBefore", listener: (instance: Yasgui, tab: Tab) => void): this;
  emit(event: "queryBefore", instance: Yasgui, tab: Tab): boolean;
  on(event: "queryAbort", listener: (instance: Yasgui, tab: Tab) => void): this;
  emit(event: "queryAbort", instance: Yasgui, tab: Tab): boolean;
  on(event: "queryResponse", listener: (instance: Yasgui, tab: Tab) => void): this;
  emit(event: "queryResponse", instance: Yasgui, tab: Tab): boolean;
  on(event: "tabChange", listener: (instance: Yasgui, tab: Tab) => void): this;
  emit(event: "tabChange", instance: Yasgui, tab: Tab): boolean;
  on(event: "tabAdd", listener: (instance: Yasgui, newTabId: string) => void): this;
  emit(event: "tabAdd", instance: Yasgui, newTabId: string): boolean;
  on(event: "tabOrderChanged", listener: (instance: Yasgui, tabList: string[]) => void): this;
  emit(event: "tabOrderChanged", instance: Yasgui, tabList: string[]): boolean;
  on(event: "fullscreen-enter", listener: (instance: Yasgui) => void): this;
  emit(event: "fullscreen-enter", instance: Yasgui): boolean;
  on(event: "fullscreen-leave", listener: (instance: Yasgui) => void): this;
  emit(event: "fullscreen-leave", instance: Yasgui): boolean;
  on(event: "endpointHistoryChange", listener: (instance: Yasgui, history: string[]) => void): this;
  emit(event: "endpointHistoryChange", instance: Yasgui, history: string[]): boolean;
  on(event: "autocompletionShown", listener: (instance: Yasgui, tab: Tab, widget: any) => void): this;
  emit(event: "autocompletionShown", instance: Yasgui, tab: Tab, widget: any): boolean;
  on(event: "autocompletionClose", listener: (instance: Yasgui, tab: Tab) => void): this;
  emit(event: "autocompletionClose", instance: Yasgui, tab: Tab): boolean;
}
export class Yasgui extends EventEmitter {
  public rootEl: HTMLDivElement;
  public tabElements: TabElements;
  public _tabs: { [tabId: string]: Tab } = {};
  public tabPanelsEl: HTMLDivElement;
  public config: Config;
  public persistentConfig: PersistentConfig;
  // Single shared Monaco editor (the monaco-vscode API can only be initialized once per page).
  // Tabs share this instance and swap its content/endpoint on activation via syncEditorsWithTab.
  public yasqe: Yasqe | undefined;
  private yasqeWrapperEl: HTMLDivElement | undefined;
  // The tab that initiated the in-flight query, so async query events route back to it even if the
  // user switches tabs in the meantime.
  private queryingTab: Tab | undefined;
  public static Tab = Tab;
  constructor(parent: HTMLElement, config: PartialConfig) {
    super();
    this.rootEl = document.createElement("div");
    addClass(this.rootEl, "yasgui");
    parent.appendChild(this.rootEl);

    this.config = merge({}, Yasgui.defaults, config);
    this.persistentConfig = new PersistentConfig(this);

    this.tabElements = new TabElements(this);
    this.tabPanelsEl = document.createElement("div");

    this.rootEl.appendChild(this.tabElements.drawTabsList());
    this.rootEl.appendChild(this.tabPanelsEl);
    // Create the single shared Monaco editor before any tab is drawn/shown.
    this.initGlobalYasqe();
    let executeIdAfterInit: string | undefined;
    let optionsFromUrl: PersistedTabJson | undefined;
    if (this.config.populateFromUrl) {
      optionsFromUrl = shareLink.getConfigFromUrl(Tab.getDefaults(this));
      if (optionsFromUrl) {
        const tabId = this.findTabIdForConfig(optionsFromUrl);
        if (tabId) {
          // when a config is already present,
          const persistentYasr = this.persistentConfig.getTab(tabId).yasr;
          this.persistentConfig.getTab(tabId).yasr = {
            // Override the settings
            settings: optionsFromUrl.yasr.settings,
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
  /** Create the single shared Monaco editor and route its events to the active tab. */
  private initGlobalYasqe() {
    this.yasqeWrapperEl = document.createElement("div");
    const yasqeConf: Partial<YasqeConfig> = {
      ...this.config.yasqe,
      persistenceId: null, // yasgui handles persistent storing, per tab
      consumeShareLink: null, // handled by the parent yasgui instance, not yasqe
      createShareableLink: () => this.getActiveTab()?.getShareableLink() || "",
      requestConfig: () => (this.getActiveTab()?.getProcessedRequestConfig() ?? {}) as any,
      languageServerWorker: this.config.languageServerWorker,
      // Once the language client is ready, notify for the active tab endpoint
      onLanguageClientReady: (languageClient, yasqe) => {
        // Yasgui overwrites the consumer defined yasqe.onLanguageClientReady, so chain back to it
        this.config.yasqe?.onLanguageClientReady?.(languageClient, yasqe);
        const endpoint = this.getActiveTab()?.getEndpoint();
        if (endpoint) this.emitEndpointChange(endpoint);
      },
    };
    this.yasqe = new Yasqe(this.yasqeWrapperEl, yasqeConf);
    this.setupGlobalYasqeListeners();
  }

  /** Notify the consumer that the active endpoint changed (single Yasgui-level hook for all tabs). */
  public emitEndpointChange(endpoint: string) {
    if (endpoint) this.config.onEndpointChange?.(this, endpoint);
  }

  private setupGlobalYasqeListeners() {
    const yasqe = this.yasqe;
    if (!yasqe) return;
    // Yasqe events are emitted instance-first: (yasqe, ...payload). We route them to the active tab.
    yasqe.on("blur", () => this.getActiveTab()?.handleYasqeBlur(yasqe));
    yasqe.on("query", () => {
      const tab = this.getActiveTab();
      this.queryingTab = tab;
      tab?.handleYasqeQuery(yasqe);
    });
    yasqe.on("queryBefore", () => this.getActiveTab()?.handleYasqeQueryBefore());
    yasqe.on("queryAbort", () => {
      (this.queryingTab || this.getActiveTab())?.handleYasqeQueryAbort();
      this.queryingTab = undefined;
    });
    yasqe.on("resize", (_yasqe: any, newSize: any) => this.getActiveTab()?.handleYasqeResize(yasqe, newSize));
    yasqe.on("autocompletionShown", (_yasqe: any, widget: any) =>
      this.getActiveTab()?.handleAutocompletionShown(yasqe, widget),
    );
    yasqe.on("autocompletionClose", () => this.getActiveTab()?.handleAutocompletionClose(yasqe));
    yasqe.on("queryResponse", (_yasqe: any, response: any, duration: any) => {
      (this.queryingTab || this.getActiveTab())?.handleQueryResponse(yasqe, response, duration);
      this.queryingTab = undefined;
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
    if (!this.yasqe) return;
    const tabConfig = tab.getPersistedJson();
    this.yasqe.setValue(tabConfig.yasqe.value);
    this.yasqe.setSize(tabConfig.yasqe.editorHeight || this.yasqe.config.editorHeight);
    this.yasqe.config.requestConfig = () => tab.getProcessedRequestConfig() as any;
    this.yasqe.config.createShareableLink = () => tab.getShareableLink();
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
   * Things like the yasr response are also not taken into consideration
   * @param tab1 Base comparable object
   * @param tab2 Second comparable object
   */
  private tabConfigEquals(tab1: PersistedTabJson, tab2: PersistedTabJson): boolean {
    let sameRequest = true;

    /**
     * Check request config
     */
    let key: keyof RequestConfig<Yasgui>;
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
      sameRequest = (<Array<keyof PersistedTabJson["yasqe"]>>["endpoint", "value"]).every(
        (key) => tab1.yasqe[key] === tab2.yasqe[key],
      );
    }

    /**
     * Check yasr settings
     */
    if (sameRequest) {
      sameRequest =
        tab1.yasr.settings.selectedPlugin === tab2.yasr.settings.selectedPlugin &&
        isEqual(
          tab1.yasr.settings.pluginsConfig?.[tab1.yasr.settings?.selectedPlugin || ""],
          tab2.yasr.settings.pluginsConfig?.[tab2.yasr.settings?.selectedPlugin || ""],
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
   * Adds a tab to yasgui
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
  public static Yasr = Yasr;
  public static Yasqe = Yasqe;
  public static defaults = initializeDefaults();
  public static corsEnabled: { [endpoint: string]: boolean } = {};
}

export function getRandomId() {
  return Math.random().toString(36).substring(7);
}

export default Yasgui;
