/**
 * Static SPARQL syntax highlighting, used as a FALLBACK when the active language server provides no
 * semantic tokens (e.g. traqula, which is diagnostics-only). Servers that do emit semantic tokens
 * (qlue-ls, swls) stay the source of truth, so this is toggled off for them by the editor
 * (see `activateLanguageServer` in `../index.ts`).
 *
 * The query is parsed with the Lezer SPARQL grammar of `codemirror-lang-sparql`. Its nodes are tagged
 * and colored by mapping those tags onto the SAME `cm-st-<type>` CSS classes the semantic-token glue
 * uses (see `./glue` and the editor stylesheet), so the fallback follows the light/dark theme and
 * matches the LSP palette. The worker-free server reads the same syntax tree (see `./sparqlContext`).
 *
 * The same vocabulary feeds {@link sparqlLocalCompletion}, the keyword completion used while the active
 * server provides no completion (or no server is configured), and the worker-free server in `./localServer`.
 */
import { LRLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { ifNotIn, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { styleTags, tags as t } from "@lezer/highlight";
import { SparqlLanguage } from "codemirror-lang-sparql";
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

// Tags of the grammar's nodes. Keywords and functions keep the tags the grammar package gives them.
// A rule set on a node with children only colors the text between them, which is how the path
// operators and group braces (anonymous in the grammar) get the operator color.
const sparqlNodeTags = styleTags({
  Comment: t.comment,
  Var: t.variableName,
  String: t.string,
  "Integer Decimal Double": t.number,
  "IntegerPositive DecimalPositive DoublePositive IntegerNegative DecimalNegative DoubleNegative": t.number,
  "TRUE FALSE": t.bool,
  Langtag: t.meta,
  "IriRef Pname_ln Pname_ns Blank_node_label": t.namespace,
  A_predicate: t.keyword,
  "; , . ^^ [ ] Anon Nil PathMod": t.operator,
  "PathAlternative PathSequence PathEltOrInverse PathElt PathPrimary PathNegatedPropertySet": t.operator,
  "GroupGraphPattern ConstructTemplate QuadData QuadPattern DataBlock BrackettedExpression": t.operator,
});

// Map those tags onto the same `cm-st-*` classes the LSP semantic-token glue uses, so the
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

/** The fallback SPARQL grammar. Language data (e.g. completion sources) can be attached to it. */
export const sparqlLanguage = LRLanguage.define({
  name: "sparql",
  parser: SparqlLanguage.parser.configure({ props: [sparqlNodeTags] }),
  languageData: { commentTokens: { line: "#" } },
});

/** SPARQL grammar-based highlighting to use when no semantic tokens are available. */
export const sparqlFallbackHighlight: Extension = [sparqlLanguage, syntaxHighlighting(sparqlHighlightStyle)];

const completionOptions: Completion[] = [
  ...KEYWORD_LIST.map((label) => ({ label, type: "keyword" })),
  ...FUNCTION_LIST.map((label) => ({ label, type: "function" })),
];

// A word that needs no completion: offering one would make Enter replace it (`a` becomes ABS) or
// swallow the newline after an already complete keyword.
const isCompleteWord = (word: string) => word === "a" || KEYWORDS.has(word.toUpperCase());

// What is being typed cannot be a keyword: a variable, language tag or prefixed name, an absolute IRI
// still open, or a number. Read from the text, as the grammar rejects most of these until complete.
const NOT_A_KEYWORD = /[?$@:][\w.-]*$|<[A-Za-z][A-Za-z0-9+.-]*:[^\s<>"{}|^`\\]*$|\b\d\w*$/;

// Suggest keywords and functions for the word before the cursor. While typing, stay quiet once that
// word is complete; Ctrl-Space still lists everything.
export const keywordCompletionSource: CompletionSource = (context) => {
  if (context.matchBefore(NOT_A_KEYWORD)) return null;
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
  autocomplete: ifNotIn(["Comment", "String", "IriRef"], keywordCompletionSource),
});
