# html-ts

A TypeScript HTML rendering engine, built from first principles as a long-term learning project.

The goal is to understand HTML deeply by implementing the full WHATWG HTML algorithm — tokenizer, tree construction, DOM — and to learn how a browser actually turns bytes into pixels along the way. **HTML is the focus.** CSS, layout, and paint exist here only to the extent that they are required to render HTML the way a real browser does _by default_ (User Agent stylesheet, presentational HTML attributes, default replaced-element behavior).

The pipeline is the standard browser one:

```
bytes → tokens → DOM → styled DOM → box tree → display list → pixels
```

## Reference engines

- **Primary:** [Ladybird](https://github.com/LadybirdBrowser/ladybird) (`LibWeb`) — code mirrors WHATWG spec text almost line-for-line.
- **Secondary:** [Servo](https://github.com/servo/servo) — clean crate boundaries, the best reference for _how subsystems separate_.
- **Tertiary**, only when Ladybird/Servo gloss over a real-world edge case: Blink/WebKit/Gecko.

## Package layout

This is a Bun-workspaces monorepo driven by [Vite+](https://viteplus.dev). Every command goes through `vp`.

```
packages/
  infrastructure/   shared types, branded primitives, error model
  html/             WHATWG tokenizer + tree construction
  dom/              Node tree + minimal traversal/query API
  css/              css-tree-backed parser wrapper + small selector matcher
  style/            UA stylesheet + style resolution + presentational hints
  layout/           box tree generation + block/inline layout
  paint/            display list + Skia backend (@napi-rs/canvas)
  engine/           top-level orchestrator: HTML bytes → PNG
  conformance/      runs html5lib-tests + WPT subset, tracks pass-rate
```

## Out of scope

JavaScript execution, networking, the accessibility tree, animations, GPU compositing, author stylesheets beyond a stub.

## Getting started

```bash
vp install                       # install workspace deps
vp run vendor:html5lib           # vendor the html5lib-tests fixtures (pinned commit)
vp check                         # lint + type-check across all packages
vp run -r test                   # run every package's tests
```

## Planning documents

- Primary plan (high-level roadmap, locked decisions): `~/.claude/plans/i-have-a-wild-cryptic-sparrow.md`
- Per-phase plans live alongside it as `~/.claude/plans/phase-N-*.md`. The current phase is **Phase 0 — Foundations & Scaffolding**.

## License

MIT
