import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import wasm from "vite-plugin-wasm";
import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";

const isProd = process.env.NODE_ENV === "production";

// When BUILD_PACKAGE is set we build a single package otherwise vite serves the demo pages
const libPackage = process.env.BUILD_PACKAGE as "yasgui" | "yasqe" | "yasqe-codemirror" | "yasr" | "utils" | undefined;

const alias = [
  { find: /^@zazuko\/yasgui$/, replacement: resolve(__dirname, "packages/yasgui/src/index.ts") },
  // Order matters: match the more specific yasqe-codemirror before the bare yasqe alias.
  { find: /^@zazuko\/yasqe-codemirror$/, replacement: resolve(__dirname, "packages/yasqe-codemirror/src/index.ts") },
  { find: /^@zazuko\/yasqe$/, replacement: resolve(__dirname, "packages/yasqe/src/index.ts") },
  { find: /^@zazuko\/yasr$/, replacement: resolve(__dirname, "packages/yasr/src/index.ts") },
  { find: /^@zazuko\/yasgui-utils$/, replacement: resolve(__dirname, "packages/utils/src/index.ts") },
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

// Monaco (the @codingame/monaco-vscode-* packages) is ESM-only and loads its workers/wasm via
// `new URL(..., import.meta.url)`. yasqe pulls it in, so any package depending on yasqe needs the
// wasm plugin, ES-format workers and the import.meta.url esbuild rewrite (dev) to resolve those assets.
const usesMonaco = libPackage === "yasqe" || libPackage === undefined;

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
    // Monaco and qlue-ls language-server workers are ES modules and load wasm
    format: "es",
    plugins: () => [wasm()],
    // Emit each worker as 1 self-contained file.
    // Inlining keeps every worker dependency-free and copyable as a single asset.
    rolldownOptions: { output: { codeSplitting: false } },
  },
  plugins: [
    ...(usesMonaco ? [wasm(), monacoServiceStubPlugin] : []),
    ...(libPackage
      ? [
          dts({
            tsconfigPath: resolve(__dirname, "tsconfig-build.json"),
            entryRoot: resolve(__dirname, `packages/${libPackage}/src`),
            outDirs: [resolve(__dirname, `packages/${libPackage}/build/ts/src`)],
            include: [`packages/${libPackage}/src`],
            aliasesExclude: [/^@zazuko\//],
          }),
        ]
      : []),
  ],
  build: libPackage
    ? {
        // Library bundle for npm, 1 pkg per invocation, goes to packages/<pkg>/build/
        outDir: `packages/${libPackage}/build`,
        emptyOutDir: true,
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
          // ESM only: Monaco loads its workers/wasm via `import.meta.url`, which UMD cannot express
          formats: ["es"],
          fileName: () => `${libPackage}.js`,
        },
        rolldownOptions: {
          // NOTE: Bundle everything (monaco-editor, vscode, monaco-languageclient, qlue-ls) into the lib
          // so a single monaco-vscode instance lives inside yasqe. Externalizing any of these makes the consumer
          // load a second instance, which breaks the vscode service registry and the editor silently fails to mount.
          // The CodeMirror editor is the opposite case: @codemirror/* (and @lezer/*) must be external so the
          // editor and the embedder LSP client share one instance.
          external: libPackage === "yasqe-codemirror" ? [/^@codemirror\//, /^@lezer\//] : [],
          output: {
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
            yasqe: resolve(__dirname, "dev/yasqe.html"),
            codemirror: resolve(__dirname, "dev/codemirror.html"),
            yasr: resolve(__dirname, "dev/yasr.html"),
            swls: resolve(__dirname, "dev/swls.html"),
          },
        },
      },
});
