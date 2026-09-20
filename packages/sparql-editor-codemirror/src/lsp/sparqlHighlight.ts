/**
 * Static SPARQL syntax highlighting, used as a FALLBACK when the active language server provides no
 * semantic tokens (e.g. traqula, which is diagnostics-only). Servers that do emit semantic tokens
 * (qlue-ls, swls) stay the source of truth, so this is toggled off for them by the editor
 * (see `activateLanguageServer` in `../index.ts`).
 *
 * Tokens are tagged via a small {@link StreamLanguage} tokenizer and colored by mapping those tags
 * onto the SAME `cm-st-<type>` CSS classes the semantic-token glue uses (see `./glue` and the
 * editor stylesheet), so the fallback follows the light/dark theme and matches the LSP palette.
 */
import { StreamLanguage, StreamParser, StringStream, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

// SPARQL 1.1 keywords + built-in functions (matched case-insensitively). `a` (the rdf:type
// shorthand) is handled separately so it only counts as a keyword when standing alone.
const KEYWORDS = new Set(
  (
    "BASE PREFIX SELECT CONSTRUCT DESCRIBE ASK WHERE FROM NAMED DISTINCT REDUCED AS GROUP BY HAVING " +
    "ORDER ASC DESC LIMIT OFFSET VALUES OPTIONAL UNION MINUS GRAPH SERVICE FILTER BIND UNDEF IN NOT " +
    "EXISTS INSERT DELETE DATA WITH USING CLEAR DROP CREATE ADD MOVE COPY LOAD INTO SILENT DEFAULT ALL " +
    "STR LANG LANGMATCHES DATATYPE BOUND IRI URI BNODE RAND ABS CEIL FLOOR ROUND CONCAT STRLEN UCASE " +
    "LCASE ENCODE_FOR_URI CONTAINS STRSTARTS STRENDS STRBEFORE STRAFTER YEAR MONTH DAY HOURS MINUTES " +
    "SECONDS TIMEZONE TZ NOW UUID STRUUID MD5 SHA1 SHA256 SHA384 SHA512 COALESCE IF STRLANG STRDT " +
    "SAMETERM ISIRI ISURI ISBLANK ISLITERAL ISNUMERIC REGEX SUBSTR REPLACE COUNT SUM MIN MAX AVG " +
    "SAMPLE GROUP_CONCAT SEPARATOR"
  )
    .split(" ")
    .map((w) => w.toUpperCase()),
);

const sparqlParser: StreamParser<unknown> = {
  token(stream: StringStream): string | null {
    if (stream.eatSpace()) return null;
    const ch = stream.peek();

    // Comments: # to end of line
    if (stream.match(/^#.*/)) return "comment";

    // Variables: ?name or $name
    if (stream.match(/^[?$][A-Za-z0-9_]+/)) return "variableName";

    // IRI refs: <...>
    if (stream.match(/^<[^\s<>"{}|^`\\]*>/)) return "namespace";

    // Strings (single-line, both quote styles, with escapes)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      stream.next();
      let escaped = false;
      let c: string | void;
      while ((c = stream.next()) != null) {
        if (c === quote && !escaped) break;
        escaped = !escaped && c === "\\";
      }
      return "string";
    }

    // Language tag: @en, @en-GB
    if (stream.match(/^@[A-Za-z][A-Za-z0-9-]*/)) return "meta";

    // Numbers
    if (stream.match(/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?/)) return "number";

    // Prefixed names (foo:bar, :bar) and bare prefixes (foo:)
    if (stream.match(/^[A-Za-z_][\w.-]*:[\w.-]*/) || stream.match(/^:[\w.-]*/)) return "namespace";

    // Words: keywords / `a` / booleans / plain identifiers
    const word = stream.match(/^[A-Za-z_]\w*/) as RegExpMatchArray | null;
    if (word) {
      const w = word[0];
      if (w === "a") return "keyword";
      if (/^(true|false)$/i.test(w)) return "bool";
      if (KEYWORDS.has(w.toUpperCase())) return "keyword";
      return null;
    }

    // Operators and punctuation
    if (stream.match(/^(\|\||&&|!=|<=|>=|\^\^|[=<>+\-*/!^|&.,;(){}[\]])/)) return "operator";

    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "#" } },
};

// Map the tokenizer's tags onto the same `cm-st-*` classes the LSP semantic-token glue uses, so the
// fallback shares the editor's theme-aware palette (no extra CSS needed).
const sparqlHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, class: "cm-st-keyword" },
  { tag: t.variableName, class: "cm-st-variable" },
  { tag: t.string, class: "cm-st-string" },
  { tag: t.number, class: "cm-st-number" },
  { tag: t.comment, class: "cm-st-comment" },
  { tag: t.namespace, class: "cm-st-namespace" },
  { tag: t.bool, class: "cm-st-boolean" },
  { tag: t.meta, class: "cm-st-langTag" },
  { tag: t.operator, class: "cm-st-operator" },
]);

/** SPARQL grammar-based highlighting to use when no semantic tokens are available. */
export const sparqlFallbackHighlight: Extension = [
  StreamLanguage.define(sparqlParser),
  syntaxHighlighting(sparqlHighlightStyle),
];
