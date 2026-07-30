/**
 * Monaco Editor setup with SPARQL syntax highlighting.
 *
 * Uses the monaco-languageclient "classic" configuration: no VSCode extension host, no TextMate
 * engine and no oniguruma wasm. The SPARQL language, a Monarch tokenizer (fallback highlighting)
 * and the light/dark themes are registered directly through the standalone Monaco API. The
 * authoritative coloring comes from qlue-ls LSP *semantic tokens*; the Monarch grammar only
 * provides highlighting before the language server responds.
 *
 * This module is language server agnostic: it does NOT create or know about any specific
 * language server. A ready-to-use LSP `Worker` can be injected by the caller; when provided,
 * a monaco-languageclient is wired to it (giving completions, diagnostics, formatting, semantic
 * tokens, etc. whatever that server supports). When omitted, the editor still works with
 * Monarch-based syntax highlighting only.
 */

import { configureDefaultWorkerFactory } from "monaco-languageclient/workerFactory";
import { type EditorAppConfig, EditorApp } from "monaco-languageclient/editorApp";
import { type MonacoVscodeApiConfig, MonacoVscodeApiWrapper } from "monaco-languageclient/vscodeApiWrapper";
import { type LanguageClientConfig, LanguageClientWrapper } from "monaco-languageclient/lcwrapper";
import { Uri, editor, languages } from "monaco-editor";
import { merge } from "lodash-es";
import { getSparqlBlockFoldingRanges } from "@rdfjs/sparql-utils";

// SPARQL themes (Monaco standalone theme data is derived from these) and classic-mode grammar
import { sparqlThemeDark, sparqlThemeLight } from "./sparqlTheme";
import { sparqlMonarchLanguage, sparqlLanguageConfiguration, buildSparqlThemeData } from "./sparqlMonarch";

/** Monaco standalone theme names registered for the SPARQL editor. */
export const SPARQL_THEME_LIGHT = "sparql-light";
export const SPARQL_THEME_DARK = "sparql-dark";

const LANGUAGE_ID = "sparql";

// Registered once for the language (not per editor) so the brace-block ranges are added on top of
// whatever the language server reports. qlue-ls only folds the PREFIX/BASE prologue, so this is what
// makes WHERE / SERVICE / OPTIONAL / sub-SELECT blocks foldable.
let foldingProviderRegistered = false;
function registerSparqlFoldingProvider(): void {
  if (foldingProviderRegistered) return;
  foldingProviderRegistered = true;
  languages.registerFoldingRangeProvider(LANGUAGE_ID, {
    provideFoldingRanges(model) {
      // Monaco lines are 1-based and the folded area starts/ends at a line's last character; using
      // `endLine` (0-based line of `}`) as the 1-based end keeps the closing brace line visible.
      return getSparqlBlockFoldingRanges(model.getValue()).map((r) => ({
        start: r.startLine + 1,
        end: r.endLine,
        kind: languages.FoldingRangeKind.Region,
      }));
    },
  });
}

export interface MonacoEditorResult {
  apiWrapper: MonacoVscodeApiWrapper;
  editorApp: EditorApp;
  getContent(): string;
  setContent(content: string): void;
  focus(): void;
  getDocumentUri(): string;
}

/** Consumer overrides for the SPARQL editor themes, deep-merged OVER the built-in light/dark themes. */
export interface SparqlThemeOverrides {
  light?: Record<string, any>;
  dark?: Record<string, any>;
}

/**
 * Connect a `monaco-languageclient` LanguageClient to a ready language server `Worker`. SparqlEditor calls
 * this for the active language server (it may switch between several), so it is decoupled from the
 * editor setup in {@link startMonacoEditor}. The returned wrapper is already started.
 */
/**
 * Resolve once a freshly created LSP worker signals it is ready, so the client never sends
 * `initialize`/`didOpen` before the worker has installed its message handler. WASM-backed workers
 * (qlue-ls, swls, ...) set their handler only AFTER an async `import()` / WASM init; a client
 * connecting too early races that setup and corrupts message ordering. By convention these workers
 * post `{ type: "ready" }` (or the bare string `"ready"`) once set up. `addEventListener` (not
 * `onmessage=`) so it never clobbers the handler the client attaches later.
 */
function awaitWorkerReady(worker: Worker): Promise<void> {
  return new Promise((resolve) => {
    const onReady = (event: MessageEvent) => {
      if (event.data?.type === "ready" || event.data === "ready") {
        worker.removeEventListener("message", onReady);
        resolve();
      }
    };
    worker.addEventListener("message", onReady);
  });
}

export async function connectLanguageClient(lsWorker: Worker): Promise<LanguageClientWrapper> {
  await awaitWorkerReady(lsWorker);
  const languageClientConfig: LanguageClientConfig = {
    languageId: LANGUAGE_ID,
    clientOptions: {
      documentSelector: [{ language: LANGUAGE_ID }],
      workspaceFolder: {
        index: 0,
        name: "workspace",
        uri: Uri.parse("file:/"),
      },
      progressOnInitialization: true,
      diagnosticPullOptions: {
        onChange: true,
        onSave: false,
      },
      // The language server returns completion labels as { label, detail } where `detail` is the
      // human-readable text. Monaco glues `detail` directly onto the label with no separator,
      // so we prefix it with a space here.
      middleware: {
        provideCompletionItem: async (document, position, context, token, next) => {
          const result = await next(document, position, context, token);
          if (!result) return result;
          const items = Array.isArray(result) ? result : result.items;
          for (const item of items) {
            const label = item.label;
            if (label && typeof label === "object" && label.detail && !label.detail.startsWith(" ")) {
              label.detail = " " + label.detail;
            }
          }
          return result;
        },
      },
    },
    connection: {
      options: {
        $type: "WorkerDirect",
        worker: lsWorker,
      },
    },
    restartOptions: {
      retries: 5,
      timeout: 1000,
      keepWorker: false,
    },
  };
  const lcWrapper = new LanguageClientWrapper(languageClientConfig);
  await lcWrapper.start();
  return lcWrapper;
}

