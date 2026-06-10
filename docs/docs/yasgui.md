# Yasgui (full app)

`@zazuko/yasgui` is the complete app: query tabs, an endpoint selector, and Yasqe + Yasr wired
together.

```ts
import Yasgui from "@zazuko/yasgui";
import "@zazuko/yasgui/style.css";
import { createQlueLsWorker, configureQlueLsBackend } from "./qlue-ls";

const yasgui = new Yasgui(document.getElementById("yasgui")!, {
  requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
  languageServerWorker: createQlueLsWorker,
  onEndpointChange: (yasgui, endpoint) =>
    configureQlueLsBackend(yasgui.yasqe?.getLanguageClient(), endpoint),
});
```

`yasgui.yasqe.getLanguageClient()` returns the underlying `monaco-languageclient` so you can send any LSP request.

## Configuration

| option | type | description |
| --- | --- | --- |
| `requestConfig` | `RequestConfig` | default endpoint & request settings (see [Request configuration](./request-config)) |
| `languageServerWorker` | `Worker \| () => Worker \| Promise<Worker>` | the LSP worker; omit for highlighting-only |
| `onEndpointChange` | `(yasgui, endpoint) => void` | called when the active endpoint changes |
| `yasqe` | `Partial<Yasqe config>` | forwarded to the shared editor (e.g. `{ theme, editorOptions }`) |
| `yasr` | `Partial<Yasr config>` | result-viewer config |
| `corsProxy` | `string` | optional CORS proxy URL |
| `persistenceId` | `string \| fn \| null` | localStorage namespace; `null` disables persistence |

## CORS

Public endpoints usually send the right CORS headers. For endpoints that don't, set a `corsProxy`:

```ts
new Yasgui(el, { corsProxy: "https://corsproxy.example/?" });
```

The proxy URL is prepended to the request URL.

## Persistence

By default Yasgui persists tabs, queries and the last results to `localStorage` under a namespace
derived from the container element id. Pass `persistenceId: null` to disable persistence, or a
string / function to control the namespace.

## See also

- [Request configuration](./request-config) · how queries are sent.
- [Theming](./theming) · light/dark wiring.
- [Monaco editor options](./editor-options) · customize the editor.
