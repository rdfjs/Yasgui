/// <reference types="vite/client" />
/**
 * Consumer-side qlue-ls configuration for the demo pages.
 *
 * yasqe/yasgui are language-server agnostic: they only receive a ready LSP `Worker` and expose the
 * resulting language client. Everything qlue-ls specific (the WASM worker, the backend/completion
 * query config, the `qlueLs/addBackend` extension) lives here, so swapping to another SPARQL
 * language server (e.g. SemanticWebLanguageServer/swls) only touches this file.
 */
import QlueLsWorker from "./qluels.worker?worker";

export type SparqlEngine = "QLever" | "GraphDB" | "Virtuoso" | "MillenniumDB" | "Blazegraph" | "Jena";

export interface PrefixMap {
  [key: string]: string;
}

/** Valid qlue-ls completion query template keys (the `CompletionTemplate` enum, camelCase). */
export type CompletionTemplate =
  | "hover"
  | "subjectCompletion"
  | "predicateCompletionContextSensitive"
  | "predicateCompletionContextInsensitive"
  | "objectCompletionContextSensitive"
  | "objectCompletionContextInsensitive"
  | "valuesCompletionContextSensitive"
  | "valuesCompletionContextInsensitive";

export type CompletionQueries = Partial<Record<CompletionTemplate, string>>;

/** Qlue-ls endpoint backend configuration */
export interface BackendConfiguration {
  name: string;
  url: string;
  healthCheckUrl?: string;
  engine?: SparqlEngine;
  requestMethod?: "GET" | "POST";
  prefixMap: PrefixMap;
  default: boolean;
  queries: CompletionQueries;
  additionalData?: unknown;
}

/**
 * Create a qlue-ls language-server worker and resolve once its WASM is initialized.
 * Pass the result to Yasqe/Yasgui via the `languageServerWorker` config option.
 */
export function createQlueLsWorker(): Promise<Worker> {
  return new Promise((resolve) => {
    const worker = new QlueLsWorker({ name: "qlue-ls" });
    worker.onmessage = (event) => {
      if (event.data?.type === "ready") resolve(worker);
    };
  });
}

/** Minimal fallback prefixes used when an endpoint exposes none. */
export const fallbackPrefixMap: PrefixMap = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  foaf: "http://xmlns.com/foaf/0.1/",
  dc: "http://purl.org/dc/elements/1.1/",
  dcterms: "http://purl.org/dc/terms/",
};

/**
 * Completion query templates (qlue-ls Jinja-like templating) used to resolve term completions
 * against the endpoint. Generic enough to work on most label-bearing datasets.
 */
const completionQueries: CompletionQueries = {
  // TODO: improve default completionQueries
  subjectCompletion: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
SELECT ?qlue_ls_entity (SAMPLE(?label) as ?qlue_ls_label) WHERE {
  ?qlue_ls_entity rdf:type ?type ; rdfs:label ?label .
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(?label, "^{{ search_term }}")
  {% endif %}
}
GROUP BY ?qlue_ls_entity
ORDER BY DESC(COUNT(?qlue_ls_entity))
LIMIT {{ limit }} OFFSET {{ offset }}`,
  predicateCompletionContextInsensitive: `{% include "prefix_declarations" %}
SELECT ?qlue_ls_entity ?qlue_ls_score WHERE {
  { SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_score) WHERE
    {
      {{local_context}}
    }
    GROUP BY ?qlue_ls_entity }
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?qlue_ls_entity), "{{ search_term }}", "i")
  {% endif %}
} ORDER BY DESC(?qlue_ls_score)
LIMIT {{ limit }} OFFSET {{ offset }}`,
  objectCompletionContextInsensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity (MIN(?name) AS ?qlue_ls_label) (MIN(?alias) AS ?qlue_ls_alias) (MAX(?count) AS ?qlue_ls_count) WHERE {
  {
    { SELECT ?qlue_ls_entity ?name ?alias ?count WHERE {
      { SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?count) WHERE {
        {{local_context}}
      } GROUP BY ?qlue_ls_entity }
      ?qlue_ls_entity rdfs:label ?name BIND(?name AS ?alias)
      {% if search_term_uncompressed %}
      FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
      {% elif search_term %}
      FILTER REGEX(STR(?alias), "^{{ search_term }}")
      {% endif %}
    } }
  } UNION {
    { SELECT ?qlue_ls_entity ?name ?alias ?count WHERE {
      { SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?count) WHERE {
        {{local_context}}
      } GROUP BY ?qlue_ls_entity }
      BIND(?qlue_ls_entity AS ?name) BIND(?qlue_ls_entity AS ?alias)
      {% if search_term_uncompressed %}
      FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
      {% elif search_term %}
      FILTER REGEX(STR(?alias), "^{{ search_term }}")
      {% endif %}
    } }
  }
} GROUP BY ?qlue_ls_entity ORDER BY DESC(?qlue_ls_count)
LIMIT {{ limit }} OFFSET {{ offset }}`,
  predicateCompletionContextSensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
{% if subject is not variable %}

SELECT ?qlue_ls_entity (SAMPLE(?qlue_ls_label_or_null) AS ?qlue_ls_label) ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ local_context }}
    }
    GROUP BY ?qlue_ls_entity
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?qlue_ls_label_or_null }
  BIND (COALESCE(?qlue_ls_label_or_null, ?qlue_ls_entity) AS ?label)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?label), "{{ search_term }}", "i")
  {% endif %}
}
GROUP BY ?qlue_ls_entity ?qlue_ls_count
ORDER BY DESC(?qlue_ls_count)

