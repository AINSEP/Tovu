/**
 * The SECOND `runner.*` allowlist: the verbs Tovu's own site assistant — the RIGHT chat, inside a
 * project's embedded admin — may reach through Runner's MCP bridge.
 *
 * **This list is now a mirror, not a subset.** Until 2026-08 this file excluded most of
 * `runnerToolNames()` on a trust-boundary argument (ADR-061 in the Tovu repo): a site assistant
 * operates over site content — posts, pages, comments, uploads — which is user-supplied, and once a
 * site is published it is attacker-supplied, so a prompt planted in a comment is read by the same
 * model that holds these tools. That argument is sound as far as it goes, and the exposure it
 * describes still exists (see below) — but Tovu-Runner and Tovu are written by the same single
 * developer, Runner is a local single-user desktop app supervising `tovu serve` processes on the
 * operator's own machine, and there is no second party on either side of the Runner↔Tovu line. The
 * operator weighed that exposure against the cost of the split-brain surface — the fleet chat
 * holding one set of verbs, a site's assistant a strictly narrower one, forever re-litigated every
 * time a verb is added — and decided, having been told the exposure twice and reaffirmed it, that
 * parity is worth more than the narrower surface. This file implements that decision. It is not this
 * file's job to relitigate it.
 *
 * **What the site assistant can reach now.** Every verb {@link runnerToolNames} declares —
 * `runner.navigate` and `runner.project.delete` included. `SITE_ASSISTANT_TOOL_NAMES` below IS
 * `runnerToolNames()`, not a hand-picked subset of it: there is no verb the fleet chat can call that
 * a site assistant cannot.
 *
 * **What the remaining exposure is, stated plainly for whoever re-narrows this next.** A site
 * assistant still operates over user-supplied, and once published attacker-supplied, content. A
 * successful prompt injection into one site's content can now do anything the operator's own fleet
 * chat can do: stop or restart a *sibling* site's process, permanently delete a project's install
 * directory with no undo and no backup, or move Runner's own top nav. Nothing in this file defends
 * against that any more — the defense is the trust decision above (one operator, one machine, no
 * second party), not a narrower allowlist. If that premise ever stops being true — several people
 * sharing one Runner install, or Runner ever supervising a site it does not itself operate — this is
 * the file to come back to, and {@link FLEET_ONLY_VERBS}/{@link FLEET_ONLY_NAMESPACES} below are left
 * in place, empty, as the seam to re-narrow through rather than a boundary already enforced.
 *
 * **The three runtime gates are unchanged, and there are still three.** `site-assistant-mcp.ts`
 * registers this list with Tovu as the tool set it may federate, `runner-mcp-bridge.ts` refuses a
 * `/call` outside it before the request reaches the daemon, and `runner-tools.ts`'s registered
 * `ToolPolicy` refuses it a third time at execute. All three now agree on the wider set instead of
 * the narrow one — they were never what made the list narrow, they are what makes whatever this list
 * says actually enforced, and that property is exactly what makes a future re-narrowing a one-line
 * change here rather than a rewrite of three files. See ADR-061 for the original trust-boundary
 * argument this file no longer applies, kept as the record of what would have to be true again
 * before it does.
 */
import { runnerToolNames, type RunnerToolName } from './sections.js';

/**
 * Verbs to exclude again if this file is ever re-narrowed. Empty today — see the file header for
 * why. This is a seam, not a boundary: {@link SiteAssistantEligibleTool} still subtracts it (and
 * {@link FLEET_ONLY_NAMESPACES}) at the type level, so re-narrowing later is "add entries here and
 * remove them from `SITE_ASSISTANT_TOOL_NAMES`'s source", not "invent the exclusion mechanism from
 * scratch".
 */
export const FLEET_ONLY_VERBS = [] as const;

export type FleetOnlyVerb = (typeof FLEET_ONLY_VERBS)[number];

/**
 * Whole `runner.*` NAMESPACES to exclude again if this file is ever re-narrowed, verb by verb,
 * including verbs not yet declared. Empty today for the same reason {@link FLEET_ONLY_VERBS} is —
 * see the file header. Listing a namespace with no declared verbs is legal and expected, same as it
 * was before: the value of a namespace exclusion is landing BEFORE the verbs under it exist.
 */
export const FLEET_ONLY_NAMESPACES = [] as const;

export type FleetOnlyNamespace = (typeof FLEET_ONLY_NAMESPACES)[number];

/**
 * A declared `runner.*` verb a site assistant is *permitted to be granted*. With both exclusion
 * lists above empty, this resolves to every {@link RunnerToolName} — the `Exclude` is inert today,
 * but it is what lets a future entry in `FLEET_ONLY_VERBS`/`FLEET_ONLY_NAMESPACES` take effect at
 * compile time (a verb re-added there stops satisfying this type, and anything still deriving
 * `SITE_ASSISTANT_TOOL_NAMES` from it fails `npm run typecheck`) without this type's definition, or
 * `SITE_ASSISTANT_TOOL_NAMES`'s, needing to change shape.
 */
