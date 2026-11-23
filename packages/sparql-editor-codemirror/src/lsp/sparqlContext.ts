/**
 * Tells which kind of term fits at a position of a SPARQL query, so the worker-free language server
 * (see `./localServer`) knows when to suggest the endpoint's predicates or classes.
 *
 * It reads the Lezer syntax tree CodeMirror keeps for the editor (grammar from `codemirror-lang-sparql`,
 * see `./sparqlHighlight`): it finds the last token before the position, then walks up its ancestors
 * to learn the role of that token in its triple (subject, predicate, object). The tree stays usable
 * on the incomplete queries met while typing, where the parser inserts error nodes.
 */
import type { SyntaxNode, Tree } from "@lezer/common";

/** `predicate`: a predicate fits here. `class`: the object of `a` / `rdf:type`. `other`: neither. */
export type TermPosition = "predicate" | "class" | "other";

const RDF_TYPE = new Set(["a", "rdf:type", "<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>"]);

// Operators that may sit between a token and the term after it. Most are anonymous in the grammar
// (not tree nodes), so they are read from the text.
const STARTS_PATH = /^[\^!(]*$/; // nothing, or the opening of an inverse, negated or grouped path
const CONTINUES_PATH = /[/|^!]\(*$/; // a path operator, after a path element

// The last token that ends at or before `pos`, skipping comments and what the parser rejected
function tokenBefore(node: SyntaxNode, pos: number): SyntaxNode | null {
  if (!node.firstChild) return node.to <= pos && node.from < node.to ? node : null;
  for (let child = node.lastChild; child; child = child.prevSibling) {
    if (child.from >= pos || child.type.isError || child.name === "Comment") continue;
    const token = tokenBefore(child, pos);
    if (token) return token;
  }
  return null;
}

/**
 * The kind of term expected at `pos`, the start of the token being completed.
 * @param slice reads the query text between two offsets
 */
export function termPosition(tree: Tree, pos: number, slice: (from: number, to: number) => string): TermPosition {
  const token = tokenBefore(tree.topNode, pos);
  if (!token) return "other";
  // Operators between that token and `pos`, without whitespace and comments
  const operators = slice(token.to, pos).replace(/#[^\n]*|\s+/g, "");
  // The object position of a verb: a class when the verb is `a` or rdf:type
  // (a verb node may extend over a rejected word typed after it, hence the cut at `pos`)
  const afterVerb = (verb: SyntaxNode | null): TermPosition =>
    verb && !operators && RDF_TYPE.has(slice(verb.from, Math.min(verb.to, pos)).trim()) ? "class" : "other";

  // Punctuation that settles the position by itself. An empty `[ ]` around `pos` is a single token
  // of the grammar, so its opening bracket only shows in the text.
  const parent = token.parent?.name ?? "";
  if (/\[[\^!(]*$/.test(operators)) return "predicate";
  const opensPredicate =
    (token.name === ";" && parent.startsWith("PropertyList")) ||
    (token.name === "[" && parent.startsWith("BlankNodePropertyList"));
  if (opensPredicate) return STARTS_PATH.test(operators) ? "predicate" : "other";
  if (token.name === "," && parent.startsWith("ObjectList")) {
    let verb = token.parent!.prevSibling;
    while (verb && !verb.name.startsWith("Verb")) verb = verb.prevSibling;
    return afterVerb(verb);
  }

  // Otherwise the token is part of a term: find the role of that term in its triple
  for (let node: SyntaxNode | null = token; node; node = node.parent) {
    const name = node.name;
    // Part of a predicate: the path goes on after a path operator, else its object comes next
    if (name === "VerbPath" || name === "VerbSimple" || name === "Verb") {
      return CONTINUES_PATH.test(operators) ? "predicate" : afterVerb(node);
    }
    // Part of an object: the triple goes on with `.`, `;` or `,`
    if (name === "ObjectListPath" || name === "ObjectList") return "other";
    // Inside a collection that is still open
    if (name.startsWith("Collection") && (node.to > pos || slice(node.to - 1, node.to) !== ")")) return "other";
    // The subject of a triple (a term, a blank node property list or a collection)
    const triple = node.parent;
    if (triple?.name.startsWith("TriplesSameSubject") && triple.firstChild?.from === node.from) {
      return /^\)*[\^!(]*$/.test(operators) ? "predicate" : "other";
    }
  }
  return "other";
}
