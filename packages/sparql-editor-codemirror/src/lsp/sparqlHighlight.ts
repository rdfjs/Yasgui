/**
 * Static SPARQL syntax highlighting, used as a FALLBACK when the active language server provides no
 * semantic tokens (e.g. traqula, which is diagnostics-only). Servers that do emit semantic tokens
 * (qlue-ls, swls) stay the source of truth, so this is toggled off for them by the editor
 * (see `activateLanguageServer` in `../index.ts`).
 *
 * Tokens are tagged via a small {@link StreamLanguage} tokenizer and colored by mapping those tags
 * onto the SAME `cm-st-<type>` CSS classes the semantic-token glue uses (see `./glue` and the
 * editor stylesheet), so the fallback follows the light/dark theme and matches the LSP palette.
 *
 * The same vocabulary feeds {@link sparqlLocalCompletion}, the keyword completion used while the active
 * server provides no completion (or no server is configured).
 */
import { StreamLanguage, StreamParser, StringStream, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { ifNotIn, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

// SPARQL 1.1 keywords and built-in functions (matched case-insensitively), kept apart so completions
// get the right icon. `a` (the rdf:type shorthand) is handled separately so it only counts as a
// keyword when standing alone.
const KEYWORD_LIST = (
  "BASE PREFIX SELECT CONSTRUCT DESCRIBE ASK WHERE FROM NAMED DISTINCT REDUCED AS GROUP BY HAVING " +
  "ORDER ASC DESC LIMIT OFFSET VALUES OPTIONAL UNION MINUS GRAPH SERVICE FILTER BIND UNDEF IN NOT " +
  "EXISTS INSERT DELETE DATA WITH USING CLEAR DROP CREATE ADD MOVE COPY TO LOAD INTO SILENT DEFAULT " +
  "ALL SEPARATOR"
).split(" ");
const FUNCTION_LIST = (
  "STR LANG LANGMATCHES DATATYPE BOUND IRI URI BNODE RAND ABS CEIL FLOOR ROUND CONCAT STRLEN UCASE " +
  "LCASE ENCODE_FOR_URI CONTAINS STRSTARTS STRENDS STRBEFORE STRAFTER YEAR MONTH DAY HOURS MINUTES " +
  "SECONDS TIMEZONE TZ NOW UUID STRUUID MD5 SHA1 SHA256 SHA384 SHA512 COALESCE IF STRLANG STRDT " +
  "SAMETERM ISIRI ISURI ISBLANK ISLITERAL ISNUMERIC REGEX SUBSTR REPLACE COUNT SUM MIN MAX AVG " +
  "SAMPLE GROUP_CONCAT"
).split(" ");
const KEYWORDS = new Set([...KEYWORD_LIST, ...FUNCTION_LIST]);

const sparqlParser: StreamParser<unknown> = {
  token(stream: StringStream): string | null {
    if (stream.eatSpace()) return null;
    const ch = stream.peek();

    // Comments: # to end of line
    if (stream.match(/^#.*/)) return "comment";

    // Variables: ?name or $name
    if (stream.match(/^[?$][A-Za-z0-9_]+/)) return "variableName";

    // IRI refs: <...>, or an absolute one still being typed (<scheme:... with no closing bracket yet)
    if (stream.match(/^<[^\s<>"{}|^`\\]*>/) || stream.match(/^<[A-Za-z][A-Za-z0-9+.-]*:[^\s<>"{}|^`\\]*/)) {
      return "namespace";
    }

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

const sparqlLanguage = StreamLanguage.define(sparqlParser);

/** SPARQL grammar-based highlighting to use when no semantic tokens are available. */
export const sparqlFallbackHighlight: Extension = [sparqlLanguage, syntaxHighlighting(sparqlHighlightStyle)];

const completionOptions: Completion[] = [
  ...KEYWORD_LIST.map((label) => ({ label, type: "keyword" })),
  ...FUNCTION_LIST.map((label) => ({ label, type: "function" })),
];

// A word that needs no completion: offering one would make Enter replace it (`a` becomes ABS) or
// swallow the newline after an already complete keyword.
const isCompleteWord = (word: string) => word === "a" || KEYWORDS.has(word.toUpperCase());

// Suggest keywords and functions for the word before the cursor. While typing, stay quiet once that
// word is complete; Ctrl-Space still lists everything.
const keywordCompletionSource: CompletionSource = (context) => {
  const word = context.matchBefore(/\w+$/);
  if (!context.explicit && (!word || isCompleteWord(word.text))) return null;
  return {
    from: word ? word.from : context.pos,
    options: completionOptions,
    // Re-query (and so close the popup) as soon as the typed word becomes complete.
    validFor: (text) => /^\w*$/.test(text) && !isCompleteWord(text),
  };
};

/**
 * Local completion of SPARQL keywords and built-in functions, for when no language server provides
 * completion. Registered as language data of the fallback grammar, so it relies on
 * {@link sparqlFallbackHighlight} being active, and is skipped inside tokens where a keyword makes no sense.
 */
export const sparqlLocalCompletion: Extension = sparqlLanguage.data.of({
  autocomplete: ifNotIn(["comment", "string", "namespace", "variableName", "meta", "number"], keywordCompletionSource),
});
