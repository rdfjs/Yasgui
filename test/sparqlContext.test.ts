import { strict as assert } from "assert";
import { describe, it } from "mocha";
import { SparqlLanguage } from "codemirror-lang-sparql";
import { termPosition, type TermPosition } from "../packages/sparql-editor-codemirror/src/lsp/sparqlContext";

// Each query stops where the completed token would start; `rest` is what follows in the editor
const cases: [query: string, expected: TermPosition, rest?: string][] = [
  // Triple positions
  ["SELECT ", "other"],
  ["SELECT * WHERE { ", "other"],
  ["SELECT * WHERE { ?s ", "predicate"],
  ["SELECT * WHERE { ?s rdfs:label ", "other"],
  ["SELECT * WHERE { ?s a ", "class"],
  ["SELECT * WHERE { ?s rdf:type ", "class"],
  ["SELECT * WHERE { ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ", "class"],
  ["SELECT * WHERE { ?s a ex:Foo ", "other"],
  ["SELECT * WHERE { ?s a ex:Foo, ", "class"],
  ["SELECT * WHERE { ?s a ex:Foo ; ", "predicate"],
  ["SELECT * WHERE { ?s a ex:Foo . ?s ", "predicate"],
  ["SELECT * WHERE { ?s a ex:Foo. ?s ", "predicate"],
  ["CONSTRUCT { ?s ", "predicate"],
  // Literals
  ['SELECT * WHERE { ?s ex:p "lit"@en ; ', "predicate"],
  ['SELECT * WHERE { ?s ex:p "5"^^xsd:int ', "other"],
  ['SELECT * WHERE { ?s ex:p "5"^^xsd:int ; ', "predicate"],
  ['# { ?s \nSELECT * WHERE { ?s ex:p "a { b" . ?s ', "predicate"],
  // Property paths, blank nodes, collections
  ["SELECT * WHERE { ?s rdfs:subClassOf/", "predicate"],
  ["SELECT * WHERE { ?s (rdfs:subClassOf|", "predicate"],
  ["SELECT * WHERE { ?s (rdfs:subClassOf|rdf:type)* ", "other"],
  ["SELECT * WHERE { ?s ex:p [ ", "predicate"],
  ["SELECT * WHERE { ?s ex:p [ a ", "class"],
  ["SELECT * WHERE { ?s ex:p [ a ex:Foo ] ; ", "predicate"],
  ["SELECT * WHERE { (1 2) ", "predicate"],
  // Keywords, expressions and nested groups
  ["SELECT * WHERE { ?s ?p ?o . FILTER(", "other"],
  ["SELECT * WHERE { ?s ?p ?o . FILTER(?o > 5) ?s ", "predicate"],
  ['SELECT * WHERE { ?s ?p ?o FILTER regex(?o, "a") ?x ', "predicate"],
  ["SELECT * WHERE { BIND(STR(?x) AS ?y) ", "other"],
  ["SELECT * WHERE { VALUES ?x { ex:a ", "other"],
  ["SELECT * WHERE { VALUES ?x { ex:a ex:b } ?x ", "predicate"],
  ["SELECT * WHERE { GRAPH ?g ", "other"],
  ["SELECT * WHERE { GRAPH ?g { ?s ", "predicate"],
  ["SELECT * WHERE { SERVICE SILENT <http://x> { ?s a ", "class"],
  ["SELECT * WHERE { OPTIONAL { ?s ?p ?o } ?s ", "predicate"],
  ["SELECT * WHERE { { SELECT ?x (CO", "other"],
  ["SELECT * WHERE { { SELECT ?x WHERE { ?x ", "predicate"],
  ["SELECT * WHERE { { SELECT ?x WHERE { ?x a ex:A } GROUP BY ?x ", "other"],
  ["SELECT * WHERE { ?s ?p ?o } ORDER BY ?s ", "other"],
  // Collections and paths still open
  ["SELECT * WHERE { (1 2 ", "other"],
  ["SELECT * WHERE { ?s ex:p (", "other"],
  ["SELECT * WHERE { ?s ^", "predicate"],
  ["SELECT * WHERE { ?s ex:p/^", "predicate"],
  ["SELECT * WHERE { [ ex:p ?o ] ", "predicate"],
  // Updates
  ["INSERT DATA { ex:s ", "predicate"],
  ["DELETE { ?s ex:p ?o } INSERT { ?s a ", "class"],
  // With the token being typed and the rest of the query after the position
  ["SELECT * WHERE { ?s ", "predicate", "lab }"],
  ["SELECT * WHERE { ?s ", "predicate", "rdfs:la ?o }"],
  ["SELECT * WHERE { ?s ", "predicate", "<http://example.org/la"],
  ["SELECT * WHERE { ?s a ", "class", "Per }"],
  ["SELECT * WHERE { ?s a ", "class", "} LIMIT 10"],
  ["SELECT * WHERE { ?s ex:p ?o ; ", "predicate", "} LIMIT 10"],
  ["SELECT * WHERE { ?s ex:p ?o ; ", "predicate", "ex:q ?x . ?x a ex:Foo }"],
  ["SELECT * WHERE { ?s a ex:Foo . ", "other", "?x ex:p ?o }"],
  ["SELECT * WHERE { ?s ex:p ", "other", "?o }"],
  ["SELECT * WHERE { ?s ex:p [ ", "predicate", "] }"],
  ["SELECT * WHERE { ?s ", "predicate", "\n  OPTIONAL { ?s ex:p ?o }\n}"],
];

describe("termPosition", () => {
  for (const [query, expected, rest = ""] of cases) {
    it(`${expected} after ${JSON.stringify(query)}${rest && " before " + JSON.stringify(rest)}`, () => {
      const text = query + rest;
      const tree = SparqlLanguage.parser.parse(text);
      assert.equal(
        termPosition(tree, query.length, (from, to) => text.slice(from, to)),
        expected,
      );
    });
  }
});