export type SiteAssistantEligibleTool = Exclude<
  RunnerToolName,
  FleetOnlyVerb | `${FleetOnlyNamespace}${string}`
>;

/**
 * The verbs a site assistant actually gets: every verb {@link runnerToolNames} declares, in the
 * same order. Mirrored rather than curated — see the file header for why a hand-picked subset was
 * dropped in favor of this.
 *
 * The cast is sound rather than a lie the compiler is being talked past: the right-hand side IS
 * `runnerToolNames()`'s own return value, called directly rather than re-expressed as a second
 * literal array (the drift `runnerToolNames()`'s own doc comment in `sections.ts` warns a restated
 * copy invites). `runnerToolNames()` is typed `readonly string[]` because it also backs a runtime
 * `Set` in `runner-tools.ts`, so TypeScript cannot see through the call to the literal union its
 * *implementation* is actually built from — which is exactly what `RunnerToolName` names, and
 * exactly why `SiteAssistantEligibleTool` (today equal to it) is the right type to assert.
 */
export const SITE_ASSISTANT_TOOL_NAMES = runnerToolNames() as readonly SiteAssistantEligibleTool[];

const SITE_ASSISTANT_ALLOWLIST: ReadonlySet<string> = new Set<string>(SITE_ASSISTANT_TOOL_NAMES);

/** `true` when `toolId` is a verb Tovu's site assistant is permitted to call. */
export function isSiteAssistantTool(toolId: string): boolean {
  return SITE_ASSISTANT_ALLOWLIST.has(toolId);
}

/**
 * Verbs within {@link SITE_ASSISTANT_TOOL_NAMES} whose completion may not rest on the calling
 * model's own say-so, because they destroy something a site cannot get back.
 *
 * `runner.project.delete` is the only entry. It stops the process, erases the install directory —
 * every post, page, upload, comment — and removes the project from the fleet, with no undo and no
 * backup (see the verb's own description in `runner-tools.ts`). `runner.project.stop` and
 * `runner.project.restart` were weighed and left out: both interrupt a live site, which is
 * disruptive, but `runner.project.start` reverses either one completely, so a wrong call costs
 * availability for as long as it takes to notice and restart it — not data. `runner.create_site`
 * was weighed and left out too: it only adds a new, independent project; there is nothing yet to
 * destroy, and undoing it is calling delete on the very thing that was just created — itself
 * already gated by this list. Widening this to "anything disruptive" would make the gate fire on
 * the routine case (an assistant restarting the site it lives on after a config change) as often as
 * the one that matters, which trains whoever reads the refusal to wave every one of them through —
 * exactly the failure mode a confirmation gate exists to prevent.
 *
 * A verb listed here is NOT removed from {@link SITE_ASSISTANT_TOOL_NAMES} — this is not a second
 * {@link FLEET_ONLY_VERBS}. That list removes a verb from a site assistant's surface entirely:
 * unadvertised, refused at the bridge's `/call`, refused by the policy below. This list does not
 * remove the verb — the site assistant still sees it and may still attempt it — what it cannot do
 * is complete without a decision from somewhere other than its own arguments. No such
 * decision-maker is wired up today (see {@link requiresOperatorConfirmation}'s own header), so in
 * this build the practical effect is a plain refusal — but the shape is "denied pending a
 * confirmation that doesn't exist yet," not "excluded," and the two are meant to diverge the day a
 * real operator-facing prompt is built.
 */
export const SITE_ASSISTANT_DESTRUCTIVE_VERBS = [
  'runner.project.delete',
] as const satisfies readonly RunnerToolName[];

export type SiteAssistantDestructiveVerb = (typeof SITE_ASSISTANT_DESTRUCTIVE_VERBS)[number];

const SITE_ASSISTANT_DESTRUCTIVE_SET: ReadonlySet<string> = new Set<string>(SITE_ASSISTANT_DESTRUCTIVE_VERBS);

/**
 * `true` when a site assistant's call to `toolId` needs a decision from an actual human operator
 * before it can complete — a `confirm: true` the calling model set on itself does not count, since
 * the model is exactly what a prompt injected into a site's own content is speaking through.
 *
 * Checked in the same two places {@link isSiteAssistantTool} is: `runner-daemon.ts`'s
 * `executeSiteAssistantTool` (the site-assistant door, for the caller-facing explanation) and
 * `runner-tools.ts`'s registered `ToolPolicy` (the innermost gate, reached regardless of which door
 * the call came through). Both refuse unconditionally today — nothing in this build ever answers
 * "yes, an operator confirmed this" — because there is nowhere for that confirmation to come from:
 * this pane renders no prompt a human could answer, and the site assistant's own chat is not
 * Runner's operator chat. That is the honest state, not an oversight; see this function's callers
 * for what would have to be built before it could ever return anything but a refusal.
 */
