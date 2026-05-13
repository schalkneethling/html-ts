# Phase 0 — Foundations & Scaffolding

> Per-phase plan for the `html-ts` project. The primary plan lives at `~/.claude/plans/i-have-a-wild-cryptic-sparrow.md`. Each phase is its own document — this is the first.

## Context

The repo at `/Users/schalkneethling/dev/opensource/html-ts` is currently a single-package Vite+ TypeScript starter:

- `src/index.ts` — a one-line `fn()` placeholder
- `tests/index.test.ts` — its trivial test
- Root `package.json` declaring `bun@1.3.13` as the package manager and `vite-plus@^0.1.14` as the toolchain

To execute the primary plan we need to convert this into a workspace where each subsystem (`html`, `dom`, `css`, `style`, `layout`, `paint`, `engine`, `infrastructure`, `conformance`) is its own package, and we need the supporting test/CI/render infrastructure in place before we write any algorithm code.

The end state of Phase 0 is a working pipeline-shaped harness: a CLI that reads a 1-line HTML fixture, walks through every package as a stub, and writes a PNG (a hardcoded blue rectangle on white) using a real Skia backend. All packages exist; most are empty stubs. CI runs `vp install`, vendors the `html5lib-tests` fixtures, runs `vp check` and `vp run -r test`, and goes green. We are nailing down **interfaces and wiring**, not algorithms.

## Foundational decisions for this phase

| Decision                     | Choice                                                                                                                                                                                                        | Reasoning                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace mechanism          | Bun workspaces (`"workspaces": ["packages/*"]` in root `package.json`)                                                                                                                                        | `packageManager` is already `bun@1.3.13`. Vite+ detects this and uses Bun under the hood. We never invoke `bun` directly — all commands go through `vp`.                                                    |
| Package naming               | `@html-ts/<subsystem>` (scoped, all `private: true`)                                                                                                                                                          | Avoids accidental publish; clear scope; mirrors a real product layout.                                                                                                                                      |
| TypeScript project structure | Per-package `tsconfig.json` extending root `tsconfig.base.json`; root `tsconfig.json` is `references`-only                                                                                                    | Per-package isolation, faster incremental builds, IDE jump-to-definition across packages works cleanly.                                                                                                     |
| Cross-package imports        | `workspace:*` protocol (`"@html-ts/dom": "workspace:*"`)                                                                                                                                                      | Idiomatic for Bun workspaces; Vite+'s `vp run -r` derives the topological order from these dependencies.                                                                                                    |
| Skia binding                 | `@napi-rs/canvas`                                                                                                                                                                                             | Lighter than `skia-canvas`, prebuilt for macOS/Linux/Windows, smaller surface area. We need rectangles, text, PNG encoding — all covered. We can swap to `skia-canvas` later if we hit a missing primitive. |
| html5lib-tests vendoring     | TypeScript fetch script (`scripts/vendor-html5lib-tests.ts`) downloads a tarball at a pinned commit SHA into `vendor/html5lib-tests/` (gitignored). The SHA lives in `vendor/html5lib-tests.sha` (committed). | No git submodules (per primary plan). Single source of truth for the version. CI re-runs the script every time.                                                                                             |
| Test runner                  | Vitest (already wired by Vite+; `vp test` invokes it)                                                                                                                                                         | No second runner.                                                                                                                                                                                           |
| Conformance comparison       | **Golden files** for both text and PNG output (see below)                                                                                                                                                     | Deterministic, reviewable in PRs as diffs (text) or visual artifacts (PNG).                                                                                                                                 |
| CI                           | GitHub Actions using `voidzero-dev/setup-vp@v1` plus an explicit `oven-sh/setup-bun@v2` step, runs `vp install --frozen-lockfile`, vendors tests, then `vp check` and `vp run -r test`. Node 24.              | Even though `setup-vp` claims to install the package manager, an explicit `setup-bun` step pins the Bun version to match `packageManager` and avoids surprises. Cheap insurance.                            |

### What is a "golden file"?

A golden file is a checked-in expected-output artifact. The test produces actual output, then compares it to the golden file. If they match, pass; if not, fail with a diff. When the change in output is intentional, you regenerate by running with an env flag (`UPDATE_GOLDENS=1`) and review the resulting diff in the PR.

In Phase 0 we use two flavors:

- **Text golden** — a `.txt` (or similar) file under `tests/__golden__/`. Compared with a string equality check; failures show a unified diff. We'll use this in Phase 1 for token streams and Phase 2 for tree dumps.
- **PNG golden** — a `.png` file under `tests/__golden__/`. Phase 0 uses **byte-equal** comparison because we have exactly one image (a solid rectangle on a solid background) and byte-equality is trivially deterministic. Pixel-diff tooling (`pixelmatch` etc.) is a Phase 8 concern, when we have anti-aliased text and gradients to worry about.

## Target directory layout at end of Phase 0

