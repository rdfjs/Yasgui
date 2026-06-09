// Demo-only: wire the qlue-ls SPARQL language server (compiled to WASM) to a
// `@codemirror/lsp-client` LSPClient, which is then passed to Yasqe/Yasgui via config
//
// Yasqe/Yasgui themselves never depend on qlue-ls: the embedder owns the server and
// all the server-specific glue (transport, pull diagnostics, semantic-token highlighting).
import { LSPClient, LSPPlugin, languageServerExtensions, Transport, LSPClientExtension } from "@codemirror/lsp-client";
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
import { setDiagnostics, Diagnostic } from "@codemirror/lint";
import init, { init_language_server, listen } from "qlue-ls";

const SEVERITY: Record<number, Diagnostic["severity"]> = { 1: "error", 2: "warning", 3: "info", 4: "info" };

/* Default completion/hover query templates (Jinja-style, rendered by qlue-ls).
 * Used as the fallback when a backend doesn't supply its own `queries`.
 */
export const DEFAULT_COMPLETION_QUERIES: Record<string, string> = {
  subjectCompletion: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?label) AS ?qlue_ls_label) (SAMPLE(?comment) AS ?qlue_ls_alias) WHERE {
  ?qlue_ls_entity a ?type ; rdfs:label ?label .
  OPTIONAL { ?qlue_ls_entity rdfs:comment ?comment }
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(?label, "^{{ search_term }}")
  {% endif %}
} GROUP BY ?qlue_ls_entity ORDER BY DESC(COUNT(?qlue_ls_entity))
LIMIT {{ limit }} OFFSET {{ offset }}`,

  predicateCompletionContextInsensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?label) AS ?qlue_ls_label) (SAMPLE(?alias) AS ?qlue_ls_alias) ?qlue_ls_score WHERE {
  { SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_score) WHERE
    {
      {{ local_context }}
    } GROUP BY ?qlue_ls_entity
  }
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?qlue_ls_entity), "{{ search_term }}", "i")
  {% endif %}
  OPTIONAL { ?qlue_ls_entity rdfs:label ?label }
  OPTIONAL { ?qlue_ls_entity rdfs:comment ?alias }
} GROUP BY ?qlue_ls_entity ?qlue_ls_score ORDER BY DESC(?qlue_ls_score)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  predicateCompletionContextSensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?qlue_ls_label_or_null) AS ?qlue_ls_label) (SAMPLE(?alias) AS ?qlue_ls_alias) ?qlue_ls_score WHERE {
  {
    SELECT ?qlue_ls_entity (
      {% if subject is variable and context %}
      COUNT(DISTINCT {{ subject }})
      {% else %}
      COUNT(?qlue_ls_entity)
      {% endif %}
      AS ?qlue_ls_score) WHERE {
      {% if subject is variable and context %}
      {{ context }} {{ local_context }}
      {% else %}
      {{ local_context }}
      {% endif %}
    } GROUP BY ?qlue_ls_entity
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?qlue_ls_label_or_null }
  BIND (COALESCE(?qlue_ls_label_or_null, STR(?qlue_ls_entity)) AS ?label)
  OPTIONAL { ?qlue_ls_entity rdfs:comment ?alias }
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?label), "{{ search_term }}", "i")
  {% endif %}
} GROUP BY ?qlue_ls_entity ?qlue_ls_score ORDER BY DESC(?qlue_ls_score)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  objectCompletionContextInsensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?name) AS ?qlue_ls_label) (SAMPLE(?alias) AS ?qlue_ls_alias) ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ local_context }}
    } GROUP BY ?qlue_ls_entity
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?label }
  OPTIONAL { ?qlue_ls_entity rdfs:comment ?alias }
  BIND(COALESCE(?label, STR(?qlue_ls_entity)) AS ?name)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(?name, "^{{ search_term }}")
  {% endif %}
} GROUP BY ?qlue_ls_entity ?qlue_ls_count ORDER BY DESC(?qlue_ls_count)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  objectCompletionContextSensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (SAMPLE(?name) AS ?qlue_ls_label) (SAMPLE(?alias) AS ?qlue_ls_alias) ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ context }} {{ local_context }} .
    } GROUP BY ?qlue_ls_entity
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?label }
  OPTIONAL { ?qlue_ls_entity rdfs:comment ?alias }
  BIND(COALESCE(?label, STR(?qlue_ls_entity)) AS ?name)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(?name, "^{{ search_term }}")
  {% endif %}
} GROUP BY ?qlue_ls_entity ?qlue_ls_count ORDER BY DESC(?qlue_ls_count)
LIMIT {{ limit }} OFFSET {{ offset }}`,

  hover: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_label WHERE {
  OPTIONAL { {{ entity }} rdfs:label ?label }
  OPTIONAL { {{ entity }} rdfs:comment ?comment }
  BIND (
    IF(BOUND(?label) && BOUND(?comment),
      CONCAT(STR(?label), ": ", STR(?comment)),
      COALESCE(STR(?label), STR(?comment), STR({{ entity }}))
    ) AS ?qlue_ls_label
  )
} LIMIT 1`,
};

/* Pull-model diagnostics (`textDocument/diagnostic`) + quick fixes (`textDocument/codeAction`)
 *
 * lsp-client only understands push diagnostics; qlue-ls is pull-only. It has no code-action
 * support at all, so we also request a quick fix per diagnostic and attach it as a
 * `@codemirror/lint` action — rendered as a clickable button in the diagnostic tooltip/panel.
 */

// Apply an LSP WorkspaceEdit to the current editor (single-file SPARQL queries).
function applyWorkspaceEdit(view: EditorView, plugin: LSPPlugin, edit: any) {
  if (!edit) return;
  const uri = plugin.uri;
  let edits: any[] = [];
  if (edit.changes?.[uri]) {
    edits = edit.changes[uri];
  } else if (Array.isArray(edit.documentChanges)) {
    for (const dc of edit.documentChanges) {
      if (dc?.textDocument?.uri === uri && Array.isArray(dc.edits)) edits.push(...dc.edits);
    }
  }
  if (!edits.length) return;
  const changes = edits.map((e) => ({
    from: plugin.fromPosition(e.range.start),
    to: plugin.fromPosition(e.range.end),
    insert: e.newText,
  }));
  view.dispatch({ changes });
}

// Convert one LSP diagnostic into a CodeMirror Diagnostic, attaching any server
// quick fixes as actions. The diagnostic must be passed in the codeAction context.
async function toDiagnostic(plugin: LSPPlugin, item: any): Promise<Diagnostic> {
  let actions: Diagnostic["actions"];
  try {
    const cas: any[] =
      (await plugin.client.request("textDocument/codeAction", {
        textDocument: { uri: plugin.uri },
        range: item.range,
        context: { diagnostics: [item], only: ["quickfix"] },
      })) ?? [];
    const fixes = cas.filter((ca) => ca?.edit && !ca.disabled);
    if (fixes.length) {
      actions = fixes.map((ca) => ({
        name: ca.title,
        apply: (v: EditorView) => applyWorkspaceEdit(v, plugin, ca.edit),
      }));
    }
  } catch {
    // no code actions for this diagnostic
  }
  return {
    from: plugin.fromPosition(item.range.start),
    to: plugin.fromPosition(item.range.end),
    severity: SEVERITY[item.severity ?? 1] ?? "error",
    message: item.message,
    source: item.source,
    actions,
  };
}

function pullDiagnostics(delay = 400): LSPClientExtension {
  const editorExtension = ViewPlugin.define((view) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const plugin = LSPPlugin.get(view);
      if (!plugin) return;
      plugin.client.sync();
      try {
        const result: any = await plugin.client.request("textDocument/diagnostic", {
          textDocument: { uri: plugin.uri },
        });
        // Resolve quick fixes per diagnostic in parallel; qlue-ls answers locally and fast.
        const items: any[] = result?.items ?? [];
        const diagnostics = await Promise.all(items.map((item) => toDiagnostic(plugin, item)));
        view.dispatch(setDiagnostics(view.state, diagnostics));
      } catch {
        // server not ready / request cancelled, retry on next edit
      }
    };
    void run();
    return {
      update(u: ViewUpdate) {
        if (u.docChanged) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(run, delay);
        }
      },
      destroy() {
        if (timer) clearTimeout(timer);
      },
    };
  });
  return { editorExtension };
}

/* Semantic-token highlighting (`textDocument/semanticTokens/full`)
 * lsp-client has no semantic-token support, so we decode them here and
 * render them as decorations. This is the *only* source of highlighting
 * (Yasqe no longer bundles a SPARQL grammar).
 */
const setSemanticTokens = StateEffect.define<DecorationSet>();
const semanticTokensField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setSemanticTokens)) deco = e.value;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const semanticTokensTheme = EditorView.baseTheme({
  ".cm-st-keyword": { color: "#708", fontWeight: "bold" },
  ".cm-st-function": { color: "#00c" },
  ".cm-st-variable": { color: "#225599" },
  ".cm-st-string": { color: "#a11" },
  ".cm-st-number": { color: "#164" },
  ".cm-st-comment": { color: "#940", fontStyle: "italic" },
  ".cm-st-operator": { color: "#a0a" },
  ".cm-st-namespace": { color: "#085" },
});

// Decode the LSP delta-encoded token array (groups of 5:
// [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]).
function decodeSemanticTokens(data: number[], view: EditorView, tokenTypes: string[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  let line = 0;
  let char = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const dLine = data[i];
    const dChar = data[i + 1];
    const len = data[i + 2];
    const typeName = tokenTypes[data[i + 3]];
    if (dLine > 0) {
      line += dLine;
      char = dChar;
    } else {
      char += dChar;
    }
    if (!typeName || len <= 0 || line < 0 || line >= doc.lines) continue;
    const lineObj = doc.line(line + 1);
    const from = Math.min(lineObj.from + char, lineObj.to);
    const to = Math.min(from + len, lineObj.to);
    if (to > from) builder.add(from, to, Decoration.mark({ class: `cm-st-${typeName}` }));
  }
  return builder.finish();
}

function semanticTokens(delay = 200): LSPClientExtension {
  const requester = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined;
      constructor(readonly view: EditorView) {
        void this.run();
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.schedule();
      }
      schedule() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.run(), delay);
      }
      async run() {
        const plugin = LSPPlugin.get(this.view);
        const legend = plugin?.client.serverCapabilities?.semanticTokensProvider?.legend;
        if (!plugin || !legend) return;
        plugin.client.sync();
        try {
          const res: any = await plugin.client.request("textDocument/semanticTokens/full", {
            textDocument: { uri: plugin.uri },
          });
          if (!res?.data) return;
          this.view.dispatch({
            effects: setSemanticTokens.of(decodeSemanticTokens(res.data, this.view, legend.tokenTypes)),
          });
        } catch {
          // ignore — will retry on next edit
        }
      }
      destroy() {
        if (this.timer) clearTimeout(this.timer);
      }
    },
  );
  return {
    clientCapabilities: {
      textDocument: {
        semanticTokens: {
          requests: { full: true },
          tokenTypes: [],
          tokenModifiers: [],
          formats: ["relative"],
        },
      },
    },
    editorExtension: [semanticTokensField, requester, semanticTokensTheme],
  };
}

/* WASM transport
 * qlue-ls exchanges bare JSON-RPC messages (no LSP headers).
 * qlue-ls also *requires* a `range` on every didChange content change, but
 * lsp-client sends rangeless full-document replacements for small docs, so we
 * track each document here and rewrite those into incremental whole-doc edits.
 */
function lineEnd(text: string): { line: number; character: number } {
  let line = 0;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i + 1;
    }
  }
  return { line, character: text.length - last };
}
function offsetAt(text: string, pos: { line: number; character: number }): number {
  let off = 0;
  for (let l = 0; l < pos.line; l++) {
    const nl = text.indexOf("\n", off);
    if (nl < 0) return text.length;
    off = nl + 1;
  }
  return Math.min(off + pos.character, text.length);
}

/**
 * Create a qlue-ls transport for `@codemirror/lsp-client`. Messages are JSON strings
 * (no LSP headers). We track open documents and rewrite rangeless didChange edits
 * into incremental whole-doc edits, as qlue-ls requires a `range` on every change.
 */
function wasmTransport(): Transport {
  let handlers: ((value: string) => void)[] = [];
  const outputWritable = new WritableStream<unknown>({
    write(chunk) {
      const str = typeof chunk === "string" ? chunk : String(chunk);
      for (const h of handlers) h(str);
    },
  });
  let enqueueToWasm!: (str: string) => void;
  const inputReadable = new ReadableStream<string>({
    start(controller) {
      enqueueToWasm = (str) => controller.enqueue(str);
    },
  });
  const server = init_language_server(outputWritable.getWriter());
  listen(server, inputReadable.getReader()).catch((err: unknown) => {
    if (String(err).includes("cancelled")) return;
    console.error("qlue-ls listen error:", err);
  });

  // Track open documents so we can give qlue-ls the `range` it demands on didChange.
  const docs = new Map<string, string>();
  const rewrite = (message: string): string => {
    let msg: any;
    try {
      msg = JSON.parse(message);
    } catch {
      return message;
    }
    if (msg.method === "textDocument/didOpen") {
      docs.set(msg.params.textDocument.uri, msg.params.textDocument.text ?? "");
    } else if (msg.method === "textDocument/didClose") {
      docs.delete(msg.params.textDocument.uri);
    } else if (msg.method === "textDocument/didChange") {
      const uri = msg.params.textDocument.uri;
      let text = docs.get(uri) ?? "";
      let mutated = false;
      for (const ch of msg.params.contentChanges ?? []) {
        if (ch.range == null) {
          ch.range = { start: { line: 0, character: 0 }, end: lineEnd(text) };
          text = ch.text;
          mutated = true;
        } else {
          const from = offsetAt(text, ch.range.start);
          const to = offsetAt(text, ch.range.end);
          text = text.slice(0, from) + ch.text + text.slice(to);
        }
      }
      docs.set(uri, text);
      if (mutated) return JSON.stringify(msg);
    }
    return message;
  };
  return {
    send(message) {
      enqueueToWasm(rewrite(message));
    },
    subscribe(handler) {
      handlers.push(handler);
    },
    unsubscribe(handler) {
      handlers = handlers.filter((h) => h !== handler);
    },
  };
}

export interface QlueLsBackend {
  /** SPARQL endpoint URL used for backend-powered completions. */
  endpoint: string;
  /** Prefix map (prefix -> namespace IRI). */
  prefixMap?: Record<string, string>;
  /** Completion query templates. Required for endpoint-powered subject/predicate/object completion. */
  queries?: Record<string, string>;
  /** Engine hint (e.g. "qlever", "graphdb"). */
  engine?: string;
}

/**
 * qlue-ls server settings, pushed via the `qlueLs/changeSettings` notification.
 * Partial objects are accepted by the server.
 */
export interface QlueLsSettings {
  completion?: {
    timeoutMs?: number;
    resultSizeLimit?: number;
    subjectCompletionTriggerLength?: number;
    objectCompletionSuffix?: boolean;
    variableCompletionLimit?: number;
    sameSubjectSemicolon?: boolean;
  };
  format?: Record<string, unknown>;
  prefixes?: { addMissing?: boolean; removeUnused?: boolean };
}

/** Default server settings. Notably bumps the completion query timeout to 10s. */
export const DEFAULT_SETTINGS: QlueLsSettings = { completion: { timeoutMs: 10000 } };

/**
 * Register `backend` with qlue-ls and make it the active default. qlue-ls upserts by
 * name, so calling this again for the same endpoint updates it in place — use it to
 * keep the server in sync when the editor's endpoint changes.
 */
export function setQlueLsBackend(client: LSPClient, backend: QlueLsBackend): void {
  client.notification("qlueLs/addBackend", {
    name: backend.endpoint,
    url: backend.endpoint,
    default: true,
    engine: backend.engine,
    prefixMap: backend.prefixMap,
    queries: backend.queries ?? DEFAULT_COMPLETION_QUERIES,
  });
  client.notification("qlueLs/updateDefaultBackend", { backendName: backend.endpoint });
}

/**
 * Initialise qlue-ls and return a connected LSPClient ready to pass to Yasqe/Yasgui as
 * `yasqe.lsp.client`. Pass a backend (with completion `queries`) to enable endpoint-powered
 * entity completion; omit it for keyword/variable completion only.
 *
 * `settings` is pushed to the server via `qlueLs/changeSettings`. Override it to tune
 * completion.
 */
export async function createQlueLsClient(
  backend?: QlueLsBackend,
  settings: QlueLsSettings = DEFAULT_SETTINGS,
): Promise<LSPClient> {
  await init();
  const client = new LSPClient({
    extensions: [...languageServerExtensions(), pullDiagnostics(), semanticTokens()],
  }).connect(wasmTransport());
  await client.initializing;
  if (settings) client.notification("qlueLs/changeSettings", settings);
  if (backend) setQlueLsBackend(client, backend);

  return client;
}
