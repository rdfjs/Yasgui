/**
 * Classic-mode SPARQL highlighting (no VSCode extension host / TextMate / oniguruma).
 *
 * A Monarch tokenizer provides the *fallback* syntax highlighting shown before the language
 * server responds. The authoritative coloring still comes from qlue-ls LSP semantic tokens.
 * Both are driven by the SAME theme `rules` table: Monarch emits token names that match the
 * standard LSP semantic token types (keyword, function, variable, string, number, comment,
 * operator, namespace), so one set of rules colors both.
 */

import type * as monaco from "monaco-editor";

/** Control/structural SPARQL keywords (case-insensitive). */
const SPARQL_KEYWORDS = [
  "BASE",
  "PREFIX",
  "SELECT",
  "DISTINCT",
  "REDUCED",
  "FROM",
  "NAMED",
  "WHERE",
  "UNION",
  "OPTIONAL",
  "MINUS",
  "GRAPH",
  "SERVICE",
  "SILENT",
  "VALUES",
  "AS",
  "GROUP",
  "BY",
  "HAVING",
  "ORDER",
  "DESC",
  "ASC",
  "LIMIT",
  "OFFSET",
  "CONSTRUCT",
  "DESCRIBE",
  "ASK",
  "LOAD",
  "INTO",
  "CLEAR",
  "ALL",
  "DEFAULT",
  "DROP",
  "ADD",
  "TO",
  "MOVE",
  "COPY",
  "WITH",
  "USING",
  "CREATE",
  "INSERT",
  "DELETE",
  "DATA",
  "true",
  "false",
  "a",
];

/** SPARQL built-in functions / aggregates (case-insensitive). */
const SPARQL_FUNCTIONS = [
  "FILTER",
  "BIND",
  "MAX",
  "SAMPLE",
  "LANG",
  "STR",
  "RAND",
  "ABS",
  "CEIL",
  "FLOOR",
  "ROUND",
  "CONCAT",
  "STRLEN",
  "UCASE",
  "LCASE",
  "ENCODE_FOR_URI",
  "CONTAINS",
  "STRSTARTS",
  "STRENDS",
  "STRBEFORE",
  "STRAFTER",
  "YEAR",
  "MONTH",
  "DAY",
  "HOURS",
  "MINUTES",
  "SECONDS",
  "TIMEZONE",
  "TZ",
  "NOW",
  "UUID",
  "STRUUID",
  "MD5",
  "SHA1",
  "SHA256",
  "SHA384",
  "SHA512",
  "COALESCE",
  "IF",
  "STRLANG",
  "STRDT",
  "sameTerm",
  "isIRI",
  "isURI",
  "isBLANK",
  "isLITERAL",
  "isNUMERIC",
  "COUNT",
  "SUM",
  "MIN",
  "AVG",
  "GROUP_CONCAT",
  "SEPARATOR",
  "SUBSTR",
  "REGEX",
  "EXISTS",
  "IN",
  "NOT",
  "BOUND",
];

/** Monarch language definition used for the pre-LSP fallback tokenization. */
export const sparqlMonarchLanguage: monaco.languages.IMonarchLanguage = {
  ignoreCase: true,
  defaultToken: "",
  keywords: SPARQL_KEYWORDS,
  functions: SPARQL_FUNCTIONS,
  tokenizer: {
    root: [
      // Comments
      [/#.*$/, "comment"],
      // Variables: ?var or $var
      [/[?$]\w+/, "variable"],
      // IRIs: <...>
      [/<[^<>"{}|^`\s]*>/, "operator"],
      // Prefixed-name prefix part (incl. trailing colon): foaf: / rdf:
      [/[A-Za-z_][\w.\-]*:/, "namespace"],
      // Numbers
      [/\d+(\.\d+([eE][\-+]?\d+)?)?/, "number"],
      // Strings (double / single quoted, with escapes)
      [/"([^"\\]|\\.)*"/, "string"],
      [/'([^'\\]|\\.)*'/, "string"],
      // Identifiers -> keyword / function / plain
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            "@keywords": "keyword",
            "@functions": "function",
            "@default": "identifier",
          },
        },
      ],
      // Brackets / punctuation / operators
      [/[{}()\[\].;,]/, "operator"],
      [/[*+\/<>=!&|^~-]+/, "operator"],
    ],
  },
};

/** Brackets, comments and auto-closing pairs (classic equivalent of the language configuration). */
export const sparqlLanguageConfiguration: monaco.languages.LanguageConfiguration = {
  comments: { lineComment: "#" },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "'", close: "'", notIn: ["string", "comment"] },
    { open: '"', close: '"', notIn: ["string"] },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
  ],
};

/** Source theme shape (subset of a VSCode theme) used to derive a standalone Monaco theme. */
interface SparqlThemeSource {
  type: string;
  colors: Record<string, string>;
  semanticTokenColors: Record<string, string | { foreground?: string; fontStyle?: string }>;
}

/**
 * Normalize a hex color to the 6/8-digit form (no leading `#`) that Monaco's standalone
 * `defineTheme` requires for token-color rules. Monaco's strict token-color parser rejects the
 * CSS shorthand (e.g. `#219`), so expand 3/4-digit shorthand to its full form.
 */
function normalizeHex(color: string): string {
  const h = color.replace(/^#/, "");
  if (h.length === 3 || h.length === 4) {
    return h
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return h;
}

/**
 * Build a standalone Monaco theme (IStandaloneThemeData) from one of the SPARQL theme objects.
 * The `rules` are keyed by the LSP semantic token type names, which also match the Monarch
 * token names emitted above, so a single table colors both the fallback and the LSP tokens.
 */
export function buildSparqlThemeData(theme: SparqlThemeSource): monaco.editor.IStandaloneThemeData {
  const rules: monaco.editor.ITokenThemeRule[] = [];
  for (const [token, value] of Object.entries(theme.semanticTokenColors)) {
    const fg = typeof value === "string" ? value : value.foreground;
    if (!fg) continue;
    const rule: monaco.editor.ITokenThemeRule = { token, foreground: normalizeHex(fg) };
    const fontStyle = typeof value === "object" ? value.fontStyle : undefined;
    if (fontStyle) rule.fontStyle = fontStyle;
    rules.push(rule);
  }
  return {
    base: theme.type === "dark" ? "vs-dark" : "vs",
    inherit: true,
    colors: theme.colors,
    rules,
  };
}
