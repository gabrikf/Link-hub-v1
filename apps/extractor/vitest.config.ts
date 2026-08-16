import { defineConfig } from "vitest/config";

// No setup file and no environment beyond node: every test here is either pure
// (hashing, technology inference) or drives a throwaway git repo in a temp dir.
// Nothing in this package may touch the network or this repository's own
// history, so there is deliberately nothing to bootstrap.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Creating and committing to real temp git repos is slower than a unit test
    // but far cheaper than mocking git badly.
    testTimeout: 30_000,
  },
});
