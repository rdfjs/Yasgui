import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Globale Ignoriermuster, gelten für alle Dateien
  globalIgnores([
    "build/**", // das gesamte build-Verzeichnis ignorieren
    "**/*.min.js", // alle Dateien mit .min.js ignorieren
  ]),

  // Beispiel: Anwendung der empfohlenen Regeln auf JS-Dateien
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    // Wir ignorieren hier ebenfalls die minimierten Dateien
    ignores: ["**/*.min.js", "build/**"],
    rules: {
      // Beispielregel
      semi: ["error", "always"],
      quotes: ["error", "double"],
    },
  },

  // optional: Overrides oder weitere Dateien/Endungen
]);
