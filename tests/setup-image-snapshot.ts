// ============================================================================
// Vitest setup: register jest-image-snapshot's `toMatchImageSnapshot` matcher.
// ============================================================================
//
// `jest-image-snapshot` was built for Jest, but its `toMatchImageSnapshot`
// matcher is a pure expect-extension — it doesn't depend on Jest internals.
// Vitest's `expect` exposes the same `extend()` API, so the matcher plugs in
// directly.
//
// After this file runs, any test in any workspace package can write:
//
//   expect(pngBuffer).toMatchImageSnapshot();
//
// To update snapshots after an intentional pixel change:
//
//   vitest -u
//
// Snapshots land in `__image_snapshots__/` next to the test file. Failure
// diffs land in `__diff_output__/` next to the snapshot.
// ============================================================================

import { toMatchImageSnapshot } from "jest-image-snapshot";
import { expect } from "vitest";

expect.extend({ toMatchImageSnapshot });
