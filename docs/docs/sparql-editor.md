# SPARQL Editor

::: info Previously Yasqe

The editor began as Yasqe. Its CSS classes has been updated: `.yasqe*` -> `.sparql-editor*`.

:::

`@rdfjs/sparql-editor-monaco` is the SPARQL query editor on its own, the Monaco editor plus an optional language client. Use it when you want only the editor, without tabs or the result viewer.

```ts
import SparqlEditor, { qlueLs } from "@rdfjs/sparql-editor-monaco";
import "@rdfjs/sparql-editor-monaco/style.css";
import QlueLsWorker from "./qlue-ls.worker?worker";

const endpoint = "https://sparql.dblp.org/sparql";
const editor = new SparqlEditor(document.getElementById("yasqe")!, {
  value: "SELECT * WHERE { ?s ?p ?o } LIMIT 10",
  requestConfig: { endpoint },
  languageServers: [
    {
      label: "Qlue-ls",
      worker: () => new QlueLsWorker({ name: "qlue-ls" }),
      onReady: (client) => {
        qlueLs.configureSettings(client);
        qlueLs.configureBackend(client, endpoint);
      },
      // Per-server, fires only while this server is active; trigger it with notifyEndpointChange().
      onEndpointChange: (client, endpoint) => qlueLs.configureBackend(client, endpoint),
    },
  ],
});

editor.on("query", (editor, req) => console.log("running", req));
editor.on("queryResponse", (yasqe, response, duration) => console.log(response, duration));
```

With an empty `languageServers`, Yasqe still works as a syntax-highlighted editor, you just don't get completion, diagnostics or formatting. The `languageServers` array, its per-server `onReady` / `onEndpointChange` hooks, the runtime switcher and helpers like `getLanguageClient()` / `setLanguageServer()` / `notifyEndpointChange()` are all covered in [Language server](./language-server), this is the same config the full app uses.

::: warning Events are instance-first
Editor events are emitted **instance-first**, handlers receive `(yasqeInstance, ...payload)`. For example `queryResponse` is `(yasqe, response, duration)`.
:::

## Common config

| option | description |
| --- | --- |
| `value` | initial query string |
| `theme` | `"light"` / `"dark"` (defaults to the OS preference) |
| `editorOptions` | [Monaco options](./editor-options), deep-merged over the defaults |
| `requestConfig` | how queries are sent, see [Request configuration](./request-config) |
| `editorHeight` | initial editor height (e.g. `"300px"`) |
| `resizeable` | whether the editor can be resized |
| `showQueryButton` | show the run button |
| `persistenceId` | localStorage namespace |
| `languageServers` | array of language servers (`{ label, description?, worker, onReady?, onEndpointChange? }`); empty for highlighting-only. The first is activated on load; 2+ adds a switcher. The `onReady`/`onEndpointChange` hooks fire only for the active server |

## Programmatic API

```ts
editor.getValue();                       // current query string
editor.setValue("SELECT * WHERE { ?s ?p ?o }");
await editor.query();                    // run the query (uses requestConfig)
editor.abortQuery();
editor.getQueryType();                   // "SELECT" | "ASK" | "CONSTRUCT" | "DESCRIBE" | ...
editor.getQueryMode();                   // "query" | "update"
editor.getPrefixesFromQuery();           // { prefix: namespace } parsed from the query
editor.getAsCurlString();                // the current query as a curl command
editor.setTheme("dark");
editor.focus();

// Language servers (see Language server page)
editor.getLanguageClient();              // active monaco-languageclient (or undefined)
editor.getLanguageServers();             // [{ label, description? }]
editor.getActiveLanguageServer();        // active index
await editor.setLanguageServer("Qlue-ls"); // by label or index
editor.notifyEndpointChange(endpoint);   // re-fire the active server's onEndpointChange
```

## Events

Handlers are **instance-first**: `(editor, ...payload)`.

| event | payload | fires when |
| --- | --- | --- |
| `query` | `(editor, req, abortController?)` | a query starts |
| `queryResponse` | `(editor, response, duration)` | a response arrives |
| `queryAbort` | `(editor, req)` | a query is aborted |
| `error` | `(editor)` | a query errors |
| `resize` | `(editor, newSize)` | the editor is resized |
| `languageServerChange` | `(editor, def, index)` | the active language server changes |
| `blur` | `(editor)` | the editor loses focus |

```ts
editor.on("queryResponse", (editor, response, duration) => console.log(response, duration));
```

## Keyboard shortcuts

On top of all the standard [Monaco / VS Code](https://code.visualstudio.com/docs/getstarted/keybindings) bindings (multi-cursor, `Ctrl/Cmd + /` to toggle comments, **Format Document** from the right-click menu, …), the editor adds:

| shortcut | action |
| --- | --- |
| `Ctrl/Cmd + Enter` | run the query |
| `Ctrl/Cmd + S` | share the query (copies a shareable URL; does not trigger the browser save dialog) |

Both also appear at the top of the editor's right-click context menu.
