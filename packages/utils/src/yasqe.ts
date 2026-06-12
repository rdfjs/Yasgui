/**
 * Shared Yasqe contract. These types are editor-agnostic so that both the Monaco-based
 * (`@zazuko/yasqe`) and the CodeMirror 6-based (`@zazuko/yasqe-codemirror`) editors expose the
 * same surface, and Yasgui can drive whichever one the consumer injects without depending on a
 * concrete editor implementation.
 * @module YasqeContract
 */

/** The SPARQL query/update forms, as detected by {@link IYasqe.getQueryType}. */
export type QueryType =
  | "SELECT"
  | "CONSTRUCT"
  | "ASK"
  | "DESCRIBE"
  | "INSERT"
  | "DELETE"
  | "LOAD"
  | "CLEAR"
  | "CREATE"
  | "DROP"
  | "COPY"
  | "MOVE"
  | "ADD";

/**
 * How a query is sent to a SPARQL endpoint. Every field may be a plain value or a getter function
 * (resolved against the editor instance), so consumers can compute values lazily at request time.
 */
export interface RequestConfig<Y> {
  queryArgument: string | ((yasqe: Y) => string) | undefined;
  endpoint: string | ((yasqe: Y) => string);
  method: "POST" | "GET" | ((yasqe: Y) => "POST" | "GET");
  acceptHeaderGraph: string | ((yasqe: Y) => string);
  acceptHeaderSelect: string | ((yasqe: Y) => string);
  acceptHeaderUpdate: string | ((yasqe: Y) => string);
  namedGraphs: string[] | ((yasqe: Y) => string[]);
  defaultGraphs: string[] | ((yasqe: Y) => string[]);
  args: Array<{ name: string; value: string }> | ((yasqe: Y) => Array<{ name: string; value: string }>);
  headers: { [key: string]: string } | ((yasqe: Y) => { [key: string]: string });
  withCredentials: boolean | ((yasqe: Y) => boolean);
  adjustQueryBeforeRequest: ((yasqe: Y) => string) | false;
}

/** A {@link RequestConfig} with every getter function resolved to its plain value (persistable). */
export type PlainRequestConfig = {
  [K in keyof RequestConfig<any>]: Exclude<RequestConfig<any>[K], Function>;
};

/** The slice of editor state persisted to local storage. */
export interface YasqePersistentConfig {
  query: string;
  editorHeight: string;
}

/** Arguments map for a SPARQL request (a value can repeat, hence `string[]`). */
export type RequestArgs = { [argName: string]: string | string[] };

/** A `{ prefixLabel: iri }` map of SPARQL `PREFIX` declarations. */
export type Prefixes = { [prefixLabel: string]: string };

/**
 * Extract the `PREFIX` declarations from a SPARQL query string as a `{ prefix: iri }` map.
 * Shared by both editors (Monaco and CodeMirror) and used by Yasr to resolve prefixed names
 * in results. A `PREFIX` must be preceded by start-of-string or whitespace.
 */
export function getPrefixesFromQuery(query: string): Prefixes {
  const out: Prefixes = {};
  const re = /(?:^|\s)PREFIX\s+([\w.-]*)\s*:\s*<([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

/** The SPARQL update forms (everything else is a read-only query). */
const UPDATE_QUERY_TYPES: ReadonlySet<QueryType> = new Set<QueryType>([
  "INSERT",
  "DELETE",
  "LOAD",
  "CLEAR",
  "CREATE",
  "DROP",
  "COPY",
  "MOVE",
  "ADD",
]);

/**
 * Detect the SPARQL query form by scanning the query text. Comments and the `PREFIX`/`BASE`
 * prologue are skipped so the first real keyword (SELECT, CONSTRUCT, INSERT, ...) is matched.
 * Returns `undefined` when nothing matches (e.g. an empty or still-typed query). Shared by both
 * editors.
 */
export function getQueryType(query: string): QueryType | undefined {
  const withoutComments = query.replace(/(^|\s)#[^\n]*/g, " ");
  // Drop the leading PREFIX/BASE prologue to reach the actual query/update keyword.
  const body = withoutComments.replace(/(\s|^)(PREFIX\s+[^\s]*\s*:\s*<[^>]*>|BASE\s+<[^>]*>)/gi, " ");
  const m = body.match(/\b(SELECT|CONSTRUCT|ASK|DESCRIBE|INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD)\b/i);
  return m ? (m[1].toUpperCase() as QueryType) : undefined;
}

/** Whether a query is a read-only `query` or a `update`, derived from its {@link QueryType}. */
export function getQueryMode(queryType: QueryType | undefined): "update" | "query" {
  return queryType && UPDATE_QUERY_TYPES.has(queryType) ? "update" : "query";
}

/**
 * The editor-agnostic Yasqe contract that Yasgui programs against. Both editor implementations
 * satisfy it (they have many more members; this is only the subset Yasgui relies on).
 */
export interface IYasqe {
  /** The editor's root element. */
  rootEl: HTMLElement;
  /**
   * The resolved editor configuration. Yasgui reads/overwrites `requestConfig`,
   * `createShareableLink` and `editorHeight` on the shared instance per tab.
   */
  config: {
    requestConfig: RequestConfig<any> | ((yasqe: any) => RequestConfig<any>);
    createShareableLink: (yasqe: any) => string;
    editorHeight: string;
    [key: string]: any;
  };

  getValue(): string;
  setValue(value: string): void;
  setSize(height?: string, width?: string): void;
  refresh(): void;
  focus(): void;

  query(config?: any): Promise<any>;
  abortQuery(): void;
  /** Build the request arguments for the current query against the given request config. */
  getUrlArguments(requestConfig: any): RequestArgs;

  getPrefixesFromQuery(): { [prefix: string]: string };
  getQueryType(): QueryType | undefined;
  getQueryMode(): "update" | "query";

  on(eventName: string, handler: (...args: any[]) => void): any;
  off(eventName: string, handler: (...args: any[]) => void): any;
  emit(eventName: string | symbol, ...args: any[]): boolean;

  /** Switch the editor theme. Optional: not every editor exposes runtime theme switching. */
  setTheme?(theme: "light" | "dark"): void | Promise<void>;
  destroy?(): void;
}

/**
 * Factory that builds an editor instance into `parent`, given the per-tab config Yasgui injects.
 * Yasgui is editor-independent: the consumer imports an editor (e.g. `@zazuko/yasqe` or
 * `@zazuko/yasqe-codemirror`) and supplies one of these as `config.yasqe`.
 */
export type YasqeFactory = (parent: HTMLElement, conf: any) => IYasqe;

/** Default query shown in a fresh editor/tab. */
export const defaultQueryValue = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT * WHERE {
  ?sub ?pred ?obj .
} LIMIT 10`;

/** Default SPARQL request configuration shared by the editors and Yasgui. */
export const defaultRequestConfig: PlainRequestConfig = {
  queryArgument: undefined, // undefined means: get query argument based on query mode
  endpoint: "https://sparql.dblp.org/sparql",
  method: "POST",
  acceptHeaderGraph: "text/turtle,application/n-triples,application/rdf+xml,application/trig,application/n-quads",
  acceptHeaderSelect: "application/sparql-results+json,*/*;q=0.9",
  acceptHeaderUpdate: "text/plain,*/*;q=0.9",
  namedGraphs: [],
  defaultGraphs: [],
  args: [],
  headers: {},
  withCredentials: false,
  adjustQueryBeforeRequest: false,
};
