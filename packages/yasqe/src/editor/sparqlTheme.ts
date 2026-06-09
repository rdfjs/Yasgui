export const sparqlThemeDark = {
  // Solarized Dark theme, adapted from the original Solarized palette
  name: "SPARQL Dark Theme",
  type: "dark",
  colors: {
    "editor.foreground": "#839496",
    "editor.background": "#002b36",
    "editor.selectionBackground": "#073642",
    "editor.lineHighlightBackground": "#073642",
    "editorCursor.foreground": "#fdf6e3",
    "editorWhitespace.foreground": "#586e75",
    "editorIndentGuide.activeBackground": "#cb4b1680",
    "editor.selectionHighlightBorder": "#d33682",
  },
  // Used when the language server (qlue-ls) emits semantic tokens
  // colors mirror the TextMate scopes below so highlighting stays consistent
  semanticHighlighting: true,
  semanticTokenColors: {
    keyword: "#859900", // green - matches keyword.control.sparql
    function: "#cb4b16", // orange - matches keyword.operator.function.sparql
    variable: "#268bd2", // blue - matches variable.other.sparql
    string: "#b58900", // yellow - matches string
    number: "#2aa198", // cyan - matches constant.numeric
    comment: "#586e75", // base01 - solarized
    operator: "#93a1a1", // base1 - matches keyword.symbol
    namespace: "#FF5600", // orange - matches variable.prefix.sparql
    // namespace: { foreground: "#FF5600", fontStyle: "italic bold" },
  },
  // Used by TextMate grammars (fallback if no semantic colors provided by language server)
  tokenColors: [
    {
      scope: "keyword.control.sparql",
      settings: {
        foreground: "#859900", // green
        // fontStyle: "bold italic",
      },
    },
    {
      scope: "keyword.operator.function.sparql",
      settings: {
        foreground: "#cb4b16", // orange
      },
    },
    {
      scope: "keyword.operator.prefixdecl.sparql",
      settings: {
        foreground: "#859900", // green
      },
    },
    {
      scope: "variable.prefix.sparql",
      settings: {
        foreground: "#FF5600", // orange
      },
    },
    {
      scope: "variable.reference.sparql",
      settings: {
        foreground: "#FF5600", // orange
      },
    },
    {
      scope: "variable.other.sparql",
      settings: {
        foreground: "#268bd2", // blue
      },
    },
    {
      scope: "constant.other.iri.sparql",
      settings: {
        foreground: "#2aa198", // cyan
      },
    },
    {
      scope: "constant.numeric",
      settings: {
        foreground: "#2aa198", // cyan
      },
    },
    {
      scope: "string",
      settings: {
        foreground: "#b58900", // yellow
      },
    },
    {
      scope: "keyword.symbol",
      settings: {
        foreground: "#93a1a1", // light gray
      },
    },
  ],
};

export const sparqlThemeLight = {
  name: "SPARQL Light Theme",
  type: "light",
  colors: {
    "editor.foreground": "#586e75",
    "editor.background": "#f7f7f7", // off-white with better contrast than white
    // "editor.background": "#ffffff", // white
    // "editor.background": "#fdf6e3", // solarized light background
    "editor.selectionBackground": "#eee8d5",
    "editor.lineHighlightBackground": "#fdf6e3",
    "editorCursor.foreground": "#002b36",
    "editorWhitespace.foreground": "#93a1a1",
    "editorIndentGuide.activeBackground": "#cb4b1680",
    "editor.selectionHighlightBorder": "#d33682",
  },
  semanticHighlighting: true,
  semanticTokenColors: {
    keyword: "#62036F",
    function: "#cb4b16",
    variable: "#219",
    string: "#AA1011",
    number: "#2aa198",
    comment: "#708090",
    operator: "#000000",
    namespace: "#FF5600",
  },
  tokenColors: [
    {
      scope: "keyword.control.sparql",
      settings: {
        foreground: "#62036F",
        // fontStyle: "bold",
      },
    },
    {
      scope: "keyword.operator.function.sparql",
      settings: {
        foreground: "#cb4b16",
      },
    },
    {
      scope: "keyword.operator.prefixdecl.sparql",
      settings: {
        foreground: "#62036F",
      },
    },
    {
      scope: "variable.prefix.sparql",
      settings: {
        foreground: "#FF5600",
      },
    },
    {
      scope: "variable.reference.sparql",
      settings: {
        foreground: "#FF5600",
      },
    },
    {
      scope: "variable.other.sparql",
      settings: {
        foreground: "#219",
      },
    },
    {
      scope: "constant.other.iri.sparql",
      settings: {
        foreground: "#085",
      },
    },
    {
      scope: "constant.numeric",
      settings: {
        foreground: "#2aa198",
      },
    },
    {
      scope: "string",
      settings: {
        foreground: "#AA1011",
      },
    },
    {
      scope: "keyword.symbol",
      settings: {
        foreground: "#000",
      },
    },
  ],
};

// NOTE: alternative dark theme
// export const sparqlThemeDark = {
//   name: "SPARQL Dark Theme",
//   type: "dark",
//   colors: {
//     "editor.foreground": "#928364",
//     "editor.background": "#282828",
//     "editor.selectionBackground": "#44475a",
//     "editor.lineHighlightBackground": "#32302f",
//     "editorCursor.foreground": "#f8f8f0",
//     "editorWhitespace.foreground": "#3B3A32",
//     "editorIndentGuide.activeBackground": "#9D550FB0",
//     "editor.selectionHighlightBorder": "#222218",
//   },
//   // Used when the language server (qlue-ls) emits semantic tokens
//   // colors mirror the TextMate scopes below so highlighting stays consistent
//   semanticHighlighting: true,
//   semanticTokenColors: {
//     keyword: "#98971a",
//     function: "#d65d0e",
//     variable: "#ebdbb2",
//     string: "#d79921",
//     number: "#689d6a",
//     comment: "#928374",
//     operator: "#fe8019",
//     namespace: "#cc241d",
//   },
// };
