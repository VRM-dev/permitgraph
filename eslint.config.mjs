// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The evaluator is a pure function of a snapshot: keep it free of I/O,
    // timers and randomness so every decision is reproducible.
    files: ["packages/evaluator/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "fs/*", "path", "http", "https", "net", "child_process", "os"],
              message: "The evaluator must stay free of I/O; pass data in through the snapshot.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "The evaluator must not perform network calls." },
        { name: "process", message: "Read configuration outside the evaluator and pass it in." },
        { name: "setTimeout", message: "Evaluation must be synchronous and deterministic." },
        { name: "setInterval", message: "Evaluation must be synchronous and deterministic." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Evaluation must be deterministic." },
        { object: "Date", property: "now", message: "Pass timestamps in through the snapshot." },
      ],
    },
  },
);
