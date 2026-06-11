# Build from source

The repository is an npm workspaces monorepo with four packages under `packages/`: `utils`, `yasqe`,
`yasr` and `yasgui`.

```sh
npm i
npm run dev          # dev server with the demo pages (dev/index.html, yasqe.html, yasr.html)
npm run build        # build the demo + all four library packages
npm run build:lib    # only the libraries (packages/*/build)
```

## What the library build emits

For each package, `build:lib` emits into `packages/<pkg>/build`:

- ESM (`*.js`), the main entry point.
- CSS (`*.css`).
- TypeScript declarations.
- The editor / language-server worker assets.

Asset URLs use a relative base (`base: "./"`) so they resolve in any consuming bundler.

## The `dev/` reference

The `dev/` folder is a working reference for integrating the packages:

- `dev/qluels.ts` + `dev/qluels.worker.ts` show the qlue-ls worker; the backend/settings plumbing
  comes from the package's `qlueLs` helpers (see [Language server](./language-server)).
- `dev/index.html` / `yasqe.html` / `yasr.html` show Yasgui / Yasqe / Yasr with the language server.

## The documentation site

This site is built with [VitePress](https://vitepress.dev) from the `docs/` folder:

```sh
npm run docs:dev      # local preview with hot reload
npm run docs:build    # build the static site into docs/.vitepress/dist
npm run docs:preview  # preview the built site
```

Build and test the docs website:

```sh
npm run build && npm run docs:build && npm run docs:preview
```

