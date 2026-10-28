import { assistantCliPermissions, type AssistantCliPermissions } from "../headless/assistant-subagents-policy.js";
import { CORE_HOST_SIGNAL_FALLBACK, evaluateHostSignals, type HostSignalOptions } from "./host-signals.js";
/** Product policy shared by the site daemon and Electron host. No I/O or framework imports. */
export const TOOLS_FIRST_RULE = 'Use Tovu tools first. Before any shell command or direct file read/edit/write of site files (themes, content, config), call search_tools describing the job; if no candidate fits, retry with different phrasing or a higher limit. Only if those searches find no suitable Tovu tool may you use native fallbacks. Only after those searches, report the fallback in one line: `Tool gap: <what you needed> — no Tovu tool for it.` Include the queries you searched in <what you needed>. ' +
  'Map shell intents: theme list/read/search → theme_list_files / theme_read_file (find, startLine, lineCount); site/handoff/plugin text → fs_list_files / fs_read_file; page HTML/localhost routes → fetch_published_page (site path, never curl); picked-folder copies → files_copy; images → media_view_image; documents → library_list / library_read (text only; PDFs are download-only, so PDF inspection is a Tool gap). ' +
  'After ONE "Operation not permitted" or permission refusal, do not retry the same kind of command, even with another shell, flags or path spelling. Switch to the mapped tool; otherwise stop and tell the owner in one line: `Tool gap: <job and searched queries> — <denial or missing capability>.` Native fallback gaps are recorded automatically; tool_gaps_list reads that audit. ' +
  'Shell is only for genuine tool gaps: literal paths inside granted roots, no paths computed at run time, no ~/.claude/tool-results or other CLI spill-file reads. Applies to every agent CLI.';

/** Hosted signals override every owner opt-in, including legacy permission-mode overrides.
 * The host injects validated platform facts; absent facts retain the core baseline without I/O.
 * @param required Environment snapshot containing the product's own host policy switches.
 * @param optional Matched shipped facts, resolved at the host boundary before policy evaluation.
 * @returns Whether native assistant tools must remain restricted. @complexity O(1).
 * @example isHostedAssistantRuntime({ env }, { hostSignals });
 */
export function isHostedAssistantRuntime(required: {
  env: Readonly<Record<string, string | undefined>>;
}, optional: HostSignalOptions = {}): boolean {
  const env = required.env;
  const hostSignals = optional.hostSignals ?? evaluateHostSignals({ env, declaration: CORE_HOST_SIGNAL_FALLBACK });
  return env.TOVU_RUNTIME_MODE === 'production' || env.TOVU_HOSTED === '1' || env.TOVU_HOSTED === 'true' ||
    hostSignals.nativeToolsRestricted === true ||
    /^https?:\/\/(?:[^/]+\.)?tovu\.dev(?::\d+)?(?:\/|$)/i.test(env.TOVU_PUBLIC_URL ?? '');
}

/** Names the local env switch that turns Full CLI access off on this machine, or undefined.
 * Hosted runtimes are reported separately. The settings route shows this name so a locked switch
 * explains itself instead of snapping back. Pure, O(1).
 * TOVU_AGENT_NATIVE_FALLBACKS remains an alias; either explicit OFF switch denies access.
 */
export function fullCliEnvLock(required: {
  env: Readonly<Record<string, string | undefined>>;
}, _optional: Record<string, never> = {}): string | undefined {
  const env = required.env;
  if (env.TOVU_AGENT_PERMISSION_MODE === 'restricted') return 'TOVU_AGENT_PERMISSION_MODE';
  if (env.TOVU_AGENT_FORBID_BASH === '1') return 'TOVU_AGENT_FORBID_BASH';
  return (['TOVU_AGENT_FULL_CLI_ACCESS', 'TOVU_AGENT_NATIVE_FALLBACKS'] as const)
    .find(key => ['0', 'false'].includes(env[key] ?? ''));
}

/** One fresh owner grant governs every CLI capability. Missing local settings default ON;
 * failed reads supply false. Request/contextRef fields never participate. Pure, O(1).
 * Platform facts are injected with the same snapshot used for permission-mode policy.
 */
