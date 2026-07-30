# Yasr plugins

Yasr renders a SPARQL response through one of several plugins. The right plugin is picked automatically from the query type (`SELECT`, `ASK`, `CONSTRUCT`, `DESCRIBE`), the response content type and the data structure, but you can switch manually with the tabs above the result area. Your choice is kept per tab.

The **Table**, **Boolean**, **Response** and **Error** plugins are built in. **Graph** and **Geo** are community plugins registered by the demo (see [Yasr](./sparql-results#result-view-plugins)).

## Configuring plugins

Plugins are configured through the `results` slot of the SparqlStudio config. Three options control which plugins are available and how they are ordered:

```ts
import SparqlStudio from '@rdfjs/sparql-studio';
import '@rdfjs/sparql-studio/style.css';

const sparqlStudio = new SparqlStudio(document.getElementById('sparqlStudio'), {
  results: {
    // Tab order in the result area (plugins not listed are appended alphabetically)
    pluginOrder: ['table', 'response'],
    // Plugin selected when no better match is found for a response
    defaultPlugin: 'table',
    // Per-plugin configuration, keyed by the name used at registration
    plugins: {
      table: {
        enabled: true,
        // Initial values for the plugin's own settings (also adjustable in the UI)
        dynamicConfig: { pageSize: 50, compact: false },
      },
      response: {
        enabled: true,
        dynamicConfig: { maxLines: 60 },
      },
      // Disable a built-in plugin entirely
      boolean: { enabled: false },
    },
  },
});
```

Notes:

- The key in `plugins` is the name passed to `SparqlStudio.Results.registerPlugin(name, …)` (`table`, `response`, `boolean`, plus any community plugins you register).
- `dynamicConfig` seeds the plugin's per-tab settings. Values the user later changes through the plugin UI are persisted to `localStorage` and take precedence on the next load.
- Defaults: `pluginOrder` is `['table', 'response']` and `defaultPlugin` is `'table'`.

## Table

Renders `SELECT` results as an interactive table: sortable columns, real-time search filtering, virtual scrolling for large result sets, and cell selection with copy to clipboard (Markdown, CSV, TSV).

```sparql
SELECT ?item ?itemLabel WHERE {
  ?item wdt:P31 wd:Q146 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 100
```

Config (`results.plugins.table.dynamicConfig`):

| Option | Type | Default | Description |
|---|---|---|---|
| `pageSize` | `number` | `50` | Rows shown per page. |
| `compact` | `boolean` | `false` | Compact rendering: hide the first index column and collapse IRI brackets. |
| `isEllipsed` | `boolean` | `true` | Truncate long cell values with an ellipsis (expand on click). |

```ts
const sparqlStudio = new SparqlStudio(document.getElementById('sparqlStudio'), {
  results: {
    plugins: {
      table: { dynamicConfig: { pageSize: 100, compact: true } },
    },
  },
});
```

## Boolean

Shows the outcome of an `ASK` query as a clear, color-coded `TRUE` (green) or `FALSE` (red).

```sparql
ASK { wd:Q42 wdt:P31 wd:Q5 }
```

## Response

Shows the raw endpoint response with syntax highlighting (JSON, XML, Turtle…), line numbers, code folding and copy to clipboard. Useful for debugging and inspecting the exact payload returned by the endpoint.

```sparql
SELECT * WHERE { ?s ?p ?o } LIMIT 10
```

Config (`results.plugins.response.dynamicConfig`):

| Option | Type | Default | Description |
|---|---|---|---|
| `maxLines` | `number` | `30` | Maximum number of lines rendered before the output is truncated (the full payload is still available via copy/download). |

```ts
const sparqlStudio = new SparqlStudio(document.getElementById('sparqlStudio'), {
  results: {
    plugins: {
      response: { dynamicConfig: { maxLines: 100 } },
    },
  },
});
```

## Geo

::: warning External plugin
[`yasgui-geo-tg`](https://github.com/Thib-G/yasgui-geo-tg)
:::

Displays geographic results on an interactive [Leaflet](https://leafletjs.com/) map. It reads WKT (`geo:wktLiteral`), GeoJSON, GML and GeoHash literals, and also auto-detects `?lat` / `?lon` numeric columns without WKT. Includes multiple basemaps, drawing tools that generate spatial SPARQL filters, a time slider for temporal data, and export to GeoJSON, KML, CSV and PNG.

Integrate it:

Register the plugin (under the name `geo`) **before** constructing SparqlStudio, then add it to `pluginOrder`:

```ts
import SparqlStudio from '@rdfjs/sparql-studio';
import GeoPlugin from 'yasgui-geo-tg';

SparqlStudio.Results.registerPlugin('geo', GeoPlugin);

const sparqlStudio = new SparqlStudio(document.getElementById('sparqlStudio'), {
  results: {
    pluginOrder: ['table', 'response', 'geo'],
    defaultPlugin: 'geo',
  },
});
```

The map controls (basemap, color, clustering, export, drawing, time slider…) are driven from the plugin UI; there are no programmatic config options to pass through `results.plugins.geo`.

Examples queries:

```sparql
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT * WHERE {
  VALUES (?wktLabel ?lat ?lon ?wktColor) {
    ("Geneva" 46.2044 6.1432 "blue")
    ("Lausanne" 46.5197 6.6323 "red")
    ("Sion" 46.2297 7.3597 "green")
  }
  BIND (STRDT(CONCAT("POINT(", STR(?lon), " ", STR(?lat), ")"),geo:wktLiteral) AS ?point_no_crs_defined)
  BIND (STRDT(CONCAT("SRID=4326;POINT(", STR(?lon), " ", STR(?lat), ")"),geo:wktLiteral) AS ?point_ewkt_4326)
  BIND (STRDT(CONCAT("<http://www.opengis.net/def/crs/EPSG/0/4326> POINT(", STR(?lat), " ", STR(?lon), ")"),geo:wktLiteral) AS ?point_opengis_4326)
  BIND (?wktLabel AS ?wktTooltip)
}
```

```sparql
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT ?feature ?wkt WHERE {
  ?feature geo:hasGeometry/geo:asWKT ?wkt .
} LIMIT 500
```

## Graph

::: warning External plugin
[`@matdata/yasgui-graph-plugin`](https://github.com/Matdata-eu/yasgui-graph-plugin)
:::

Renders `CONSTRUCT` / `DESCRIBE` results as an interactive node-edge graph with a force-directed layout. URIs, literals and blank nodes are color-coded, double-click a node to expand it with a `DESCRIBE` query, and use compact mode to hide literals and class nodes.

Integrate it:

```ts
import SparqlStudio from '@rdfjs/sparql-studio';
import GraphPlugin from '@matdata/yasgui-graph-plugin';

SparqlStudio.Results.registerPlugin('graph', GraphPlugin);

const sparqlStudio = new SparqlStudio(document.getElementById('sparqlStudio'), {
  results: {
    pluginOrder: ['table', 'response', 'graph'],
  },
});
```

Graph settings (compact mode, edge style, node size…) are adjustable from the plugin's ⚙ panel and persisted to `localStorage`. To change the defaults, subclass the plugin and register your variant:

```ts
class MyGraphPlugin extends GraphPlugin {
  constructor(sparqlResults) {
    super(sparqlResults);
    this.settings.compactMode = true;        // hide literal/class nodes (default: false)
    this.settings.edgeStyle = 'straight';    // 'curved' | 'straight' (default: 'curved')
    this.settings.nodeSize = 'large';        // 'small' | 'medium' | 'large' (default: 'medium')
    this.settings.predicateDisplay = 'label';// 'label' | 'icon' | 'hidden' (default: 'icon')
    this.settings.physicsEnabled = false;    // disable force-directed layout (default: true)
    this.settings.showNodeLabels = true;     // display node labels (default: true)
  }
}

SparqlStudio.Results.registerPlugin('graph', MyGraphPlugin);
```

Example query:

```sparql
PREFIX ex: <http://example.org/>
CONSTRUCT {
  ?s ex:knows ?o .
  ?s rdfs:label ?label .
}
WHERE {
  ?s ex:knows ?o .
  ?s rdfs:label ?label .
}
```

## Error

Appears automatically when a query fails. Shows detailed error messages, HTTP status codes, SPARQL endpoint errors and CORS troubleshooting guidance for network errors, syntax problems or an unavailable endpoint.

## Writing a plugin

A plugin is a class that implements the `Plugin` interface and renders into the result area. Register it with `SparqlStudio.Results.registerPlugin(name, PluginClass)` **before** creating the app. The constructor receives the `SparqlResults` instance; render into `this.results.resultsEl`.

```ts
import SparqlStudio from "@rdfjs/sparql-studio";
import type { Plugin } from "@rdfjs/sparql-results";

class BooleanPlugin implements Plugin<undefined> {
  // Higher wins when several plugins can handle the same response.
  priority = 10;
  // Hide it from the plugin tabs (it is auto-selected via canHandleResults instead).
  hideFromSelection = true;

  constructor(private results: InstanceType<typeof SparqlStudio.Results>) {}

  // Required: can this plugin render the current response?
  canHandleResults() {
    return typeof this.results.results?.getBoolean?.() === "boolean";
  }

  // Required: render into the results element.
  draw() {
    const el = document.createElement("div");
    el.textContent = this.results.results?.getBoolean() ? "True" : "False";
    this.results.resultsEl.appendChild(el);
  }

  // Required: a tab/selection icon (an SVG element renders best).
  getIcon() {
    const icon = document.createElement("span");
    icon.textContent = "✓/✗";
    return icon;
  }
}

SparqlStudio.Results.registerPlugin("myBoolean", BooleanPlugin);
```

### The `Plugin` interface

| member | required | purpose |
| --- | --- | --- |
| `priority` | yes | when multiple plugins return `true` from `canHandleResults()`, the highest priority is auto-selected |
| `canHandleResults()` | yes | whether this plugin can render the current `results` |
| `draw(persistentConfig?, runtimeConfig?)` | yes | render into `this.results.resultsEl` (may be async) |
| `getIcon()` | yes | the `Element` shown on the plugin's selection tab |
| `hideFromSelection` | — | hide the selection tab (e.g. auto-only plugins like Boolean/Error) |
| `label` | — | display name on the tab (defaults to the registered name) |
| `options` | — | the plugin's settings object, seeded from `dynamicConfig` |
| `initialize()` / `destroy()` | — | async setup / teardown hooks |
| `download(filename?)` | — | return a `DownloadInfo` (`{ contentType, getData, filename, title }`) to enable the download button |
| `helpReference` | — | URL shown as a help link for the plugin |

The parsed response is on `this.results.results` (a `Parser`): `getBoolean()`, `getBindings()`, `getVariables()`, the content type, etc. See the built-in [table](https://github.com/rdfjs/Yasgui/tree/main/packages/sparql-results/src/plugins/table) and [boolean](https://github.com/rdfjs/Yasgui/tree/main/packages/sparql-results/src/plugins/boolean) plugins for full references.