export function requiresOperatorConfirmation(toolId: string): boolean {
  return SITE_ASSISTANT_DESTRUCTIVE_SET.has(toolId);
}

/**
 * Verbs within {@link SITE_ASSISTANT_TOOL_NAMES} whose only argument naming WHICH project to act on
 * is a project reference (id, slug, or display name) — every verb built on
 * `PROJECT_REFERENCE_SCHEMA` in `runner-tools.ts`. Read by that file's
 * `assertSiteAssistantOwnProject`, which refuses a call naming a project other than the caller's own.
 *
 * This closes the gap this file used to leave open by design: "Whether a site assistant should be
 * scoped to naming only its own project for any future verb is assumed desirable and not designed"
 * (ADR-061, Open/assumed/deferred). It is layered ON TOP of {@link SITE_ASSISTANT_TOOL_NAMES}, not a
 * narrowing of it — a verb stays exactly as reachable as `ba2e8ea`/`204f3e6` left it; this only
 * constrains WHICH project it may be pointed at, never which verbs exist. Re-narrowing the verb
 * surface itself is still {@link FLEET_ONLY_VERBS}'s job, unchanged.
 *
 * **Why every project-referencing verb, with no exemption:**
 * - `runner.project.stop` / `.restart` take a SIBLING site's process off the air — the exact
 *   exposure ADR-061's threat model names, and the reason a scope check was worth adding at all.
 * - `runner.project.open` launches the OPERATOR'S OWN browser at a URL the caller chose, with no
 *   confirmation UI — a site's assistant opening an unrequested tab is a surprise whether the tab is
 *   this site or another one, so there is no argument for leaving it out.
 * - `runner.project.start` naming a project other than the caller's own has no ordinary use: the
 *   caller is a running `tovu serve` instance's own embedded assistant, which cannot be reached at
 *   all while its own project is stopped — a `start` call can only ever mean "start some OTHER
 *   site," which is fleet lifecycle a site's own assistant has no business initiating.
 * - `runner.project.delete` is already refused unconditionally by
 *   {@link requiresOperatorConfirmation}. Listed here anyway, as a second and independent reason it
 *   stays refused if that gate is ever loosened — this list does not rely on that one holding alone.
 *
 * `runner.fleet.status`, `runner.project.list`, `runner.create_site`, and `runner.navigate` are
 * absent because none of them names an existing project to act ON: `fleet.status`/`project.list`
 * enumerate every project (an already-accepted exposure — see ADR-061's Rejected alternatives),
 * `create_site` only ever creates a new one, and `navigate` names a Runner UI section, not a project.
 *
 * Declared the same way {@link SITE_ASSISTANT_DESTRUCTIVE_VERBS} is — `as const satisfies readonly
 * RunnerToolName[]` — so a typo, or a verb `sections.ts` does not declare, fails `npm run typecheck`
 * instead of silently mis-scoping a verb this list meant to name.
 */
export const SITE_ASSISTANT_PROJECT_SCOPED_VERBS = [
  'runner.project.start',
  'runner.project.stop',
  'runner.project.restart',
  'runner.project.open',
  'runner.project.delete',
] as const satisfies readonly RunnerToolName[];

export type SiteAssistantProjectScopedVerb = (typeof SITE_ASSISTANT_PROJECT_SCOPED_VERBS)[number];

const SITE_ASSISTANT_PROJECT_SCOPED_SET: ReadonlySet<string> = new Set<string>(
  SITE_ASSISTANT_PROJECT_SCOPED_VERBS,
);

/**
 * `true` when a site assistant's call to `toolId` must name its OWN project. See
 * {@link SITE_ASSISTANT_PROJECT_SCOPED_VERBS}'s header for which verbs this is and, more
 * importantly, why it is not a curated subset.
 */
export function requiresOwnProject(toolId: string): boolean {
  return SITE_ASSISTANT_PROJECT_SCOPED_SET.has(toolId);
}

/**
 * The role carried by the `Principal` a site-assistant call executes as.
 *
 * Read by `runner-tools.ts`'s registered `ToolPolicy`, which is the innermost of the three places
 * this allowlist is applied (advertisement, bridge call check, execute-time policy). Three gates
 * rather than one because they fail independently: an advertisement bug leaks a tool *name*, a
 * missing call check leaks an *invocation*, and only the policy sits below both.
 */
export const SITE_ASSISTANT_ROLE = 'tovu-site-assistant';

/** The principal id a given project's site assistant acts as. One identity per site, never shared. */
export function siteAssistantPrincipalId(projectId: string): string {
  return `${SITE_ASSISTANT_ROLE}:${projectId}`;
}
