/**
 * A language "server" for the CodeMirror editor that needs no Web Worker: every feature is a plain
 * CodeMirror extension running on the main thread, for hosts where workers are unavailable.
 *
 * {@link localLanguageServer} builds one, to list in `config.languageServers` like any other server.
 * It completes SPARQL keywords and functions, the variables already used in the query, and the
 * predicates and classes of the current endpoint. Those are listed once per endpoint with two SPARQL
 * queries, then filtered locally by CodeMirror as the user types.
 */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { insertCompletionText, pickedCompletion } from "@codemirror/autocomplete";
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { getAjaxConfig, qlueLs } from "@rdfjs/sparql-utils";
import type { Prefixes, PopulatedAjaxConfig } from "@rdfjs/sparql-utils";
import type { SparqlEditor } from "../index";
import { sparqlLanguage, keywordCompletionSource } from "./sparqlHighlight";
import { termPosition } from "./sparqlContext";

/**
 * A language server made of CodeMirror extensions instead of a Web Worker. It is listed in
 * `config.languageServers` next to (or instead of) worker-based servers, and shows in the same switcher.
 */
export interface LocalLanguageServerDef {
  /** Short name shown in the switcher. */
  label: string;
  /** Optional longer description, shown dimmed next to the label. */
  description?: string;
  /** The CodeMirror extensions providing the language features, installed while this server is active. */
  extension: Extension | ((editor: SparqlEditor) => Extension);
  /** Called when the active endpoint changes, but only while this server is active. */
  onEndpointChange?: (endpoint: string, editor: SparqlEditor) => void;
}

/** Options of {@link localLanguageServer}. */
export interface LocalLanguageServerOptions {
  /** Name shown in the switcher. Defaults to `"Built-in"`. */
  label?: string;
  description?: string;
  /** SELECT query listing the endpoint's predicates, bound to `?term`. */
  predicatesQuery?: string;
  /** SELECT query listing the endpoint's classes, bound to `?term`. */
  classesQuery?: string;
  /**
   * `{ prefix: namespace }` map used to shorten the suggested IRIs. Defaults to the prefixes the
   * endpoint declares (`sh:prefix` / `sh:namespace`), or a set of common ones when it declares none.
   */
  prefixes?: Prefixes;
  /** Timeout of each endpoint query, in milliseconds. Defaults to 30000. */
  timeout?: number;
}

const DEFAULT_PREDICATES_QUERY = "SELECT DISTINCT ?term WHERE { ?s ?term ?o } LIMIT 1000";
const DEFAULT_CLASSES_QUERY = "SELECT DISTINCT ?term WHERE { ?s a ?term } LIMIT 1000";

