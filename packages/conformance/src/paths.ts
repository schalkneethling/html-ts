// ============================================================================
// Workspace and vendor path resolution
// ============================================================================
//
// Tests and tools need to find files under `vendor/html5lib-tests/` regardless
// of which package they live in. Hardcoding relative paths from individual
// test files is fragile; instead, every consumer routes through these helpers.
//
// We anchor on `import.meta.url` of this file (always
// `packages/conformance/src/paths.ts`) and walk up three segments to reach
// the workspace root. If the package layout ever changes, this file changes.
// ============================================================================

import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath(new URL("../../../", import.meta.url)) resolves to the
// workspace root: from `packages/conformance/src/` up to `packages/conformance/`,
// then `packages/`, then the workspace root.
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Join a sequence of path segments onto the workspace root.
 *
 * @example
 *   repoRoot("scripts", "foo.ts") // → /abs/path/to/html-ts/scripts/foo.ts
 */
export function repoRoot(...segments: string[]): string {
  return join(workspaceRoot, ...segments);
}

/**
 * Join a sequence of path segments onto `vendor/html5lib-tests/`.
 *
 * @example
 *   vendorRoot("tokenizer", "entities.test")
 *   // → /abs/path/to/html-ts/vendor/html5lib-tests/tokenizer/entities.test
 */
export function vendorRoot(...segments: string[]): string {
  return join(workspaceRoot, "vendor", "html5lib-tests", ...segments);
}
