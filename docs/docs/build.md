# Build from source

The repository is an npm workspaces monorepo with five packages under `packages/`: `sparql-utils`, `sparql-editor-monaco`, `sparql-editor-codemirror`, `sparql-results` and `sparql-studio`.

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
- CSS (`*.css`).
- TypeScript declarations.
- The editor / language server worker assets.

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
