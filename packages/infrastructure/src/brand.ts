// ============================================================================
// Branded types: bolting nominal typing onto TypeScript's structural system
// ============================================================================
//
// TypeScript types are *structural*: two types with the same shape are the
// same type. So `number` is `number`, whether it represents a Unicode code
// point, a CSS pixel, an array index, or a phone number. The compiler will
// happily let you pass any of those where any other is expected.
//
// That's a problem in a project like this, where we deal with many distinct
// "kinds of number" coming from different specs (WHATWG, CSS, DOM). Mixing
// them up is a common source of bugs — and exactly the kind of mistake the
// type system *could* catch if we gave it a way to tell them apart.
//
// A "brand" is a phantom marker we attach to a type so that two otherwise
// identical types become distinct from the compiler's point of view, while
// remaining identical at runtime (the marker has zero runtime cost).
//
// Concretely:
//   type CodePoint = Brand<number, "CodePoint">;
//   type CSSPixel  = Brand<number, "CSSPixel">;
//
// Both are still `number` at runtime. But the compiler now refuses to pass
// a CSSPixel where a CodePoint is expected, and vice versa. The only way to
// produce a branded value is via a constructor we control (see `primitives.ts`),
// which gives us a chokepoint for runtime validation in dev mode.
// ============================================================================

// A `unique symbol` is a value whose *type* is a singleton — no other symbol
// has the same type, even one created with the same description. We use it as
// the property key for the brand marker. Three benefits over a string key:
//
//   1. The symbol is declared but never exported, so external code literally
//      cannot construct an object that has this property — the brand is
//      unforgeable.
//   2. Symbols don't collide with real properties on the underlying value.
//   3. `declare const` says "this exists at the type level only; do not emit
//      runtime code for it." There is no JS output for this line.
//
// The name `__brand` is convention (from io-ts / Effect / fp-ts). The leading
// double underscore signals "internal, do not touch." TypeScript's `private`
// keyword can't be used here — it's a class-member modifier, not a property-
// key qualifier — but `unique symbol` gives us a stronger guarantee anyway.
declare const __brand: unique symbol;

// `Brand<T, K>` is the underlying type `T` intersected with an object that
// has a single readonly property keyed by the unique symbol, whose value
// type is the string literal `K`. The intersection means a `Brand<T, K>` is
// "a T that also carries a phantom K-shaped marker."
//
// At runtime, a value of type `Brand<number, "CodePoint">` is just a number.
// At compile time, it's a number that the compiler refuses to confuse with
// a plain number or with any other branded number.
export type Brand<T, K extends string> = T & { readonly [__brand]: K };

// `unsafeBrand` is the (only) way to attach a brand to a value. It is
// "unsafe" because it does not validate the value — that's the caller's job.
// In `primitives.ts` we wrap this with `assertCodePoint`, `assertCSSPixel`,
// etc., which run range checks before branding.
//
// Usage: pass the target brand as an explicit type parameter.
//
//   type PositiveNumber = Brand<number, "PositiveNumber">;
//   const p = unsafeBrand<PositiveNumber>(42);
//
// The `B extends Brand<unknown, string>` constraint forces the caller to
// instantiate `B` with an actual brand type — `unsafeBrand<number>(42)`
// would not compile because `number` is not a `Brand<...>`.
//
// This function should normally be called *only* from inside the
// branded-primitive module that owns the type. Consumers should call the
// validating constructors (`assertCodePoint`, etc.) instead.
export function unsafeBrand<B extends Brand<unknown, string>>(value: unknown): B {
  // The cast is the whole point: at runtime there's nothing to do, we just
  // tell the compiler to treat this value as a `B` from now on.
  return value as B;
}
