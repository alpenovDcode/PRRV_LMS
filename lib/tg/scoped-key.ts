// Single source of truth for variable-scope parsing.
// Used by flow-engine (setVarScoped) and inline-actions (setVariable
// action). Keeping the regex in one place ensures both code paths
// stay in sync as we evolve the scope vocabulary.

export type VarScope = "client" | "project" | "deal" | "field";

// `client.x` → { scope: "client", key: "x" }
// `project.foo.bar` → { scope: "project", key: "foo.bar" }  (nested key)
// `field.email` → { scope: "field", key: "email" }
// `vars.x` → { scope: "client", key: "x" }  (legacy alias)
// `x` (no prefix) → { scope: "client", key: "x" }  (default scope)
export function parseScopedKey(raw: string): { scope: VarScope; key: string } {
  const m = /^(client|project|deal|field|vars)\.(.+)$/.exec(raw);
  if (!m) return { scope: "client", key: raw };
  const scope = m[1] === "vars" ? "client" : (m[1] as VarScope);
  return { scope, key: m[2] };
}
