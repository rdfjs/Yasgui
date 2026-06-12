# Yasr (results)

`@zazuko/yasr` renders a SPARQL response, as a table, raw response, graph or map. Use it standalone
when you have results from anywhere and want Yasgui's viewer without the editor.

Wire it to a [Yasqe](./yasqe) instance (or feed it a response from any source):

```ts
import Yasqe from "@zazuko/yasqe";
import Yasr from "@zazuko/yasr";
import "@zazuko/yasqe/style.css";
import "@zazuko/yasr/style.css";

const yasqe = new Yasqe(document.getElementById("yasqe")!, {
  requestConfig: { endpoint: "https://sparql.dblp.org/sparql" },
});
const yasr = new Yasr(document.getElementById("yasr")!, {
  // resolve prefixed names in results using the query's PREFIX declarations
  prefixes: () => yasqe.getPrefixesFromQuery(),
});

// queryResponse is emitted instance-first: (yasqe, response, duration)
yasqe.on("queryResponse", (yasqe, response, duration) => {
  yasr.setResponse(response, duration);
});
```

## Feeding a response directly

You don't need Yasqe at all, `setResponse` accepts any SPARQL JSON / response object:

```ts
const yasr = new Yasr(document.getElementById("yasr")!);
yasr.setResponse(sparqlResultsJson);
```

## Result-view plugins

Yasr picks a sensible plugin based on the response (a table for `SELECT`, a boolean for `ASK`,
etc.). The live demo registers two extra plugins before creating the app:

```ts
import GraphPlugin from "@matdata/yasgui-graph-plugin";
import GeoPlugin from "yasgui-geo-tg";

Yasgui.Yasr.registerPlugin("Graph", GraphPlugin);
Yasgui.Yasr.registerPlugin("Geo", GeoPlugin);
```

Built-in and community plugins include:

- **Table** · sortable, paginated table for `SELECT` results.
- **Response** · the raw response body (JSON, XML, Turtle, …).
- **Boolean** · the result of an `ASK` query.
- **Graph** · node-link visualization of `CONSTRUCT` / `DESCRIBE` results.
- **Geo** · map view for results with geographic literals.

Users switch between the available plugins with the tabs above the result area.
