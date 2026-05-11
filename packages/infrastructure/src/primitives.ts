// ============================================================================
// Spec-shaped primitive types
// ============================================================================
//
// Every distinct "kind of number" the engine deals with gets its own branded
// type and a checked constructor (`assertX`). At runtime these are still just
// numbers; at compile time the brand prevents accidental mixing across
// subsystems (e.g. handing a `CSSPixel` to something that wants a `CodePoint`).
//
// See `brand.ts` for the mechanics of how the brand is attached.
// ============================================================================

import { type Brand, unsafeBrand } from "./brand.ts";
import { dev } from "./dev.ts";

// ----------------------------------------------------------------------------
// Unicode primitives
// ----------------------------------------------------------------------------

// A Unicode *code point*: any integer in the range [0, 0x10FFFF (1,114,111)].
// This is the universe of values the WHATWG HTML tokenizer reads from its
// input stream (after preprocessing into the "Unicode preprocessing model").
// Includes surrogates, which are individually invalid as scalar values but
// appear as intermediate code points during decoding.
//
// Spec: https://infra.spec.whatwg.org/#code-point
export type CodePoint = Brand<number, "CodePoint">;

// A Unicode *scalar value*: a code point that is *not* in the surrogate range
// [0xD800 (55,296), 0xDFFF (57,343)]. Surrogates only have meaning as halves
// of a UTF-16 pair; on their own they aren't valid characters. Most of the engine
// downstream of the input stream operates on scalars rather than raw code
// points, because the tokenizer has already replaced lone surrogates with
// U+FFFD (the "replacement character" �) per the HTML spec.
//
// `& CodePoint` is intentional: every scalar value is also a code point, so
// a function expecting a `CodePoint` will accept a `ScalarValue` (subtyping).
// The reverse is *not* true — you can't pass a `CodePoint` where a
// `ScalarValue` is expected without going through `assertScalarValue`.
//
// Spec: https://infra.spec.whatwg.org/#scalar-value
export type ScalarValue = Brand<number, "ScalarValue"> & CodePoint;

// ----------------------------------------------------------------------------
// DOM primitives
// ----------------------------------------------------------------------------

// A stable identifier for a node inside one document's node arena. NodeIds
// are *not* portable across documents — they're indexes into the arena that
// owns the node. Treating them as branded numbers (rather than passing
// `Node` references everywhere) keeps the DOM tree compact and avoids
// accidental cross-document mixing at the type level.
export type NodeId = Brand<number, "NodeId">;

// ----------------------------------------------------------------------------
// CSS primitives
// ----------------------------------------------------------------------------

// A length in CSS pixels. This represents a *used value* (post-resolution),
// not an authored value like "1em" or "50%". Can be fractional (sub-pixel
// layout is common) and negative (e.g. negative margins, off-screen
// positioning). What it can't be is NaN or ±Infinity — see `assertCSSPixel`.
//
// Spec: https://www.w3.org/TR/css-values-4/#px
export type CSSPixel = Brand<number, "CSSPixel">;

// ----------------------------------------------------------------------------
// Encoding primitives
// ----------------------------------------------------------------------------

// A single byte from a UTF-8 input stream: integer in [0, 255]. Used by the
// encoding-detection / decoder layer (Phase 9+); we declare it now so the
// type is in place when we get there.
export type Utf8Byte = Brand<number, "Utf8Byte">;

// ----------------------------------------------------------------------------
// Validating constructors
// ----------------------------------------------------------------------------
//
// Every branded type gets an `assertX` constructor. These are the only
// way a brand should be attached in normal code. They:
//
//   1. Run a range/shape check (in dev mode only — see `dev.ts`).
//   2. Throw a RangeError if the check fails — fail fast, fail loud.
//   3. Otherwise return the value with the brand attached.
//
// In production builds (HTML_TS_DEV=0), the checks compile out and these
// reduce to plain `unsafeBrand` calls, which are inlined by the runtime.
// ----------------------------------------------------------------------------

// The maximum legal Unicode code point. Above this, code points are
// undefined in the standard.
const MAX_CODE_POINT = 0x10ffff; // (1,114,111)

// The surrogate range — code points reserved for UTF-16 encoding and
// invalid as standalone characters.
const SURROGATE_LO = 0xd800; // (55,296)
const SURROGATE_HI = 0xdfff; // (57,343)

export function assertCodePoint(n: number): CodePoint {
  // Three things must hold for a valid code point: it's an integer (no
  // fractional values), non-negative, and within the Unicode range.
  if (dev && (!Number.isInteger(n) || n < 0 || n > MAX_CODE_POINT)) {
    throw new RangeError(`Invalid code point: ${n}`);
  }
  return unsafeBrand<CodePoint>(n);
}

export function assertScalarValue(n: number): ScalarValue {
  if (dev) {
    // First: is it even a valid code point at all?
    if (!Number.isInteger(n) || n < 0 || n > MAX_CODE_POINT) {
      throw new RangeError(`Invalid code point: ${n}`);
    }
    // Then: scalars exclude surrogates. A value in the surrogate range
    // is a half of a UTF-16 pair, not a real character.
    if (n >= SURROGATE_LO && n <= SURROGATE_HI) {
      throw new RangeError(`Surrogate is not a scalar value: 0x${n.toString(16)}`);
    }
  }
  return unsafeBrand<ScalarValue>(n);
}

export function assertNodeId(n: number): NodeId {
  // NodeIds are non-negative integer arena indexes. We don't bound the
  // upper end — a document large enough to hit MAX_SAFE_INTEGER nodes is
  // a separate problem.
  if (dev && (!Number.isInteger(n) || n < 0)) {
    throw new RangeError(`Invalid NodeId: ${n}`);
  }
  return unsafeBrand<NodeId>(n);
}

export function assertCSSPixel(n: number): CSSPixel {
  // CSS pixels can be fractional (sub-pixel layout) and negative (negative
  // margins, off-screen positions). Zero is fine. The values that *aren't*
  // legal are NaN (arithmetic with an undefined operand) and ±Infinity
  // (overflow). `Number.isFinite` rejects exactly those three and accepts
  // every other number — including negatives and fractions, which is what
  // we want.
  if (dev && !Number.isFinite(n)) {
    throw new RangeError(`Invalid CSSPixel: ${n}`);
  }
  return unsafeBrand<CSSPixel>(n);
}

export function assertUtf8Byte(n: number): Utf8Byte {
  // A byte is an integer in [0, 255]. Anything else means a decoder bug
  // upstream.
  if (dev && (!Number.isInteger(n) || n < 0 || n > 0xff)) {
    throw new RangeError(`Invalid UTF-8 byte: ${n}`);
  }
  return unsafeBrand<Utf8Byte>(n);
}
