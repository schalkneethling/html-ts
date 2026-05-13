# `html-ts` — A TypeScript HTML Rendering Engine: Primary Plan

## Context

The goal is to build an HTML rendering engine in TypeScript, from first principles, as a long-term learning project. The motivation is to understand HTML deeply by implementing the full WHATWG HTML algorithm (tokenizer, tree construction, DOM) — and learning how a browser actually turns bytes into pixels along the way.

**HTML is the protagonist.** CSS, layout, and paint exist in this project only to the extent that they are required to render HTML the way a real browser does _by default_ — i.e. via the User Agent stylesheet, presentational HTML attributes, and default replaced-element behavior. We are not building a CSS engine. We are building an engine that renders HTML faithfully, and the bare minimum CSS plumbing follows from that.

This document is the primary plan: the high-level roadmap that frames every subsequent per-phase planning session. Each phase below will get its own dedicated plan when its turn comes.

## Reference engines

- **Primary: Ladybird (`LibWeb`)** — its tokenizer, tree builder, and DOM are the most pedagogical implementations in existence; code mirrors WHATWG spec text almost line-for-line.
- **Secondary: Servo (`html5ever`, `selectors`, `style`, `layout`)** — clean crate boundaries make it the best reference for _how subsystems separate_.
- **Tertiary, only when Ladybird/Servo gloss over a real-world edge case: Blink/WebKit/Gecko.**

## Foundational decisions (locked)

| Decision                                | Choice                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Scope ceiling                           | Minimal CSS — only what browsers ship as default styles. HTML is the focus.                               |
| Reference engine                        | Ladybird primary, Servo secondary                                                                         |
| Render target                           | Skia-Node (`skia-canvas` or `@napi-rs/canvas`) — same rasterizer as Blink                                 |
| Conformance                             | Spec-driven from day one (html5lib-tests + curated WPT subset)                                            |
| TypeScript                              | Maximally strict; branded types for spec primitives (`CodePoint`, `CSSPixel`, `NodeId`, …)                |
| Repo structure                          | Monorepo, one package per subsystem                                                                       |
| Visibility                              | Public repo, README + design notes from the start                                                         |
| Out of scope (forever, or near-forever) | JavaScript, networking, accessibility tree, animations, GPU compositing, author stylesheets beyond a stub |

## Subsystems and proposed package layout

```
packages/
  infrastructure/   shared types, branded primitives, error model, fixture harness
  html/             WHATWG tokenizer + tree construction
  dom/              Node tree + minimal traversal/query API
  css/              `css-tree`-backed parser wrapper + small selector matcher
  style/            UA stylesheet + style resolution + presentational hints
  layout/           box tree generation + block/inline layout
  paint/            display list + Skia backend
  engine/           top-level orchestrator: HTML bytes → PNG
  conformance/      runs html5lib-tests + WPT subset, tracks pass-rate
```

This mirrors Servo's crate structure and keeps each phase mappable to a package.

## High-level phases

The pipeline of a browser engine is: **bytes → tokens → DOM → styled DOM → box tree → display list → pixels**. The phases below walk that pipeline, with depth weighted toward the HTML half.

Each phase ends with measurable conformance progress (test pass-rate against html5lib or WPT) and a working end-to-end demo of everything built so far.

### Phase 0 — Foundations & Scaffolding

Monorepo setup (Vite+ workspace), branded-type primitives, fixture/golden-file harness, html5lib-tests vendored as a pinned download (a small fetch script that pulls a specific commit into a gitignored local directory, with the commit SHA tracked in-repo — no git submodules), Skia-Node paint backend stub that can render a solid-color rectangle, CI green. End state: `engine` runs end-to-end on a 1-line HTML fixture and produces a blank PNG.

### Phase 1 — HTML Tokenizer

The full WHATWG state machine: every state, every transition, character references, error reporting via parse-errors. End state: html5lib tokenizer tests at high pass-rate. This phase is _deep_ — the tokenizer is one of the most precisely-specified algorithms in the web platform and is where a lot of HTML's character intuition lives.

### Phase 2 — HTML Tree Construction → DOM

The full insertion-mode state machine: the "in body" / "in table" / "in select" mess, foster parenting, the active formatting elements list, the adoption agency algorithm, foreign content (SVG/MathML namespace switching), `<template>`, form-associated handling, fragment parsing. End state: html5lib tree-construction tests at high pass-rate. This is where you learn what HTML _actually is_ — the parser's quirks are HTML's quirks.

### Phase 3 — DOM API (minimal)

`Document`, `Element`, `Text`, `Comment`, `Attr`, `DocumentType`, `DocumentFragment`. Tree mutation primitives (insert, remove, replace), `querySelector` / `querySelectorAll` (against our minimal selector engine), `getElementById`, `getElementsByTagName`. No `MutationObserver`, no shadow DOM, no custom elements. End state: layout/style consumers can traverse the tree comfortably.

### Phase 4 — UA Stylesheet & Default Styling

