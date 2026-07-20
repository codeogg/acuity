import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    // Node by default (contract + client tests); DOM tests opt in per file
    // via `// @vitest-environment jsdom`.
    environment: "node",
  },
});
