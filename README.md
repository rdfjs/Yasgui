# SPARQL Studio

SPARQL Studio is a SPARQL query editor and results viewer for the web. It is a fork of [Yasgui](https://github.com/zazuko/Yasgui) and stays compatible with all existing Yasr result-view plugins.

Useful links:

- Live demo: [sparql.studio](https://sparql.studio)
- Documentation: [sparql.studio/docs/introduction](https://sparql.studio/docs/introduction)
- Source code: [github.com/rdfjs/Yasgui](https://github.com/rdfjs/Yasgui)

## Packages

| Package                            | Description                                            |
| ---------------------------------- | ------------------------------------------------------ |
| `@rdfjs/sparql-studio`             | Full app: tabbed editor + results (formerly Yasgui)    |
| `@rdfjs/sparql-editor-monaco`      | SPARQL query editor based on Monaco (formerly Yasqe)   |
| `@rdfjs/sparql-editor-codemirror`  | SPARQL query editor based on CodeMirror 6              |
| `@rdfjs/sparql-results`            | SPARQL results viewer (formerly Yasr)                  |
| `@rdfjs/sparql-utils`              | Shared utilities                                       |

## Installation

Below is how to include the full app in your project. To install only the editor or the
results viewer, swap `@rdfjs/sparql-studio` for the relevant package above.

### npm

```sh
npm i @rdfjs/sparql-studio
```

### Yarn

```sh
yarn add @rdfjs/sparql-studio
```

## Local development

### Installing dependencies

Run `npm install`.

### Running locally

To develop locally, run `npm run dev`.

### Compiling

Run `npm run build`. It stores the transpiled js/css files in the `build` directory.

## License

SPARQL Studio is a fork of [Yasgui](https://github.com/TriplyDB/Yasgui/) maintained by Zazuko, originally written by Triply.

This code is released under the MIT license.
