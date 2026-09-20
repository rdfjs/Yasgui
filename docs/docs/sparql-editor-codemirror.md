# CodeMirror 6 editor

`@rdfjs/sparql-editor-codemirror` provides a standalone SPARQL editor built on CodeMirror 6.
Use it on its own or in a [Studio editor factory](./sparql-studio#the-editor-factory).
It accepts the same language server entries as the [Monaco editor](./sparql-editor-monaco).

## Install and mount

```bash
npm i --save @rdfjs/sparql-editor-codemirror @rdfjs/sparql-utils qlue-ls
```

This example uses qlue-ls. Create the worker and configure Vite as shown in
[Getting started](./getting-started#_2-bundler-setup-vite), then mount the editor into `<div id="editor"></div>`:

```ts
import SparqlEditor from "@rdfjs/sparql-editor-codemirror";
import { qlueLs } from "@rdfjs/sparql-utils";
import "@rdfjs/sparql-editor-codemirror/style.css";
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
      onEndpointChange: (client, endpoint) => qlueLs.configureBackend(client, endpoint),
    },
  ],
});

editor.on("queryResponse", (editor, response, duration) => console.log(response, duration));
```

Omit `languageServers` for syntax highlighting without server features. With several servers, a dropdown
in the toolbar lets users switch between them. See [Language server](./language-server) for the choices and hooks.

## Configuration

| Option | Description |
| --- | --- |
| `value` | Initial query string |
| `requestConfig` | Endpoint and [request settings](./request-config) |
| `languageServers` | Workers and lifecycle hooks for the available servers |
| `theme` | `"light"` or `"dark"`; defaults to the OS preference |
| `lineNumbers`, `lineWrapping` | Show line numbers and wrap long lines |
| `highlightActiveLine`, `matchBrackets` | Highlight the current line and matching brackets |
| `foldGutter` | Allow folding the leading `PREFIX` / `BASE` declarations |
| `readOnly` | Disable editing |
| `extensions` | Additional CodeMirror 6 extensions |
| `editorHeight`, `resizeable` | Initial CSS height and whether users can resize the editor |
| `showQueryButton` | Show the run button |
| `persistenceId` | Local storage namespace |

CodeMirror options are top-level fields; `editorOptions` is specific to Monaco.

## Programmatic API

```ts
editor.getValue();
editor.setValue("SELECT * WHERE { ?s ?p ?o } LIMIT 10");
await editor.query();
editor.abortQuery();
editor.setTheme("dark");
editor.focus();

await editor.setLanguageServer("Qlue-ls"); // label or index
editor.notifyEndpointChange(endpoint);   // notify the active server in standalone use
editor.getLanguageClient();              // active CodeMirror LSPClient, or undefined
editor.destroy();                       // release the editor when unmounting
```

Query events use `(editor, ...payload)`, including `queryResponse(editor, response, duration)`.
For complete types and methods, see the [API reference](/api/).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Enter` | Run the query |
| `Ctrl/Cmd + S` | Copy a shareable query URL |
| `Ctrl/Cmd + /` | Toggle line comments |
| `Shift + Alt + F` | Format the query, if supported by the active server |

Standard CodeMirror editing, search, undo and completion shortcuts are also available.
