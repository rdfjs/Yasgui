# Getting started

To embed SPARQL Studio, choose an editor and a language server. This guide uses the hosted app's defaults:
[Monaco](./sparql-editor-monaco) and [qlue-ls](./language-server#qlue-ls). You can use
[CodeMirror 6](./sparql-editor-codemirror) with the same server configuration, or choose another
[language server](./language-server).

For standalone components, see the editor pages or [Results](./sparql-results).

## 1. Install

```bash
npm i --save @rdfjs/sparql-studio @rdfjs/sparql-editor-monaco qlue-ls
```

For Vite, add the WASM plugin used to load qlue-ls:

```bash
npm i -D vite-plugin-wasm
```

Monaco is ESM-only. The other packages also ship [UMD bundles](#without-a-bundler-codemirror) for plain script tags. The examples below use ESM with Vite.

Each package ships its own CSS that you must import once:

```js
import "@rdfjs/sparql-studio/style.css";
import "@rdfjs/sparql-editor-monaco/style.css";
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
Without a language server, both editors still provide syntax highlighting. The WASM setup is only needed for servers that use WebAssembly.
:::

## 3. Set up the language server

Create a worker that loads qlue-ls and forwards LSP messages. Both editors wait for its `ready` message before connecting.

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

Add a container to your page:

```html
<div id="sparqlStudio"></div>
```

The `editor` factory creates one editor that Studio reuses across tabs. Its `languageServers` entries define the workers and any server-specific setup:

```ts
import SparqlStudio from "@rdfjs/sparql-studio";
import SparqlEditor, { qlueLs } from "@rdfjs/sparql-editor-monaco";
import "@rdfjs/sparql-studio/style.css";
import "@rdfjs/sparql-editor-monaco/style.css";
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

::: info CodeMirror instead of Monaco
Install `@rdfjs/sparql-editor-codemirror` in place of the Monaco package and change the editor and CSS imports to it. Import `qlueLs` from `@rdfjs/sparql-utils` (add it as a direct dependency). The factory and `languageServers` entries stay the same.
:::

To offer several servers, add entries to `languageServers`. Studio remembers the user's choice per endpoint.
See [Language server](./language-server) for the available servers and their configuration.

## Without a bundler (CodeMirror)

Load the CodeMirror editor and Studio bundles with their styles:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@rdfjs/sparql-studio/build/sparql-studio.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@rdfjs/sparql-editor-codemirror/build/sparql-editor-codemirror.css" />
<script src="https://cdn.jsdelivr.net/npm/@rdfjs/sparql-editor-codemirror/build/sparql-editor-codemirror.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@rdfjs/sparql-studio/build/sparql-studio.umd.js"></script>

<div id="sparqlStudio"></div>
<script>
  const studio = new SparqlStudio.SparqlStudio(document.getElementById("sparqlStudio"), {
    requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
    editor: (parent, conf) => new SparqlEditorCodeMirror.SparqlEditor(parent, conf),
  });
</script>
```

Pin matching package versions in production. This example supports query editing and execution without a language server. To add one, pass `languageServers` through the editor factory with a worker URL you host; see [Language server](./language-server). Use ESM when adding external CodeMirror extensions, so they share the editor's CodeMirror dependencies.

## Framework integration

`SparqlStudio` is a plain DOM library, so it drops into any framework: mount it into a ref/element on mount and call `destroy()` on unmount. React example:

```tsx
import { useEffect, useRef } from "react";
import SparqlStudio from "@rdfjs/sparql-studio";
import SparqlEditor from "@rdfjs/sparql-editor-monaco";
import "@rdfjs/sparql-studio/style.css";
import "@rdfjs/sparql-editor-monaco/style.css";

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
