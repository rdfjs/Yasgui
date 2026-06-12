/**
 * Default options for the CodeMirror 6 Yasqe. Override by setting `Yasqe.defaults` or by
 * passing your own options as the second argument to the constructor.
 */
import { default as Yasqe, Config } from "./";
import { defaultQueryValue, defaultRequestConfig, PlainRequestConfig } from "@zazuko/yasgui-utils";
import * as queryString from "query-string";

export default function get() {
  const prefixCcApi =
    (window.location.protocol.indexOf("http") === 0 ? "//" : "http://") + "prefix.cc/popular/all.file.json";

  const config: Omit<Config, "requestConfig"> = {
    value: defaultQueryValue,
    lineNumbers: true,
    lineWrapping: true,
    highlightActiveLine: true,
    foldGutter: true,
    matchBrackets: true,
    readOnly: false,
    syntaxErrorCheck: true,
    extensions: [],
    // Follow the OS/browser preference by default so the editor matches the auto-adapting chrome.
    // Callers can override by passing `theme` explicitly or via Yasqe.setTheme().
    theme:
      typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
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

  const requestConfig: PlainRequestConfig = { ...defaultRequestConfig };
  return { ...config, requestConfig };
}
