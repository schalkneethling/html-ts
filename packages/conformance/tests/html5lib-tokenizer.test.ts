// Smoke tests for the tokenizer JSON loader.
//
// We don't try to exercise every field combination — Phase 1's tokenizer
// will drive every test in the corpus, which is exhaustive enough. Here
// we just confirm:
//
//   1. We can find and parse a real fixture file.
//   2. The shape we get back is what we typed.
//   3. The doubleEscaped codepath unescapes \uHHHH sequences correctly.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { vendorRoot } from "../src/paths.ts";
import { loadTokenizerSuite } from "../src/html5lib-tokenizer.ts";

describe("loadTokenizerSuite — real fixture", () => {
  const suite = loadTokenizerSuite(vendorRoot("tokenizer", "entities.test"));

  it("loads every test", () => {
    expect(suite.length).toBe(80);
  });

  it("preserves the first test's description and shape", () => {
    const first = suite[0];
    expect(first?.description).toMatch(/Undefined named entity/);
    expect(first?.input).toBe('<h a="&noti;">');
    expect(first?.output[0]?.[0]).toBe("StartTag");
  });
});

describe("loadTokenizerSuite — doubleEscaped", () => {
  // jest-image-snapshot puts its data dir next to the test file, so a tmpfile
  // there would get caught up; use /tmp instead.
  it("expands \\uHHHH sequences in input, output strings, and error codes", () => {
    const tmp = join(process.env["TMPDIR"] ?? "/tmp", `de-${process.pid}.test`);
    writeFileSync(
      tmp,
      JSON.stringify({
        tests: [
          {
            description: "synthetic doubleEscaped test",
            input: "\\u0041\\u00e9",
            output: [["Character", "\\u0041\\u00e9"]],
            errors: [{ code: "\\u0041-err", line: 1, col: 1 }],
            doubleEscaped: true,
          },
        ],
      }),
    );

    const [first] = loadTokenizerSuite(tmp);
    expect(first?.input).toBe("Aé");
    expect(first?.output[0]?.[1]).toBe("Aé");
    expect(first?.errors?.[0]?.code).toBe("A-err");
  });
});
