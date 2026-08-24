/**
 * @file EXPERIMENTAL measurement affordance for the delivery-mechanism question the swarm-consensus
 * debate deliberately left UNRESOLVED (`ADS-memory/reports/swarm-consensus/runs/
 * 2026-08-23-tovu-capability-manifest-fork/SYNTHESIS.md`): does a capability-discovery manifest need
 * to be passive text, a mandatory pre-planning gate, a required tool call, or a server-side forced
 * first-turn injection to actually get an agent to look for a capability it never considered?
 * Selected per-process by `TOVU_CAPABILITY_MANIFEST_ARM` — same "measurement affordance, not a shipped
 * feature" status as `TOVU_AGENT_PLUGIN_DELIVERY` (`resolve-agent-plugin-refs.ts`) — and defaults to
 * `off` (today's behavior), so no run is affected unless a probe explicitly opts in.
 *
 * Only `off` / `passive` / `gate` / `mandate` are covered here. The other two arms the debate named (a
 * required `list_capability_categories()` tool call, and a server-side forced first-turn keyword
 * search) are NOT built by this slice — they need a new tool registration and a live catalog query
 * respectively, which are separable follow-ups, not blocking this one.
 *
 * `mandate` (added 2026-08-23) exists because `gate`'s trigger was measured BROKEN, not merely
 * ineffective: its wording fires only "before proposing an implementation path," and all 3 of its
 * recorded runs asked a clarifying question instead, which never trips that condition at all. Its
 * 0/3 result is therefore void as evidence about forced-check mechanisms in general — the mechanism
 * was never actually exercised. `mandate` keeps `gate` intact for comparison and adds an
 * unconditional first-turn trigger that names the two escape hatches the measurements actually
 * caught the agent taking: "I'll just ask a clarifying question first" and "I already thought of a
 * plausible answer, so I don't need to look."
 *
 * The manifest text itself is a POINTER, never an inventory claim — the sharpest single idea the
 * debate produced (each category names a search vocabulary, never asserts anything is installed).
 * This is what lets `passive` and `gate` share identical manifest text: the two arms differ ONLY in
 * whether an imperative consultation instruction is appended, isolating "does the text exist" from
 * "is it phrased as mandatory" as the actual independent variable under test.
 */

export type CapabilityManifestArm = "off" | "passive" | "gate" | "mandate";

const DEFAULT_ARM: CapabilityManifestArm = "off";

/** Mirrors `resolveAgentPluginDeliveryMode`'s own typed-env-param shape so both are testable without
 *  touching global `process.env`. */
export function resolveCapabilityManifestArm(
  env: { readonly TOVU_CAPABILITY_MANIFEST_ARM?: string | undefined } = process.env,
): CapabilityManifestArm {
  const value = env.TOVU_CAPABILITY_MANIFEST_ARM;
  if (value === "passive" || value === "gate" || value === "mandate") return value;
  return DEFAULT_ARM;
}

/**
 * Fixed, editorial category list. Membership/presence derivation (matching a real installed card's
 * own text against this vocabulary, per the debate's settled decision) is NOT built by this slice —
 * this is intentionally static for every workspace, which is sufficient to test delivery mechanism in
 * isolation from category-derivation correctness. The "Other installed capabilities" line is the
 * fallback bucket the debate's kind-to-category concession assumes exists.
 */
export const CAPABILITY_MANIFEST_TEXT = `Capability areas available in this workspace — search \`search_tools\` (native tools) or \`capability_search\` (installed skills/plugins) using terms like these before assuming a plausible answer is the only one:
- Publish, deploy, and operate this site — deploy, host, publish, staging, release
- Create and manage content — post, page, content, editor
- Design and presentation — theme, design, style, layout
- Media generation and transformation — image, media, generate, transform
- Extend site functionality — plugin, extension, feature
- Connect external services and data — connect, integration, api, service
- Automate workflows and agent behavior — skill, workflow, automate
- Inspect, diagnose, and secure — diagnose, audit, security, recover
- Other installed capabilities — anything not covered above; search broadly before assuming nothing exists`;

const GATE_INSTRUCTION = `Before proposing an implementation path for an ambiguous or unfamiliar request, check the categories above and search accordingly — even if you already found a plausible native tool that seems to answer it.`;

/**
 * Unlike `GATE_INSTRUCTION`, this names no precondition — there is no state the agent can be in that
 * exempts it. Each "EVEN IF" clause below is not hypothetical: it transcribes an escape route a real
 * measured run actually took. The "plausible answer you reached on your own" clause is the load-bearing
 * one — the recorded root cause is that the agent resolved "design guidance" to "the active theme"
 * *before issuing a single query*, so a plausible self-generated answer, not a failed search, is what
 * suppresses discovery.
 */
const MANDATE_INSTRUCTION = `MANDATORY FIRST STEP — applies to your very first reply in this conversation, with no exceptions.

Before you answer, before you ask a clarifying question, and before you read any file or call any other tool, you MUST first run at least one \`search_tools\` or \`capability_search\` query built from the category vocabulary above.

This applies EVEN IF:
- you already believe you know what the user means, or
- you have already thought of a plausible native tool, file, or theme that seems to answer it, or
- you were only going to ask a clarifying question first, or
- the request seems simple enough not to need it.

A plausible answer you reached on your own is NOT evidence that nothing is installed for this. Search first, then answer. Briefly state what you searched for and what came back.`;

/** Returns `""` for `off` — today's behavior, no manifest text at all. */
export function buildCapabilityManifestPrefix(arm: CapabilityManifestArm): string {
  if (arm === "off") return "";
  if (arm === "passive") return CAPABILITY_MANIFEST_TEXT;
  if (arm === "mandate") return `${CAPABILITY_MANIFEST_TEXT}\n\n${MANDATE_INSTRUCTION}`;
  return `${CAPABILITY_MANIFEST_TEXT}\n\n${GATE_INSTRUCTION}`;
}
