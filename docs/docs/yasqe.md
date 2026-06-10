# Yasqe (editor)

`@zazuko/yasqe` is the SPARQL query editor on its own, the Monaco editor plus an optional language
client. Use it when you want only the editor, without tabs or the result viewer.

```ts
import Yasqe from "@zazuko/yasqe";
import "@zazuko/yasqe/style.css";
import { createQlueLsWorker, configureQlueLsBackend } from "./qlue-ls";

const yasqe = new Yasqe(document.getElementById("yasqe")!, {
  value: "SELECT * WHERE { ?s ?p ?o } LIMIT 10",
  requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
  languageServerWorker: createQlueLsWorker,
  onLanguageClientReady: (languageClient) =>
    configureQlueLsBackend(languageClient, "https://sparql.dblp.org/sparql"),
});

yasqe.on("query", (yasqe, req) => console.log("running", req));
yasqe.on("queryResponse", (yasqe, response, duration) => console.log(response, duration));
```

Without `languageServerWorker`, Yasqe still works as a syntax-highlighted editor, you just don't get
completion, diagnostics or formatting.

::: warning Events are instance-first
Yasqe events are emitted **instance-first**, handlers receive `(yasqeInstance, ...payload)`. For
example `queryResponse` is `(yasqe, response, duration)`.
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
| `languageServerWorker` | the LSP worker; omit for highlighting-only |
| `onLanguageClientReady` | `(languageClient) => void`, fired once the LSP client is connected |
