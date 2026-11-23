# Build from source

The repository is an npm workspaces monorepo with 5 packages under `packages/`: `sparql-utils`, `sparql-editor-monaco`, `sparql-editor-codemirror`, `sparql-results` and `sparql-studio`.

Install:

```sh
npm i
```

Run dev server (`dev/*.html`):

```sh
npm run dev
```

Run tests:

```sh
npm test
```

Build packages:

```sh
npm run build
```

## What the library build emits

For each package, `build:lib` emits into `packages/<pkg>/build`:

- ESM (`*.js`), the main entry point.
- UMD (`*.umd.js`) for every package except Monaco.
- CSS (`*.css`).
- TypeScript declarations.
- The editor / language server worker assets.

UMD bundles include their dependencies and expose these browser globals:

| Package | Global | Constructor |
| --- | --- | --- |
| `sparql-studio` | `SparqlStudio` | `SparqlStudio.SparqlStudio` |
| `sparql-editor-codemirror` | `SparqlEditorCodeMirror` | `SparqlEditorCodeMirror.SparqlEditor` |
| `sparql-results` | `SparqlResults` | `SparqlResults.SparqlResults` |
| `sparql-utils` | `SparqlUtils` | Utilities such as `SparqlUtils.qlueLs` |

`main`, `module` and the root `import` export point to ESM. `unpkg`, `jsdelivr` and the `./umd` subpath point to UMD. These `.umd.js` files are for browser script loaders; packages retain `"type": "module"`, so they are not Node.js `require()` entry points.

The build runs ESM first, then UMD with `BUILD_FORMAT=umd`. CodeMirror dependencies stay external in ESM for extension compatibility and are bundled in UMD. Monaco remains ESM-only because its worker and WASM assets use `import.meta.url`.

::: info Assets bundling
Asset URLs use a relative base (`base: "./"`) so they resolve in any consuming bundler.
:::

## The documentation website

This site is built with [VitePress](https://vitepress.dev) from the `docs/` folder:

Local preview with hot reload:

```sh
npm run docs:dev
```

Build the static site into `docs/.vitepress/dist`:

```sh
npm run docs:build
```

Preview the built site:

```sh
npm run docs:preview
```

One-liner to build and test the docs website:

```sh
npm run build && npm run docs:build && npm run docs:preview
```
