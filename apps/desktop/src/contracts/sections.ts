/**
 * The Runner top nav's sections, and the `desktop.*` tool surface the left-hand chat
 * drives them with.
 *
 * Two chats exist in this app and they must never blur:
 *
 *   - The LEFT chat is Runner's operator agent. It owns the fleet. Its tools are
 *     the `desktop.*` verbs declared here.
 *   - The RIGHT chat is Tovu's own site assistant, which arrives with the Tovu
 *     admin mounted into the main content area. It owns one site's content.
 *
 * ADR-014 fixes the direction: Runner composes site tools plus its own; Tovu never
 * imports Runner tools. Keeping every verb below under a `desktop.` prefix is what
 * makes that boundary mechanical instead of a convention — a site tool can never
 * collide with a fleet tool, so the left chat cannot accidentally edit a post.
 *
 * The converse half of that sentence used to read "and the right chat cannot stop a
 * process", with the prefix as the reason, then (ADR-061) "and `site-assistant-tools.ts`
 * — a SECOND, narrower list — keeps it away from the rest". Both are stale as of
 * 2026-08: the operator decided the two chats should carry identical capability (single
 * developer, single-user desktop app, no second party on either side of the Runner↔Tovu
 * line — see `site-assistant-tools.ts`'s header for the full argument and the residual
 * exposure), so that file now mirrors `runnerToolNames()` instead of excluding from it.
 * Adding a verb below grants it to BOTH chats — that mirror is the current design, not
 * an oversight this file needs to guard against. The prefix still does its own job (no
 * collisions, no unprefixed verb, Tovu never importing a Runner tool by accident); it
 * was just never what separated the two chats' capability, in either era.
 *
 * `RunnerSectionId` values are a public contract. They appear in agent tool schemas
 * and in URLs, so renaming one silently breaks saved conversations and deep links.
 * Add, deprecate, alias — but do not rename in place.
 */

export type RunnerSectionGroupId = 'workspace' | 'work' | 'operations' | 'access';

export type RunnerSectionId =
  | 'home'
  | 'projects'
  | 'templates'
  | 'marketplace'
  | 'tasks'
  | 'generation'
  | 'activity'
  | 'updates'
  | 'deploy'
  | 'diagnostics'
  | 'api-keys'
  | 'settings'
  | 'account';

export interface RunnerSectionGroup {
  id: RunnerSectionGroupId;
  label: string;
}

export interface RunnerSection {
  id: RunnerSectionId;
  group: RunnerSectionGroupId;
  label: string;
  /**
   * Hidden from the nav, but still registered. Seven sections are parked this way
   * (see TODO.md): six because twelve entries was more than the app can currently
   * justify and their shape isn't settled yet, plus `tasks` (owner request, 2026-09-12
   * — remove the icon from the nav without breaking the public `RunnerSectionId`
   * contract or dropping its verbs). Kept in the registry rather than deleted or
   * commented out: a literal comment would break the `RunnerSectionId` union and
   * silently drop their verbs from `runnerToolNames()`, which is a worse outcome than
   * one boolean. Flip to `false` — or delete the line — to bring one back.
   */
  hidden?: boolean;
  /**
   * Written for the model, not for the user. This is what the left chat reads to
   * decide whether a request belongs to this section, so it states what the section
   * governs rather than describing the screen.
   */
  agentDescription: string;
  /** The `desktop.*` verbs this section owns. Empty means read-only/navigation-only. */
  tools: readonly string[];
}

export const RUNNER_SECTION_GROUPS: readonly RunnerSectionGroup[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'work', label: 'Work' },
  { id: 'operations', label: 'Operations' },
  { id: 'access', label: 'Access' },
];

