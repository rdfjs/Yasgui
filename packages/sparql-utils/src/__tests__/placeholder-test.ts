import { strict as assert } from "assert";
import { describe, it } from "mocha";
import { configureBackend } from "../languageServers/qlueLs";
import { waitWorkerReady, waitLanguageServerReady } from "../languageServers/worker";

describe("Language server regressions", () => {
  it("keeps the latest endpoint when prefix lookups finish out of order", async () => {
    const fetch = globalThis.fetch;
    const requests: ((response: Response) => void)[] = [];
    const backends: string[] = [];
    globalThis.fetch = () => new Promise<Response>((resolve) => requests.push(resolve));
    try {
      const client = {
        sendNotification(method: string, params: any) {
          if (method === "qlueLs/addBackend") backends.push(params.url);
        },
      };
      const old = configureBackend(client, "https://old.example/sparql");
      const current = configureBackend(client, "https://current.example/sparql");
      const response = () => new Response(JSON.stringify({ results: { bindings: [] } }));
      requests[1](response());
      await current;
      requests[0](response());
      await old;
      assert.deepEqual(backends, ["https://current.example/sparql"]);
    } finally {
      globalThis.fetch = fetch;
    }
  });

  it("rejects failed worker startup and cancels pending initialization", async () => {
    const worker = new EventTarget() as Worker;
    const controller = new AbortController();
    const ready = waitWorkerReady(worker, controller.signal);
    worker.dispatchEvent(new Event("error"));
    await assert.rejects(ready, /worker failed/);
    const initializing = waitLanguageServerReady(new Promise(() => {}), controller.signal);
    controller.abort();
    await assert.rejects(initializing, { name: "AbortError" });
  });
});
