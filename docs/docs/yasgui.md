# Yasgui (full app)

`@zazuko/yasgui` is the complete app: query tabs, an endpoint selector, and Yasqe + Yasr wired
together.

```ts
import Yasgui from "@zazuko/yasgui";
import "@zazuko/yasgui/build/yasgui.min.css";
import { createQlueLsWorker, configureQlueLsBackend } from "./qlue-ls";

const yasgui = new Yasgui(document.getElementById("yasgui")!, {
  requestConfig: { endpoint: "https://dbpedia.org/sparql" },
  languageServerWorker: createQlueLsWorker,
  onEndpointChange: (yasgui, endpoint) =>
    configureQlueLsBackend(yasgui.yasqe?.getLanguageClient(), endpoint),
});
```

## One shared editor

Yasgui uses **one shared Monaco editor** across all tabs (Monaco can only be initialized once per
page) and swaps its content and endpoint on tab switch.

- `yasgui.yasqe` is that shared [Yasqe](./yasqe) instance.
- `yasgui.yasqe.getLanguageClient()` returns the underlying `monaco-languageclient` so you can send
  any LSP request.

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

## The endpoint selector

Yasgui ships with a catalogue of popular public SPARQL endpoints in the endpoint dropdown,
including DBpedia, Wikidata, UniProt, the QLever services and many life-science datasets. Users can
type any other endpoint URL directly.

When the active endpoint changes (on load, tab switch, or when the user edits the endpoint),
`onEndpointChange` fires once for the whole app. Use it to point the language server at the active
endpoint, as shown above.

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
- [Yasqe API](./api) · methods and events on the shared editor.
