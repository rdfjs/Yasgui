# Yasqe API

`yasgui.yasqe` is the shared [Yasqe](./yasqe) instance, so this reference applies to both the full
app and the standalone editor.

**Constructor:** `new Yasqe(parentElement, config?)`

## Methods

| method | description |
| --- | --- |
| `getValue()` / `setValue(q)` | get / set the query string |
| `query(config?)` | run the query (returns a Promise) |
| `abortQuery()` | abort the running query |
| `getPrefixesFromQuery()` | `{ prefix: iri }` from the query's `PREFIX` lines |
| `getLanguageClient()` | the `monaco-languageclient` (or `undefined`), send custom LSP requests |
| `setTheme("light" \| "dark")` | switch the editor + chrome theme |
| `setSize(height?, width?)` | resize the editor (e.g. `"300px"`) |
| `refresh()` / `focus()` | re-layout / focus |
| `getQueryType()` | the query type (`SELECT`, `CONSTRUCT`, `ASK`, …) |
| `getQueryMode()` | `"query"` vs `"update"` |
| `destroy()` | tear down the instance |
| `on(event, handler)` / `off(...)` | subscribe / unsubscribe (handlers are instance-first) |

## Events

`query`, `queryBefore`, `queryResponse`, `queryResults`, `queryAbort`, `error`, `blur`, `change`,
`resize`, `autocompletionShown`, `autocompletionClose`.

::: warning Instance-first handlers
Handlers receive the Yasqe instance as their first argument: `(yasqeInstance, ...payload)`. For
example `queryResponse` is `(yasqe, response, duration)`.
:::

```ts
yasqe.on("query", (yasqe, req) => console.log("running", req));
yasqe.on("queryResponse", (yasqe, response, duration) => console.log(response, duration));
yasqe.on("error", (yasqe, error) => console.error(error));
```

## Common config

`value`, `theme`, `editorOptions`, `requestConfig`, `editorHeight`, `resizeable`, `showQueryButton`,
`persistenceId`, `languageServerWorker`, `onLanguageClientReady`.

See [Yasqe](./yasqe) for descriptions, [Request configuration](./request-config) for `requestConfig`
and [Monaco editor options](./editor-options) for `editorOptions`.
