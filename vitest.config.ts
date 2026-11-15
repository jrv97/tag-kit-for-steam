import { configDefaults, defineConfig } from "vitest/config";

/** Wall-clock budgets; they run apart from the unit tests so no other file shares the CPU. */
const PERF = "src/**/*.perf.test.ts";

export default defineConfig({
  test: {
    environment: "happy-dom",
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, PERF],
        },
      },
      {
        extends: true,
        test: {
          name: "perf",
          include: [PERF],
          fileParallelism: false,
          // Each test times a dozen scans; the budget fails it before this does.
          testTimeout: 30_000,
          // After every unit test file has finished.
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
