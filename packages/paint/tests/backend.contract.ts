import { describe, expect, it } from "vitest";
import type { PaintBackend } from "../src/backend.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Register the behavior every `PaintBackend` must have. Each backend's test
 * file calls this with a factory that returns a fresh backend.
 *
 * This file is not named `*.test.ts` on purpose: it holds no tests of its own,
 * and the test runner would report an empty test file as a failure.
 */
export function describePaintBackendContract(name: string, factory: () => PaintBackend): void {
  describe(`PaintBackend contract: ${name}`, () => {
    it("encodes a filled surface as a PNG", () => {
      const backend = factory();
      backend.createSurface(100, 100);
      backend.fillRect(0, 0, 100, 100, { r: 0, g: 0, b: 255, a: 1 });

      const png = backend.encodePng();

      expect(Array.from(png.slice(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE);
    });
  });
}
