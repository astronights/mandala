import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "db/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/**", "db/**/*.ts"],
      exclude: ["**/*.test.{ts,tsx}", "db/testing.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
