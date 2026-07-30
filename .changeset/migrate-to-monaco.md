---
"@rdfjs/sparql-studio": major
"@rdfjs/sparql-utils": major
"@rdfjs/sparql-editor-monaco": major
"@rdfjs/sparql-editor-codemirror": major
"@rdfjs/sparql-results": major
---

- Migrate from CodeMirror 5 to Monaco/CodeMirror 6 editors with language servers
  - Users can now choose between 2 editors: one based on Monaco, the other based on CodeMirror 6
  - The editor now extends `EventEmitter` instead of `CodeMirror`, with a shared `IEditor` interface both editors implement
  - Enable use of language servers for diagnostics, syntax highlighting, autocompletion, code actions, hover and formatting
  - Delete the editor's built-in autocomplete and grammar code (now handled by the language server)
  - CodeMirror falls back to static SPARQL syntax highlighting when the language server provides no semantic tokens
  - Update some of the puppeteer tests
- Language servers
  - Unified, editor-agnostic language server interface for both Monaco and CodeMirror: you pass a `Worker` (instance or factory) and the editor connects the client for you, waiting for the worker's `ready` signal
  - Support multiple language servers via a `languageServers` array, with runtime switching (right-click menu in Monaco, dropdown in CodeMirror) and a per-endpoint preference persisted to localStorage
  - Generic settings panel generated from a JSON schema, with a callback to apply settings to the active server
  - Improved display of error messages coming from the language server
  - Ship qlue-ls plumbing (settings, types, backend/endpoint registration, prefix discovery, completion-query templates) in utils under the `qlueLs` namespace, so consumers can wire it up easily
  - The demo implements 3 language servers: **qlue-ls** (WASM, endpoint-powered completions), **swls** (WASM, semantic web language server) and **Traqula** (JS SPARQL 1.2 parser, diagnostics only)
- App and editor improvements
  - Enable light/dark theme
  - Add a "Share query URL" entry to the Monaco right-click menu (under Execute query) bound to Cmd/Ctrl+S
  - Update the CodeMirror used by the results viewer to display the raw response JSON from v5 to v6
  - Update the default SPARQL endpoint from DBpedia to https://sparql.dblp.org/sparql (faster for completion queries)
  - Improve the partial config implementation (`DeepPartial`)
  - Enable importing the main JS and CSS from `@rdfjs/sparql-studio` and `@rdfjs/sparql-studio/style.css`
- Docs
  - Add a documentation website built with VitePress (served from https://sparql.studio), with an auto-generated API reference (TypeDoc)
  - The home page is the full app with the 3 language servers, a second page demos the CodeMirror editor
- Drop UMD support: the libraries are now ESM-only (Monaco loads its workers/wasm via `import.meta.url`, which UMD cannot express). ESM imports work in plain HTML `<script type="module">` in every browsers.
- Rename the packages and exported classes:
  - `@zazuko/yasgui` -> `@rdfjs/sparql-studio` (class `Yasgui` -> `SparqlStudio`)
  - `@zazuko/yasqe` -> `@rdfjs/sparql-editor-monaco` and a new `@rdfjs/sparql-editor-codemirror` (class `Yasqe` -> `SparqlEditor`)
  - `@zazuko/yasr` -> `@rdfjs/sparql-results` (class `Yasr` -> `SparqlResults`)
  - `@zazuko/yasgui-utils` -> `@rdfjs/sparql-utils`
  - The `SparqlStudio` config keys `yasqe`/`yasr` are now `editor`/`results`
  - Rename `window.yasgui` & cie to `window.sparqlStudio`
  - Rename CSS classes (`.yasgui* -> `.sparqlStudio*`)
- add `postcss-nested` to flatten nested CSS