```
html-ts/
├── .github/workflows/ci.yml
├── packages/
│   ├── infrastructure/             // Brand<>, primitives, Result, ParseError
│   │   ├── src/{brand,primitives,result,index}.ts
│   │   ├── tests/brand.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── conformance/                // html5lib loader + golden helpers
│   │   ├── src/{html5lib-loader,golden,index}.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── html/                       // empty stub: src/index.ts exports tokenize() returning []
│   ├── dom/                        // empty stub
│   ├── css/                        // empty stub
│   ├── style/                      // empty stub
│   ├── layout/                     // empty stub
│   ├── paint/
│   │   ├── src/{backend,skia-backend,index}.ts
│   │   ├── tests/skia-backend.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── engine/
│       ├── src/{pipeline,cli,index}.ts
│       ├── tests/end-to-end.test.ts
│       ├── tests/__fixtures__/hello.html
│       ├── tests/__golden__/hello.png
│       ├── package.json
│       └── tsconfig.json
├── scripts/vendor-html5lib-tests.ts
├── vendor/
│   ├── .gitignore                  // ignores html5lib-tests/
│   └── html5lib-tests.sha          // pinned commit SHA, committed
├── tsconfig.base.json
├── tsconfig.json                   // references-only
├── vite.config.ts                  // unchanged (lint/fmt/pack config)
├── package.json                    // workspaces, fan-out scripts, private: true
├── bun.lock
└── README.md
```

The existing root `src/` and `tests/` directories are **deleted** — they hold the starter `fn()` and its test, neither of which we keep.

## Concrete deliverables, in order

### D0. Demolish the single-package starter

- Delete `src/index.ts`, `tests/index.test.ts`, plus the matching `exports`, `files`, and `publishConfig` from root `package.json`.
- Add `"private": true` and `"workspaces": ["packages/*"]` to root `package.json`.
- Reshape root scripts:
  - `"check": "vp check"`
  - `"test": "vp run -r test"`
  - `"build": "vp run -r build"`
  - Keep `prepare` and `prepublishOnly` only if Vite+ requires them; otherwise drop.
- Verification: `vp install` succeeds; `vp run -r --if-present test` runs zero tests cleanly.

### D1. Root `tsconfig.base.json` + `tsconfig.json`

- `tsconfig.base.json` lifts the existing strict settings and adds `"composite": true`, `"declarationMap": true`, `"incremental": true`, `"sourceMap": true`. Per-package `tsconfig.json` extends this and sets `rootDir: "src"`, `outDir: "dist"`, plus `references` to its workspace deps.
- Root `tsconfig.json` has `"files": []` and only `references` to every package.
- Verification: `vp check` succeeds against the empty packages.

### D2. `@html-ts/infrastructure` — branded primitives

- `brand.ts` — `type Brand<T, K extends string> = T & { readonly __brand: K }` plus `unsafeBrand<T, K>(value, kind)` (a phantom field; zero runtime cost).
- `primitives.ts` — `CodePoint` (number, U+0000..U+10FFFF), `ScalarValue` (CodePoint minus surrogates), `NodeId` (number), `CSSPixel` (number), `Utf8Byte` (number 0..255). Each has a checked constructor (`assertCodePoint(n)` etc.) gated by a `dev` flag exported from this package — flip off for hot loops once Phase 1 has a benchmark.
- `result.ts` — `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`. A `ParseError` shape (string-literal union of error codes) that we'll grow in Phase 1 to mirror the html5lib parse-error code set.
- Tests for `assertCodePoint`, `Result.ok`/`Result.err` helpers — enough to prove Vitest works.
- Verification: `vp run --filter @html-ts/infrastructure test` is green.

### D3. Vendored html5lib-tests

- `scripts/vendor-html5lib-tests.ts`:
  1. Reads `vendor/html5lib-tests.sha`.
  2. Fetches `https://github.com/html5lib/html5lib-tests/archive/${sha}.tar.gz`.
  3. Wipes any prior `vendor/html5lib-tests/`.
  4. Extracts the tarball into `vendor/html5lib-tests/`.
  - Idempotent. Uses Node `fetch` plus the `tar` package (correctness > hand-rolling).
