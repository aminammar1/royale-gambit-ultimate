import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src-tauri"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      // Only src/engine, src/db and src/api/auth may talk to Tauri (CLAUDE.md).
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@tauri-apps/api", "@tauri-apps/api/*"], message: "Use src/engine, src/db or src/api/auth." }] },
      ],
    },
  },
  {
    files: ["src/engine/**", "src/db/**", "src/api/auth/**"],
    rules: { "no-restricted-imports": "off" },
  },
);
