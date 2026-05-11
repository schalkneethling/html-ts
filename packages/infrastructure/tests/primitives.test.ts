import { describe, expect, it } from "vitest";
import { assertCodePoint, assertScalarValue, assertUtf8Byte } from "../src/primitives.ts";
import { err, ok } from "../src/result.ts";

describe("assertCodePoint", () => {
  it("accepts valid code points", () => {
    expect(assertCodePoint(0)).toBe(0);
    expect(assertCodePoint(0x10ffff)).toBe(0x10ffff);
  });

  it("rejects out-of-range numbers", () => {
    expect(() => assertCodePoint(-1)).toThrow(RangeError);
    expect(() => assertCodePoint(0x110000)).toThrow(RangeError);
    expect(() => assertCodePoint(1.5)).toThrow(RangeError);
  });
});

describe("assertScalarValue", () => {
  it("rejects surrogates", () => {
    expect(() => assertScalarValue(0xd800)).toThrow(/surrogate/i);
    expect(() => assertScalarValue(0xdfff)).toThrow(/surrogate/i);
  });

  it("accepts the boundaries around the surrogate range", () => {
    expect(assertScalarValue(0xd7ff)).toBe(0xd7ff);
    expect(assertScalarValue(0xe000)).toBe(0xe000);
  });
});

describe("assertUtf8Byte", () => {
  it("rejects values outside [0, 255]", () => {
    expect(() => assertUtf8Byte(256)).toThrow(RangeError);
    expect(() => assertUtf8Byte(-1)).toThrow(RangeError);
  });
});

describe("Result helpers", () => {
  it("ok carries a value", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("err carries an error", () => {
    const r = err("boom");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("boom");
  });
});