- `vendor/.gitignore` ignores `html5lib-tests/`.
- `vendor/html5lib-tests.sha` is committed and pins a recent main-branch commit (we'll pick the latest at implementation time).
- Root script: `"vendor:html5lib": "tsx scripts/vendor-html5lib-tests.ts"` invoked via `vp run vendor:html5lib`.
- CI runs `vp run vendor:html5lib` before `vp run -r test`.
- Verification: `vp run vendor:html5lib` writes a known fixture path under `vendor/html5lib-tests/` and is safe to run twice in a row.

### D4. `@html-ts/conformance`

- `html5lib-loader.ts` — parser for the `.dat` format (delimited sections `#data`, `#errors`, `#document`, …) plus a JSON loader for the tokenizer tests. ~80 lines.
- `golden.ts`:
  - `expectTextGolden(path, actual)` — compares string-for-string; if `process.env.UPDATE_GOLDENS === "1"` it overwrites the file instead.
  - `expectPngGolden(path, actualBuffer)` — byte-equal compare for Phase 0; same `UPDATE_GOLDENS` overwrite path.
- One smoke test loads a single fixture from `vendor/html5lib-tests/` and asserts a known field — proves the loader works against real data.
- Verification: smoke test green.

### D5. `@html-ts/paint`

- `backend.ts` — minimal `PaintBackend` interface: `createSurface(width, height)`, `fillRect(x, y, w, h, color)`, `encodePng(): Uint8Array`. Color is `{ r, g, b, a }` (we'll formalize in Phase 7).
- `skia-backend.ts` — implementation using `@napi-rs/canvas`'s `createCanvas`, `getContext('2d')`, `toBuffer('image/png')`.
- Tests: 100×100 surface, fill blue, encode, assert PNG signature bytes (`89 50 4E 47 0D 0A 1A 0A`) and a sanity byte length.
- Verification: test green; the resulting PNG opens in Preview.

### D6. `@html-ts/engine`

- `pipeline.ts` — types out the full pipeline as a single function with stub steps: `parse(bytes) → DOM stub → box stub → paint stub → png`. Every stub returns `{ kind: 'todo' }`. The paint stub uses `@html-ts/paint` to draw a hardcoded blue rectangle on a white background, ignoring its DOM input. This proves wiring across every package boundary.
- `cli.ts` — `engine input.html output.png`. Reads the file, calls `pipeline`, writes the PNG.
- End-to-end test: pipe `tests/__fixtures__/hello.html` through `pipeline`, assert byte-equal against `tests/__golden__/hello.png` via `expectPngGolden`.
- Verification: `vp run --filter @html-ts/engine test` green; running the CLI by hand produces the PNG.

### D7. CI

- `.github/workflows/ci.yml`: single ubuntu-latest job:
  1. `actions/checkout@v4`
  2. `oven-sh/setup-bun@v2` with `bun-version: 1.3.13` (matches `packageManager`)
  3. `voidzero-dev/setup-vp@v1` with `node-version: '24'` and `cache: true`
  4. `vp install --frozen-lockfile`
  5. `vp run vendor:html5lib`
  6. `vp check`
  7. `vp run -r test`
- Triggers: `push` to `main`, `pull_request`.
- Verification: open a draft PR and watch the run go green.

### D8. README

- One-page rewrite covering: project intent (one sentence), pipeline diagram (bytes → tokens → DOM → styled DOM → box tree → display list → pixels), package map, "How to run the demo" section (the `vp` commands from the verification block below), link to the primary plan and to this Phase 0 doc.

## Critical files (to be created or rewritten)

- `package.json` (root, modified): workspaces, fan-out scripts, drop publish config
- `tsconfig.base.json` (new), `tsconfig.json` (rewritten as references-only)
- `packages/infrastructure/src/{brand,primitives,result,index}.ts`
- `packages/conformance/src/{html5lib-loader,golden,index}.ts`
- `packages/paint/src/{backend,skia-backend,index}.ts`
- `packages/engine/src/{pipeline,cli,index}.ts` plus `tests/{end-to-end.test.ts,__fixtures__/hello.html,__golden__/hello.png}`
- `scripts/vendor-html5lib-tests.ts`, `vendor/{.gitignore,html5lib-tests.sha}`
- `.github/workflows/ci.yml`
- `README.md` (rewrite)

## Files to delete

- `src/index.ts`, `tests/index.test.ts`, the now-empty root `src/` and `tests/` directories

## Intentionally deferred from Phase 0

- Real tokenization, DOM, layout, painting beyond a rectangle — Phases 1–8.
- Pixel-diff comparison (`pixelmatch`) — byte-equal is enough for the one Phase 0 image.
- Pre-commit hooks beyond what Vite+ ships in `.vite-hooks` (already present).
- Coverage reporting, benchmarks, doc generation.
- Publishing configuration — every package is `private: true`.

## Verification (Phase 0 end state)

From a fresh clone:

```bash
vp install
vp run vendor:html5lib                  # populates vendor/html5lib-tests/
vp check                                # lint + type-check across all packages
vp run -r test                          # all packages green, including engine end-to-end
vp run --filter @html-ts/engine cli -- \
    packages/engine/tests/__fixtures__/hello.html /tmp/hello.png
open /tmp/hello.png                     # blue rectangle on white background
```

(The exact `cli` invocation may end up wrapped behind a small `package.json` script in `@html-ts/engine` — finalized at implementation time. The point is: **no direct `bun` calls; everything through `vp`**.)

CI runs the equivalent and stays green.

A future regression that perturbs the rectangle's color or that bumps Skia's anti-aliasing makes `tests/__golden__/hello.png` diverge — that's the **explicit signal** Phase 0 is doing its job: a regression in any subsystem fails the golden compare.

## Next phase

When Phase 0 is green, the next planning session is **Phase 1 — HTML Tokenizer**: full WHATWG state machine, html5lib tokenizer-test conformance, character references, parse-error reporting. It will get its own plan file.
