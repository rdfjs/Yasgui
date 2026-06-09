import "./scss/yasqe.scss";
import "./scss/buttons.scss";
import "./scss/codemirrorMods.scss";

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
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import { indentWithTab, defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import type { LSPClient } from "@codemirror/lsp-client";

import { Storage as YStorage, drawSvgStringAsElement, addClass, removeClass } from "@zazuko/yasgui-utils";

import getDefaults from "./defaults";
import * as Sparql from "./sparql";
import * as imgs from "./imgs";
import { getPrefixesFromQuery, addPrefixes, removePrefixes, Prefixes } from "./prefixUtils";

const UPDATE_KEYWORDS = new Set(["INSERT", "DELETE", "LOAD", "CLEAR", "CREATE", "DROP", "COPY", "MOVE", "ADD"]);
const QUERY_TYPE_REGEX = /\b(SELECT|ASK|CONSTRUCT|DESCRIBE|INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD)\b/i;

// Yasqe is language-server agnostic. The embedder creates and
// connects the client (with `@codemirror/lsp-client`) and passes it via config.
// All language features (highlighting, diagnostics, completion, hover, formatting)
// come from the language server, Yasqe ships no SPARQL grammar of its own.
export class Yasqe extends EventEmitter {
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
  private static uriCounter = 0;
  private documentUri?: string;

  constructor(parent: HTMLElement, conf: PartialConfig = {}) {
    super();
    if (!parent) throw new Error("No parent passed as argument. Dont know where to draw YASQE");
    this.rootEl = document.createElement("div");
    this.rootEl.className = "yasqe";
    parent.appendChild(this.rootEl);
    this.editorEl = document.createElement("div");
    this.editorEl.className = "yasqe_editor";
    this.rootEl.appendChild(this.editorEl);

    // `lsp` (a class instance) and `extensions` (opaque CM6 objects) must not be
    // deep-merged by lodash, which would clone away their prototypes. Assign them by reference.
    const { lsp, extensions, ...mergeableConf } = conf;
    this.config = merge({}, Yasqe.defaults, mergeableConf) as Config;
    if (extensions) this.config.extensions = extensions as Extension[];
    if (lsp) this.config.lsp = lsp as Config["lsp"];
    this.storage = new YStorage(Yasqe.storageNamespace);

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

    this.drawButtons();

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
        // Custom bindings first: they must win over defaultKeymap, which also binds
        // Mod-Enter (to insertBlankLine). Ctrl-Enter is added explicitly so it also
        // works on macOS, where Mod resolves to Cmd only.
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
    if (c.lsp?.client) {
      base.push(lintGutter());
      // Add `LSPClient` to the CM6 extensions, it is the single source of language features:
      // highlighting, diagnostics, completion, hover, formatting...
      base.push(c.lsp.client.plugin(this.getDocumentUri(), c.lsp.languageId ?? "sparql"));
    }
    if (c.lineWrapping) base.push(EditorView.lineWrapping);
    base.push(
      EditorView.updateListener.of((u: ViewUpdate) => {
        if (u.docChanged) {
          this.emit("change", this);
          this.emit("changes", this);
          this.checkSyntax();
          this.updateQueryButton();
        }
        if (u.selectionSet) {
          this.emit("cursorActivity", this);
        }
        if (u.focusChanged) {
          if (this.cm.hasFocus) this.emit("focus", this);
          else {
            this.saveQuery();
            this.emit("blur", this);
          }
        }
      }),
    );
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
   * The LSP document URI for this editor. Derived from `config.lsp.documentUri`
   * (string or factory), falling back to an auto-generated unique URI so that
   * several editors sharing one client (e.g. Yasgui tabs) get distinct URIs.
   */
  public getDocumentUri(): string {
    if (this.documentUri) return this.documentUri;
    const conf = this.config.lsp?.documentUri;
    if (typeof conf === "function") this.documentUri = conf(this);
    else if (typeof conf === "string") this.documentUri = conf;
    else this.documentUri = `file:///query${++Yasqe.uriCounter}.rq`;
    return this.documentUri;
  }

  /* Events */
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
    Yasqe.clearStorage();
  }

  /* Query type */
  public getQueryType(): QueryType | undefined {
    return this.queryType;
  }
  public getQueryMode(): "update" | "query" {
    return this.queryType && UPDATE_KEYWORDS.has(this.queryType) ? "update" : "query";
  }
  public checkSyntax() {
    // Detect query type from the (comment-stripped) value
    const stripped = this.getValue().replace(/#[^\n]*/g, "");
    const m = QUERY_TYPE_REGEX.exec(stripped);
    this.queryType = m ? (m[1].toUpperCase() as QueryType) : undefined;
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
    const changes = lines.map(({ line, text }) => {
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
  public autoformat() {
    // Basic CM6 autoformat is not provided; leave the value untouched.
  }

  /* Prefixes */
  public getPrefixesFromQuery(): Prefixes {
    return getPrefixesFromQuery(this);
  }
  public addPrefixes(prefixes: string | Prefixes): void {
    return addPrefixes(this, prefixes);
  }
  public removePrefixes(prefixes: Prefixes): void {
    return removePrefixes(this, prefixes);
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
    buttons.className = "yasqe_buttons";
    this.rootEl.appendChild(buttons);

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

    if (this.config.createShareableLink) {
      const svgShare = drawSvgStringAsElement(imgs.share);
      const shareLinkWrapper = document.createElement("button");
      shareLinkWrapper.className = "yasqe_share";
      shareLinkWrapper.title = "Share query";
      shareLinkWrapper.setAttribute("aria-label", "Share query");
      shareLinkWrapper.appendChild(svgShare);
      buttons.appendChild(shareLinkWrapper);
      const showSharePopup = (event: MouseEvent | KeyboardEvent) => {
        event.stopPropagation();
        let popup: HTMLDivElement | undefined = document.createElement("div");
        popup.className = "yasqe_sharePopup";
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
          shortBtn.className = "yasqe_btn yasqe_btn-sm shorten";
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
        curlBtn.className = "yasqe_btn yasqe_btn-sm curl";
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
      addClass(this.queryBtn, "yasqe_queryButton");
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
    this.emit("resize", this, this.editorEl.style.height);
    if (this.getStorageId() && this.persistentConfig) {
      this.persistentConfig.editorHeight = this.editorEl.style.height;
      this.saveQuery();
    }
    this.refresh();
  };
  public expandEditor = () => {
    this.editorEl.style.height = "100%";
  };

  /* Query lifecycle */
  public query(config?: Sparql.YasqeAjaxConfig) {
    if (this.config.queryingDisabled) return Promise.reject("Querying is disabled.");
    this.abortQuery();
    // Wire request emission to internal state via listeners
    const onQuery = (_y: Yasqe, req: Request, abort?: AbortController) => {
      this.req = req;
      this.abortController = abort;
      this.updateQueryButton();
    };
    const onResponse = (_y: Yasqe, _resp: any, duration: number) => {
      this.lastQueryDuration = duration;
      this.req = undefined;
      this.updateQueryButton();
      this.off("query", onQuery);
      this.off("queryResponse", onResponse);
      this.off("queryAbort", onAbort);
    };
    const onAbort = (_y: Yasqe) => {
      this.req = undefined;
      this.updateQueryButton();
      this.off("query", onQuery);
      this.off("queryResponse", onResponse);
      this.off("queryAbort", onAbort);
    };
    this.on("query", onQuery);
    this.on("queryResponse", onResponse);
    this.on("queryAbort", onAbort);
    return Sparql.executeQuery(this, config);
  }
  public abortQuery() {
    if (this.req) {
      this.abortController?.abort();
      this.emit("queryAbort", this, this.req);
    }
  }
  public getAsCurlString(config?: Sparql.YasqeAjaxConfig): string {
    return Sparql.getAsCurlString(this, config);
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

  /* Destroy */
  public destroy() {
    this.abortQuery();
    this.removeAllListeners();
    this.resizeWrapper?.removeEventListener("mousedown", this.initDrag, false);
    this.resizeWrapper?.removeEventListener("dblclick", this.expandEditor);
    window.removeEventListener("hashchange", this.handleHashChange);
    this.cm.destroy();
    this.rootEl.remove();
  }

  /* Statics */
  static Sparql = Sparql;
  static defaults = getDefaults();
  static Autocompleters: { [name: string]: any } = {};
  static registerAutocompleter(_value: any, _enable = true): void {
    // No-op: autocomplete is now provided by the language server (see `config.lsp`).
  }
  static forkAutocompleter(_from: string, _to: { name: string } & any, _enable = true): void {
    // No-op: autocomplete is now provided by the language server (see `config.lsp`).
  }
  static clearStorage() {
    const storage = new YStorage(Yasqe.storageNamespace);
    storage.removeNamespace();
  }
}

export type QueryType =
  | "SELECT"
  | "ASK"
  | "CONSTRUCT"
  | "DESCRIBE"
  | "INSERT"
  | "DELETE"
  | "LOAD"
  | "CLEAR"
  | "CREATE"
  | "DROP"
  | "COPY"
  | "MOVE"
  | "ADD";

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

export interface RequestConfig<Y> {
  queryArgument: string | ((yasqe: Y) => string) | undefined;
  endpoint: string | ((yasqe: Y) => string);
  method: "POST" | "GET" | ((yasqe: Y) => "POST" | "GET");
  acceptHeaderGraph: string | ((yasqe: Y) => string);
  acceptHeaderSelect: string | ((yasqe: Y) => string);
  acceptHeaderUpdate: string | ((yasqe: Y) => string);
  namedGraphs: string[] | ((yasqe: Y) => string[]);
  defaultGraphs: string[] | ((yasqe: Y) => []);
  args: Array<{ name: string; value: string }> | ((yasqe: Y) => Array<{ name: string; value: string }>);
  headers: { [key: string]: string } | ((yasqe: Y) => { [key: string]: string });
  withCredentials: boolean | ((yasqe: Y) => boolean);
  adjustQueryBeforeRequest: ((yasqe: Y) => string) | false;
}
export type PlainRequestConfig = {
  [K in keyof RequestConfig<any>]: Exclude<RequestConfig<any>[K], Function>;
};
export type PartialConfig = {
  [P in keyof Config]?: Config[P] extends object ? Partial<Config[P]> : Config[P];
};

export interface Config {
  /** Initial editor content */
  value: string;
  /** Show line numbers gutter */
  lineNumbers: boolean;
  /** Soft-wrap long lines */
  lineWrapping: boolean;
  /** Highlight the current line */
  highlightActiveLine: boolean;
  /** Show fold gutter (currently fold by syntax tree is not yet wired up) */
  foldGutter: boolean;
  /** Highlight matching brackets */
  matchBrackets: boolean;
  /** Editor starts as read-only */
  readOnly: boolean;
  /** @deprecated No-op. Diagnostics come from the language server (`lsp`); Yasqe ships no built-in syntax checker. */
  syntaxErrorCheck: boolean;
  /** Extra CodeMirror 6 extensions (advanced) */
  extensions: Extension[];
  /**
   * Language Server Protocol integration. Yasqe ships no SPARQL grammar of its own — all
   * language features (highlighting, diagnostics, completion, hover, formatting) come from
   * the server. The embedder creates and connects an `LSPClient` (from `@codemirror/lsp-client`,
   * configured with `languageServerExtensions()` plus any server-specific glue such as
   * semantic-token highlighting) and passes it here. qlue-ls (or any SPARQL server) lives in
   * the embedder, never in Yasqe's dependencies. Without `lsp`, Yasqe is a plain text editor.
   */
  lsp?: {
    /** A connected LSPClient instance. */
    client: LSPClient;
    /**
     * Document URI for this editor. Provide a function to derive a unique URI per editor
     * (e.g. one per Yasgui tab). Defaults to an auto-generated unique URI.
     */
    documentUri?: string | ((yasqe: Yasqe) => string);
    /** LSP language id sent to the server. Defaults to "sparql". */
    languageId?: string;
  };

  /** Show button to run the query */
  showQueryButton: boolean;
  /** Show resize handle below the editor */
  resizeable: boolean;
  /** Initial editor height (CSS value) */
  editorHeight: string;
  /** Disable querying (also disables the run button); the string is shown as tooltip */
  queryingDisabled: string | undefined;
  /** Pre-fold prefix declarations on load (no-op until folding is implemented) */
  collapsePrefixesOnLoad: boolean;
  /** Legacy autocompleter names; ignored for now */
  autocompleters: string[];
  /** Legacy hint config; ignored for now */
  hintConfig: any;

  createShareableLink: (yasqe: Yasqe) => string;
  createShortLink: ((yasqe: Yasqe, longLink: string) => Promise<string>) | undefined;
  consumeShareLink: ((yasqe: Yasqe) => void) | undefined | null;
  persistenceId: ((yasqe: Yasqe) => string) | string | undefined | null;
  persistencyExpire: number;
  requestConfig: RequestConfig<Yasqe> | ((yasqe: Yasqe) => RequestConfig<Yasqe>);
  pluginButtons: (() => HTMLElement[] | HTMLElement) | undefined;
  prefixCcApi: string;
}
export interface PersistentConfig {
  query: string;
  editorHeight: string;
}

export interface HintConfig {
  [k: string]: any;
}

export default Yasqe;
