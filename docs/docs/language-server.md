# Language server

Smart features, autocompletion, diagnostics, hover, formatting and semantic highlighting, come from
a **SPARQL language server (LSP)** running in a Web Worker. Yasqe and Yasgui are language-server
**agnostic**: you pass them a ready LSP `Worker` and they wire a `monaco-languageclient` to it.

The recommended server is [**qlue-ls**](https://github.com/IoannisNezis/Qlue-ls), a fast WASM SPARQL
language server. Yasqe ships the qlue-ls plumbing (settings, backend/endpoint registration, prefix
discovery, completion-query templates and types) under the `qlueLs` namespace, so the only thing you
write yourself is the WASM worker:

```ts
import { qlueLs } from "@zazuko/yasqe"; // the Monaco editor; not re-exported from "@zazuko/yasgui"
```

## The worker

qlue-ls is distributed as a WASM module; you wrap it in a Web Worker and resolve a factory once it
signals it is ready. This is the only qlue-ls specific code you maintain (it depends on the `qlue-ls`
package); everything else comes from the `qlueLs` helpers.

:::code-group

```ts [qlue-ls.ts]
import QlueLsWorker from "./qlue-ls.worker?worker";

/** Create a qlue-ls worker and resolve once its WASM is ready. */
export function createQlueLsWorker(): Promise<Worker> {
  return new Promise((resolve) => {
    const worker = new QlueLsWorker({ name: "qlue-ls" });
    worker.onmessage = (e) => {
      if (e.data?.type === "ready") resolve(worker);
    };
  });
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

## Hooking it up

Pass the worker factory as `languageServerWorker`, then use the `qlueLs` helpers to push settings and
register the active endpoint as the default backend (so completions resolve against it).

- With **Yasgui**, register backends from `onEndpointChange` (fires on load, tab switch and endpoint
  edits, once for the whole app):

  ```ts [main.ts]
  import Yasgui from "@zazuko/yasgui";
  import Yasqe, { qlueLs } from "@zazuko/yasqe";
  import { createQlueLsWorker } from "./qlue-ls";

  new Yasgui(el, {
    // Yasgui is editor-independent: pass an editor factory and wire the worker into the editor.
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

- With **Yasqe**, do both from `onLanguageClientReady`:

  ```ts [main.ts]
  import Yasqe, { qlueLs } from "@zazuko/yasqe";
  import { createQlueLsWorker } from "./qlue-ls";

  new Yasqe(el, {
    languageServerWorker: createQlueLsWorker,
    onLanguageClientReady: (lc) => {
      qlueLs.configureSettings(lc);
      qlueLs.configureBackend(lc, "https://sparql.dblp.org/sparql");
    },
  });
  ```

`qlueLs.configureBackend` is safe to call repeatedly (it skips re-registering the same endpoint).
`yasqe.getLanguageClient()` returns the underlying `monaco-languageclient`, so you can also send any
other LSP request or custom notification yourself.

## The `qlueLs` helpers

| export | what it does |
| --- | --- |
| `configureBackend(client, endpoint, options?)` | register `endpoint` as the **default** backend so completions resolve against it. Fetches the endpoint's prefixes when none are passed, and uses `defaultCompletionQueries` for term completion. |
| `configureSettings(client, settings?)` | push server settings (formatting, completion, prefix handling). Defaults to `defaultSettings`. |
| `createBackendConf(endpoint, options?)` | build a `BackendConfiguration` (fetching prefixes when not provided) without sending it. |
| `fetchPrefixMap(endpoint)` | query the endpoint for `sh:prefix` / `sh:namespace` declarations, falling back to `fallbackPrefixMap`. |
| `defaultSettings`, `fallbackPrefixMap`, `defaultCompletionQueries` | sensible defaults you can spread/override. |

`BackendOptions` lets you override pieces without rebuilding the config by hand:

```ts
qlueLs.configureBackend(lc, endpoint, {
  prefixMap: { rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#", ...qlueLs.fallbackPrefixMap },
  queries: qlueLs.defaultCompletionQueries, // or your own CompletionTemplate map
  engine: "QLever",
});
```

### The backend object

The qlue-ls `BackendConfiguration` (what `createBackendConf` builds) is flat and camelCase:

| field | required | meaning |
| --- | --- | --- |
| `name` | yes | backend identifier / label |
| `url` | yes | SPARQL endpoint URL |
| `default` | — | whether it is the default backend |
| `prefixMap` | — | `{ prefix: namespace }` used for prefix completion |
| `queries` | — | completion-query templates, keyed by qlue-ls `CompletionTemplate` (`subjectCompletion`, `predicateCompletionContextSensitive`, `objectCompletionContextSensitive`, …). Needed for **term** completion. An empty object still gives prefix/keyword completion. |
| `engine`, `requestMethod`, `healthCheckUrl` | — | optional |

::: tip Auto-discovering prefixes
`configureBackend` / `createBackendConf` call `fetchPrefixMap` for you when you don't pass a
`prefixMap`: many endpoints expose their prefixes via `sh:namespace` / `sh:prefix`, and `qlueLs`
falls back to `fallbackPrefixMap` (a broad set of common vocab prefixes) when none are returned.
:::

## CodeMirror editor (`@zazuko/yasqe-codemirror`)

The Monaco editor (`@zazuko/yasqe`) is the default, but Yasgui is editor-independent: you can build
the editor factory around the CodeMirror 6 editor instead. `@zazuko/yasqe-codemirror` takes a ready
LSP **client** (rather than a worker) via `lsp: { client }`. You own the qlue-ls wiring (transport,
pull diagnostics, semantic-token highlighting) and pass the resulting `@codemirror/lsp-client`
`LSPClient` in:

```ts
import Yasgui from "@zazuko/yasgui";
import Yasqe from "@zazuko/yasqe-codemirror";
import { createQlueLsClient, setQlueLsBackend } from "./qlueLsClient";

const client = await createQlueLsClient({ endpoint });
const lsp = { client };

new Yasgui(el, {
  requestConfig: { endpoint },
  yasqe: (parent, conf) => new Yasqe(parent, { ...conf, lsp }),
  onEndpointChange: (_yasgui, endpoint) => setQlueLsBackend(client, { endpoint }),
});
```

The completion-query templates (`defaultCompletionQueries`) used by the client live in
`@zazuko/yasgui-utils`. See `dev/codemirror.html` and `dev/qlueLsClient.ts` in the repo for the full
qlue-ls wiring (the `qlueLs` helpers above are Monaco-specific and not used here).

## Using a different language server

Yasqe and Yasgui only need a ready LSP `Worker`. The `qlueLs` helpers are a convenience for qlue-ls;
they are not required. To use, for example,
[swls](https://github.com/SemanticWebLanguageServer/swls) instead:

1. Replace `qlue-ls.worker.ts` / `qlue-ls.ts` with that server's worker and connection.
2. Pass its worker factory as `languageServerWorker`.
3. In `onEndpointChange` / `onLanguageClientReady`, send whatever that server needs to target an
   endpoint (its own custom requests) via `getLanguageClient()`.

No changes to the `@zazuko/*` packages are required.
