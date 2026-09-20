# SPARQL Studio

Web interface for writing SPARQL queries, running them against an endpoint and exploring the results.

Directly use the app with [Monaco](/) or [CodeMirror 6](/codemirror). Use the packages to embed the full app, or use its editors and results viewer separately.

## Choose your editor

Use [Monaco](./sparql-editor-monaco), the editor behind VS Code, or [CodeMirror 6](./sparql-editor-codemirror). Both support query execution, sharing, light and dark themes, and the same language server configuration. Studio uses a factory you supply to create one editor, shared across query tabs.

## Choose your language server

Completion, diagnostics, formatting and other language features depend on the server you connect. The hosted app offers qlue-ls, swls and a Traqula parser adapter; see the [feature comparison and setup](./language-server). Both editors also provide syntax highlighting without a server.

## Query and explore

Keep queries in separate tabs, each with its own endpoint. Studio saves tabs, queries and results in local storage and restores them after a reload. Share a query by copying its URL.

View results as a table or raw response, and add [plugins](./plugins) for maps and graphs. SPARQL Studio is a fork of [Yasgui](https://github.com/zazuko/Yasgui) and supports Yasr result-view plugins.

## Packages

| Package | Purpose |
| --- | --- |
| [`@rdfjs/sparql-studio`](./sparql-studio) | Tabs, endpoint selection, and integration with your chosen editor and the results viewer |
| [`@rdfjs/sparql-editor-monaco`](./sparql-editor-monaco) | Monaco SPARQL editor |
| [`@rdfjs/sparql-editor-codemirror`](./sparql-editor-codemirror) | CodeMirror 6 SPARQL editor |
| [`@rdfjs/sparql-results`](./sparql-results) | Results viewer with a plugin API |

To embed it in your own site, follow [Getting started](./getting-started).

:::tip Compatible with Yasgui Yasr plugins

It is a fork of [Yasgui](https://github.com/zazuko/Yasgui) and is compatible with all existing Yasr result-view plugins.

:::