export const RUNNER_SECTIONS = [
  {
    id: 'home',
    group: 'workspace',
    label: 'Home',
    agentDescription:
      'Fleet overview. How many projects exist, which are running, which are unhealthy.',
    tools: ['desktop.status'],
  },
  {
    // Label changed to 'Sites' (owner's vocabulary ruling: a website project is a "site" — see
    // Commit 4's ProjectRecord -> SiteRecord). Id stays `projects` deliberately: RunnerSectionId
    // values are a public contract in agent tool schemas and URLs (see this file's header), same
    // precedent as `id: 'generation'` keeping its id while only `label` moved to 'Media'.
    id: 'projects',
    group: 'workspace',
    label: 'Sites',
    agentDescription:
      'The project list and its lifecycle. Each project is one install dir served by one `tovu serve` OS process on one port, serving exactly one workspace for that process lifetime. Creating, starting, stopping, and opening projects all happen here.',
    // `create_site` keeps ADR-014's exact verb name rather than being renamed to fit
    // this file's shape — that name is already written down as an operator tool.
    tools: [
      'desktop.create_site',
      'desktop.project.list',
      'desktop.project.start',
      'desktop.project.stop',
      'desktop.project.restart',
      'desktop.project.open',
      'desktop.project.delete',
    ],
  },
  {
    id: 'templates',
    group: 'workspace',
    label: 'Templates',
    hidden: true,
    agentDescription:
      "Starter templates a new project is instantiated from. Per ADR-012, creating a site copies a template's data and config into a fresh install dir.",
    tools: ['desktop.template.list', 'desktop.template.inspect'],
  },
  {
    // Visible (not `hidden`) but tool-less on purpose: the owner wants the destination signposted
    // now — agent plugins, themes, and regular plugins will all live here eventually — while
    // `NavLink`'s existing `section.id !== 'projects'` rule keeps it grayed out and inert until one
    // of those three actually ships. An empty `tools` array is this file's documented spelling for
    // "read-only/navigation-only", so this grants the left chat nothing new.
    id: 'marketplace',
    group: 'workspace',
    label: 'Marketplace',
    agentDescription:
      'Where agent plugins, themes, and regular plugins will be discovered and installed across the fleet. Not built yet — no tools here.',
    tools: [],
  },
  {
    id: 'tasks',
    group: 'work',
    label: 'Tasks',
    hidden: true,
    agentDescription:
      'Long-running and queued operator jobs — anything that outlives a single chat turn, including bulk actions across many projects.',
    tools: ['desktop.queue_task', 'desktop.task.list', 'desktop.task.cancel'],
  },
  {
    // Id stays `generation` deliberately: `RunnerSectionId` values are a public contract that
    // appears in agent tool schemas and URLs (see this file's header), so the operator-facing
    // label is what changes here, not the identifier.
    id: 'generation',
    group: 'work',
    label: 'Media',
    agentDescription:
      'Image and video generation across projects, through the multi-provider media gateway.',
    tools: ['desktop.generate_video', 'desktop.generate_image'],
  },
  {
    id: 'activity',
    group: 'operations',
    label: 'Activity',
    agentDescription:
      'Fleet-wide event log and per-project output: spawns, crashes, restarts, health transitions. `tovu serve` only writes to stdout, so if Runner does not capture it nobody can see why a site died.',
    tools: ['desktop.activity.tail', 'desktop.project.logs'],
  },
  {
    id: 'updates',
    group: 'operations',
    label: 'Updates',
    agentDescription:
      'Schema-version drift across projects, and staggered upgrades. Each `tovu serve` self-migrates safely on its own; nothing coordinates or reports drift across the fleet, which is Runner-owned by design.',
    tools: ['desktop.migration.check_drift', 'desktop.migration.upgrade'],
  },
  {
    id: 'deploy',
    group: 'operations',
    label: 'Deploy',
    hidden: true,
    agentDescription: 'Publishing a local project somewhere reachable, and its deploy status.',
    tools: ['desktop.deploy.publish', 'desktop.deploy.status'],
  },
  {
    id: 'diagnostics',
    group: 'operations',
    label: 'Diagnostics',
    hidden: true,
    agentDescription:
      'Support bundles: collect logs, config, and health across projects with redaction applied.',
    tools: ['desktop.diagnostics.bundle'],
  },
  {
    id: 'api-keys',
    group: 'access',
    label: 'Keys & Access',
    hidden: true,
    agentDescription:
      'API keys per project. Tovu issues an `api_key` principal per site for headless access; managing many of them across the fleet is Runner-owned.',
    tools: ['desktop.apikey.issue', 'desktop.apikey.list', 'desktop.apikey.revoke'],
  },
  {
    id: 'settings',
    group: 'access',
    label: 'Settings',
    hidden: true,
    agentDescription:
      "Runner's own configuration, including how provider credentials are held across the fleet.",
    tools: ['desktop.settings.get', 'desktop.settings.set'],
  },
  {
    id: 'account',
    group: 'access',
    label: 'Account',
    hidden: true,
    agentDescription: 'Operator identity for Runner itself, distinct from any single site’s users.',
    tools: ['desktop.account.get'],
  },
  // `as const satisfies` rather than a `: readonly RunnerSection[]` annotation. The annotation
  // widened every `tools` entry to `string`, which left the type system with no vocabulary for
  // "a verb this app actually declares" — so `site-assistant-tools.ts`'s mirror of this list could
  // only be checked at runtime. Preserving the literals is what lets `RunnerToolName` exist, and
  // `satisfies` keeps the shape check the annotation was there for, so nothing about this list got
  // looser.
] as const satisfies readonly RunnerSection[];

