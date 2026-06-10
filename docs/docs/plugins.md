# Yasr plugins

Yasr renders a SPARQL response through one of several plugins. The right plugin is picked automatically from the query type (`SELECT`, `ASK`, `CONSTRUCT`, `DESCRIBE`), the response content type and the data structure, but you can switch manually with the tabs above the result area. Your choice is kept per tab.

The **Table**, **Boolean**, **Response** and **Error** plugins are built in. **Graph** and **Geo** are community plugins registered by the demo (see [Yasr](./yasr#result-view-plugins)).

## Table

Renders `SELECT` results as an interactive table: sortable columns, real-time search filtering, virtual scrolling for large result sets, and cell selection with copy to clipboard (Markdown, CSV, TSV).

```sparql
SELECT ?item ?itemLabel WHERE {
  ?item wdt:P31 wd:Q146 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 100
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

## Geo

::: warning External plugin
[`yasgui-geo-tg`](https://github.com/Thib-G/yasgui-geo-tg)
:::

Displays geographic results on an interactive Leaflet map. It reads WKT (`geo:wktLiteral`), GeoJSON, GML and GeoHash literals, and also auto-detects `?lat` / `?lon` numeric columns without WKT. Includes multiple basemaps, drawing tools that generate spatial SPARQL filters, a time slider for temporal data, and export to GeoJSON, KML, CSV and PNG.

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
