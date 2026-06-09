---
"@zazuko/yasgui": major
"@zazuko/yasgui-utils": major
"@zazuko/yasqe": major
"@zazuko/yasr": major
---

- Migrate from CodeMirror 5 to Monaco editor (VSCode) with a language server
  - `Yasqe` now extends `EventEmitter` instead of `CodeMirror`
  - Use a wasm language server for diagnostics, syntax highlight, autocompletion, code actions, etc
  - In the `dev/index.html` implement a demo using the Qlue-LS language server
  - Delete code in yasqe related to built-in autocomplete and grammar (since this now handled by the language server)
- Add docs website with VitePress
  - main page is a bare Yasgui with qlue-ls language server
  - documentation to use yasgui is defined in markdown files available at `/docs`
- Enable light/dark theme
