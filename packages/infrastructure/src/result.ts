// ============================================================================
// Result: an explicit success/failure type
// ============================================================================
//
// Most of the engine returns `Result<T, E>` rather than throwing. The reasons:
//
//   1. The HTML tokenizer emits parse errors *non-fatally* — it keeps going
//      after an error, accumulating the list. Exceptions don't model that
//      well; a return value does.
//   2. `Result` makes the failure mode visible in the type. A function that
//      returns `Result<Token, ParseError>` cannot be silently ignored —
//      consumers must check `.ok` before reading `.value`, and TypeScript's
//      narrowing enforces it.
//   3. It's cheaper than throwing in tight loops (no stack-unwinding overhead).
//
// We still throw for *programmer errors* (bad branded-primitive ranges,
// impossible-state assertions). Those should never happen at runtime; if
// they do, the program is already broken and an exception with a stack is
// the right signal.
// ============================================================================

// Discriminated union — pattern-match on `.ok` to narrow to the right shape.
//   if (r.ok) console.log(r.value); // r is { ok: true; value: T }
//   else      console.error(r.error); // r is { ok: false; error: E }
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// `ok(v)` is shorter than writing `{ ok: true, value: v }` everywhere and
// gives better inference: the return type is `Result<T, never>`, meaning
// "this can't fail," which composes correctly when chained with results
// that *can* fail.
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

// Mirror of `ok` for the failure case. Returning `Result<never, E>` says
// "no value will ever be produced through this path."
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ----------------------------------------------------------------------------
// Parse errors
// ----------------------------------------------------------------------------
//
// The HTML spec defines a fixed, named set of parse-error codes that the
// tokenizer and tree-construction stages can emit. Conformance suites
// (html5lib-tests in particular) check for *exact* code matches on
// specific inputs, so we model the codes as a string-literal union — that
// way the compiler catches typos and `switch` statements force exhaustive
// handling.
//
// We're seeding the union with two codes here; Phase 1 will fill it out to
// cover every code referenced by the HTML standard. Adding a new code is
// a one-line edit; nothing else needs to change.
//
// Spec: https://html.spec.whatwg.org/multipage/parsing.html#parse-errors
// ----------------------------------------------------------------------------

export type ParseErrorCode =
  | "unexpected-null-character"
  | "unexpected-question-mark-instead-of-tag-name";

export interface ParseError {
  readonly code: ParseErrorCode;
  // 0-based offset into the input stream where the error was emitted.
  // Used by tests to assert errors fired at the right position, and by
  // (eventual) tooling to pinpoint problems in source files.
  readonly offset: number;
}
