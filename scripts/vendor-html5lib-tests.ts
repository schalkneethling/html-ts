// ============================================================================
// scripts/vendor-html5lib-tests.ts
// ============================================================================
//
// Vendors the html5lib-tests conformance corpus into vendor/html5lib-tests/.
// The commit SHA to fetch is read from vendor/html5lib-tests.sha — that file
// is the *only* thing committed about the corpus version. Bumping the SHA
// is the way to upgrade.
//
// Idempotent. A sentinel file (vendor/html5lib-tests/.sha) records the SHA
// the directory was last extracted from; matching SHAs skip the fetch.
// Pass --force to re-extract regardless.
//
// Why not a git submodule? They're easy to forget to update, hard to pin
// reproducibly, and confuse shallow CI checkouts. A pinned tarball + a
// committed SHA gives us reproducibility without the friction.
//
// Requires Node >= 24.4 for `fs.mkdtempDisposableSync`.
// ============================================================================

import {
  existsSync,
  mkdtempDisposableSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";
import { x as extractTar } from "tar";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const shaFile = join(repoRoot, "vendor", "html5lib-tests.sha");
const destDir = join(repoRoot, "vendor", "html5lib-tests");
const sentinel = join(destDir, ".sha");

const force = process.argv.includes("--force");

// Read and sanity-check the pinned SHA. Accept short or full hex; reject
// anything else so a typo in the file fails loudly rather than producing
// a bogus 404 from GitHub.
const sha = readFileSync(shaFile, "utf8").trim();
// Matches a Git commit hash between 7 and 45 characters in length, case-insensitively.
if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
  throw new Error(`vendor/html5lib-tests.sha is not a valid SHA: ${JSON.stringify(sha)}`);
}

// Fast path: if we've already extracted this exact SHA, nothing to do.
if (!force && existsSync(sentinel) && readFileSync(sentinel, "utf8").trim() === sha) {
  console.log(`html5lib-tests @ ${sha} is up to date`);
  process.exit(0);
}

// GitHub's `codeload` endpoint serves a gzipped tarball of any commit.
// Same content as the github.com/.../archive/${sha}.tar.gz URL; using
// codeload directly avoids the redirect.
const url = `https://codeload.github.com/html5lib/html5lib-tests/tar.gz/${sha}`;
console.log(`fetching ${url}`);

const res = await fetch(url);
if (!res.ok || !res.body) {
  throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
}

// Stream the tarball into a fresh temp directory.
//
// `using` ties the temp directory's lifetime to this scope: on any throw,
// the disposer (registered by mkdtempDisposableSync) recursively removes
// it. On success we rename it away first, so the auto-cleanup at scope
// exit finds nothing and silently no-ops.
//
// `strip: 1` drops the leading "html5lib-tests-${sha}/" path component
// from every entry, so files land directly under the temp dir's root.
using tmp = mkdtempDisposableSync(join(tmpdir(), "html5lib-tests-"));

await new Promise<void>((resolve, reject) => {
  const out = extractTar({ cwd: tmp.path, strip: 1 });
  out.on("error", reject);
  out.on("end", resolve);
  // Node's fetch body is a Web ReadableStream; tar's extractor wants a
  // Node Readable. Readable.fromWeb bridges the two.
  Readable.fromWeb(res.body as unknown as WebReadableStream).pipe(out);
});

// Write the sentinel before the rename so the final directory always
// contains it — if anything between extraction and rename fails, the
// auto-cleanup wipes the lot.
writeFileSync(join(tmp.path, ".sha"), `${sha}\n`);

// Atomic-ish swap: remove the old extract (if any), rename the new one
// into place. The window between rmSync and renameSync is narrow; in
// practice nothing is reading the directory at this point.
if (existsSync(destDir)) {
  rmSync(destDir, { recursive: true, force: true });
}
renameSync(tmp.path, destDir);

console.log(`extracted to ${destDir}`);
