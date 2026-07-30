# Language server

Smart features, completion, diagnostics, hover, formatting and semantic highlighting, come from a **SPARQL language server (LSP)** running in a Web Worker.

`SparqlEditor` and `SparqlStudio` are language-server **agnostic**: you pass them an LSP `Worker` (or a factory that returns one) and they connect a language client to it for you, waiting until the worker signals it is ready. The same worker works in both editors (Monaco connects a `monaco-languageclient`; CodeMirror builds an `LSPClient` internally).

The server used throughout this documentation is [**qlue-ls**](https://github.com/IoannisNezis/Qlue-ls), a fast WASM SPARQL language server. `SparqlEditor` ships the qlue-ls plumbing (settings, backend/endpoint registration, prefix discovery, completion-query templates and types) under the `qlueLs` namespace, so the only thing you write yourself is the WASM worker:

```ts
import { qlueLs } from "@rdfjs/sparql-utils";
```

## The worker

qlue-ls is distributed as a WASM module; you wrap it in a Web Worker that posts a `ready` message once its WASM is initialized. The editor waits for that signal before connecting the client, so you hand it the worker directly, no readiness wrapper or Promise needed. This is the only qlue-ls specific code you maintain (it depends on the `qlue-ls` package); everything else comes from the `qlueLs` helpers.

The worker file is the same for both editors, see the copy-paste version in [Getting started · Set up the language server](./getting-started#_3-set-up-the-language-server). The **contract** is all that matters here: post `{ type: "ready" }` once started, then bridge messages both ways between `self` and the WASM server. Any server that honors that contract works.

## Hooking it up

Configure one or more servers through the `languageServers` array. Each entry has a `label`, the `worker` (instance or factory) and two optional **per-server** hooks, only the *active* server's hooks fire:

- `onReady(client, editor)` · runs when that server becomes active (on load or when switched to). Use it to push settings and register the active endpoint as the default backend.
- `onEndpointChange(client, endpoint, editor)` · runs when the endpoint changes while that server is active. Use it to re-register the backend for the new endpoint.

The first entry is activated on load; with two or more configured, a switcher appears (right-click the editor in Monaco, a dropdown in CodeMirror) and the user's choice is remembered per endpoint.

  ```ts [main.ts]
  import SparqlStudio from "@rdfjs/sparql-studio";
  import SparqlEditor, { qlueLs } from "@rdfjs/sparql-editor-monaco";
  import QlueLsWorker from "./qlue-ls.worker?worker";

  new SparqlStudio(el, {
    // SparqlStudio is editor-independent: pass an editor factory and list the servers in the editor.
    editor: (parent, conf) =>
      new SparqlEditor(parent, {
        ...conf,
        languageServers: [
          {
            label: "Qlue-ls",
            description: "SPARQL language server with endpoint-powered completions",
            worker: () => new QlueLsWorker({ name: "qlue-ls" }),
            onReady: (client) => {
              qlueLs.configureSettings(client);
              qlueLs.configureBackend(client, sparqlStudio?.getTab()?.getEndpoint());
            },
            onEndpointChange: (client, endpoint) => qlueLs.configureBackend(client, endpoint),
          },
        ],
      }),
  });
  ```

Standalone **SparqlEditor** takes the identical `languageServers` array (it is the editor's own option), the per-server `onReady` and `onEndpointChange` carry the setup, except you trigger the latter yourself with `sparqlEditor.notifyEndpointChange(endpoint)` since there is no SparqlStudio to call it. See [SPARQL Editor](./sparql-editor) for the standalone example.

::: warning Per-server vs SparqlStudio-level
The per-server `onEndpointChange` only fires for the active server, so each server handles endpoints its own way. SparqlStudio still has a top-level `onEndpointChange(sparqlStudio, endpoint)` for app-wide, server-independent work (analytics, UI). Both fire.
:::

`qlueLs.configureBackend` is safe to call repeatedly (it skips re-registering the same endpoint on the same client). `sparqlEditor.getLanguageClient()` returns the active `monaco-languageclient`, so you can also send any other LSP request or custom notification yourself.

::: tip Offering several servers
List more than one entry to let users switch at runtime (e.g. qlue-ls for QLever endpoints, another server for large Virtuoso ones). Each entry's `worker` is resolved lazily the first time it is activated, so unused servers are never started. The reserved `configSchema` / `configCallback` fields are placeholders for a future generic config UI and are not yet implemented.
:::

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
`configureBackend` / `createBackendConf` call `fetchPrefixMap` for you when you don't pass a `prefixMap`: many endpoints expose their prefixes via `sh:namespace` / `sh:prefix`, and `qlueLs` falls back to `fallbackPrefixMap` (a broad set of common vocab prefixes) when none are returned.
:::

## CodeMirror editor (`@rdfjs/sparql-editor-codemirror`)

The Monaco editor (`@rdfjs/sparql-editor-monaco`) is the default, but SparqlStudio is editor-independent: you can build the editor factory around the CodeMirror 6 editor instead. The `languageServers` config is **identical**, same `worker` field, same `qlueLs` helpers (they operate on the editor-agnostic connection passed to `onReady` / `onEndpointChange`). The only change is the editor import; CodeMirror builds the `@codemirror/lsp-client` `LSPClient` from your worker internally:

```ts
import SparqlStudio from "@rdfjs/sparql-studio";
import SparqlEditor from "@rdfjs/sparql-editor-codemirror";
import { qlueLs } from "@rdfjs/sparql-utils";
import QlueLsWorker from "./qlue-ls.worker?worker";

new SparqlStudio(el, {
  requestConfig: { endpoint },
  editor: (parent, conf) =>
    new SparqlEditor(parent, {
      ...conf,
      languageServers: [
        {
          label: "Qlue-ls",
          worker: () => new QlueLsWorker({ name: "qlue-ls" }),
          onReady: (conn) => qlueLs.configureBackend(conn, sparqlStudio?.getTab()?.getEndpoint()),
          onEndpointChange: (conn, endpoint) => qlueLs.configureBackend(conn, endpoint),
        },
      ],
    }),
});
```

With two or more entries the editor shows a labelled switcher dropdown in its toolbar (left of the
format/share/run buttons). See `dev/codemirror.html` in the repo for the full reference wiring.

## Using a different language server

SparqlEditor and SparqlStudio only need an LSP `Worker` (the same field for both editors). The `qlueLs` helpers are a convenience for qlue-ls; they are not required. To use, for example, [swls](https://github.com/SemanticWebLanguageServer/swls) instead:

1. Replace `qlue-ls.worker.ts` with that server's worker (it must post a `ready` message once started).
2. Add it as another `languageServers` entry (its own `worker`), alongside or instead of qlue-ls.
3. In that entry's `onReady` / `onEndpointChange`, send whatever that server needs to target an endpoint (its own custom requests) on the connection you receive.

No changes to the `@rdfjs/*` packages are required.
