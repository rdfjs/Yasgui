/* eslint-disable no-console */
/**
 * swls SPARQL language server running as a Web Worker (WASM).
 *
 * Consumer-side config: sparqlEditor is language server agnostic and just receives this worker.
 * Unlike qlue-ls, swls speaks length-prefixed LSP frames (`Content-Length` headers), so this
 * worker frames outgoing messages and deframes incoming bytes back into JSON-RPC objects.
 *
 * The WASM is loaded once up front and the worker only signals "ready" afterwards. The host waits
 * for that signal before connecting a language client, so the initialize/initialized/didOpen burst
 * can't arrive before the server exists (a lazy per-message import races that burst and corrupts
 * message ordering, which left semantic-token highlighting unapplied).
 */
class LspMessageSplitter {
  private buffer: Uint8Array = new Uint8Array(0);
  private readonly asciiDecoder = new TextDecoder("ascii");
  private readonly utf8Decoder = new TextDecoder("utf-8");

  /**
   * Push raw bytes into the splitter.
   * Returns zero or more complete LSP message payloads (JSON text).
   */
  push(chunk: Uint8Array): string[] {
    this.buffer = concat(this.buffer, chunk);
    const messages: string[] = [];
    while (true) {
      const headerEnd = indexOfDoubleCRLF(this.buffer);
      if (headerEnd === -1) break;
      const headerBytes = this.buffer.subarray(0, headerEnd);
      const headerText = this.asciiDecoder.decode(headerBytes);
      const match = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!match) {
        throw new Error("Invalid LSP header: missing Content-Length");
      }
      const contentLength = Number(match[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) break;
      const messageBytes = this.buffer.subarray(messageStart, messageEnd);
      const messageText = this.utf8Decoder.decode(messageBytes);
      messages.push(messageText);
      // Consume processed bytes
      this.buffer = this.buffer.subarray(messageEnd);
    }
    return messages;
  }
}

/* ----------------- helpers ----------------- */

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfDoubleCRLF(buf: Uint8Array): number {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (
      buf[i] === 13 && // \r
      buf[i + 1] === 10 && // \n
      buf[i + 2] === 13 &&
      buf[i + 3] === 10
    ) {
      return i;
    }
  }
  return -1;
}

const encoder = new TextEncoder();
const deframer = new LspMessageSplitter();

/**
 * swls logs through this callback as verbose structured (JSON) lines. Surface only WARN/ERROR (and
 * anything that isn't a recognizable structured log) so the console isn't flooded with INFO traces.
 */
function logFromSwls(...args: unknown[]) {
  const line = args[0];
  if (typeof line === "string") {
    try {
      const level = JSON.parse(line).level;
      if (level === "INFO" || level === "DEBUG" || level === "TRACE") return;
    } catch {
      // not a structured log line; fall through and print it
    }
  }
  console.log(...args);
}

(async () => {
  const mod = await import("swls-wasm");
  const lsp = new mod.WasmLsp((bytes: Uint8Array) => {
    // Language Server -> Language Client: deframe and forward each complete message as JSON.
    for (const msg of deframer.push(bytes)) self.postMessage(JSON.parse(msg));
  }, logFromSwls);

  // Language Client -> Language Server: frame as a length-prefixed LSP message.
  self.onmessage = (event) => {
    const payload = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    // Content-Length is a byte count; the server reads UTF-8 bytes, so measure bytes, not chars.
    const framed = `Content-Length: ${encoder.encode(payload).length}\r\n\r\n${payload}`;
    lsp.send(framed);
  };

  // Signal to the host that the WASM server is initialized and ready to connect.
  self.postMessage({ type: "ready" });
})();

export {};
