/**
 * The default Yasqe options. Editor-specific behaviour (line numbers, word wrap, keybindings, ...)
 * is configured through Monaco editor options, see the `editorOptions` config field. Override these
 * defaults by setting `Yasqe.defaults`, or by passing your own options as the second constructor argument.
 */
import { default as Yasqe, Config, PlainRequestConfig } from "./";
import * as queryString from "query-string";
export default function get() {
  const config: Omit<Config, "requestConfig"> = {
    value: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT * WHERE {
  ?sub ?pred ?obj .
} LIMIT 10`,
    // Follow the OS/browser preference by default so the editor matches the auto-adapting chrome.
    // Callers can override by passing `theme` explicitly or via Yasqe.setTheme().
    theme:
      typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    // Custom Monaco editor options, deep-merged over the built-in defaults
    editorOptions: {},
    // Custom SPARQL theme overrides, deep-merged over the built-in light/dark themes
    themes: {},
    createShareableLink: function (yasqe: Yasqe) {
      return (
        document.location.protocol +
        "//" +
        document.location.host +
        document.location.pathname +
        document.location.search +
        "#" +
        queryString.stringify(yasqe.configToQueryParams())
      );
    },
    pluginButtons: undefined,
    createShortLink: undefined,

    consumeShareLink: function (yasqe: Yasqe) {
      yasqe.queryParamsToConfig(yasqe.getUrlParams());
    },
    persistenceId: function (yasqe: Yasqe) {
      //Traverse parents untl we've got an id
      // Get matching parent elements
      let id = "";
      let elem: any = yasqe.rootEl;
      if ((<any>elem).id) id = (<any>elem).id;
      for (; elem && elem !== <any>document; elem = elem.parentNode) {
        if (elem) {
          if ((<any>elem).id) id = (<any>elem).id;
          break;
        }
      }
      return "yasqe_" + id + "_query";
    },
    persistencyExpire: 60 * 60 * 24 * 30,

    showQueryButton: true,
    resizeable: true,
    editorHeight: "300px",
    queryingDisabled: undefined,
    // Language server is consumer-provided; no LSP by default (TextMate highlighting still works)
    languageServerWorker: undefined,
    onLanguageClientReady: undefined,
  };
  const requestConfig: PlainRequestConfig = {
    queryArgument: undefined, //undefined means: get query argument based on query mode
    endpoint: "https://sparql.dblp.org/sparql",
    method: "POST",
    acceptHeaderGraph: "text/turtle,application/n-triples,application/rdf+xml,application/trig,application/n-quads",
    acceptHeaderSelect: "application/sparql-results+json,*/*;q=0.9",
    acceptHeaderUpdate: "text/plain,*/*;q=0.9",
    namedGraphs: [],
    defaultGraphs: [],
    args: [],
    headers: {},
    withCredentials: false,
    adjustQueryBeforeRequest: false,
  };
  return { ...config, requestConfig };
}
