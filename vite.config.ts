import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import wasm from "vite-plugin-wasm";
import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";

const isProd = process.env.NODE_ENV === "production";
const isUmd = process.env.BUILD_FORMAT === "umd";

// When BUILD_PACKAGE is set we build a single package otherwise vite serves the demo pages
const libPackage = process.env.BUILD_PACKAGE as
  | "sparql-studio"
  | "sparql-editor-monaco"
  | "sparql-editor-codemirror"
  | "sparql-results"
  | "sparql-utils"
  | undefined;

const libraryGlobals = {
  "sparql-studio": "SparqlStudio",
  "sparql-editor-monaco": "SparqlEditorMonaco",
  "sparql-editor-codemirror": "SparqlEditorCodeMirror",
  "sparql-results": "SparqlResults",
  "sparql-utils": "SparqlUtils",
};

if (isUmd && (!libPackage || libPackage === "sparql-editor-monaco")) {
  throw new Error("UMD builds require a non-Monaco BUILD_PACKAGE");
}

// Internal monaco-vscode-api modules used by yasqe to render the language server right-click submenu
// (MenuRegistry/MenuId/CommandsRegistry/ContextKeyExpr). They are reachable via the package's
// `./vscode/*` export, but Rolldown only resolves that reliably in lib-build mode; aliasing the bare
// specifiers to the concrete files makes BOTH the demo and lib builds resolve them, and (resolving to
// the same physical files monaco-languageclient imports) keeps a single shared menu registry.
const monacoInternalBase = "node_modules/@codingame/monaco-vscode-api/vscode/src/vs/platform";
const monacoInternalAlias = [
  ["actions/common/actions", "actions/common/actions"],
  ["commands/common/commands", "commands/common/commands"],
  ["contextkey/common/contextkey", "contextkey/common/contextkey"],
].map(([sub]) => ({
  find: new RegExp(`^@codingame/monaco-vscode-api/vscode/src/vs/platform/${sub}$`),
  replacement: resolve(__dirname, `${monacoInternalBase}/${sub}.js`),
}));

const alias = [
  { find: /^@rdfjs\/sparql-studio$/, replacement: resolve(__dirname, "packages/sparql-studio/src/index.ts") },
  {
    find: /^@rdfjs\/sparql-editor-codemirror$/,
    replacement: resolve(__dirname, "packages/sparql-editor-codemirror/src/index.ts"),
  },
  {
    find: /^@rdfjs\/sparql-editor-monaco$/,
    replacement: resolve(__dirname, "packages/sparql-editor-monaco/src/index.ts"),
  },
  { find: /^@rdfjs\/sparql-results$/, replacement: resolve(__dirname, "packages/sparql-results/src/index.ts") },
  { find: /^@rdfjs\/sparql-utils$/, replacement: resolve(__dirname, "packages/sparql-utils/src/index.ts") },
  ...monacoInternalAlias,
];

// The editor runs monaco-languageclient in `classic` mode so these `extended` service overrides are not used at runtime
// But codeSplitting:false would still inline every `(await import(pkg)).default` in the bundle (~5 MB of dead code)
const STUBBED_MONACO_SERVICES = new Set([
  "@codingame/monaco-vscode-textmate-service-override",
  "@codingame/monaco-vscode-theme-service-override",
  "@codingame/monaco-vscode-languages-service-override",
  "@codingame/monaco-vscode-views-service-override",
  "@codingame/monaco-vscode-workbench-service-override",
  "@codingame/monaco-vscode-theme-defaults-default-extension",
]);
const STUB_VIRTUAL_ID = "\0monaco-service-stub";
const monacoServiceStubPlugin = {
  name: "monaco-service-stub",
  enforce: "pre" as const,
  // Exact match only: subpath imports like ".../worker" must resolve normally, not to the stub.
  resolveId(id: string) {
    return STUBBED_MONACO_SERVICES.has(id) ? STUB_VIRTUAL_ID : null;
  },
  load(id: string) {
    return id === STUB_VIRTUAL_ID ? "export default () => ({});" : null;
  },
};

// Only the Monaco editor and the development app bundle Monaco's workers and wasm.
const usesMonaco = libPackage === "sparql-editor-monaco" || libPackage === undefined;

