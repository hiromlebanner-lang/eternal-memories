import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    "dist/**",
    "dev-dist/**",
    "work/**",
    "*.tsbuildinfo",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      // Initial data loading and async QR generation intentionally start in effects.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: [
      "tests/**/*.{ts,tsx}",
      "build/**/*.ts",
      "scripts/**/*.mjs",
      "vite.config.ts",
      "vitest.config.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
]);