export function resolveFullCliAccess(required: {
  isOwner: boolean; setting?: boolean | undefined; env: Readonly<Record<string, string | undefined>>;
}, optional: HostSignalOptions = {}): boolean {
  const env = required.env;
  return required.isOwner && required.setting !== false && !isHostedAssistantRuntime({ env }, optional) &&
    fullCliEnvLock({ env }, {}) === undefined;
}

/** Compatibility alias; there is no second grant resolver. */
export const resolveAssistantNativeFallbacks = resolveFullCliAccess;

/** Apply the structural owner/host gate before projecting any persisted per-capability choice.
 * The master is a default, not a second veto: individual toggles can be turned back on below it.
 * The host supplies matched facts so the projection shares the launch's host decision.
 * @complexity O(1), a fixed number of permissions. No I/O.
 */
export function resolveAssistantCliPermissions(required: {
  isOwner: boolean; env: Readonly<Record<string, string | undefined>>; settings: AssistantCliPermissions;
}, optional: HostSignalOptions = {}): AssistantCliPermissions {
  if (!resolveFullCliAccess({ isOwner: required.isOwner, env: required.env }, optional)) return assistantCliPermissions({ enabled: false });
  return assistantCliPermissions(required.settings);
}

/** Locked run policy (SEC-assistant-env-isolation-2026-09-07 Finding 2).
 * Owner decision 2026-10-17 supersedes native-tool restrictions for local full-access runs.
 * Historical rationale: those runs retained Read path denies as defense in depth only; Bash
 * could read keys and write other sites, which the owner accepted on 2026-10-17.
 * Owner decision 2026-10-23 supersedes that broader access for the in-app SITE agent:
 * Tovu supplies its site folder to Jini's mandatory filesystem boundary independently of these
 * capability grants. Bash stays available under the CLI sandbox on macOS/Linux; native Windows
 * retains shell access with an explicit warning. Desktop-agent confinement is a separate scope.
 * Bridge/site tool credentials stay scoped.
 * All other principals keep the complete list; native providers must enforce it or refuse spawn.
 */
export const ASSISTANT_DISALLOWED_TOOLS: readonly string[] = [
  "Bash",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "BashOutput",
  "KillShell",
  "Task",
  // Claude Code 2.1.296 names the spawn tool Agent and recognizes Task as its legacy name.
  "Agent",
  "CronCreate",
  "CronDelete",
  "CronList",
  "EnterWorktree",
  "ExitWorktree",
  "RemoteTrigger",
  "Workflow",
  // Read/Grep/Glob path denies remain useful in locked runs and as defense in depth locally.
  // Historical Full CLI access accepted Bash reading these files (owner, 2026-10-17); the site
  // agent's 2026-10-23 filesystem boundary now applies independently. `//`
  // anchors at the filesystem root, so `//**/.tovu/**` covers the folder at any depth; `/proc` is
  // the Linux `/proc/<pid>/environ` route to the env-held key. Confirmed live on Claude Code
  // 2.1.281 under bypassPermissions: Read refused, Grep/Glob return no match on the denied files.
  "Read(//**/.tovu/**)",
  "Read(~/.tovu/**)",
  "Read(//**/*-key*.hex)",
  "Read(//proc/**)",
];


/** Project the one verified grant into native tool denies for both site and desktop hosts.
 * Legacy agent/subagent fields are accepted for compatibility but never establish a grant.
 * The October 17 owner accepted hand-run filesystem access; October 23 limits site agents to
 * their site folder without changing this capability projection. Read path denies remain.
 * @complexity O(t) for t fixed deny entries when enabled, O(1) for the locked policy.
 */
export function resolveAssistantDisallowedTools(required: {
  nativeToolAccess?: boolean; agentId?: string; subagentsEnabled?: boolean;
}, _optional: Record<string, never> = {}): readonly string[] {
  return required.nativeToolAccess
    ? ASSISTANT_DISALLOWED_TOOLS.filter(tool => tool.startsWith("Read("))
    : ASSISTANT_DISALLOWED_TOOLS;
}
