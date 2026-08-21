// Smoke tests for the tree-construction .dat loader.
//
// adoption01.dat is the first file Phase 2 will care about (its tests are
// the canonical adoption-agency-algorithm cases). The first test in the
// file is the small but spec-exact `<a><p></a></p>` example.

import { describe, expect, it } from "vitest";

import { vendorRoot } from "../src/paths.ts";
import { loadTreeConstructionSuite } from "../src/html5lib-dat.ts";

describe("loadTreeConstructionSuite — adoption01.dat", () => {
  const suite = loadTreeConstructionSuite(vendorRoot("tree-construction", "adoption01.dat"));

  it("parses at least one test", () => {
    expect(suite.length).toBeGreaterThan(0);
  });

  it("captures the first test's data and errors", () => {
    const first = suite[0];
    expect(first?.data).toBe("<a><p></a></p>");
    expect(first?.errors.length).toBe(2);
    expect(first?.errors[0]).toMatch(/expected-doctype/);
  });

  it("preserves the #document section verbatim, including `| ` prefixes", () => {
    const first = suite[0];
    // Per the .dat README: nested elements get two-space indentation per
    // ancestor, prefixed with `| `.
    expect(first?.document).toContain("| <html>");
    expect(first?.document).toContain("|   <body>");
    expect(first?.document).toContain("|     <a>");
  });

  it("does not set documentFragment or scriptMode when absent", () => {
    expect(suite[0]?.documentFragment).toBeUndefined();
    expect(suite[0]?.scriptMode).toBeUndefined();
  });
});