export default defineConfig({
  root: libPackage ? undefined : resolve(__dirname, "dev"),
  // Relative base so emitted asset/worker URLs (new URL("./assets/x", import.meta.url)) resolve
  // relative to the importing chunk in ANY consuming app, instead of a root-absolute "/assets/..".
  base: libPackage ? "./" : "/",
  resolve: { alias, extensions: [".json", ".js", ".ts", ".scss", ".css"] },
  define: { __DEVELOPMENT__: JSON.stringify(!isProd) },
  server: { port: 4000, host: "0.0.0.0" },
  optimizeDeps: {
    // Rewrites `import.meta.url` asset references in pre-bundled monaco-vscode deps (dev only)
    rolldownOptions: usesMonaco ? { plugins: [importMetaUrlPlugin] } : undefined,
  },
  worker: {
    // Monaco and qlue-ls language server workers are ES modules and load wasm
    format: "es",
    plugins: () => [wasm()],
    // Emit each worker as 1 self-contained file.
    // Inlining keeps every worker dependency-free and copyable as a single asset.
    rolldownOptions: { output: { codeSplitting: false } },
  },
  plugins: [
    ...(usesMonaco ? [wasm(), monacoServiceStubPlugin] : []),
    ...(libPackage && !isUmd
      ? [
          dts({
            tsconfigPath: resolve(__dirname, "tsconfig-build.json"),
            entryRoot: resolve(__dirname, `packages/${libPackage}/src`),
            outDirs: [resolve(__dirname, `packages/${libPackage}/build/ts/src`)],
            include: [`packages/${libPackage}/src`],
            aliasesExclude: [/^@rdfjs\//],
          }),
        ]
      : []),
  ],
  build: libPackage
    ? {
        // Library bundle for npm, 1 pkg per invocation, goes to packages/<pkg>/build/
        outDir: `packages/${libPackage}/build`,
        // The UMD pass adds its bundle alongside the ESM bundle and declarations.
        emptyOutDir: !isUmd,
        copyPublicDir: false,
        // Monaco/qlue-ls need esnext (top-level await in the wasm glue), other packages keep es2020
        target: usesMonaco ? "esnext" : "es2020",
        sourcemap: false,
        cssCodeSplit: false,
        // esbuild is more lenient than the default lightningcss minifier (CSS uses nesting)
        cssMinify: "esbuild",
        // Keep wasm + workers as separate emitted files (never inline) so consumers can load them
        assetsInlineLimit: usesMonaco ? 0 : 4096,
        lib: {
          entry: resolve(__dirname, `packages/${libPackage}/src/index.ts`),
          name: libraryGlobals[libPackage],
          formats: [isUmd ? "umd" : "es"],
          fileName: () => `${libPackage}${isUmd ? ".umd" : ""}.js`,
        },
        rolldownOptions: {
          // NOTE: Bundle everything (monaco-editor, vscode, monaco-languageclient, qlue-ls) into the lib
          // so a single monaco-vscode instance lives inside yasqe. Externalizing any of these makes the consumer
          // load a second instance, which breaks the vscode service registry and the editor silently fails to mount.
          // CodeMirror's ESM build shares dependencies with the embedder. Its UMD build is self-contained.
          external: libPackage === "sparql-editor-codemirror" && !isUmd ? [/^@codemirror\//, /^@lezer\//] : [],
          output: {
            exports: "named",
            // Emit 1 self-contained JS file (no code-split sibling chunks)
            codeSplitting: false,
            assetFileNames: (info) =>
              info.names?.some((n) => n.endsWith(".css")) ? `${libPackage}.css` : "[name][extname]",
          },
        },
      }
    : {
        // Dev server in `dev/`
        outDir: resolve(__dirname, "build"),
        emptyOutDir: false,
        target: "esnext",
        sourcemap: true,
        rolldownOptions: {
          input: {
            index: resolve(__dirname, "dev/index.html"),
            codemirror: resolve(__dirname, "dev/codemirror.html"),
            editor_results: resolve(__dirname, "dev/editor_results.html"),
          },
        },
      },
});
