/**
 * Monaco Editor setup with SPARQL syntax highlighting.
 *
 * This module is language-server agnostic: it does NOT create or know about any specific
 * language server. A ready-to-use LSP `Worker` can be injected by the caller; when provided,
 * a monaco-languageclient is wired to it (giving completions, diagnostics, formatting, semantic
 * tokens, etc. — whatever that server supports). When omitted, the editor still works with
 * TextMate-based syntax highlighting only.
 */

import { configureDefaultWorkerFactory } from "monaco-languageclient/workerFactory";
import { type EditorAppConfig, EditorApp } from "monaco-languageclient/editorApp";
import { type MonacoVscodeApiConfig, MonacoVscodeApiWrapper } from "monaco-languageclient/vscodeApiWrapper";
import { type LanguageClientConfig, LanguageClientWrapper } from "monaco-languageclient/lcwrapper";
import { Uri } from "monaco-editor";
import { merge } from "lodash-es";

// Import SPARQL theme and grammar for syntax highlighting
import { sparqlThemeDark, sparqlThemeLight } from "./sparqlTheme";
import { sparqlTextmateGrammar, sparqlLanguageConfig } from "./sparqlGrammar";

export interface MonacoEditorResult {
  apiWrapper: MonacoVscodeApiWrapper;
  editorApp: EditorApp;
  /** The LSP client wrapper, or undefined when no language server worker was provided. */
  languageClient?: LanguageClientWrapper;
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
 * Creates a Monaco editor with SPARQL syntax highlighting.
 * @param lsWorker Optional, ready language-server Worker. When given, an LSP client is connected to it.
 * @param editorOptions Optional Monaco editor options, deep-merged OVER the built-in defaults.
 * @param themeOverrides Optional partial light/dark theme objects, deep-merged OVER the built-in themes.
 */
export async function startMonacoEditor(
  container: HTMLElement,
  initialValue: string,
  theme: "light" | "dark" = "dark",
  lsWorker?: Worker,
  editorOptions?: Record<string, any>,
  themeOverrides?: SparqlThemeOverrides,
): Promise<MonacoEditorResult> {
  // Built-in themes with any consumer overrides deep-merged on top
  const lightTheme = merge({}, sparqlThemeLight, themeOverrides?.light ?? {});
  const darkTheme = merge({}, sparqlThemeDark, themeOverrides?.dark ?? {});

  // Extension files for SPARQL language support
  const extensionFilesOrContents = new Map<string, string | URL>();
  extensionFilesOrContents.set("/sparql-configuration.json", JSON.stringify(sparqlLanguageConfig));
  extensionFilesOrContents.set("/sparql-grammar.json", JSON.stringify(sparqlTextmateGrammar));
  extensionFilesOrContents.set("/sparql-theme-light.json", JSON.stringify(lightTheme));
  extensionFilesOrContents.set("/sparql-theme-dark.json", JSON.stringify(darkTheme));

  // MonacoVscodeApiConfig
  const vscodeApiConfig: MonacoVscodeApiConfig = {
    $type: "extended",
    viewsConfig: {
      $type: "EditorService",
    },
    userConfiguration: {
      json: JSON.stringify({
        "workbench.colorTheme": theme === "dark" ? "SPARQL Dark Theme" : "SPARQL Light Theme",
        "editor.guides.bracketPairsHorizontal": "active",
        "editor.lightbulb.enabled": "On",
        "editor.wordBasedSuggestions": "off",
        "editor.experimental.asyncTokenization": true,
        // Use language-server semantic tokens (parser-based) on top of the TextMate grammar
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
    extensions: [
      {
        config: {
          name: "sparql-language",
          publisher: "Ioannis Nezis",
          version: "1.0.0",
          engines: { vscode: "*" },
          contributes: {
            languages: [
              {
                id: "sparql",
                extensions: [".rq", ".sparql"],
                aliases: ["sparql", "SPARQL"],
                configuration: "/sparql-configuration.json",
              },
            ],
            themes: [
              {
                id: "SPARQL Light Theme",
                label: "SPARQL Light Theme",
                uiTheme: "vs",
                path: "./sparql-theme-light.json",
              },
              {
                id: "SPARQL Dark Theme",
                label: "SPARQL Dark Theme",
                uiTheme: "vs-dark",
                path: "./sparql-theme-dark.json",
              },
            ],
            grammars: [
              {
                language: "sparql",
                scopeName: "source.sparql",
                path: "/sparql-grammar.json",
              },
            ],
          },
        },
        filesOrContents: extensionFilesOrContents,
      },
    ],
  };

  // Create and start the monaco-vscode api wrapper
  const apiWrapper = new MonacoVscodeApiWrapper(vscodeApiConfig);
  await apiWrapper.start();

  // Connect a language client to the injected worker, if any
  let lcWrapper: LanguageClientWrapper | undefined;
  if (lsWorker) {
    const languageClientConfig: LanguageClientConfig = {
      languageId: "sparql",
      clientOptions: {
        documentSelector: [{ language: "sparql" }],
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
              const label: any = item.label;
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
    lcWrapper = new LanguageClientWrapper(languageClientConfig);
    await lcWrapper.start();
  }

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

  // EditorAppConfig
  const editorAppConfig: EditorAppConfig = {
    codeResources: {
      modified: {
        uri: "query.rq",
        text: initialValue,
      },
    },
    editorOptions: merge({}, defaultEditorOptions, editorOptions ?? {}),
  };

  // Create and start the editor app
  const editorApp = new EditorApp(editorAppConfig);
  await editorApp.start(container);

  return {
    apiWrapper,
    editorApp,
    languageClient: lcWrapper,
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
