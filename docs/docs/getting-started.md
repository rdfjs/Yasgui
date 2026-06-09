# Getting started

This guide embeds the full Yasgui app with the recommended **qlue-ls** language server. If you only
need the editor or the result viewer, see [Yasqe](./yasqe) and [Yasr](./yasr).

## 1. Install

```bash
npm install @zazuko/yasgui          # or @zazuko/yasqe / @zazuko/yasr individually
```

To use the qlue-ls language server (recommended), also add it and the Vite WASM plugin to **your
app**:

```bash
npm install qlue-ls
npm install -D vite-plugin-wasm
```

The `@zazuko/*` packages are **self-contained ESM bundles** (Monaco and the language client are
bundled in), you do **not** need to install `monaco-editor`. They also ship a UMD build, but the
**ESM build is the one that works** (Monaco loads its workers via `import.meta.url`, which UMD
can't do). Use a modern bundler (Vite recommended).

Each package ships its own CSS that you must import once:

```js
import "@zazuko/yasgui/build/yasgui.min.css";
// or for standalone use:
// import "@zazuko/yasqe/build/yasqe.min.css";
// import "@zazuko/yasr/build/yasr.min.css";
```

## 2. Bundler setup (Vite)

Because the qlue-ls worker loads WebAssembly, your app's Vite config needs `vite-plugin-wasm` and
ES-module workers:

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

::: info
If you don't use a language server at all, none of this is needed, the editor still does syntax
highlighting.
:::

## 3. Set up the qlue-ls language server

The language server runs in a **Web Worker**. Create two small files in your app. They are the only
files you change to switch to a different SPARQL language server later. See the
[Language server](./language-server) page for the full versions; here is the minimal setup:

:::code-group

```ts [qlue-ls.ts]
// qlue-ls.ts
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

/** Register a SPARQL endpoint as the default qlue-ls backend so completions resolve against it. */
let last: string | undefined;
export async function configureQlueLsBackend(languageClient: any, endpoint: string) {
  if (!languageClient || !endpoint || endpoint === last) return;
  last = endpoint;
  const backend = {
    name: endpoint, // backend label/id (the endpoint URL is fine)
    url: endpoint,
    default: false,
    prefixMap: {
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    },
    queries: {}, // optional completion-query templates, see the Language server page
  };
  // qlueLs/addBackend and qlueLs/updateDefaultBackend are LSP notifications (no response)
  languageClient.sendNotification("qlueLs/addBackend", backend);
  languageClient.sendNotification("qlueLs/updateDefaultBackend", { backendName: backend.name });
}
```

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

  self.onmessage = (msg) => writer.write(JSON.stringify(msg.data));
  (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      self.postMessage(JSON.parse(value));
    }
  })();

  self.postMessage({ type: "ready" }); // tell the host the WASM is initialized
});
export {};
```

:::

## 4. Mount Yasgui

```ts
import Yasgui from "@zazuko/yasgui";
import "@zazuko/yasgui/build/yasgui.min.css";
import { createQlueLsWorker, configureQlueLsBackend } from "./qlue-ls";

const yasgui = new Yasgui(document.getElementById("yasgui")!, {
  requestConfig: { endpoint: "https://dbpedia.org/sparql" },

  // Provide the language server worker (forwarded to the shared editor)
  languageServerWorker: createQlueLsWorker,

  // Fires on load, tab switch, and endpoint edits, defined once, applies to all tabs.
  // Use it to point the language server at the active endpoint.
  onEndpointChange: (yasgui, endpoint) =>
    configureQlueLsBackend(yasgui.yasqe?.getLanguageClient(), endpoint),
});
```

That is the same setup that powers the [live demo](/). From here:

- [Yasgui (full app)](./yasgui) · the complete config reference.
- [Language server](./language-server) · richer completion queries and using a different LSP.
- [Theming](./theming) · light/dark wiring.
