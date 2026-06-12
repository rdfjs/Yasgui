# What is Yasgui?

**Yasgui (Yet Another SPARQL GUI)** is a web-based interface for writing, running and exploring
SPARQL queries against any endpoint. It is built from three packages you can use together or
independently:

| Package | npm | What it is |
| --- | --- | --- |
| **Yasqe** | `@zazuko/yasqe` | The SPARQL query **editor** (Monaco-based, with optional LSP) |
| **Yasqe (CodeMirror)** | `@zazuko/yasqe-codemirror` | Alternative SPARQL **editor** built on CodeMirror 6 (takes an LSP client) |
| **Yasr** | `@zazuko/yasr` | The SPARQL **result** viewer (table, response, geo, …) |
| **Yasgui** | `@zazuko/yasgui` | The full **app**: tabs, endpoint selector, editor + Yasr wired together |

Try it now on the [live demo](/). Then head to [Getting started](./getting-started) to embed it in
your own app.

## Monaco editor with a language server

The editor is **Monaco** (the editor that powers VS Code). Syntax highlighting works out of the box
through a TextMate grammar. The smart features, autocompletion, diagnostics, hover, formatting and
semantic highlighting, come from a **SPARQL language server (LSP)** that *you* provide.

The recommended language server is [**qlue-ls**](https://github.com/IoannisNezis/Qlue-ls), a fast
WASM SPARQL language server, but Yasqe and Yasgui are language-server **agnostic**, so you can plug
in any LSP `Worker`.

::: tip Key idea
Yasqe and Yasgui never import a specific language server. You pass them a ready LSP `Worker`, and
they wire a `monaco-languageclient` to it. All server-specific configuration lives in your app. This
keeps the libraries small and lets you swap servers later.
:::

## Key features

- **Advanced query editor** · SPARQL syntax highlighting, smart autocomplete, query formatting,
  prefix management, bracket matching and folding.
- **Powerful result viewers** · interactive tables, graph visualizations, geographic maps and a raw
  response viewer.
- **Multiple tabs** · work with several queries at once, each with its own endpoint.
- **Light and dark themes** · follows the OS preference, or set it explicitly.
- **Persistent storage** · queries, tabs and results survive a page reload via `localStorage`.
- **Developer friendly** · small ESM packages, an event system and a documented API.

## Next steps

- [Getting started](./getting-started) · install and embed Yasgui in your app.
- [Yasgui (full app)](./yasgui) · configure the complete interface.
- [Language server](./language-server) · set up qlue-ls or plug in your own.