/** Navigation is itself a tool — the left chat can move the top nav, not just answer about it. */
export const RUNNER_NAVIGATE_TOOL = 'desktop.navigate';

/**
 * `RUNNER_SECTIONS` read through the interface instead of its literal tuple type.
 *
 * `as const` (above) narrows each entry to exactly the keys it wrote, so `section.hidden` is a type
 * error on the six sections that never declare it — correct, but useless to a filter that has to
 * ask every section. Widening once here keeps the literals available where they are wanted
 * (`RunnerToolName`) without making every consumer restate the optional key.
 */
const SECTIONS: readonly RunnerSection[] = RUNNER_SECTIONS;

const SECTIONS_BY_ID = new Map<string, RunnerSection>(SECTIONS.map((s) => [s.id, s]));

export function findSection(id: string): RunnerSection | undefined {
  return SECTIONS_BY_ID.get(id);
}

/** Nav-visible sections in `group`. Hidden ones stay registered but unrendered. */
export function sectionsInGroup(group: RunnerSectionGroupId): readonly RunnerSection[] {
  return SECTIONS.filter((section) => section.group === group && section.hidden !== true);
}

/**
 * Every nav-visible section, in declaration order and flattened across groups.
 *
 * The top nav is one horizontal row, so it renders sections in a single sequence rather than
 * under the group headings the old vertical rail used. The groups themselves stay in the
 * registry: they still describe what each section owns, and a future overflow menu is the
 * obvious place for them to matter again.
 */
export function visibleSections(): readonly RunnerSection[] {
  return SECTIONS.filter((section) => section.hidden !== true);
}

/**
 * Every `desktop.*` verb this build declares, as a literal union.
 *
 * Derived from {@link RUNNER_SECTIONS} rather than restated, for the same reason `SECTION_IDS` in
 * `runner-tools.ts` is derived: a second hand-maintained copy drifts. Its job is to give
 * `site-assistant-tools.ts`'s mirror of this list something to be checked against at compile time,
 * so that list can never name a verb this app does not actually declare — that gate matters more,
 * not less, now that the two lists are meant to agree, since a typo there would otherwise silently
 * grant a site assistant a tool name Runner's own bridge never advertises.
 */
export type RunnerToolName =
  | typeof RUNNER_NAVIGATE_TOOL
  | (typeof RUNNER_SECTIONS)[number]['tools'][number];

/**
 * Every verb the left chat may call, `desktop.navigate` included. The tool executor
 * gates on this list, so a section that declares no tools grants the agent nothing
 * beyond navigating to it.
 */
export function runnerToolNames(): readonly string[] {
  return [RUNNER_NAVIGATE_TOOL, ...RUNNER_SECTIONS.flatMap((section) => section.tools)];
}
