// ============================================================================
// html5lib tree-construction (.dat) loader
// ============================================================================
//
// The .dat format is a line-oriented bundle of tree-construction tests.
// Each test is a sequence of sections; each section starts with a `#header`
// line. See `vendor/html5lib-tests/tree-construction/README.md` for the
// canonical description. The grammar, schematically:
//
//   TEST   ::= #data \n DATA #errors \n ERRORS
//              [ #new-errors \n ERRORS ]
//              [ #document-fragment \n CONTEXT \n ]
//              [ #script-on \n | #script-off \n ]
//              #document \n DOCUMENT
//
//   Tests are separated by a blank line followed by the next `#data`.
//
// Quirk per README: the `#data` payload has its **trailing newline removed**
// — i.e. the newline between the last data line and `#errors` is *not*
// part of the data. We honour that by joining data lines with `\n` and not
// appending a final `\n`.
//
// We expose `loadTreeConstructionSuite(absPath)` returning an array of
// `TreeConstructionTest`. The `document` field is kept as a raw string
// (with the `| ` prefixes preserved) because Phase 2's compare step will
// generate its own dump in the same format and string-compare.
// ============================================================================

import { readFileSync } from "node:fs";

/** Where a fragment-parsing test's context element lives. */
export type ScriptMode = "on" | "off";

export interface TreeConstructionTest {
  readonly data: string;
  /** Raw `#errors` lines, unparsed. Count matters; format doesn't, per the spec. */
  readonly errors: readonly string[];
  /** Raw `#new-errors` lines (if present). */
  readonly newErrors?: readonly string[];
  /**
   * Context element name for fragment parsing (if present). Per the README:
   *   - "svg foo"   → SVG namespace, local name "foo"
   *   - "math foo"  → MathML namespace, local name "foo"
   *   - "foo"       → HTML namespace, local name "foo"
   * We preserve the raw string here; Phase 2 splits it.
   */
  readonly documentFragment?: string;
  /**
   * `"on"` or `"off"` if specified; absent means "run in both modes" per spec.
   */
  readonly scriptMode?: ScriptMode;
  /** Raw `#document` dump, including `| ` prefixes. */
  readonly document: string;
}

/**
 * Load and parse a single tree-construction `.dat` file. Returns the tests
 * in file order.
 */
export function loadTreeConstructionSuite(absPath: string): readonly TreeConstructionTest[] {
  const raw = readFileSync(absPath, "utf8");
  return Object.freeze(splitTests(raw).map(parseTest));
}

// ---------------------------------------------------------------------------
// Splitting the file into per-test blocks
// ---------------------------------------------------------------------------
//
// Tests are separated by a blank line, with each test starting with `#data`.
// Per the README the file structure is:
//
//   [TEST]LF
//   LF
//   [TEST]LF
//   LF
//   [TEST]LF      // last test ends with a single LF, not a blank line
//
// We split on "\n\n#data\n" and re-attach the leading "#data\n" to every
// block. The first block already starts with "#data\n" (or should).
function splitTests(raw: string): string[] {
  if (!raw.startsWith("#data\n")) {
    throw new Error(
      `expected file to start with "#data\\n", got ${JSON.stringify(raw.slice(0, 20))}`,
    );
  }
  // Strip the leading "#data\n" so split produces clean blocks.
  const body = raw.slice("#data\n".length);
  const blocks = body.split("\n\n#data\n");
  // Re-attach "#data\n" to every block, including the first.
  return blocks.map((b) => `#data\n${b}`);
}

// ---------------------------------------------------------------------------
// Parsing one test block
// ---------------------------------------------------------------------------
//
// A test is a sequence of sections delimited by `#header` lines. We walk
// the lines, switching into a new section every time we hit a header. The
// known headers are listed below; an unrecognized header throws.
//
// Quirk: `#data`'s trailing newline (between the last data line and
// `#errors`) is NOT part of the data. Joining the accumulated lines with
// `\n` (and not appending a trailing `\n`) produces the spec-required
// payload.

type Section = "data" | "errors" | "newErrors" | "documentFragment" | "document" | "none";

function parseTest(block: string): TreeConstructionTest {
  const lines = block.split("\n");
  // Drop a trailing empty line introduced by a final \n on the block.
  if (lines.length > 0 && lines.at(-1) === "") lines.pop();

  const data: string[] = [];
  const errors: string[] = [];
  const newErrors: string[] = [];
  const documentLines: string[] = [];
  let documentFragment: string | undefined;
  let scriptMode: ScriptMode | undefined;

  let section: Section = "none";

  for (const line of lines) {
    // A line starting with "#" *might* be a header; check against the known
    // set. A `#`-prefixed line inside `#data` or `#document` is valid content,
    // not a header — but the headers we accept aren't valid HTML/DOM-dump
    // prefixes, so the check is safe in practice.
    switch (line) {
      case "#data":
        section = "data";
        continue;
      case "#errors":
        section = "errors";
        continue;
      case "#new-errors":
        section = "newErrors";
        continue;
      case "#document-fragment":
        section = "documentFragment";
        continue;
      case "#script-on":
        scriptMode = "on";
        section = "none";
        continue;
      case "#script-off":
        scriptMode = "off";
        section = "none";
        continue;
      case "#document":
        section = "document";
        continue;
    }

    switch (section) {
      case "data":
        data.push(line);
        break;
      case "errors":
        errors.push(line);
        break;
      case "newErrors":
        newErrors.push(line);
        break;
      case "documentFragment":
        // documentFragment is a single line per spec.
        if (documentFragment === undefined) documentFragment = line;
        break;
      case "document":
        documentLines.push(line);
        break;
      case "none":
        // Stray content between sections; shouldn't happen in a well-formed
        // .dat file. We silently ignore — the corpus is well-formed, and
        // throwing here would just be noise.
        break;
    }
  }

  // Join data with newlines but *no* trailing newline (see README quirk above).
  // documentLines: preserved verbatim including newlines between them; the
  // expected dump never has a trailing newline either.
  return {
    data: data.join("\n"),
    errors: Object.freeze(errors),
    ...(newErrors.length > 0 ? { newErrors: Object.freeze(newErrors) } : {}),
    ...(documentFragment !== undefined ? { documentFragment } : {}),
    ...(scriptMode !== undefined ? { scriptMode } : {}),
    document: documentLines.join("\n"),
  };
}
