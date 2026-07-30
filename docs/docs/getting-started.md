# Getting started

This guide embeds the full SparqlStudio app with the **qlue-ls** language server. If you only
need the editor or the result viewer, see [Editor](./sparql-editor) and [Results](./sparql-results).

## 1. Install

```bash
npm install @rdfjs/sparql-studio
```

To use the qlue-ls language server, also add it and the Vite WASM plugin to **your app**:

```bash
npm install qlue-ls
npm install -D vite-plugin-wasm
```

The `@rdfjs/*` packages are **self-contained ESM bundles** (Monaco and the language client are bundled in), you do **not** need to install `monaco-editor`. They are **ESM only** (Monaco loads its workers via `import.meta.url`, which UMD can't do), so use a modern bundler (Vite recommended).

Each package ships its own CSS that you must import once:

```js
import "@rdfjs/sparql-studio/style.css";
// or for standalone use:
// import "@rdfjs/sparql-editor-monaco/style.css";
// import "@rdfjs/sparql-results/style.css";
```

## 2. Bundler setup (Vite)

Because the qlue-ls worker loads WebAssembly, your app's Vite config needs `vite-plugin-wasm` and ES-module workers:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [wasm()],
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
});
```

::: info No language server
If you don't use a language server at all, none of this is needed, the editor still does syntax highlighting.
:::

## 3. Set up the language server

The language server runs in a **Web Worker**. The qlue-ls backend/settings plumbing ships with the package (the `qlueLs` helpers), so the only file you write is the worker itself, which is also the only file you change to switch to a different SPARQL language server later. You pass that worker straight to the editor: it waits for the worker to signal it is ready, then connects the LSP client for you, so no readiness wrapper is needed.

See the [Language server](./language-server) page for details, here is the minimal setup:

```ts [qlue-ls.worker.ts]
// @ts-ignore qlue-ls is loaded as a WASM module via vite-plugin-wasm
import init, { init_language_server, listen } from "qlue-ls?init";

init().then(() => {
  const input = new TransformStream();
  const output = new TransformStream();
  const reader = output.readable.getReader();
  const writer = input.writable.getWriter();

  const server = init_language_server(output.writable.getWriter());
  listen(server, input.readable.getReader());

  // Bridge: language client -> server, and server -> language client.
  self.onmessage = (msg) => writer.write(JSON.stringify(msg.data));
  (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      self.postMessage(JSON.parse(value));
    }
  })();

  // Tell the editor the WASM server is initialized; it waits for this before connecting.
  self.postMessage({ type: "ready" });
});
export {};
```

## 4. Mount SparqlStudio

`SparqlStudio` is editor-independent, so you build the editor yourself. Pass the worker instance, the editor waits for its "ready" signal and connects the client. Per-entry hooks `(onReady, onEndpointChange)` fire only while that server is active.

```ts
import SparqlStudio from "@rdfjs/sparql-studio";
import SparqlEditor, { qlueLs } from "@rdfjs/sparql-editor-monaco";
import "@rdfjs/sparql-studio/style.css";
import QlueLsWorker from "./qlue-ls.worker?worker";

const sparqlStudio = new SparqlStudio(document.getElementById("sparqlStudio")!, {
  requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
  editor: (parent, conf) =>
    new SparqlEditor(parent, {
      ...conf,
      languageServers: [
        {
          label: "Qlue-ls",
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

::: tip Offering several servers
Add more entries to `languageServers` to let users switch at runtime; with two or more, a switcher appears (right-click in Monaco, a dropdown in CodeMirror) and the choice is remembered per endpoint.
:::

::: info CodeMirror instead of Monaco
The factory is also where you choose the editor implementation. To use the CodeMirror 6 editor, import `SparqlEditor` from `@rdfjs/sparql-editor-codemirror` instead. The `languageServers` config is identical, both editors take the same `worker` (Monaco connects a language client to it, CodeMirror builds an `LSPClient` from it internally). See [Language server](./language-server).
:::

## Framework integration

`SparqlStudio` is a plain DOM library, so it drops into any framework: mount it into a ref/element on mount and call `destroy()` on unmount. React example:

```tsx
import { useEffect, useRef } from "react";
import SparqlStudio from "@rdfjs/sparql-studio";
import SparqlEditor from "@rdfjs/sparql-editor-monaco";
import "@rdfjs/sparql-studio/style.css";

export function Sparql() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sparqlStudio = new SparqlStudio(el.current!, {
      requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
      editor: (parent, conf) => new SparqlEditor(parent, { ...conf /* + languageServers */ }),
    });
    return () => sparqlStudio.destroy();
  }, []);
  return <div ref={el} />;
}
```
