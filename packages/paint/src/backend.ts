// ============================================================================
// Paint backend contract
// ============================================================================
//
// The engine draws pixels only through this interface, never through a
// specific graphics library. That keeps the rendering pipeline independent of
// Skia: a backend can be swapped (for example, for a pure TypeScript
// rasterizer) without touching layout or paint code, and every backend can be
// checked against the same contract test.
// ============================================================================

/**
 * An RGBA color.
 *
 * `r`, `g`, and `b` are integers from 0 to 255. `a` is a number from 0 (fully
 * transparent) to 1 (fully opaque), matching CSS `rgba()`.
 */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** A drawing target that can be filled and encoded as a PNG image. */
export interface PaintBackend {
  /** Start a new blank surface. Any previous surface is discarded. */
  createSurface(width: number, height: number): void;

  /** Fill a rectangle on the current surface. Coordinates are in pixels. */
  fillRect(x: number, y: number, width: number, height: number, color: Color): void;

  /** Encode the current surface as PNG bytes. */
  encodePng(): Uint8Array;
}
