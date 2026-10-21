import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "forks",
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
});
