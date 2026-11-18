import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Test against the evaluator's sources, so it doesn't have to be built first.
    alias: {
      "@permitgraph/evaluator": fileURLToPath(new URL("../../packages/evaluator/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
