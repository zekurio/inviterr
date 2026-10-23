import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // DB-backed suites fsync every write on a file database; with one worker
    // per core the slowest tests exceed the 5 s default under load.
    testTimeout: 20_000,
  },
})
