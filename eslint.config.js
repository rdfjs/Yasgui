import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import jest from "eslint-plugin-jest";
import lodash from "eslint-plugin-lodash";
import prettier from "eslint-config-prettier/flat";

const inCi = !!process.env["CI_PIPELINE_ID"];
const expensive = inCi || !!process.env["ESLINT_STRICT"];
const errLevel = expensive ? "error" : "warn";

export default defineConfig([
  { ignores: ["build/**", "**/*.min.js"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      jest,
      lodash,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2018,
      sourceType: "module",
      parserOptions: expensive ? { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname } : {},
    },
    rules: {
      "no-return-await": "off", // Disable this rule so that "@typescript-eslint/return-await" works correctly.
      ...(expensive
        ? { "@typescript-eslint/no-floating-promises": errLevel, "@typescript-eslint/return-await": errLevel }
        : {}),
      "no-console": [
        errLevel,
        { allow: ["time", "timeEnd", "trace", "warn", "error", "info", "groupEnd", "group", "groupCollapsed"] },
      ],
      "no-debugger": 2,
      "jest/no-focused-tests": errLevel,
      "lodash/import-scope": [errLevel, "member"],
    },
  },
  prettier,
]);