/**
 * Creates a Monaco editor with SPARQL syntax highlighting. Language-server agnostic: the editor is
 * built here, and SparqlEditor connects the active language client separately via {@link connectLanguageClient}.
 * @param editorOptions Optional Monaco editor options, deep-merged OVER the built-in defaults.
 * @param themeOverrides Optional partial light/dark theme objects, deep-merged OVER the built-in themes.
 */
export async function startMonacoEditor(
  container: HTMLElement,
  initialValue: string,
  theme: "light" | "dark" = "dark",
  editorOptions?: Record<string, any>,
  themeOverrides?: SparqlThemeOverrides,
): Promise<MonacoEditorResult> {
  // Built-in themes with any consumer overrides deep-merged on top
  const lightTheme = merge({}, sparqlThemeLight, themeOverrides?.light ?? {});
  const darkTheme = merge({}, sparqlThemeDark, themeOverrides?.dark ?? {});
  const initialThemeName = theme === "dark" ? SPARQL_THEME_DARK : SPARQL_THEME_LIGHT;

  // Classic monaco-vscode api config: no extension host, no TextMate, no theme service.
  const vscodeApiConfig: MonacoVscodeApiConfig = {
    $type: "classic",
    viewsConfig: {
      $type: "EditorService",
    },
    userConfiguration: {
      json: JSON.stringify({
        "editor.guides.bracketPairsHorizontal": "active",
        "editor.lightbulb.enabled": "On",
        "editor.wordBasedSuggestions": "off",
        "editor.experimental.asyncTokenization": true,
        // Use language server semantic tokens (parser-based) on top of the Monarch fallback grammar
        "editor.semanticHighlighting.enabled": true,
        "editor.tabSize": 2,
        "editor.insertSpaces": true,
        "editor.detectIndentation": false,
        "editor.fontSize": 14,
        "editor.minimap.enabled": false,
        "files.eol": "\n",
      }),
    },
    monacoWorkerFactory: configureDefaultWorkerFactory,
    // Skip the extension-host services entirely (classic mode registers language/grammar/theme
    // through the standalone API), which drops the extensionHost worker + extensions service.
    advanced: {
      loadExtensionServices: false,
      // enforceSemanticHighlighting: true,
    },
  };

  // Create and start the monaco-vscode api wrapper
  const apiWrapper = new MonacoVscodeApiWrapper(vscodeApiConfig);
  await apiWrapper.start();

  // Built-in default Monaco editor options. Consumers can override/extend any of these via the
  // `editorOptions` argument (deep-merged on top)
  const defaultEditorOptions = {
    tabCompletion: "on",
    suggestOnTriggerCharacters: true,
    fontSize: 14,
    fontFamily: "Source Code Pro, monospace",
    links: false,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    scrollBeyondLastLine: false,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    padding: { top: 8, bottom: 8 },
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 2,
    glyphMargin: true,
    // Show the Monaco/VSCode right-click context menu (Format Document, Cut/Copy/Paste, ...)
    contextmenu: true,
    folding: true,
    foldingImportsByDefault: true,
    snippetSuggestions: "top",
    tabSize: 2,
    // Monaco equivalents of the old YASQE/CodeMirror defaults, kept so behaviour is preserved
    lineNumbers: "on", // was lineNumbers: true
    wordWrap: "on", // was lineWrapping: true
    matchBrackets: "always", // was matchBrackets: true
    selectionHighlight: true, // was highlightSelectionMatches: { showToken: /\w/ }
  } as const;

  // EditorAppConfig: classic mode registers the SPARQL language + Monarch grammar + initial theme
  const editorAppConfig: EditorAppConfig = {
    codeResources: {
      modified: {
        uri: "query.rq",
        text: initialValue,
      },
    },
    editorOptions: merge({}, defaultEditorOptions, editorOptions ?? {}),
    languageDef: {
      languageExtensionConfig: {
        id: LANGUAGE_ID,
        extensions: [".rq", ".sparql"],
        aliases: ["SPARQL", "sparql"],
      },
      monarchLanguage: sparqlMonarchLanguage,
      theme: {
        name: initialThemeName,
        data: buildSparqlThemeData(theme === "dark" ? darkTheme : lightTheme),
      },
    },
  };

  // Create and start the editor app (registers language, Monarch grammar and the initial theme)
  const editorApp = new EditorApp(editorAppConfig);
  await editorApp.start(container);

  // Register both themes + the language configuration (brackets/comments/auto-close) so theme
  // switching at runtime works and bracket matching/auto-closing behave correctly.
  editor.defineTheme(SPARQL_THEME_LIGHT, buildSparqlThemeData(lightTheme));
  editor.defineTheme(SPARQL_THEME_DARK, buildSparqlThemeData(darkTheme));
  editor.setTheme(initialThemeName);
  languages.setLanguageConfiguration(LANGUAGE_ID, sparqlLanguageConfiguration);
  registerSparqlFoldingProvider();

  return {
    apiWrapper,
    editorApp,
    getContent(): string {
      return editorApp.getEditor()?.getValue() ?? "";
    },
    setContent(content: string): void {
      editorApp.getEditor()?.setValue(content);
    },
    focus(): void {
      editorApp.getEditor()?.focus();
    },
    getDocumentUri(): string {
      return editorApp.getEditor()?.getModel()?.uri.toString() ?? "";
    },
  };
}
