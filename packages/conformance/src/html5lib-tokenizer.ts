// ============================================================================
// html5lib tokenizer-test loader
// ============================================================================
//
// The html5lib-tests project distributes tokenizer conformance tests as JSON.
// File format (see vendor/html5lib-tests/tokenizer/README.md):
//
//   {"tests": [
//     {"description": "...",
//      "input": "...",
//      "output": [["StartTag", "h", {"a": "&noti;"}], ...],
//      "initialStates": ["Data state"],          // optional
//      "lastStartTag": "...",                    // optional
//      "errors": [{"code": "...", "line": 1, "col": 1}], // optional
//      "doubleEscaped": true}                    // optional
//   ]}
//
// We expose a single function — `loadTokenizerSuite(path)` — that returns
// an array of `TokenizerTest`. The token tuples stay loosely typed in this
// phase; Phase 1 will narrow them into a discriminated union once we know
// what our tokenizer is producing.
//
// The `doubleEscaped` opt-in is the only non-trivial logic in this loader:
// when present and `true`, every string in `input` and `output` (and the
// error codes) carries a *second* round of \uHHHH escapes that we must
// expand. The spec quote from the README: "the only unescaping required by
// this option is to convert each sequence of the form \\uHHHH (where H is
// a hex digit) into the corresponding Unicode code point."
// ============================================================================

import { readFileSync } from "node:fs";

/**
 * A tokenizer's input is run starting from one of these named states.
 * Defaults to `"Data state"` when `initialStates` is absent.
 */
export type InitialState =
  | "Data state"
  | "PLAINTEXT state"
  | "RCDATA state"
  | "RAWTEXT state"
  | "Script data state"
  | "CDATA section state";

/**
 * A parse error emitted by the tokenizer. The shape is fixed by html5lib-tests
 * (1-based line/col indices); we keep it as-is rather than converting to our
 * internal 0-based offsets — the consumer is responsible for that mapping.
 */
export interface TokenizerParseError {
  readonly code: string;
  readonly line: number;
  readonly col: number;
}

/**
 * A token in the html5lib-tests output format. Tokens are positional tuples
 * — the first element identifies the kind, subsequent elements depend on
 * the kind:
 *
 *   ["DOCTYPE", name, public_id, system_id, correctness]
 *   ["StartTag", name, {attributes}]
 *   ["StartTag", name, {attributes}, true]      // self-closing flag
 *   ["EndTag", name]
 *   ["Comment", data]
 *   ["Character", data]
 *
 * Loose typing for D4. Phase 1 narrows this into a discriminated union.
 */
export type Token = readonly [kind: string, ...rest: unknown[]];

export interface TokenizerTest {
  readonly description: string;
  readonly input: string;
  readonly output: readonly Token[];
  readonly initialStates?: readonly InitialState[];
  readonly lastStartTag?: string;
  readonly errors?: readonly TokenizerParseError[];
  readonly doubleEscaped?: boolean;
}

interface TokenizerSuiteJson {
  readonly tests: readonly TokenizerTest[];
  // Some suites use "xmlViolationTests" — we ignore them for now.
  readonly xmlViolationTests?: readonly TokenizerTest[];
}

/**
 * Load and parse a single tokenizer-test JSON file.
 *
 * If any test in the file has `doubleEscaped: true`, the loader expands the
 * extra layer of `\uHHHH` escapes in its `input`, `output` strings, and
 * `errors[].code` before returning.
 */
export function loadTokenizerSuite(absPath: string): readonly TokenizerTest[] {
  const raw = readFileSync(absPath, "utf8");
  const parsed = JSON.parse(raw) as TokenizerSuiteJson;

  if (!Array.isArray(parsed.tests)) {
    throw new Error(`tokenizer suite ${absPath}: expected a top-level "tests" array`);
  }

  return Object.freeze(parsed.tests.map(unescapeIfNeeded));
}

// Per the html5lib-tests README: doubleEscaped applies a second round of
// JSON-style \uHHHH unescaping to every string in the test. JSON itself
// already decoded the *first* layer when we called JSON.parse; this handles
// the second.
function unescapeIfNeeded(test: TokenizerTest): TokenizerTest {
  if (!test.doubleEscaped) return test;

  return {
    ...test,
    input: unescapeDoubleEscaped(test.input),
    output: test.output.map(unescapeToken),
    ...(test.errors === undefined
      ? {}
      : {
          errors: test.errors.map((e) => ({ ...e, code: unescapeDoubleEscaped(e.code) })),
        }),
  };
}

// Each token tuple may contain strings (token name, character data, attribute
// values) — recurse into the tuple, unescaping anything string-shaped. Numbers,
// booleans, null, and the attributes object are left alone except for
// re-unescaping attribute keys and values (also strings).
function unescapeToken(token: Token): Token {
  return token.map(unescapeValue) as unknown as Token;
}

function unescapeValue(value: unknown): unknown {
  if (typeof value === "string") return unescapeDoubleEscaped(value);
  if (Array.isArray(value)) return value.map(unescapeValue);
  if (value !== null && typeof value === "object") {
    // Attribute maps: { "name": "value" } — unescape keys and values.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[unescapeDoubleEscaped(k)] = unescapeValue(v);
    }
    return out;
  }
  return value;
}

// Replace every `\uHHHH` (four hex digits) with the matching code point.
// Surrogate pairs are emitted as two separate \u escapes; String.fromCodePoint
// on each half preserves the original surrogate, which then combine when
// concatenated — same behavior html5lib-tests consumers in Python and JS rely on.
function unescapeDoubleEscaped(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
}
