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
import type { MonacoLanguageClient } from "monaco-languageclient";

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

/**
 * Fetch a prefix map from the given SPARQL endpoint by querying for prefixes declared with SHACL
 */
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

/**
 * Update qlue-ls settings
 */
export function configureQlueLsSettings(languageClient: MonacoLanguageClient): void {
  languageClient.sendNotification("qlueLs/changeSettings", qlueLsSettings);
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

// Qlue-ls settings

/**
 * qlue-ls server settings pushed once the language client is ready. Mirrors the keys the qlue-ls
 * VS Code extension reads from its `config.get(...)` calls; here we send the demo defaults.
 */
export const qlueLsSettings = {
  format: {
    alignPredicates: false,
    alignPrefixes: false,
    separatePrologue: true,
    capitalizeKeywords: true,
    insertSpaces: true,
    tabSize: 2,
    whereNewLine: false,
    filterSameLine: true,
    lineLength: 120,
    contractTriples: true,
    keepEmptyLines: false,
  },
  completion: {
    timeoutMs: 10000,
    resultSizeLimit: 50,
    subjectCompletionTriggerLength: 3,
    objectCompletionSuffix: true,
    variableCompletionLimit: 10,
    sameSubjectSemicolon: true,
  },
  prefixes: {
    addMissing: true,
    removeUnused: false,
  },
};

/** Minimal fallback prefixes used when an endpoint exposes none. */
export const fallbackPrefixMap: PrefixMap = {
  activitystreams: "https://www.w3.org/ns/activitystreams#",
  adms: "http://www.w3.org/ns/adms#",
  bd: "http://www.bigdata.com/rdf#",
  bibo: "http://purl.org/ontology/bibo/",
  busco: "http://busco.ezlab.org/schema#",
  cc: "http://creativecommons.org/ns#",
  chebi: "http://purl.obolibrary.org/obo/CHEBI_",
  cito: "http://purl.org/spar/cito/",
  csvw: "http://purl.org/csvw/vocab#",
  dblp: "https://dblp.org/rdf/schema#",
  dbo: "http://dbpedia.org/ontology/",
  dbr: "http://dbpedia.org/resource/",
  dc: "http://purl.org/dc/elements/1.1/",
  dcat: "http://www.w3.org/ns/dcat#",
  dcmit: "http://purl.org/dc/dcmitype/",
  dcterms: "http://purl.org/dc/terms/",
  doap: "http://usefulinc.com/ns/doap#",
  doi: "http://dx.doi.org/",
  earl: "http://www.w3.org/ns/earl#",
  ECO: "http://purl.obolibrary.org/obo/ECO_",
  edm: "http://www.europeana.eu/schemas/edm/",
  ensembl: "http://rdf.ebi.ac.uk/resource/ensembl/",
  fabio: "http://purl.org/spar/fabio/",
  faldo: "http://biohackathon.org/resource/faldo#",
  foaf: "http://xmlns.com/foaf/0.1/",
  genex: "http://purl.org/genex#",
  geo: "http://www.opengis.net/ont/geosparql#",
  geof: "http://www.opengis.net/def/function/geosparql/",
  go: "http://purl.obolibrary.org/obo/GO_",
  gr: "http://purl.org/goodrelations/v1#",
  hydra: "http://www.w3.org/ns/hydra/core#",
  mondo: "http://purl.obolibrary.org/obo/MONDO_",
  np: "http://www.nanopub.org/nschema#",
  npx: "http://purl.org/nanopub/x/",
  oa: "http://www.w3.org/ns/oa#",
  obo: "http://purl.obolibrary.org/obo/",
  oboInOwl: "http://www.geneontology.org/formats/oboInOwl#",
  org: "http://www.w3.org/ns/org#",
  osmwiki: "https://www.openstreetmap.org/wiki/Key:",
  owl: "http://www.w3.org/2002/07/owl#",
  pav: "http://purl.org/pav/",
  prov: "http://www.w3.org/ns/prov#",
  pubmed: "http://purl.uniprot.org/pubmed/",
  qb: "http://purl.org/linked-data/cube#",
  qudt: "http://qudt.org/schema/qudt/",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  rh: "http://rdf.rhea-db.org/",
  rr: "http://www.w3.org/ns/r2rml#",
  schema: "http://schema.org/",
  schemas: "https://schema.org/",
  sd: "http://www.w3.org/ns/sparql-service-description#",
  sh: "http://www.w3.org/ns/shacl#",
  shex: "http://www.w3.org/ns/shex#",
  sio: "http://semanticscience.org/resource/",
  sioc: "http://rdfs.org/sioc/ns#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  skosxl: "http://www.w3.org/2008/05/skos-xl#",
  sp: "http://spinrdf.org/sp#",
  stato: "http://purl.obolibrary.org/obo/STATO_",
  taxon: "http://purl.uniprot.org/taxonomy/",
  time: "http://www.w3.org/2006/time#",
  uniparc: "http://purl.uniprot.org/uniparc/",
  uniprot: "http://purl.uniprot.org/uniprot/",
  up: "http://purl.uniprot.org/core/",
  vann: "http://purl.org/vocab/vann/",
  vcard: "http://www.w3.org/2006/vcard/ns#",
  voag: "http://voag.linkedmodel.org/schema/voag#",
  void: "http://rdfs.org/ns/void#",
  wd: "http://www.wikidata.org/entity/",
  wdt: "http://www.wikidata.org/prop/direct/",
  wikibase: "http://wikiba.se/ontology#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
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
