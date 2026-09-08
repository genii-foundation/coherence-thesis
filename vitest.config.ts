import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // Repository proofs snapshot shared source and generated host state. Other
    // test files must not mutate that state while a proof holds its snapshot.
    fileParallelism: false,
    environment: "node",
    include: ["{src,scripts}/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "src/lib/**/*.ts",
        "scripts/manuscripts/**/*.ts",
        "scripts/updates/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
    },
  },
});