{% else %}

SELECT ?qlue_ls_entity (SAMPLE(?qlue_ls_label_or_null) AS ?qlue_ls_label) ?qlue_ls_count WHERE {
  {% if not context %}
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ local_context }}
    }
    GROUP BY ?qlue_ls_entity
  }
  {% else %}
  {
    SELECT ?qlue_ls_entity (COUNT(DISTINCT {{ subject }}) AS ?qlue_ls_count) WHERE {
      {{ context }} {{ local_context }}
    }
    GROUP BY ?qlue_ls_entity
  }
  {% endif %}
  OPTIONAL { ?qlue_ls_entity rdfs:label ?qlue_ls_label_or_null }
  BIND (COALESCE(?qlue_ls_label_or_null, ?qlue_ls_entity) AS ?label)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?label), "{{ search_term }}", "i")
  {% endif %}
}
GROUP BY ?qlue_ls_entity ?qlue_ls_count
ORDER BY DESC(?qlue_ls_count)

{% endif %}
LIMIT {{ limit }} OFFSET {{ offset }}`,
  objectCompletionContextSensitive: `{% include "prefix_declarations" %}
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?qlue_ls_entity ?qlue_ls_label ?qlue_ls_count WHERE {
  {
    SELECT ?qlue_ls_entity (COUNT(?qlue_ls_entity) AS ?qlue_ls_count) WHERE {
      {{ context }} {{ local_context }} .
    }
    GROUP BY ?qlue_ls_entity
  }
  OPTIONAL {
    ?qlue_ls_entity rdf:type [ rdfs:label ?qlue_ls_label_or_null ] .
  }
  OPTIONAL { ?qlue_ls_entity rdfs:label ?qlue_ls_label_or_null }
  BIND (COALESCE(?qlue_ls_label_or_null, ?qlue_ls_entity) AS ?qlue_ls_label)
  {% if search_term_uncompressed %}
  FILTER (REGEX(STR(?qlue_ls_entity), "^{{ search_term_uncompressed }}"))
  {% elif search_term %}
  FILTER REGEX(STR(?qlue_ls_label), "^{{ search_term }}")
  {% endif %}
}
ORDER BY DESC(?qlue_ls_count)
LIMIT {{ limit }} OFFSET {{ offset }}`,
};

async function fetchPrefixMap(endpoint: string): Promise<PrefixMap> {
  const prefixes: PrefixMap = {};
  try {
    const url = new URL(endpoint);
    url.searchParams.set(
      "query",
      `PREFIX sh: <http://www.w3.org/ns/shacl#>
      SELECT DISTINCT ?prefix ?namespace
      WHERE { [] sh:namespace ?namespace ; sh:prefix ?prefix}
      ORDER BY ?prefix`,
    );
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/sparql-results+json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bindings = (await response.json()).results.bindings;
    const used = new Set<string>();
    bindings.forEach((b: any) => {
      const prefix = b.prefix.value;
      const namespace = b.namespace.value;
      if (!used.has(namespace) && !prefixes[prefix]) {
        prefixes[prefix] = namespace;
        used.add(namespace);
      }
    });
  } catch (error: any) {
    console.warn(`Error retrieving prefixes from ${endpoint}:`, error?.message || error);
  }
  return Object.keys(prefixes).length === 0 ? fallbackPrefixMap : prefixes;
}

/** Build a flat qlue-ls BackendConfiguration for an endpoint, fetching prefixes when needed. */
export async function createBackendConf(endpoint: string): Promise<BackendConfiguration> {
  const prefixMap = await fetchPrefixMap(endpoint);
  return {
    name: endpoint,
    url: endpoint,
    prefixMap,
    queries: completionQueries,
    default: false,
  };
}

// Avoid re-registering the same backend repeatedly
let lastBackendEndpoint: string | undefined;

/**
 * Register a SPARQL endpoint with the qlue-ls language client and make it the default backend,
 */
export async function configureQlueLsBackend(languageClient: any, endpoint: string): Promise<void> {
  if (!languageClient || !endpoint || endpoint === lastBackendEndpoint) return;
  lastBackendEndpoint = endpoint;
  try {
    const backend = await createBackendConf(endpoint);
    languageClient.sendNotification("qlueLs/addBackend", backend);
    languageClient.sendNotification("qlueLs/updateDefaultBackend", { backendName: backend.name });
  } catch (error) {
    lastBackendEndpoint = undefined; // allow retry
    console.error("Failed to configure qlue-ls backend for", endpoint, error);
  }
}

// Shared code for the demo pages

/** Default SPARQL endpoint used across the demo pages. */
export const DEMO_ENDPOINT = "https://sparql.dblp.org/sparql";

export type DevTheme = "light" | "dark";

/**
 * Wire the demo page's light/dark switcher: start from the OS preference, and on toggle set the
 * `[data-theme]` attribute (which drives the CSS) and call `onThemeChange` (e.g. editor.setTheme).
 */
export function setupThemeToggle(onThemeChange?: (theme: DevTheme) => void): DevTheme {
  let currentTheme: DevTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = currentTheme;
  const button = document.getElementById("darkModeToggle");
  const render = () => {
    if (!button) return;
    button.textContent = currentTheme === "dark" ? "☀️" : "🌙";
    const title = currentTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    button.setAttribute("title", title);
    button.setAttribute("aria-label", title);
  };
  render();
  button?.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = currentTheme;
    render();
    onThemeChange?.(currentTheme);
  });
  return currentTheme;
}
