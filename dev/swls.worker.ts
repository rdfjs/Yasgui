let initialized = false;
let send_to_lsp: (frame: string) => void;
async function handleIncomingMessage(event: MessageEvent) {
  await ensureLspLoaded();

  const payload = typeof event.data === "string" ? event.data : JSON.stringify(event.data);

  const framed = `Content-Length: ${payload.length}\r\n\r\n${payload}`;
  send_to_lsp(framed);
}

class LspDeframer {
  buffer = "";
  onMessage: (msg: any) => void;

  constructor(onMessage: (msg: any) => void) {
    this.onMessage = onMessage;
  }

  push(data: string) {
    this.buffer += data;

    while (true) {
      // Look for header terminator
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break; // incomplete header

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        console.error("Invalid LSP header", header);
        this.buffer = ""; // discard invalid data
        break;
      }

      const length = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;

      if (this.buffer.length < bodyEnd) break; // incomplete body

      const bodyStr = this.buffer.slice(bodyStart, bodyEnd);
      try {
        const msg = JSON.parse(bodyStr);
        this.onMessage(msg);
      } catch (e) {
        console.error("Invalid JSON body", bodyStr, e);
        console.error(this.buffer);
      }

      // Remove processed message from buffer
      this.buffer = this.buffer.slice(bodyEnd);
    }
  }
}

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

let deframer = new LspMessageSplitter();
async function ensureLspLoaded() {
  if (!initialized) {
    console.log("[worker] importing swls-web…");
    const mod = await import("swls-wasm");
    const t = new mod.WasmLsp((x: Uint8Array) => {
      for (const msg of deframer.push(x)) {
        postMessage(JSON.parse(msg));
      }
    }, console.log);
    send_to_lsp = t.send.bind(t);
    initialized = true;
  }
}

onmessage = handleIncomingMessage;
