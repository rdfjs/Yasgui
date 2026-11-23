# Monaco editor

::: info Previously Yasqe

The editor began as Yasqe. Its CSS classes changed from `.yasqe*` to `.sparql-editor*`.

:::

`@rdfjs/sparql-editor-monaco` provides a standalone SPARQL editor built on Monaco, the editor used by VS Code.
Use it on its own or in a [Studio editor factory](./sparql-studio#the-editor-factory).
For CodeMirror, see the [CodeMirror 6 editor](./sparql-editor-codemirror).

```bash
npm i --save @rdfjs/sparql-editor-monaco qlue-ls
```

This example uses qlue-ls. Create the worker and configure Vite as shown in
[Getting started](./getting-started#_2-bundler-setup-vite), then mount the editor into `<div id="editor"></div>`:

```ts
import SparqlEditor, { qlueLs } from "@rdfjs/sparql-editor-monaco";
import "@rdfjs/sparql-editor-monaco/style.css";
import QlueLsWorker from "./qlue-ls.worker?worker";

const endpoint = "https://sparql.dblp.org/sparql";
const editor = new SparqlEditor(document.getElementById("editor")!, {
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
editor.on("queryResponse", (editor, response, duration) => console.log(response, duration));
```

Omit `languageServers` for syntax highlighting without completion, diagnostics or formatting.
See [Language server](./language-server) for other servers, lifecycle hooks and runtime switching.

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
editor.destroy();                        // release the editor when unmounting
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

On top of all the standard [Monaco / VS Code](https://code.visualstudio.com/docs/getstarted/keybindings) bindings (multi-cursor, `Ctrl/Cmd + /` to toggle comments, **Format Document** from the right-click menu, ...), the editor adds:

| shortcut | action |
| --- | --- |
| `Ctrl/Cmd + Enter` | run the query |
| `Ctrl/Cmd + S` | share the query (copies a shareable URL; does not trigger the browser save dialog) |

Both also appear at the top of the editor's right-click context menu.
