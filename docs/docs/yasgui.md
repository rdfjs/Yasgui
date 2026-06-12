# Yasgui (full app)

`@zazuko/yasgui` is the complete app: query tabs, an endpoint selector, and Yasqe + Yasr wired
together.

```ts
import Yasgui from "@zazuko/yasgui";
import Yasqe, { qlueLs } from "@zazuko/yasqe";
import "@zazuko/yasgui/style.css";
import { createQlueLsWorker } from "./qlue-ls";

const yasgui = new Yasgui(document.getElementById("yasgui")!, {
  requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
  // Editor factory: build the editor and wire in its language server. `conf` is the
  // per-tab config Yasgui prepares (value, requestConfig, …); spread it, then add your own.
  yasqe: (parent, conf) =>
    new Yasqe(parent, {
      ...conf,
      languageServerWorker: createQlueLsWorker,
      onLanguageClientReady: (languageClient) => qlueLs.configureSettings(languageClient),
    }),
  onEndpointChange: (yasgui, endpoint) =>
    qlueLs.configureBackend(yasgui.yasqe?.getLanguageClient(), endpoint),
});
```

Yasgui is **editor-independent**: instead of an editor config object, you pass a factory
`(parent, conf) => IYasqe` that builds the editor. This is where you choose the editor implementation
(Monaco `@zazuko/yasqe` above, or CodeMirror `@zazuko/yasqe-codemirror`) and wire in its language
server and theme. `qlueLs` is only exported from `@zazuko/yasqe` (the Monaco editor), not from
`@zazuko/yasgui`.

`yasgui.yasqe.getLanguageClient()` returns the underlying `monaco-languageclient` so you can send any
LSP request.

## Configuration

| option | type | description |
| --- | --- | --- |
| `requestConfig` | `RequestConfig` | default endpoint & request settings (see [Request configuration](./request-config)) |
| `onEndpointChange` | `(yasgui, endpoint) => void` | called when the active endpoint changes |
| `yasqe` | `YasqeFactory` = `(parent, conf) => IYasqe` | editor factory: build the editor (Monaco `@zazuko/yasqe` or CodeMirror `@zazuko/yasqe-codemirror`) and wire in its LSP, theme, etc. |
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

The shared editor types (`IYasqe`, `YasqeFactory`, `RequestConfig`, `PlainRequestConfig`,
`QueryType`) live in `@zazuko/yasgui-utils` and are implemented by both editor packages.
