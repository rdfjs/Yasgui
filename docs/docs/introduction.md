# What is SPARQL Studio?

**SPARQL Studio** is a web-based interface for writing, running and exploring SPARQL queries against any endpoint.

::: tip Compatible with Yasgui Yasr plugins
It is a fork of [Yasgui](https://github.com/zazuko/Yasgui) and is compatible with all existing Yasr result-view plugins.
:::

It is built from packages you can use together or independently:

| Package | npm | What it is |
| --- | --- | --- |
| **Studio** | `@rdfjs/sparql-studio` | The full **app**: tabs, endpoint selector, editor + Yasr wired together |
| **Editor · Monaco** | `@rdfjs/sparql-editor-monaco` | The SPARQL query **editor** (Monaco-based, with optional LSP) |
| **Editor · CodeMirror** | `@rdfjs/sparql-editor-codemirror` | Alternative SPARQL **editor** built on CodeMirror 6 (takes an LSP client) |
| **Results** | `@rdfjs/sparql-results` | The SPARQL **result** viewer (table, response, geo, …) |

Try it now on the [live demo](/). Then head to [Getting started](./getting-started) to embed it in your own app.

## 🔑 Key features

- **Modern query editor** · SPARQL syntax highlighting, smart completions, query formatting,
  diagnostics, code actions, hover information, prefix management.
- **User-friendly result viewers** · interactive tables, graph visualizations, geographic maps and a raw
  response viewer.
- **Multiple tabs** · work with several queries at once, each with its own endpoint.
- **Light and dark themes** · follows the OS preference, or set it explicitly.
- **Persistent storage** · queries, tabs and results survive a page reload via `localStorage`.
- **Developer friendly** · small ESM packages, an event system and a documented API.

## ⚡️ Powered by language servers

SPARQL Studio's features: semantic highlighting, diagnostics, code actions, hover, formatting and completion, all come from a **SPARQL [language server (LSP)](https://microsoft.github.io/language-server-protocol/)**.

The editors are language server agnostic: you provide a language server and they wire a language client to it, so all server-specific config lives in your app and you can swap servers later.

The live demo wires up 3 language servers:

| Language server                                              | Description                                                  | Implementation | Completion | Semantic tokens | Author                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------ | -------------- | ---------- | --------------- | ------------------------------------------------- |
| [**qlue-ls**](https://github.com/IoannisNezis/Qlue-ls)       | SPARQL language server with endpoint-powered completion and code actions | 🦀 WASM         | ✅          | ✅               | [Ioannis Nezis](https://github.com/IoannisNezis/) |
| [**swls**](https://github.com/SemanticWebLanguageServer/swls) | Semantic Web Language Server                                 | 🦀 WASM         |            | ☑️               | [Arthur Vercruysse](https://github.com/ajuvercr)  |
| [**Traqula**](https://github.com/comunica/traqula)           | SPARQL 1.2 parser written in JS                              | 🟨 JS           |            |                 | [Jitse De Smet](https://github.com/jitsedesmet)   |

::: info Default syntax highlighting

When the language server provides no semantic tokens for highlighting, we use a default syntax highlighting (monarch on monaco, lezer on CodeMirror)

:::

> See [Language server](./language-server) for how to use language servers.

## 📝 Two editors to choose from

SPARQL Studio is editor-independent: you pick the editor when embedding it, and both implement the same interface so they are interchangeable behind the editor factory.

- **Monaco** (`@rdfjs/sparql-editor-monaco`) · the editor that powers VSCode, more features.
- **CodeMirror 6** (`@rdfjs/sparql-editor-codemirror`) · more lightweight.
