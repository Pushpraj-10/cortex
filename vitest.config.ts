import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests live next to each package; tests/ holds cross-package checks (architecture.test.ts).
    // The live-model scripts in tests/e2e-*-test.ts are run by `npm run test:e2e`, not here.
    include: ["apps/*/test/**/*.test.{ts,tsx}", "packages/*/test/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
