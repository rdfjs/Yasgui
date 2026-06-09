# Request configuration

`requestConfig` controls how queries are sent to the endpoint. It is accepted by both
[Yasqe](./yasqe) and [Yasgui](./yasgui) (where it sets the default for every tab).

Every field may be a value **or** a `(yasqe) => value` function, so you can compute it per request.

```ts
new Yasgui(el, {
  requestConfig: {
    endpoint: "https://dbpedia.org/sparql",
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
| `adjustQueryBeforeRequest` | `false` | `(yasqe) => string` to rewrite the query before sending |

::: tip CORS
If the endpoint does not return CORS headers, set a `corsProxy` on Yasgui rather than fighting the
request config. See [Yasgui · CORS](./yasgui#cors).
:::
