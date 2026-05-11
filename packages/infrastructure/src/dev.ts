// Runtime checks in branded-primitive constructors are gated by this flag.
// Defaults to on; flip off in hot loops once a phase has a benchmark to justify it.
// Read once at module load — callers should not rely on toggling at runtime.
export const dev: boolean = process.env["HTML_TS_DEV"] !== "0";
