import { Config } from "./";
import Yasr from "@zazuko/yasr";
import { default as Yasqe } from "@zazuko/yasqe";
import { CatalogueItem } from "./endpointSelect";

export default function initialize(): Config<CatalogueItem> {
  return {
    autofocus: true,
    endpointInfo: undefined,
    persistenceId: function (yasgui) {
      //Traverse parents untl we've got an id
      // Get matching parent elements
      var id = "";
      var elem: any = yasgui.rootEl;
      if ((<any>elem).id) id = (<any>elem).id;
      for (; elem && elem !== <any>document; elem = elem.parentNode) {
        if (elem) {
          if ((<any>elem).id) id = (<any>elem).id;
          break;
        }
      }
      return "yagui_" + id;
    },
    tabName: "Query",
    corsProxy: undefined,
    persistencyExpire: 60 * 60 * 24 * 30,
    persistenceLabelResponse: "response",
    persistenceLabelConfig: "config",
    yasqe: Yasqe.defaults,
    yasr: Yasr.defaults,
    endpointCatalogueOptions: {
      getData: () => {
        return [
          "https://sparql.dblp.org/sparql",
          "https://dbpedia.org/sparql",
          "https://query.wikidata.org/sparql",
          "https://commons-query.wikimedia.org/sparql",
          "https://qlever.dev/api/wikidata",
          "https://qlever.dev/api/wikimedia-commons",
          "https://qlever.dev/api/osm-planet",
          "https://qlever.dev/api/freebase",
          "https://qlever.dev/api/imdb",
          "https://sparql.uniprot.org/sparql",
          "https://www.bgee.org/sparql/",
          "https://sparql.omabrowser.org/sparql/",
          "https://beta.sparql.swisslipids.org/",
          "https://sparql.rhea-db.org/sparql/",
          "https://sparql.cellosaurus.org/sparql",
          "https://sparql.sibils.org/sparql",
          "https://kg.earthmetabolome.org/metrin/api/",
          "https://hamap.expasy.org/sparql/",
          "https://rdf.metanetx.org/sparql/",
          "https://sparql.orthodb.org/sparql",
          "https://sparql.wikipathways.org/sparql/",
          "https://id.nlm.nih.gov/mesh/sparql",
          "https://agrovoc.fao.org/sparql",
          "https://data.europa.eu/sparql",
        ].map((endpoint) => ({ endpoint }));
      },
      keys: [],
      renderItem: (data, source) => {
        const contentDiv = document.createElement("div");

        contentDiv.style.display = "flex";
        contentDiv.style.flexDirection = "column";
        const endpointSpan = document.createElement("span");
        endpointSpan.innerHTML =
          data.matches.endpoint?.reduce(
            (current, object) => (object.highlight ? current + object.text.bold() : current + object.text),
            "",
          ) || "";
        contentDiv.appendChild(endpointSpan);
        source.appendChild(contentDiv);
      },
    },
    copyEndpointOnNewTab: true,
    populateFromUrl: true,
    autoAddOnInit: true,
    requestConfig: Yasqe.defaults.requestConfig,
    contextMenuContainer: undefined,
  };
}
