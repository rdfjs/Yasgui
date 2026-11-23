# Monaco editor options

Pass any [Monaco editor options](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IStandaloneEditorConstructionOptions.html) via `editorOptions`. They are **deep-merged over** the editor defaults.

```ts
new SparqlEditor(el, {
  editorOptions: {
    lineNumbers: "off",
    wordWrap: "off",
    fontSize: 16,
    minimap: { enabled: true },
    renderWhitespace: "all",
  },
});
```

Via SPARQL Studio, forward them inside the `editor` factory:

```ts
new SparqlStudio(el, {
  editor: (parent, conf) => new SparqlEditor(parent, { ...conf, editorOptions: { fontSize: 16 } }),
});
```

## Defaults

The editor's defaults already enable:

- line numbers
- word wrap
- bracket matching
- code folding
- the VSCode right-click context menu (including **Format Document**)
- semantic highlighting

You only need `editorOptions` to override these or to enable extra Monaco features.
