import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

const isProd = process.env.NODE_ENV === "production";

// When BUILD_PACKAGE is set we build a single package otherwise vite serves the demo pages
const libPackage = process.env.BUILD_PACKAGE as "yasgui" | "yasqe" | "yasr" | "utils" | undefined;

const globalName = (p: string) => (p === "utils" ? "Utils" : p.charAt(0).toUpperCase() + p.slice(1));

// UMD <script> global is the default export (e.g. `window.Yasgui === Yasgui`), matching webpack `libraryExport: "default"`.
const umdDefaultGlobal = (g: string) => `if(typeof ${g}!=="undefined"&&${g}&&${g}.default){${g}=${g}.default;}`;

const alias = [
  { find: /^@zazuko\/yasgui$/, replacement: resolve(__dirname, "packages/yasgui/src/index.ts") },
  { find: /^@zazuko\/yasqe$/, replacement: resolve(__dirname, "packages/yasqe/src/index.ts") },
  { find: /^@zazuko\/yasr$/, replacement: resolve(__dirname, "packages/yasr/src/index.ts") },
  { find: /^@zazuko\/yasgui-utils$/, replacement: resolve(__dirname, "packages/utils/src/index.ts") },
];

export default defineConfig({
  root: libPackage ? undefined : resolve(__dirname, "dev"),
  resolve: { alias, extensions: [".json", ".js", ".ts", ".scss", ".css"] },
  define: { __DEVELOPMENT__: JSON.stringify(!isProd) },
  server: { port: 4000, host: "0.0.0.0" },
  plugins: libPackage
    ? [
        dts({
          tsconfigPath: resolve(__dirname, "tsconfig-build.json"),
          entryRoot: resolve(__dirname, `packages/${libPackage}/src`),
          outDirs: [resolve(__dirname, `packages/${libPackage}/build/ts/src`)],
          include: [`packages/${libPackage}/src`],
          aliasesExclude: [/^@zazuko\//],
        }),
      ]
    : [],
  build: libPackage
    ? {
        // Library bundle for npm, 1 pkg per invocation, goes to packages/<pkg>/build/
        outDir: `packages/${libPackage}/build`,
        emptyOutDir: true,
        copyPublicDir: false,
        target: "es2020",
        sourcemap: true,
        cssCodeSplit: false,
        lib: {
          entry: resolve(__dirname, `packages/${libPackage}/src/index.ts`),
          name: globalName(libPackage),
          // UMD for <script> users (<pkg>.min.js), ES for modern bundlers (<pkg>.esm.js)
          formats: ["umd", "es"],
          fileName: (format) => (format === "es" ? `${libPackage}.esm.js` : `${libPackage}.min.js`),
        },
        rollupOptions: {
          output: {
            assetFileNames: (info) =>
              info.names?.some((n) => n.endsWith(".css")) ? `${libPackage}.min.css` : "[name][extname]",
            // ESM consumers use a normal default import, so this only applies to the UMD bundle.
            footer: (chunk) => (chunk.fileName.endsWith(".esm.js") ? "" : umdDefaultGlobal(globalName(libPackage))),
          },
        },
      }
    : {
        // Dev server in dev/
        outDir: resolve(__dirname, "build"),
        emptyOutDir: false,
        target: "es2020",
        sourcemap: true,
        rollupOptions: {
          input: {
            index: resolve(__dirname, "dev/index.html"),
            yasqe: resolve(__dirname, "dev/yasqe.html"),
            yasr: resolve(__dirname, "dev/yasr.html"),
          },
        },
      },
});
