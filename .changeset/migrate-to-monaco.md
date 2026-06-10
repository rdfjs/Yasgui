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
  - Update some of the puppeteer tests
- Add docs website with VitePress
  - main page is a bare Yasgui with qlue-ls language server
  - documentation to use yasgui is defined in markdown files available at `/docs`
- Enable light/dark theme
- Enable to import the main JS and CSS files from `@zazuko/yasgui` and `@zazuko/yasgui/style.css`
- Update CodeMirror used by the YASR component to display raw response JSON from v5 to v6
- Update default SPARQL endpoint from dbpedia to https://sparql.dblp.org/sparql (faster for completion queries)
