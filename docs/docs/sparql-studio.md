# SPARQL Studio

::: info Formerly Yasgui

SPARQL Studio is a fork of [Yasgui](https://github.com/zazuko/Yasgui). Its CSS classes has been updated: `.yasgui*` -> `.sparql-studio*`.

:::

`@rdfjs/sparql-studio` is the complete app: query tabs, an endpoint selector, and SparqlEditor + SparqlResults wired together. [Getting started](./getting-started) walks through mounting it end to end (including the language server worker); this page is the configuration reference.

## The editor factory

SparqlStudio is **editor-independent**: instead of an editor config object, you pass a factory `(parent, conf) => IEditor` that builds the editor. `conf` is the per-tab config SparqlStudio prepares (value, requestConfig, …); spread it, then add your own options:

```ts
import SparqlStudio from "@rdfjs/sparql-studio";
import SparqlEditor from "@rdfjs/sparql-editor-monaco";
import "@rdfjs/sparql-studio/style.css";

const sparqlStudio = new SparqlStudio(document.getElementById("sparqlStudio")!, {
  requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
  editor: (parent, conf) => new SparqlEditor(parent, { ...conf /* + languageServers, theme, … */ }),
});
```

The factory is where you choose the editor implementation (Monaco `@rdfjs/sparql-editor-monaco` or CodeMirror `@rdfjs/sparql-editor-codemirror`) and list its [language servers](./language-server), theme and [editor options](./editor-options). `sparqlStudio.editor.getLanguageClient()` returns the active language client so you can send any LSP request. With two or more `languageServers`, a switcher lets users pick one and SparqlStudio remembers the choice **per endpoint**.

## Configuration

| option | type | description |
| --- | --- | --- |
| `requestConfig` | `RequestConfig` | default endpoint & request settings (see [Request configuration](./request-config)) |
| `onEndpointChange` | `(client, endpoint) => void` | called when the active endpoint changes |
| `editor` | `SparqlEditorFactory` = `(parent, conf) => IEditor` | editor factory: build the editor (Monaco `@rdfjs/sparql-editor-monaco` or CodeMirror `@rdfjs/sparql-editor-codemirror`) and wire in its LSP, theme, etc. |
| `results` | `Partial<SparqlResults config>` | result-viewer config |
| `corsProxy` | `string` | optional CORS proxy URL |
| `persistenceId` | `string \| fn \| null` | localStorage namespace; `null` disables persistence |

## Programmatic API

SparqlStudio works in tabs; each tab owns its query, endpoint, editor and results. Drive it after construction:

```ts
const sparqlStudio = new SparqlStudio(el, { requestConfig: { endpoint } });

// Tabs
const tab = sparqlStudio.addTab(true, { ...SparqlStudio.Tab.getDefaults(), name: "My query" }); // true = make active
sparqlStudio.getTab();          // the active tab (or a tab id: getTab("tab_id"))
sparqlStudio.getActiveTab();

// Drive the active tab
tab.setQuery("SELECT * WHERE { ?s ?p ?o } LIMIT 10");
tab.setEndpoint("https://dbpedia.org/sparql");
await tab.query();        // run it
tab.getEditor();          // the IEditor for this tab (see SPARQL Editor API)
tab.getResults();         // the SparqlResults instance
tab.close();
```

## Events

SparqlStudio extends an event emitter; handlers are **instance-first** (`(sparqlStudio, …)`).

| event | payload | fires when |
| --- | --- | --- |
| `query` | `(sparqlStudio, tab)` | a query starts |
| `queryResponse` | `(sparqlStudio, tab)` | a response arrives |
| `queryAbort` | `(sparqlStudio, tab)` | a running query is aborted |
| `tabSelect` | `(sparqlStudio, tabId)` | the active tab changes |
| `tabAdd` | `(sparqlStudio, tabId)` | a tab is added |
| `tabClose` | `(sparqlStudio, tab)` | a tab is closed |
| `endpointHistoryChange` | `(sparqlStudio, history)` | the endpoint history changes |

```ts
sparqlStudio.on("queryResponse", (sparqlStudio, tab) => console.log(tab.getResults()?.results));
```

## Endpoint catalogue

The endpoint selector can suggest endpoints from a catalogue you supply via `endpointCatalogueOptions`:

```ts
new SparqlStudio(el, {
  endpointCatalogueOptions: {
    getData: () => [
      { endpoint: "https://sparql.dblp.org/sparql" },
      { endpoint: "https://query.wikidata.org/sparql", label: "Wikidata" },
    ],
    keys: ["label"],            // extra fields to match on besides `endpoint`
    renderItem: (data, source) => {
      const div = document.createElement("div");
      div.textContent = data.value.label ?? data.value.endpoint;
      source.appendChild(div);
    },
  },
});
```

Each item must have an `endpoint` string; add any other fields and list the searchable ones in `keys`.

::: tip Locking to a single endpoint
To hide the selector entirely (fixed endpoint), set the endpoint in `requestConfig` and hide the selector with CSS: `.sparql-studio .autocompleteWrapper { display: none !important; }`.
:::

## CORS

Public endpoints usually send the right CORS headers. For endpoints that don't, set a `corsProxy`:

```ts
new SparqlStudio(el, { corsProxy: "https://corsproxy.example/?" });
```

The proxy URL is prepended to the request URL.

## Persistence

By default SparqlStudio persists tabs, queries and the last results to `localStorage` under a namespace derived from the container element id. Pass `persistenceId: null` to disable persistence, or a string / function to control the namespace.

## Sharing queries

The editor's **share** action (`Ctrl/Cmd + S`, or the share button) produces a URL that encodes the current query and view settings, no server needed. When SparqlStudio loads with such a URL it restores that query into a tab (`populateFromUrl`, on by default). Build the link yourself with `tab.getShareableLink()`. Disable URL restoring with `populateFromUrl: false`.
