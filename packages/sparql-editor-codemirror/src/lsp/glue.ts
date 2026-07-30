/**
 * Reusable, server-agnostic CodeMirror LSP glue. `@codemirror/lsp-client` covers document sync,
 * completion and hover, but not pull-diagnostics, code-action quick fixes or semantic-token
 * highlighting, the things `monaco-languageclient` gives Monaco for free. These extensions add them
 * so the CodeMirror editor reaches feature parity from any LSP worker (qlue-ls, swls, ...).
 *
 * Token colors are rendered via `cm-st-<tokenType>` CSS classes shipped in the editor's stylesheet,
 * so highlighting follows the light/dark theme (no editor-side color theme needed here).
 */
import { LSPPlugin, type LSPClientExtension } from "@codemirror/lsp-client";
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
import { setDiagnostics, Diagnostic } from "@codemirror/lint";

const SEVERITY: Record<number, Diagnostic["severity"]> = { 1: "error", 2: "warning", 3: "info", 4: "info" };

/* Pull-model diagnostics (`textDocument/diagnostic`) + quick fixes (`textDocument/codeAction`).
 * lsp-client only understands push diagnostics; qlue-ls is pull-only and has no code-action support,
 * so we request a quick fix per diagnostic and attach it as a `@codemirror/lint` action. */

/** Apply an LSP WorkspaceEdit to the current editor (single-file SPARQL queries). */
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

/** Convert one LSP diagnostic into a CodeMirror Diagnostic, attaching any server quick fixes. */
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

/** Pull diagnostics on every edit (debounced) and feed them to `@codemirror/lint`. */
export function pullDiagnostics(delay = 400): LSPClientExtension {
  const editorExtension = ViewPlugin.define((view) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const plugin = LSPPlugin.get(view);
      if (!plugin) return;
      // Only pull when the server advertises pull diagnostics. Push-only servers (e.g. swls) would
      // answer `textDocument/diagnostic` with "Method not found"; their diagnostics arrive via
      // `publishDiagnostics`, which `languageServerExtensions()` already handles.
      if (!plugin.client.serverCapabilities?.diagnosticProvider) return;
      plugin.client.sync();
      try {
        const result: any = await plugin.client.request("textDocument/diagnostic", {
          textDocument: { uri: plugin.uri },
        });
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

/* Semantic-token highlighting (`textDocument/semanticTokens/full`). lsp-client has no semantic-token
 * support, so we decode them here and render them as `cm-st-<tokenType>` decorations. This is the
 * only source of highlighting (the editor ships no SPARQL grammar). */
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

/** Effect that drops all semantic-token decorations. The field is shared across clients, so the
 * editor dispatches this when switching to a server that emits no semantic tokens, to clear any the
 * previous server left behind. */
export const clearSemanticTokens = setSemanticTokens.of(Decoration.none);

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

/** Request semantic tokens on every edit (debounced) and render them as decorations. */
export function semanticTokens(delay = 200): LSPClientExtension {
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
          // ignore, will retry on next edit
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
    editorExtension: [semanticTokensField, requester],
  };
}
