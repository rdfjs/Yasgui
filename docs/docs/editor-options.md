# Monaco editor options

Pass any [Monaco editor options](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IStandaloneEditorConstructionOptions.html)
via `editorOptions`. They are **deep-merged over** Yasqe's defaults.

```ts
new Yasqe(el, {
  editorOptions: {
    lineNumbers: "off",
    wordWrap: "off",
    fontSize: 16,
    minimap: { enabled: true },
    renderWhitespace: "all",
  },
});
```

Via Yasgui, forward them through the `yasqe` option:

```ts
new Yasgui(el, {
  yasqe: { editorOptions: { fontSize: 16 } },
});
```

## Defaults

Yasqe's defaults already enable:

- line numbers
- word wrap
- bracket matching
- code folding
- the VS Code right-click context menu (including **Format Document**)
- semantic highlighting

You only need `editorOptions` to override these or to enable extra Monaco features.