Port a subset of Ladybird's or Blink's `html.css`. Use [`css-tree`](https://github.com/csstree/csstree) for parsing — since CSS is not the focus of this project, reimplementing a CSS parser is a distraction. We wrap `css-tree`'s AST in our own typed model and walk it. We _do_ implement our own selector matcher (small, well-typed), because matching is where the engine touches the DOM and is short enough to enjoy writing. The matcher handles tag, class, id, simple attribute selectors, and the small set of pseudo-classes the UA stylesheet uses. Implement HTML's presentational hints (`<font color>`, `<table border>`, `<hr size>`, etc.) — these are part of how default HTML renders, not CSS author authority. Compute used styles per element. End state: every element in the DOM has a resolved style record.

### Phase 5 — Box Tree

Generate boxes per CSS 2.1 normal flow: block boxes, inline boxes, anonymous boxes for inline-in-block, replaced elements (`<img>` with intrinsic dimensions, `<input>` etc.), line boxes will come in the next phase. End state: a box tree pretty-printer that mirrors what Firefox's "Box Model" devtools panel shows.

### Phase 6 — Layout: Block + Inline

Block formatting context: width/margin/padding/border resolution, vertical margin collapse, height resolution. Inline formatting context: line-box construction, text run measurement via Skia font metrics, basic line-breaking, text-align, vertical-align. End state: a styled HTML document lays out into a box tree with concrete geometry.

### Phase 7 — Painting & Display List

Paint order per CSS 2.1 Appendix E (which the modern stacking-context spec restates), stacking contexts, background, borders, text, replaced content. Emit a serializable display list. End state: a display list dump for any laid-out document.

### Phase 8 — Rasterization

Walk the display list, emit Skia draw commands (`drawRect`, `drawText`, `drawImage`, `clipRect`), produce a PNG. End state: end-to-end render of real HTML files (a styled article, a small table, a form) into PNGs that match a reference browser closely enough to read side-by-side.

### Phase 9+ — Iterate outward

Each of these is its own phase, planned individually when its turn comes:

- More elements: forms, tables (HTML tables are _deeply_ HTML-shaped, not just CSS), `<details>`/`<summary>`, `<dialog>`
- More layout: positioning (relative/absolute/fixed), floats, basic flex (only if a default-styled HTML element actually uses it)
- Replaced content: real `<img>` decoding (PNG/JPEG), intrinsic sizing, `srcset`
- Encoding detection (UTF-8 BOM, `<meta charset>`, the encoding sniffing algorithm)
- Fragment parsing & `innerHTML` round-trip
- Pretty serializer (HTML fragment serialization algorithm)
- Conformance push: chase WPT pass-rate on a chosen subset

## Guiding principles

1. **Spec-faithful, then fast.** Always write the algorithm the way the spec writes it first. Optimize only when a phase is conformance-green and a benchmark says we should.
2. **Tests precede implementation per phase.** Every phase starts by wiring its conformance tests in and watching them all fail. Implementation closes the gap.
3. **Branded types for spec concepts.** If the spec talks about it (code points, scalar values, tree positions, CSS pixels, used values, computed values), it gets a brand.
4. **No JavaScript escape hatch.** We will be tempted to add a "just for now" `eval`-shaped thing for `<script>`. We will not. Scripts are dropped.
5. **Each phase ends with a demo.** A laid-out PNG, a test-pass delta, a CLI command. Momentum matters in a multi-year project.
6. **Reference engines are read aloud.** When stuck, open Ladybird's source and read the spec quote in the comment; that's the entire point of choosing it.

## Critical files and references (will grow per phase)

- `node_modules/vite-plus/docs` — local Vite+ docs for workspace setup
- WHATWG HTML standard: https://html.spec.whatwg.org/multipage/
- DOM standard: https://dom.spec.whatwg.org/
- CSS Syntax Module 3: https://www.w3.org/TR/css-syntax-3/
- Ladybird LibWeb: https://github.com/LadybirdBrowser/ladybird/tree/master/Libraries/LibWeb
- Servo: https://github.com/servo/servo
- html5lib-tests (parser conformance): https://github.com/html5lib/html5lib-tests
- WPT (web-platform-tests): https://github.com/web-platform-tests/wpt
- Blink UA stylesheet (`html.css`): https://chromium.googlesource.com/chromium/blink/+/master/Source/core/css/html.css

## Verification (primary-plan level)

This primary plan is verified by the per-phase planning sessions that follow. The first one (Phase 0) is the next conversation. The success metric for the _whole project_ is: given a non-trivial HTML file (a styled article with headings, paragraphs, lists, an image, a table), `html-ts` produces a PNG that a reasonable person would say "yes, that is the same page" when held next to a real browser's render.

## Workflow for subsequent planning sessions

For each phase:

1. Open a planning session with the phase number as the topic.
2. Re-read this primary plan + the previous phase's plan + the previous phase's actual outcomes.
3. Read the relevant Ladybird and Servo source for that subsystem.
4. Identify which conformance tests gate this phase.
5. Produce a phase-specific plan **in its own document** under `~/.claude/plans/` (one plan file per phase — never appended to this primary plan).

The next planning session is **Phase 0 — Foundations & Scaffolding**, which will live in its own plan file.

<!-- Phase 0 detailed plan lives in its own document, not here. -->

When Phase 0 is green, the next planning session is **Phase 1 — HTML Tokenizer**.
