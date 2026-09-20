# SPARQL Studio

::: info Formerly Yasgui

SPARQL Studio is a fork of [Yasgui](https://github.com/zazuko/Yasgui). Its CSS classes changed from `.yasgui*` to `.sparql-studio*`.

:::

`@rdfjs/sparql-studio` manages query tabs, endpoints and results. You supply the editor and its language servers.
[Getting started](./getting-started) shows a complete Monaco + qlue-ls setup; this page covers Studio configuration.

## The editor factory

Pass a factory `(parent, conf) => IEditor` using either [Monaco](./sparql-editor-monaco) or [CodeMirror 6](./sparql-editor-codemirror). Studio calls it once, then updates the shared editor's query and request settings when users switch tabs. Spread `conf` before adding your options:

```ts
import SparqlStudio from "@rdfjs/sparql-studio";
import SparqlEditor from "@rdfjs/sparql-editor-monaco";
import "@rdfjs/sparql-studio/style.css";
import "@rdfjs/sparql-editor-monaco/style.css";

const sparqlStudio = new SparqlStudio(document.getElementById("sparqlStudio")!, {
  requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
  editor: (parent, conf) => new SparqlEditor(parent, { ...conf, theme: "dark" }),
});
```

Add `languageServers` to the editor options for completion, diagnostics and other server features.
Both editors accept the same [server entries](./language-server#configuration). With several entries,
users can switch servers and Studio remembers their choice per endpoint. Without a server, the example above provides syntax highlighting and query execution.

## Configuration

| option | type | description |
| --- | --- | --- |
| `requestConfig` | `RequestConfig` | default endpoint & request settings (see [Request configuration](./request-config)) |
| `onEndpointChange` | `(sparqlStudio, endpoint) => void` | called when the active endpoint changes; server-specific hooks belong in `languageServers` |
| `editor` | `SparqlEditorFactory` = `(parent, conf) => IEditor` | required factory that creates the shared editor |
| `results` | `Partial<SparqlResults config>` | result-viewer config |
| `corsProxy` | `string` | optional CORS proxy URL |
| `persistenceId` | `string \| fn \| null` | localStorage namespace; `null` disables persistence |

## Programmatic API

SparqlStudio works in tabs; each tab owns its query, endpoint and results; the editor is shared. Drive it after construction:

```ts
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

SparqlStudio extends an event emitter; handlers are **instance-first** (`(sparqlStudio, ...)`).

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
  editor: (parent, conf) => new SparqlEditor(parent, conf),
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
new SparqlStudio(el, {
  editor: (parent, conf) => new SparqlEditor(parent, conf),
  corsProxy: "https://corsproxy.example/?",
});
```

The proxy URL is prepended to the request URL.

## Persistence

By default SparqlStudio persists tabs, queries and the last results to `localStorage` under a namespace derived from the container element id. Pass `persistenceId: null` to disable persistence, or a string / function to control the namespace.

## Sharing queries

The editor's **share** action (`Ctrl/Cmd + S`, or the share button) produces a URL that encodes the current query and view settings, no server needed. When SparqlStudio loads with such a URL it restores that query into a tab (`populateFromUrl`, on by default). Build the link yourself with `tab.getShareableLink()`. Disable URL restoring with `populateFromUrl: false`.
