# Language server

Smart features, autocompletion, diagnostics, hover, formatting and semantic highlighting, come from
a **SPARQL language server (LSP)** running in a Web Worker. Yasqe and Yasgui are language-server
**agnostic**: you pass them a ready LSP `Worker` and they wire a `monaco-languageclient` to it.

The recommended server is [**qlue-ls**](https://github.com/IoannisNezis/Qlue-ls), a fast WASM SPARQL
language server.

## The worker

qlue-ls resolves completions against a registered **backend**. Register one and make it the default
whenever the active endpoint changes

:::code-group

```ts [qlue-ls.ts]
import QlueLsWorker from "./qlue-ls.worker?worker";

export function createQlueLsWorker(): Promise<Worker> {
  return new Promise((resolve) => {
    const worker = new QlueLsWorker({ name: "qlue-ls" });
    worker.onmessage = (e) => {
      if (e.data?.type === "ready") resolve(worker);
    };
  });
}

let last: string | undefined;
export async function configureQlueLsBackend(languageClient: any, endpoint: string) {
  if (!languageClient || !endpoint || endpoint === last) return;
  last = endpoint;
  const backend = await createBackendConf(endpoint);
  // qlueLs/addBackend and qlueLs/updateDefaultBackend are LSP notifications (no response)
  languageClient.sendNotification("qlueLs/addBackend", backend);
  languageClient.sendNotification("qlueLs/updateDefaultBackend", { backendName: backend.name });
}
```

```ts [qlue-ls.worker.ts]
// @ts-ignore qlue-ls is loaded as a WASM module via vite-plugin-wasm
import init, { init_language_server, listen } from "qlue-ls?init";

init().then(() => {
  // Connection Worker <-> Language Server (WASM)
  const wasmInputStream = new TransformStream();
  const wasmOutputStream = new TransformStream();
  const wasmReader = wasmOutputStream.readable.getReader();
  const wasmWriter = wasmInputStream.writable.getWriter();

  // Initialize and start the language server
  const server = init_language_server(wasmOutputStream.writable.getWriter());
  listen(server, wasmInputStream.readable.getReader());

  // Language Client -> Language Server
  self.onmessage = (message) => wasmWriter.write(JSON.stringify(message.data));
  // Language Server -> Language Client
  (async () => {
    while (true) {
      const { value, done } = await wasmReader.read();
      if (done) break;
      self.postMessage(JSON.parse(value));
    }
  })();

  // Signal to the host that the WASM server is initialized and ready
  self.postMessage({ type: "ready" });
});
export {};
```

:::

### The backend object

The qlue-ls `BackendConfiguration` is flat and camelCase:

| field | required | meaning |
| --- | --- | --- |
| `name` | yes | backend identifier / label |
| `url` | yes | SPARQL endpoint URL |
| `default` | — | whether it is the default backend |
| `prefixMap` | — | `{ prefix: namespace }` used for prefix completion |
| `queries` | — | completion-query templates, keyed by qlue-ls `CompletionTemplate` (`subjectCompletion`, `predicateCompletionContextSensitive`, `objectCompletionContextSensitive`, …). Needed for **term** completion. An empty object still gives prefix/keyword completion. |
| `engine`, `requestMethod`, `healthCheckUrl` | — | optional |

```ts
function createBackendConf(endpoint: string) {
  return {
    name: endpoint,
    url: endpoint,
    default: false,
    prefixMap: {
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    },
    queries: {}, // add CompletionTemplate entries for subject/predicate/object completion
  };
}
```

::: tip Auto-discovering prefixes
Many endpoints expose their prefixes via `sh:namespace` / `sh:prefix`. You can query that at
backend-creation time and fall back to a minimal prefix map when none are returned. The live demo's
`qluels.ts` does exactly this.
:::

## Hooking it up

- With **Yasgui**, register backends from `onEndpointChange` (fires on load, tab switch and endpoint
  edits, once for the whole app):

  ```ts [main.ts]
  new Yasgui(el, {
    languageServerWorker: createQlueLsWorker,
    onEndpointChange: (yasgui, endpoint) =>
      configureQlueLsBackend(yasgui.yasqe?.getLanguageClient(), endpoint),
  });
  ```

- With **Yasqe**, use `onLanguageClientReady`:

  ```ts [main.ts]
  new Yasqe(el, {
    languageServerWorker: createQlueLsWorker,
    onLanguageClientReady: (lc) => configureQlueLsBackend(lc, endpoint),
  });
  ```

`yasqe.getLanguageClient()` returns the underlying `monaco-languageclient` so you can send any LSP
request or custom notification.

## Using a different language server

Yasqe and Yasgui only need a ready LSP `Worker`. To use, for example,
[swls](https://github.com/SemanticWebLanguageServer/swls) instead of qlue-ls:

1. Replace `qlue-ls.worker.ts` / `qlue-ls.ts` with that server's worker and connection.
2. Pass its worker factory as `languageServerWorker`.
3. In `onEndpointChange` / `onLanguageClientReady`, send whatever that server needs to target an
   endpoint (its own custom requests).

No changes to the `@zazuko/*` packages are required.
