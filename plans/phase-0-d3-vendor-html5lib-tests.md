# Phase 0 · D3 — Vendor html5lib-tests

> Per-deliverable plan. Parent phase plan: `plans/phase-0-foundations-scaffolding.md` (TBD: copy from `~/.claude/plans/`). Primary plan: `plans/primary.md` (TBD).

## Context

Every later phase needs the `html5lib-tests` conformance corpus to drive itself:

- Phase 1 (Tokenizer) consumes the `tokenizer/*.test` JSON suites.
- Phase 2 (Tree Construction) consumes the `tree-construction/*.dat` suites.
- The `@html-ts/conformance` package (D4, next deliverable) loads these files and exposes them to the rest of the workspace.

The primary plan said: **no git submodules.** The fixtures live in a gitignored `vendor/` directory, populated by a TypeScript fetch script. The pinned commit SHA is the only thing checked into the repo — it's the source of truth for "which version of the corpus we test against." Bumping it is a one-line PR; the diff is reviewable.

D3 lands that machinery. Nothing depends on it being clever — it just has to be correct, idempotent, and clearly logged.

## Foundational decisions for this deliverable

| Decision             | Choice                                                                                                                                                                                                                                                              | Reasoning                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tarball source       | `https://codeload.github.com/html5lib/html5lib-tests/tar.gz/${sha}` (GitHub's archive endpoint)                                                                                                                                                                     | Works for any commit SHA, no auth, no rate-limit issues in CI for a single small fetch. Same URL `github.com/.../archive/${sha}.tar.gz` resolves to — using the canonical `codeload` form. |
| SHA pinning location | `vendor/html5lib-tests.sha` — a one-line file, trailing newline trimmed                                                                                                                                                                                             | Trivial to bump, trivial to read, plays well with `git blame`.                                                                                                                             |
| Tar reader           | `tar` npm package (by Isaac Schlueter; what npm/pnpm/yarn use internally)                                                                                                                                                                                           | Hand-rolling a streaming tarball reader is a sidequest; `tar` handles gzip + ustar correctly and is small.                                                                                 |
| Where to extract     | `vendor/html5lib-tests/` (gitignored), top-level archive dir stripped                                                                                                                                                                                               | Consumers see a stable path that doesn't change when the SHA bumps.                                                                                                                        |
| Atomicity            | Extract into a `using mkdtempDisposable(...)` temp dir, then `rm -rf vendor/html5lib-tests/` + `rename(tmp, final)`. On any throw, the `using` declaration auto-removes the temp dir; on success, the rename moves it away so the auto-rm finds nothing and no-ops. | If the script is interrupted, the final dir is either the previous good copy or absent — never half-populated. Node ≥ 24.4 required (we're on 24 in CI).                                   |
| Re-run behaviour     | Idempotent: a second run completes successfully and leaves the same final state                                                                                                                                                                                     | The script is safe to run anywhere, any time.                                                                                                                                              |
| Skip-if-unchanged    | A `.sha` sentinel inside `vendor/html5lib-tests/` records the SHA the directory was extracted from. If it matches `vendor/html5lib-tests.sha`, the script logs "up to date" and exits. Override with `--force`.                                                     | Saves CI a second of network on cache hits; saves the developer the same when iterating.                                                                                                   |
| Runner               | `tsx scripts/vendor-html5lib-tests.ts` via `vp run vendor:html5lib` (already wired in root `package.json`)                                                                                                                                                          | TS source is already in `tsconfig.json`'s include glob. No build step.                                                                                                                     |
| TS deps added        | `tsx`, `tar`, `@types/tar` (devDependencies, root)                                                                                                                                                                                                                  | All small. `tsx` is the standard TS runner; `tar` is the de facto tar reader.                                                                                                              |
| Output verbosity     | Three log lines: "fetching", "extracted", "done" — plus error lines on failure                                                                                                                                                                                      | CI logs stay readable; developers don't drown.                                                                                                                                             |
| CI invocation        | `vp run vendor:html5lib` before `vp check` and `vp run -r test`, no caching at first                                                                                                                                                                                | Caching is a future optimization once we know how often the SHA bumps.                                                                                                                     |

## Concrete deliverables

### Files

**`vendor/.gitignore`** — single line `html5lib-tests/`. Keeps `vendor/html5lib-tests.sha` and `vendor/.gitignore` itself in the tree; ignores everything the script writes.

**`vendor/html5lib-tests.sha`** — pinned commit SHA, trailing newline, no other content. Picked at implementation time from `git ls-remote https://github.com/html5lib/html5lib-tests.git refs/heads/main`. The SHA is the _only_ thing the repo tracks about the corpus version.

**`scripts/vendor-html5lib-tests.ts`** — the script. Approximate shape:

```ts
// scripts/vendor-html5lib-tests.ts
//
// Vendors the html5lib-tests conformance corpus at the SHA pinned in
// vendor/html5lib-tests.sha into vendor/html5lib-tests/.
//
// Idempotent. Pass --force to re-extract even when up to date.

import {
  readFileSync,
  existsSync,
  rmSync,
  renameSync,
  mkdtempDisposableSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { x as extractTar } from "tar";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const shaFile = join(repoRoot, "vendor", "html5lib-tests.sha");
const destDir = join(repoRoot, "vendor", "html5lib-tests");
const sentinel = join(destDir, ".sha");

const force = process.argv.includes("--force");

const sha = readFileSync(shaFile, "utf8").trim();
if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
  throw new Error(`vendor/html5lib-tests.sha is not a valid SHA: ${JSON.stringify(sha)}`);
}

if (!force && existsSync(sentinel) && readFileSync(sentinel, "utf8").trim() === sha) {
  console.log(`html5lib-tests @ ${sha} is up to date`);
  process.exit(0);
}

const url = `https://codeload.github.com/html5lib/html5lib-tests/tar.gz/${sha}`;
console.log(`fetching ${url}`);

const res = await fetch(url);
if (!res.ok || !res.body) {
  throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
}

// Stream the tarball into a fresh temp dir, stripping the top-level
// "html5lib-tests-${sha}/" path component so files land directly under
// vendor/html5lib-tests/.
//
// `using` ties the temp dir's lifetime to this scope: on any throw below,
// `mkdtempDisposableSync`'s `[Symbol.dispose]` recursively removes it.
// On success we rename it away first, so the dispose call finds nothing
// and silently no-ops.
using tmp = mkdtempDisposableSync(join(tmpdir(), "html5lib-tests-"));

await new Promise<void>((resolve, reject) => {
  const out = extractTar({ cwd: tmp.path, strip: 1 });
  out.on("error", reject);
  out.on("end", resolve);
  Readable.fromWeb(res.body as unknown as WebReadableStream).pipe(out);
});

writeFileSync(join(tmp.path, ".sha"), `${sha}\n`);

if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
renameSync(tmp.path, destDir);

console.log(`extracted to ${destDir}`);
```

Shape notes (refined at implementation):

- **Streaming**, not buffering — the corpus is ~30MB unpacked; we don't need it in memory.
- **`strip: 1`** drops the leading `html5lib-tests-${sha}/` segment from every entry.
- **Sentinel inside the dir** (`.sha`) makes the "up to date" check trivial and survives partial-checkout situations.
- **`using` + atomic rename**: `mkdtempDisposableSync` registers an auto-cleanup tied to the script's scope. If extraction or any step after it throws, the temp dir is removed. On success, the rename moves the dir away before scope-exit, so the cleanup finds nothing and silently exits. A Ctrl-C mid-extract leaves the previous good state intact.
- **Top-level await** is fine — the script is ESM via the workspace's `"type": "module"`.
- **Node version**: requires Node ≥ 24.4 (for `mkdtempDisposableSync`). Already on Node 24 in CI; document the floor in the script header.

**Root `package.json` devDependencies — add three:** `tsx`, `tar`, `@types/tar`. Added via `vp add -D tsx tar @types/tar`.

**No `.gitignore` change for `vendor/` itself** — only the subdirectory is ignored.

### Verification

```bash
# Cold run: directory absent → fetch + extract.
vp run vendor:html5lib
ls vendor/html5lib-tests/tokenizer | head     # confirms tokenizer suites landed

# Warm run: same SHA → no-op.
vp run vendor:html5lib                        # prints "up to date"

# Forced re-extract.
vp run vendor:html5lib -- --force             # fetches again

# Bumping the SHA: edit vendor/html5lib-tests.sha, re-run, observe changes.

# Cleanup is just removing the directory:
rm -rf vendor/html5lib-tests && vp run vendor:html5lib
```

Type-check the script: `vp check` (the script is included via root `tsconfig.json`'s `scripts/**/*.ts` glob from D1).

### Files touched

- `vendor/.gitignore` (new)
- `vendor/html5lib-tests.sha` (new)
- `scripts/vendor-html5lib-tests.ts` (new)
- `package.json` (devDependencies: `tsx`, `tar`, `@types/tar`)
- `bun.lock` (auto, via `vp add`)

### Files _not_ touched

- `tsconfig.json`, `tsconfig.base.json` — the script is already covered by the root tsconfig's include.
- Any package — D3 is workspace-root tooling.

## Open questions

- **Picking the SHA.** I'll fetch `refs/heads/main` at implementation time and pin whatever's current. If you'd rather pin to a tagged release (none of the recent html5lib-tests history is tagged, AFAIK) or to a specific commit, say the word.
- **CI cache.** Skipped here; revisit if `vendor:html5lib` becomes noticeably slow in CI logs.

## Intentionally deferred

- A standalone unit test for the script — it makes network calls and is dev-only tooling. The D4 conformance package will have a smoke test that loads one fixture from `vendor/html5lib-tests/`, which is a more useful end-to-end signal.
- Re-trying on transient network errors — Node's `fetch` will surface the failure and a CI re-run is cheap.
- Integrity verification (SHA-256 of the tarball) — GitHub's commit SHA already pins the content; a second checksum is belt-and-braces.

## Next deliverable

D4 — `@html-ts/conformance`: the `.dat` parser, JSON loader, and golden-file helpers that build on the vendored fixtures.
