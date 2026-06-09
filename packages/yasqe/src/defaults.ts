/**
 * Default options for Yasqe. Override by setting `Yasqe.defaults` or by
 * passing your own options as the second argument to the constructor.
 */
import { default as Yasqe, Config, PlainRequestConfig } from "./";
import * as queryString from "query-string";

export default function get() {
  const prefixCcApi =
    (window.location.protocol.indexOf("http") === 0 ? "//" : "http://") + "prefix.cc/popular/all.file.json";

  const config: Omit<Config, "requestConfig"> = {
    value: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT * WHERE {
  ?sub ?pred ?obj .
} LIMIT 10`,
    lineNumbers: true,
    lineWrapping: true,
    highlightActiveLine: true,
    foldGutter: true,
    matchBrackets: true,
    readOnly: false,
    syntaxErrorCheck: true,
    extensions: [],
    showQueryButton: true,
    resizeable: true,
    editorHeight: "300px",
    queryingDisabled: undefined,
    collapsePrefixesOnLoad: false,
    autocompleters: [],
    hintConfig: {},

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
    createShortLink: undefined,
    consumeShareLink: function (yasqe: Yasqe) {
      yasqe.queryParamsToConfig(yasqe.getUrlParams());
    },
    persistenceId: function (yasqe: Yasqe) {
      let id = "";
      let elem: any = yasqe.rootEl;
      if (elem?.id) id = elem.id;
      for (; elem && elem !== (document as any); elem = elem.parentNode) {
        if (elem?.id) {
          id = elem.id;
          break;
        }
      }
      return "yasqe_" + id + "_query";
    },
    persistencyExpire: 60 * 60 * 24 * 30,
    pluginButtons: undefined,
    prefixCcApi,
  };

  const requestConfig: PlainRequestConfig = {
    queryArgument: undefined,
    endpoint: "https://dbpedia.org/sparql",
    method: "POST",
    acceptHeaderGraph: "application/n-triples,*/*;q=0.9",
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
