import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// Resolve the setup file relative to this config so it works for tests
// running under any package's cwd, not just the workspace root.
const setupImageSnapshot = fileURLToPath(
  new URL("./tests/setup-image-snapshot.ts", import.meta.url),
);

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  // Vitest config — see node_modules/vite-plus/docs/guide/test.md.
  // The setup file registers `toMatchImageSnapshot` globally so every package
  // can compare PNG buffers without re-importing the matcher.
  test: {
    setupFiles: [setupImageSnapshot],
  },
});