// The token being completed: an IRI still open, or a (prefixed) name
const IRI_TOKEN = /^<[^\s<>"{}|^`\\]*$/;
const NAME_TOKEN = /^[\w.-]*:?[\w.-]*$/;
const TERM_BEFORE_CURSOR = /<[^\s<>"{}|^`\\]*$|[\w.-]*:?[\w.-]*$/;
const VARIABLE_TOKEN = /^[?$]\w*$/;

/** What is known about an endpoint, fetched once. Failed requests resolve to an empty list. */
interface EndpointTerms {
  predicates: Promise<string[]>;
  classes: Promise<string[]>;
  prefixes: Promise<Prefixes>;
}

type Token = { from: number; text: string };

// Run a SELECT query with the editor's request settings and collect the IRIs bound to ?term
async function fetchTerms(request: PopulatedAjaxConfig, query: string, timeout: number): Promise<string[]> {
  try {
    const url = new URL(request.url, window.location.href);
    url.searchParams.set("query", query);
    const response = await fetch(url, {
      headers: { ...request.headers, Accept: "application/sparql-results+json" },
      credentials: request.withCredentials ? "include" : "same-origin",
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const terms = new Set<string>();
    for (const binding of (await response.json()).results.bindings) {
      if (binding.term?.type === "uri") terms.add(binding.term.value);
    }
    return [...terms];
  } catch (error: any) {
    console.warn(`Could not list terms from ${request.url}:`, error?.message || error);
    return [];
  }
}

/**
 * Build a completion result that stays quiet once the typed token is complete (`a`, or exactly one
 * of the options), so Enter then inserts a newline instead of accepting a suggestion.
 */
function completionResult(
  context: CompletionContext,
  token: Token,
  options: Completion[],
  validToken: RegExp,
): CompletionResult | null {
  const labels = new Set(options.map((option) => option.label));
  const isComplete = (text: string) => text === "a" || labels.has(text);
  if (!options.length || (!context.explicit && isComplete(token.text))) return null;
  return {
    from: token.from,
    options,
    validFor: (text) => validToken.test(text) && !isComplete(text),
  };
}

// Suggest the variables used elsewhere in the query
function variableCompletion(context: CompletionContext, token: Token): CompletionResult | null {
  const names = new Set<string>();
  for (const match of context.state.doc.toString().matchAll(/[?$](\w+)/g)) {
    if (match.index !== token.from) names.add(match[1]);
  }
  const options = [...names].map((name) => ({ label: token.text[0] + name, type: "variable" }));
  return completionResult(context, token, options, VARIABLE_TOKEN);
}

/**
 * Turn IRIs into completions. An IRI is shortened with the longest matching namespace, preferring
 * the prefixes declared in the query; picking one that uses an undeclared prefix also adds its
 * PREFIX declaration. IRIs no prefix fits are suggested in full.
 */
function termCompletions(editor: SparqlEditor, iris: string[], known: Prefixes, type: string): Completion[] {
  const declared = editor.getPrefixesFromQuery();
  const namespaces = Object.entries(declared).map(([prefix, namespace]) => ({ prefix, namespace, declared: true }));
  for (const [prefix, namespace] of Object.entries(known)) {
    // A known prefix is unusable when the query already binds that name
    if (!(prefix in declared)) namespaces.push({ prefix, namespace, declared: false });
  }
  namespaces.sort((a, b) => b.namespace.length - a.namespace.length || Number(b.declared) - Number(a.declared));

  return iris.map((iri) => {
    for (const { prefix, namespace, declared: isDeclared } of namespaces) {
      if (!iri.startsWith(namespace)) continue;
      const local = iri.slice(namespace.length);
      // Only local names that are valid unescaped in a prefixed name
      if (!/^(?:[\w-]|[\w-][\w.-]*[\w-])?$/.test(local)) continue;
      const completion: Completion = { label: `${prefix}:${local}`, type, info: iri };
      if (!isDeclared) {
        completion.apply = (view, picked, from, to) => {
          view.dispatch({
            ...insertCompletionText(view.state, picked.label, from, to),
            annotations: pickedCompletion.of(picked),
          });
          editor.addPrefixes({ [prefix]: namespace });
        };
      }
      return completion;
    }
    return { label: `<${iri}>`, type };
  });
}

// The single completion source of the server: variables, then terms or keywords depending on position
function completionSource(editor: SparqlEditor, loadTerms: () => EndpointTerms | undefined): CompletionSource {
  return async (context) => {
    const { state } = context;
    // The syntax tree of the whole query (small enough to finish parsing right away)
    const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
    const node = tree.resolveInner(context.pos, -1).name;
    if (node === "Comment" || node === "String" || node === "Langtag") return null;

    const variable = context.matchBefore(/[?$]\w*$/);
    if (variable) return variableCompletion(context, variable);

    const token = context.matchBefore(TERM_BEFORE_CURSOR) ?? { from: context.pos, text: "" };
    const position = termPosition(tree, token.from, (from, to) => state.sliceDoc(from, to));
    // Outside predicate and class positions: keywords
    if (position === "other") return keywordCompletionSource(context);
    if ((!context.explicit && !token.text) || /^\d/.test(token.text)) return null;

    const terms = loadTerms();
    if (!terms) return null;
    const [iris, known] = await Promise.all([
      position === "predicate" ? terms.predicates : terms.classes,
      terms.prefixes,
    ]);
    if (context.aborted) return null;
    const type = position === "predicate" ? "property" : "class";
    // An IRI being typed is matched against full IRIs, anything else against prefixed names
    if (token.text.startsWith("<")) {
      const options = iris.map((iri) => ({ label: `<${iri}>`, type }));
      return completionResult(context, token, options, IRI_TOKEN);
    }
    return completionResult(context, token, termCompletions(editor, iris, known, type), NAME_TOKEN);
  };
}

/**
 * A worker-free language server for the CodeMirror editor: completion of keywords, functions,
 * variables, and the predicates and classes of the current endpoint.
 *
 * ```ts
 * new SparqlEditor(parent, { languageServers: [localLanguageServer()] });
 * ```
 */
export function localLanguageServer(options: LocalLanguageServerOptions = {}): LocalLanguageServerDef {
  const timeout = options.timeout ?? 30000;
  const cache = new Map<string, EndpointTerms>();
  // The terms of the editor's current endpoint, queried on first use and then kept per endpoint
  const loadTerms = (editor: SparqlEditor): EndpointTerms | undefined => {
    const request = getAjaxConfig(editor);
    if (!request) return undefined;
    let terms = cache.get(request.url);
    if (!terms) {
      terms = {
        predicates: fetchTerms(request, options.predicatesQuery ?? DEFAULT_PREDICATES_QUERY, timeout),
        classes: fetchTerms(request, options.classesQuery ?? DEFAULT_CLASSES_QUERY, timeout),
        prefixes: options.prefixes ? Promise.resolve(options.prefixes) : qlueLs.fetchPrefixMap(request.url),
      };
      cache.set(request.url, terms);
    }
    return terms;
  };

  return {
    label: options.label ?? "Built-in",
    description: options.description ?? "Worker-free completion of the endpoint's predicates and classes",
    extension: (editor) => {
      // Start listing the endpoint's terms right away, so they are ready for the first completion
      loadTerms(editor);
      return sparqlLanguage.data.of({ autocomplete: completionSource(editor, () => loadTerms(editor)) });
    },
    onEndpointChange: (_endpoint, editor) => void loadTerms(editor),
  };
}
