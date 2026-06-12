/* eslint-disable no-console */
/**
 * qlue-ls SPARQL language server running as a Web Worker (WASM).
 *
 * This is consumer-side config: yasqe is language-server agnostic and just receives this worker.
 */
// @ts-ignore qlue-ls is loaded as a wasm module via vite-plugin-wasm
import init, { init_language_server, listen } from "qlue-ls?init";

// qlue-ls (Rust tracing-wasm) has no log-level API: it routes every level through the
// console. Keep DEBUG/TRACE in dev, but only surface INFO and above in prod
if (import.meta.env.PROD) {
  console.debug = () => {};
  const nativeLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === "string" && /^%c\s*(DEBUG|TRACE)\b/.test(args[0])) return;
    nativeLog(...args);
  };
}

init().then(() => {
  // Connection Worker <-> Language Server (WASM)
  const wasmInputStream = new TransformStream();
  const wasmOutputStream = new TransformStream();
  const wasmReader = wasmOutputStream.readable.getReader();
  const wasmWriter = wasmInputStream.writable.getWriter();

  // Initialize and start language server
  const server = init_language_server(wasmOutputStream.writable.getWriter());
  listen(server, wasmInputStream.readable.getReader());

  // Language Client -> Language Server
  self.onmessage = function (message) {
    wasmWriter.write(JSON.stringify(message.data));
  };
  // Language Server -> Language Client
  (async () => {
    while (true) {
      const { value, done } = await wasmReader.read();
      if (done) break;
      self.postMessage(JSON.parse(value));
    }
  })();

  // Signal to the host that the WASM server is initialized and ready to connect
  self.postMessage({ type: "ready" });
});
export {};
