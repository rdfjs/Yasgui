# Request configuration

`requestConfig` controls how queries are sent to the endpoint. It is accepted by both [SparqlEditor](./sparql-editor) and [SparqlStudio](./sparql-studio) (where it sets the default for every tab).

Every field may be a value **or** a `(sparqlEditor) => value` function, so you can compute it per request.

```ts
new SparqlStudio(el, {
  requestConfig: {
    endpoint: "https://sparql.dblp.org/sparql",
    method: "POST",
    headers: () => ({ Authorization: `Bearer ${getToken()}` }),
    withCredentials: false,
  },
});
```

| field | default | description |
| --- | --- | --- |
| `endpoint` | — | SPARQL endpoint URL |
| `method` | `"POST"` | `"GET"` or `"POST"` |
| `acceptHeaderSelect` | `application/sparql-results+json,*/*;q=0.9` | accept header for `SELECT` / `ASK` |
| `acceptHeaderGraph` | `application/n-triples,*/*;q=0.9` | accept header for `CONSTRUCT` / `DESCRIBE` |
| `acceptHeaderUpdate` | `text/plain,*/*;q=0.9` | accept header for updates |
| `namedGraphs` / `defaultGraphs` | `[]` | graph URIs |
| `args` | `[]` | extra `{ name, value }` request args |
| `headers` | `{}` | extra HTTP headers |
| `withCredentials` | `false` | send credentials (cookies) with the request |
| `adjustQueryBeforeRequest` | `false` | `(sparqlEditor) => string` to rewrite the query before sending |

::: tip CORS
If the endpoint does not return CORS headers, set a `corsProxy` on SparqlStudio rather than fighting the request config. See [SparqlStudio · CORS](./sparql-studio#cors).
:::
