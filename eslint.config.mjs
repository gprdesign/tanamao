import { defineConfig, globalIgnores } from "eslint/config";
import quality from "./eslint-rules/index.cjs";

// Projeto JavaScript de scripts de navegador, sem camada de dados importável.
export default defineConfig([
  globalIgnores(["node_modules/**"]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350 }], // baseline: 1 arquivo

      "quality/no-direct-console": "warn", // baseline: 1 ocorrência
    },
  },
  {
    files: ["tests/**/*.{js,mjs,cjs}", "**/*{.,-}{test,spec}.{js,mjs,cjs}"],
    rules: { "quality/max-lines": ["error", { max: 350, includeTests: true }] },
  },
]);
