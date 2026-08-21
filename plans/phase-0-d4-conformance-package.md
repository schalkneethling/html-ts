# Phase 0 · D4 — `@html-ts/conformance`

> Per-deliverable plan. Parent phase plan: `plans/phase-0-foundations-scaffolding.md`. Primary plan: `plans/primary.md`.

## Context

D3 vendored the `html5lib-tests` corpus into `vendor/html5lib-tests/`. D4 is the package that **reads** that corpus and gives the rest of the workspace a typed, ergonomic way to iterate over its tests.

Two distinct fixture formats live in the corpus:

| Suite                     | Format                                                                   | Consumers                               |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `tokenizer/*.test`        | JSON: `{"tests": [{description, input, output, ...}]}`                   | Phase 1 (tokenizer conformance)         |
| `tree-construction/*.dat` | Custom line-based format with `#data` / `#errors` / `#document` sections | Phase 2 (tree-construction conformance) |

We also need **a story for goldens** — text goldens for token-stream dumps and tree dumps (Phase 1+), and PNG goldens for the engine's rendered output (D6, Phase 8+). Rather than build that machinery ourselves (it's pure test infrastructure, teaches nothing about the engine), we lean on tools that already exist:

- **Text goldens** → Vitest's native `expect(actual).toMatchFileSnapshot(path)`. Update with `vitest -u`. Zero new deps.
- **PNG goldens** → [`jest-image-snapshot`](https://github.com/americanexpress/jest-image-snapshot) plugs into Vitest's `expect`. Uses `pixelmatch` under the hood, supports thresholds and writes diff PNGs on failure. One root dev-dep.

D4 therefore lands two pieces (the loaders), not three. Conformance is the **boring, well-typed entrypoint** for fixture files — Phase 1 and Phase 2 can focus on algorithms, not file parsing.

## Foundational decisions for this deliverable

| Decision                                     | Choice                                                                                                                                                          | Reasoning                                                                                                                                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two loaders, two files                       | `html5lib-dat.ts` and `html5lib-tokenizer.ts`                                                                                                                   | Different formats, different consumers, different test files. Keeping them split keeps each file small and obvious.                                                                                                                          |
| No barrel; subpath exports in `package.json` | Consumers do `import { vendorRoot } from "@html-ts/conformance/paths"` etc.                                                                                     | One hop to definition, public surface visible in `package.json`, adding a public file forces an explicit `exports` entry rather than hiding it behind a barrel. We'll retrofit `@html-ts/infrastructure` to match.                           |
| `.dat` parser style                          | Line-based state machine over the file split on `\n`                                                                                                            | The format is line-oriented; a regex-driven parser would be more fragile. ~80 lines.                                                                                                                                                         |
| Tokenizer JSON parsing                       | `JSON.parse` + a typed shape                                                                                                                                    | The file is JSON; no need to reinvent. We layer types on top, not validation — bad data fails at compile time when consumers index unknown fields.                                                                                           |
| `doubleEscaped` handling                     | Implemented inline in the tokenizer loader                                                                                                                      | Per the html5lib-tests tokenizer README: when `doubleEscaped: true`, `input` and `output` strings contain `\uHHHH` sequences that need a second round of unescaping. Cheap to handle, expensive to forget.                                   |
| Token shape typing                           | Loose enums for token kinds, exhaustive shapes added in Phase 1                                                                                                 | The tokenizer test JSON uses positional tuples (`["StartTag", name, attrs]`); we'll type them as discriminated unions in Phase 1 when we know what the tokenizer is _producing_ on the other side. For D4, "we can read the file" is enough. |
| Path resolution                              | A `paths.ts` module that resolves `vendor/html5lib-tests/` relative to the conformance package's `import.meta.url`, walking up two levels to the workspace root | Self-contained; no env var or config needed. If the package layout changes, one file changes.                                                                                                                                                |
| Text goldens                                 | Vitest's native `expect(actual).toMatchFileSnapshot(absPath)`; update with `vitest -u`                                                                          | Already in the runner. Phase 1 (token stream dumps) and Phase 2 (tree dumps) use it directly — nothing for this package to provide.                                                                                                          |
| PNG goldens                                  | `jest-image-snapshot` as a root dev-dep, registered globally via a Vitest setup file. Phase 0 uses default threshold (~0.01); Phase 8 may tune                  | Battle-tested pixel-diff + diff-PNG output for failures. One dep replaces a sidecar-file hand-roll that would teach us nothing engine-relevant.                                                                                              |
| Where goldens live                           | `packages/<consumer>/tests/__image_snapshots__/*` and `__snapshots__/*` — _not_ in this package                                                                 | Conventional locations for the two tools. Each consumer owns its own snapshots.                                                                                                                                                              |
| Package deps                                 | `workspace:*` on `@html-ts/infrastructure` (defensive, may not be used yet); no runtime deps                                                                    | Cross-package wiring goes in early so subsequent packages copy the pattern.                                                                                                                                                                  |
| Smoke tests                                  | Two: load a known tokenizer test, load a known `.dat` test                                                                                                      | Catches typos, broken paths, and the `doubleEscaped` codepath. Doesn't try to be exhaustive — that's what Phase 1/2 are for. Snapshot-tooling smoke is left to D6 where it's actually exercised.                                             |

## Target layout

```
packages/conformance/
├── src/
│   ├── paths.ts                    // workspaceRoot() + vendorRoot()
│   ├── html5lib-dat.ts             // .dat parser, returns TreeConstructionTest[]
│   └── html5lib-tokenizer.ts       // tokenizer JSON loader + double-escape
├── tests/
│   ├── html5lib-dat.test.ts        // load adoption01.dat, assert first test fields
│   └── html5lib-tokenizer.test.ts  // load entities.test, assert first test fields
├── README.md                       // short note on the two golden patterns
├── package.json                    // subpath exports, no barrel
└── tsconfig.json

# Root-level changes
vitest.config.ts                     // setup file registering jest-image-snapshot
tests/setup-image-snapshot.ts        // adds toMatchImageSnapshot to expect
```

## Concrete deliverables, in order

### D4.1 — `paths.ts`

A tiny helper module:

```ts
// import.meta.url is packages/conformance/src/paths.ts;
// walk up two levels to get the workspace root.
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const repoRoot = (...p: string[]) => join(workspaceRoot, ...p);
export const vendorRoot = (...p: string[]) => join(workspaceRoot, "vendor", "html5lib-tests", ...p);
```

Why: every test fixture path then becomes `vendorRoot("tokenizer", "entities.test")` — readable, refactor-safe, and centralized.

### D4.2 — `html5lib-tokenizer.ts`

```ts
export interface TokenizerTest {
  readonly description: string;
  readonly input: string;
  readonly output: readonly Token[]; // typed loosely for now
  readonly initialStates?: readonly InitialState[];
  readonly lastStartTag?: string;
  readonly errors?: readonly TokenizerParseError[];
  readonly doubleEscaped?: boolean;
}

export type InitialState =
  | "Data state"
  | "PLAINTEXT state"
  | "RCDATA state"
  | "RAWTEXT state"
  | "Script data state"
  | "CDATA section state";

export interface TokenizerParseError {
  readonly code: string;
  readonly line: number;
  readonly col: number;
}

// Token shape kept loose; Phase 1 will narrow this into a discriminated union.
export type Token = readonly [kind: string, ...rest: unknown[]];

export function loadTokenizerSuite(absPath: string): readonly TokenizerTest[];
```

The loader:

1. Reads the file (`fs.readFileSync`), `JSON.parse`s.
2. Validates the top-level shape: `{ tests: TokenizerTest[] }`. Throw on mismatch.
3. If a test has `doubleEscaped: true`, runs a `\uHHHH` → code-point unescape over **`input`** and over every string inside **`output`** and inside `errors[].code` (per the README). The unescape is a simple regex replace.
4. Returns the array, frozen for safety.

The `doubleEscaped` codepath is the only non-trivial logic in this loader; a unit test will cover it explicitly with a fabricated input.

### D4.3 — `html5lib-dat.ts`

```ts
export interface TreeConstructionTest {
  readonly data: string;
  readonly errors: readonly string[]; // raw lines, unparsed
  readonly newErrors?: readonly string[];
  readonly documentFragment?: string; // e.g. "div" or "svg path"
  readonly scriptMode?: "on" | "off"; // undefined → "both" (run in both)
  readonly document: string; // raw tree dump including "| " prefixes
}

export function loadTreeConstructionSuite(absPath: string): readonly TreeConstructionTest[];
```

The parser:

1. Read the file as a single string.
2. Split into test blocks on `\n\n#data\n` (with a small fix-up for the first block).
3. For each block, walk a tiny state machine over its lines, switching state on the section headers:
   - `#data` → `#errors` → optional `#new-errors` → optional `#document-fragment` → optional `#script-on`/`#script-off` → `#document`.
4. Per the README: when reading `#data`, strip the **single** trailing newline (the one between the last data line and `#errors`).
5. Return the frozen array.

The `#document` section is preserved verbatim — Phase 2 will compare against this exact string after generating its own tree dump in the same format.

### D4.4 — Snapshot tooling (root-level, not in conformance)

Two pieces, both at the workspace root:

- **`vitest.config.ts`** — minimal config that registers a setup file via `test.setupFiles`. Vite+ ships its own vitest preset; this file extends it.
- **`tests/setup-image-snapshot.ts`** — calls `expect.extend({ toMatchImageSnapshot })` from `jest-image-snapshot`. Now every test in every package can do `expect(pngBuffer).toMatchImageSnapshot()`.
- **Root `package.json`** — add `jest-image-snapshot` and `@types/jest-image-snapshot` to devDependencies.

A short **`packages/conformance/README.md`** documents the two patterns so future-you doesn't have to dig:

```md
## Goldens

### Text

expect(actual).toMatchFileSnapshot(absPath) // update: vitest -u

### PNG

expect(buffer).toMatchImageSnapshot() // update: vitest -u
```

### D4.5 — Subpath exports (no barrel)

The package's public surface lives in `package.json`:

```json
{
  "name": "@html-ts/conformance",
  "exports": {
    "./paths": "./src/paths.ts",
    "./tokenizer": "./src/html5lib-tokenizer.ts",
    "./tree-construction": "./src/html5lib-dat.ts",
    "./package.json": "./package.json"
  }
}
```

Consumers import directly from the file:

```ts
import { vendorRoot } from "@html-ts/conformance/paths";
import { loadTokenizerSuite, type TokenizerTest } from "@html-ts/conformance/tokenizer";
import { loadTreeConstructionSuite } from "@html-ts/conformance/tree-construction";
```

Adding a new public file means adding one entry to `exports`. Internal helpers stay un-exported and are not reachable from outside the package.

### D4.5a — Retrofit `@html-ts/infrastructure`

Drop `packages/infrastructure/src/index.ts` and replace its `exports` block with subpaths:

```json
"exports": {
  "./brand": "./src/brand.ts",
  "./primitives": "./src/primitives.ts",
  "./result": "./src/result.ts",
  "./dev": "./src/dev.ts",
  "./package.json": "./package.json"
}
```

The infrastructure package's own tests update from `import { … } from "../src/index.ts"` to direct file imports.

### D4.6 — Tests

**`tests/html5lib-tokenizer.test.ts`**

- Load `vendorRoot("tokenizer", "entities.test")`; assert the first test's `description` matches the known string and `output[0][0] === "StartTag"`.
- Synthetic test for `doubleEscaped`: pass a fake suite with `doubleEscaped: true` and `input: "\\u0041"`, assert the loader returns `input: "A"`.

**`tests/html5lib-dat.test.ts`**

- Load `vendorRoot("tree-construction", "adoption01.dat")`; assert the first test has `data: "<a><p></a></p>"`, `errors.length === 2`, and `document` contains `"<a>"`.

### D4.7 — Package wiring

**`packages/conformance/package.json`** — same shape as infrastructure: `private: true`, scoped name `@html-ts/conformance`, source-import `exports`, `dependencies: { "@html-ts/infrastructure": "workspace:*" }`.

**`packages/conformance/tsconfig.json`** — extends the workspace base, includes `src/**/*.ts` and `tests/**/*.ts`.

**Root `package.json`** — add `jest-image-snapshot` and `@types/jest-image-snapshot` to devDependencies via `vp add -D`.

## Verification

```bash
vp install                                          # picks up the new package + image-snapshot dep
vp run --filter @html-ts/conformance test           # both loader smoke tests green
vp check                                            # type + format clean
```

The snapshot tooling itself is exercised in D6 where the engine pipeline produces its first PNG.

## Critical files (to be created)

- `packages/conformance/package.json`
- `packages/conformance/tsconfig.json`
- `packages/conformance/src/paths.ts`
- `packages/conformance/src/html5lib-tokenizer.ts`
- `packages/conformance/src/html5lib-dat.ts`
- `packages/conformance/tests/html5lib-tokenizer.test.ts`
- `packages/conformance/tests/html5lib-dat.test.ts`
- `packages/conformance/README.md`
- `vitest.config.ts` (workspace root)
- `tests/setup-image-snapshot.ts` (workspace root)

## Critical files (to be modified)

- Root `package.json` — `jest-image-snapshot` + `@types/jest-image-snapshot` via `vp add -D`
- `packages/infrastructure/package.json` — replace `exports: { ".": "./src/index.ts" }` with subpath exports
- `packages/infrastructure/tests/primitives.test.ts` — switch from `../src/index.ts` imports to direct file imports
- Delete `packages/infrastructure/src/index.ts`

## Intentionally deferred

- A discriminated union for `Token` — Phase 1's tokenizer types will drive this, not the loader.
- Tuning `jest-image-snapshot` thresholds — Phase 8 problem once we have real anti-aliased text in the output.
- Schema validation of the tokenizer JSON (e.g. via Zod) — `JSON.parse` + TS types catches well-formed-but-wrong-shape failures at use sites with clear errors; full schema validation is overhead with no payoff in dev tooling.
- A linter for `.dat` files (e.g. detecting trailing whitespace, malformed section headers) — the corpus itself is well-formed; we don't need to police it.

## Next deliverable

D5 — `@html-ts/paint`: the `PaintBackend` interface plus a `@napi-rs/canvas`-backed implementation that can draw a rectangle and emit a PNG.
