# Language servers

SPARQL Studio and both editors are language-server agnostic. Supply an LSP Web Worker to add language features; use any of the integrations below or connect your own server.

## Available servers

| npm package | Completion | Semantic highlighting | Diagnostics | Hover | Formatting | Code actions | Example worker |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| [`qlue-ls`](https://www.npmjs.com/package/qlue-ls) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [qluels.worker.ts](https://github.com/rdfjs/Yasgui/blob/main/dev/qluels.worker.ts) |
| [`swls-wasm`](https://www.npmjs.com/package/swls-wasm) | ✅ | ✅ | ✅ | ✅ | - | - | [swls.worker.ts](https://github.com/rdfjs/Yasgui/blob/main/dev/swls.worker.ts) |
| [`@traqula/parser-sparql-1-2`](https://www.npmjs.com/package/@traqula/parser-sparql-1-2) | - | - | ✅ | - | - | - | [traqula.worker.ts](https://github.com/rdfjs/Yasgui/blob/main/dev/traqula.worker.ts) |

The table covers SPARQL features, not support for other RDF languages. A dash means unavailable in the SPARQL integration. Traqula is a parser wrapped in a small LSP adapter in this repository.
Both editors provide syntax highlighting when no semantic tokens are available.

## qlue-ls

[qlue-ls](https://docs.qlue-ls.com/02_capabilities/) is the default in our examples. It runs as WebAssembly and supports endpoint-backed completion, formatting and query fixes. Follow [Getting started](./getting-started) for installation, Vite configuration and the worker.

Import the helpers from `@rdfjs/sparql-utils` (install it as a direct dependency), or from the Monaco editor package:

```ts
import { qlueLs } from "@rdfjs/sparql-utils";
```

Use `configureSettings` and `configureBackend` in the server's lifecycle hooks, as shown [below](#configuration). Backend registration is skipped when the same endpoint is already registered on that client.

### Helpers

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

### Backend configuration

The qlue-ls `BackendConfiguration` (what `createBackendConf` builds) is flat and camelCase:

| field | required | meaning |
| --- | --- | --- |
| `name` | yes | backend identifier / label |
| `url` | yes | SPARQL endpoint URL |
| `default` | No | whether it is the default backend |
| `prefixMap` | No | `{ prefix: namespace }` used for prefix completion |
| `queries` | No | completion-query templates, keyed by qlue-ls `CompletionTemplate` (`subjectCompletion`, `predicateCompletionContextSensitive`, `objectCompletionContextSensitive`, ...). Needed for **term** completion. An empty object still gives prefix/keyword completion. |
| `engine`, `requestMethod`, `healthCheckUrl` | No | optional |

Custom completion queries must return each entity once and bind it as `?qls_entity`. They may also bind
`?qls_label`, `?qls_alias`, `?qls_description`, and `?qls_count`. The alias must be a single value, not a
`GROUP_CONCAT` list; when aliases are searched, use an aggregate such as `SAMPLE(?alias) AS ?qls_alias` after
filtering and group by the entity. qlue-ls uses `?qls_count` to rank results.

::: tip Auto-discovering prefixes
`configureBackend` / `createBackendConf` call `fetchPrefixMap` for you when you don't pass a `prefixMap`: many endpoints expose their prefixes via `sh:namespace` / `sh:prefix`, and `qlueLs` falls back to `fallbackPrefixMap` (a broad set of common vocab prefixes) when none are returned.
:::

## swls

[Semantic Web Language Server](https://github.com/SemanticWebLanguageServer/swls) supports SPARQL and other RDF languages. Its SPARQL support includes completion, diagnostics, hover and semantic tokens; its document formatters target Turtle and JSON-LD. See the [SPARQL implementation](https://github.com/SemanticWebLanguageServer/swls/blob/main/lang-sparql/src/lib.rs) for language-specific support.

Install `swls-wasm` and use the [example worker](https://github.com/rdfjs/Yasgui/blob/main/dev/swls.worker.ts). It converts the server's `Content-Length` frames to JSON-RPC messages. Use the same Vite WASM setup as qlue-ls; no `qlueLs` hooks are needed.

## Traqula

The [Traqula worker](https://github.com/rdfjs/Yasgui/blob/main/dev/traqula.worker.ts) runs the SPARQL 1.2 parser on document changes and publishes syntax errors as LSP diagnostics. It provides no completion or semantic tokens, so the editor uses its built-in syntax highlighting.

```bash
npm i --save @traqula/parser-sparql-1-2 @traqula/chevrotain
```

Copy the worker into your app and add it to `languageServers`. It runs in JavaScript and needs no WASM plugin or server-specific hooks.

## Configuration

Both editors accept the same `languageServers` array. For example, after copying the workers into your app:

```ts
import { qlueLs } from "@rdfjs/sparql-utils";
import QlueLsWorker from "./qlue-ls.worker?worker";
import SwlsWorker from "./swls.worker?worker";
import TraqulaWorker from "./traqula.worker?worker";

const endpoint = "https://sparql.dblp.org/sparql";
const editor = new SparqlEditor(el, {
  requestConfig: { endpoint },
  languageServers: [
    {
      label: "Qlue-ls",
      worker: () => new QlueLsWorker(),
      onReady: (client) => {
        qlueLs.configureSettings(client);
        qlueLs.configureBackend(client, endpoint);
      },
      onEndpointChange: (client, endpoint) => qlueLs.configureBackend(client, endpoint),
      configSchema: qlueLs.settingsSchema,
      configCallback: (client, settings) => qlueLs.configureSettings(client, settings),
    },
    { label: "swls", worker: () => new SwlsWorker() },
    { label: "Traqula", worker: () => new TraqulaWorker() },
  ],
});
```

Import `SparqlEditor` and its CSS from your chosen [Monaco](./sparql-editor-monaco) or [CodeMirror](./sparql-editor-codemirror) package. In Studio, pass these options through the [editor factory](./sparql-studio#the-editor-factory) and read the active tab's endpoint in `onReady`, as in [Getting started](./getting-started#_4-mount-sparqlstudio).

| Field | Purpose |
| --- | --- |
| `label`, `description?` | Name and optional description shown in the server menu |
| `worker` | Worker instance or factory returning a worker (optionally a Promise); prefer a factory for one worker per editor |
| `onReady(connection, editor)` | Configure the server when it becomes active |
| `onEndpointChange(connection, endpoint, editor)` | Update the active server when the endpoint changes |
| `configSchema`, `configCallback` | Define a settings panel and apply its values to the server |
| `languageId`, `documentUri` | CodeMirror document identity overrides; defaults to `sparql` and a unique URI per editor. Monaco uses `sparql` and an automatically assigned URI. |

Hooks receive an editor-independent connection with `sendRequest` and `sendNotification`. Only the active server's hooks run. Studio also has a separate app-wide `onEndpointChange(studio, endpoint)` callback.

### Switching servers

The first entry starts on load. With two or more entries, Monaco offers a context-menu switcher and CodeMirror a toolbar dropdown. Studio remembers the choice per endpoint. Worker factories run only when their server is activated.

Use worker factories when offering several servers. Monaco terminates the outgoing worker and creates a new one when switching back; CodeMirror keeps inactive clients cached. Destroying either editor releases all its workers, including supplied instances. Startup and initialization each time out after 30 seconds; `setLanguageServer()` rejects on failure and the editor shows a notification.

```ts
editor.getLanguageServers();              // labels and descriptions
editor.getActiveLanguageServer();         // active index
await editor.setLanguageServer("Qlue-ls"); // label or index
editor.notifyEndpointChange(endpoint);    // needed for standalone endpoint changes
editor.getLanguageClient();               // native client for the selected editor
```

`getLanguageClient()` returns a Monaco language client or a CodeMirror `LSPClient`, depending on the editor. Use the connection passed to hooks when writing server setup shared by both editors.

### Other servers

Create a worker that posts `{ type: "ready" }` once initialized, then exchanges JSON-RPC messages through `postMessage` and `onmessage`. Add it as a `languageServers` entry and use its hooks for server-specific setup. No changes to the editor packages are required.
