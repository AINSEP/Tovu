import { contributeCommentsTools } from "../comments/tool-registrations";
import { contributeContentTypesTools } from "../features/content-types/tool-registrations";
import { contributeEntriesTools } from "../features/entries/tool-registrations";
import { contributePluginsTools } from "../features/plugin-runtime/tool-registrations";
import { contributeRecoveryTools } from "../features/recovery/tool-registrations";
import { contributeTaxonomyTools } from "../features/taxonomy/tool-registrations";
import { contributeFormsTools } from "../forms/tool-registrations";
import { contributeIdentityTools } from "../identity/tool-registrations";
import { contributeMembersTools } from "../members/tool-registrations";
import { contributeMenusTools } from "../navigation/tool-registrations";
import { contributeNewsletterTools } from "../newsletter/tool-registrations";
import { contributeRedirectsTools } from "../redirects/tool-registrations";
import { contributeWidgetsTools } from "../widgets/tool-registrations";

/**
 * @file The server composition manifest for `assistant/tool-contribution-registry.ts`: the one file
 * that decides which first-party features' AI tools are installed into the catalog, by calling each
 * one's own `contribute<Domain>Tools()` explicitly.
 *
 * Shape: `server composition manifest -> feature contribution installers -> assistant registry ->
 * final tool catalog` (2026-08-17 design, following the `mcp-federation/presets.ts` precedent
 * already in this codebase — see `tool-contribution-registry.ts`'s header for the full rationale).
 * This file plays the role `agent-daemon-server.ts` plays for MCP federation presets
 * (`registerSupabaseMcpPreset()`), just for AI-tool contributions and shared by BOTH real
 * composition roots instead of being called from one.
 *
 * `server` is the right layer for this, not `assistant`: `assistant` must not import a feature by
 * name (that is precisely the edge that used to close the `[assistant, comments, features/plugins,
 * newsletter]` module cycle), but `server` already imports most first-party features by name
 * throughout `server/deps.ts`/`server/app.ts` — this file adds no new module-level edge that did not
 * already exist, it just adds one more file-level reason for edges that were already there.
 *
 * 13 of the ~24 assistant-wired domains are listed here today (2026-08-17: `comments`/`newsletter`
 * from Stage 1 of the registry rollout, `identity`/`members`/`taxonomy`/`redirects` added in Stage 2
 * batch 1 — `themes` was also tried in that batch and reverted, see `assistant/tool-registrations.ts`'s
 * header for why — and `widgets`/`content-types`/`forms`/`menus`/`recovery`/`plugins`/`entries` added
 * in Stage 2 batch 2, `widgets` converted FIRST in that batch specifically to remove the
 * `assistant -> widgets` static edge before `content-types`/`forms`/`entries` converted, since all
 * three are imported by `widgets`. `database` was ALSO tried in the same batch and reverted — see
 * `assistant/tool-registrations.ts`'s own
 * `DOMAIN_SLICES` entry comment for why: a much larger 16-module SCC than the `themes`/`post`
 * near-misses in the prior batch). The rest still wire through
 * `assistant/tool-registrations.ts`'s own `DOMAIN_SLICES` array, unchanged — see that file's header
 * for why (its own array still names exactly which domains those are). `post` was also tried and
 * reverted the same night as Stage 1: converting it opened a NEW module cycle (`assistant -> widgets ->
 * features/post -> assistant`, since `widgets`/`export` both depend on `post` while `assistant`
 * still statically depends on `widgets`) — see `features/post/tool-registrations.ts`'s trailing
 * comment. `widgets`' own later conversion (Stage 2 batch 2) closes the `widgets` half of that risk,
 * but `export` still depends on `post` and `assistant` still reaches `export` transitively through
 * the still-static `deployments`/`source-control` entries, so `post` stays unconverted and out of
 * scope regardless. A later pass converts the rest the same way, checking for this same "does
 * anything else depend on me" shape per domain first; nothing about this file's shape changes when
 * it does, only its import list and the body of `installFirstPartyToolContributors` grow.
 *
 * Idempotent: `registerToolContributor` (what each `contribute<Domain>Tools()` call ultimately
 * calls) replaces an existing entry by domain key rather than appending, so calling this function
 * more than once in the same process — a real thing both real callers below do NOT do (each calls
 * it exactly once, at boot), but that a shared test process legitimately might — is safe and leaves
 * the registry in the same state as calling it once.
 *
 * Real callers (must run this BEFORE their own `buildAssistantToolRegistrations` call, since that
 * function reads whatever is currently registered):
 * - `server/agent-daemon/agent-daemon-server.ts` (the spawned agent daemon's own boot).
 * - `server/modules/assistant-byok.ts`'s `createAssistantByokModule` (the in-process BYOK path).
 *
 * NOT third-party plugin tool contributions: those must still enter through this same
 * `registerToolContributor` seam eventually, but gated behind the SPEC-005 plugin runtime's own
 * policy checks, not auto-discovered from disk and installed unconditionally the way the calls below
 * are — plugin/data-module membership (`declareDataModule`) and AI-tool membership are deliberately
 * two different systems (see the 2026-08-17 architecture addendum this file implements).
 */
export function installFirstPartyToolContributors(): void {
  contributeCommentsTools();
  contributeContentTypesTools();
  contributeEntriesTools();
  contributeFormsTools();
  contributeIdentityTools();
  contributeMembersTools();
  contributeMenusTools();
  contributeNewsletterTools();
  contributePluginsTools();
  contributeRecoveryTools();
  contributeRedirectsTools();
  contributeTaxonomyTools();
  contributeWidgetsTools();
}
