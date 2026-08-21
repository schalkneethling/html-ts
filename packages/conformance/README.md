# @html-ts/conformance

Loaders for the [html5lib-tests](https://github.com/html5lib/html5lib-tests) conformance corpus, plus pointers to the snapshot patterns used elsewhere in the workspace.

The corpus itself lives at `vendor/html5lib-tests/` after running `vp run vendor:html5lib` at the workspace root. The pinned commit SHA lives in `vendor/html5lib-tests.sha`.

## Public surface

```ts
// Path helpers
import { repoRoot, vendorRoot } from "@html-ts/conformance/paths";

// Tokenizer-test JSON loader (vendor/html5lib-tests/tokenizer/*.test)
import {
  loadTokenizerSuite,
  type TokenizerTest,
  type Token,
  type InitialState,
} from "@html-ts/conformance/tokenizer";

// Tree-construction .dat loader (vendor/html5lib-tests/tree-construction/*.dat)
import {
  loadTreeConstructionSuite,
  type TreeConstructionTest,
} from "@html-ts/conformance/tree-construction";
```

## Goldens (snapshot patterns)

This package does **not** ship custom golden helpers. The two patterns below are part of the runner and registered globally:

### Text snapshots

For token-stream dumps, tree dumps, display lists — anything text-shaped:

```ts
expect(actualText).toMatchFileSnapshot("path/to/expected.txt");
```

Vitest's built-in. Update with `vitest -u`.

### PNG snapshots

For rendered images:

```ts
expect(pngBuffer).toMatchImageSnapshot();
```

Provided by [`jest-image-snapshot`](https://github.com/americanexpress/jest-image-snapshot), registered globally via `tests/setup-image-snapshot.ts` at the workspace root. Update with `vitest -u`.

Snapshots land in `__image_snapshots__/` next to the test file. On failure, a diff PNG is written to `__diff_output__/` next to the snapshot.
