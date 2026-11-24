import type { RunConsentKey } from '@jini-ai/core/contracts/agents';

/** Consent keys whose grant adds no way for the CLI to change anything. Owner decision (A425):
 * a prelaunch card that only asks for these is skipped; the access is still disclosed in the run.
 * - `web`: Web fetch/search only reads.
 * - `subagents`: Task subagents run with the same tools as the CLI itself; every other OFF switch
 *   is still in the plan's keys, so turning this on adds no write path.
 * Every other key needs the card, because its grant can write:
 * - `enabled` (Full CLI access): the master switch over Bash/Edit/Write and the other native fallbacks.
 * - `shell`, `fileWrite`, `userSettings`, `workflows`: run commands, edit files, change personal
 *   skills/settings, schedule work.
 * - `userMcp`: personal MCP servers Tovu neither approves nor logs; any of them may write.
 * - `loginEnvironment`: hands the CLI the owner's shell environment, credentials included.
 * - any key added later: unknown counts as write, so a new switch shows the card until classified here.
 */
export const RUN_READ_ONLY_CONSENT_KEYS: readonly RunConsentKey[] = Object.freeze(['web', 'subagents']);

/** Words the consent card uses for the read-only switches. */
const READ_ONLY_LABELS: Readonly<Record<string, string>> = { web: 'Web fetch/search', subagents: 'Subagents/Task' };

/** True when any requested consent key could let the run write. Pure, O(k).
 * @example runHasWriteAccess({ keys: ['web'] }); // false
 */
export function runHasWriteAccess(required: { keys: readonly string[] }, optional: { readOnlyKeys?: readonly string[] } = {}): boolean {
  const readOnly = new Set<string>(optional.readOnlyKeys ?? RUN_READ_ONLY_CONSENT_KEYS);
  return required.keys.some(key => !readOnly.has(key));
}

/** The prelaunch access disclosure shown in place of the card. Pure.
 * @example readOnlyAccessDisclosure({ name: 'Cli', keys: ['web'] });
 */
export function readOnlyAccessDisclosure(required: { name: string; keys: readonly string[] }, _optional = {}): string {
  const labels = new Intl.ListFormat('en', { type: 'conjunction' }).format(required.keys.map(key => READ_ONLY_LABELS[key] ?? key));
  const pronoun = required.keys.length === 1 ? 'it' : 'them';
  return `${required.name} runs with ${labels} on. ${required.name} can't run with ${pronoun} off, so this also applies to its other chats on this site. `
    + 'Tools provided here: Tovu and Jini tools, enabled plugin tools, and connected servers.';
}

export interface ReadOnlyRunAccessInput {
  name: string; agentId: string; keys: readonly string[];
  readFresh: () => Promise<{ allowed: boolean; revisionSeq: number }>;
  isLive: () => Promise<boolean>;
  allow: (input: { agentId: string; keys: readonly string[]; expectedRevisionSeq: number }) => Promise<boolean>;
  disclose: (input: { detail: string }) => Promise<void>;
}

/** Turn on a no-write plan's keys without a card, with the same fresh-owner and revision checks the
 * card's Allow uses. Returns false (and grants nothing) whenever the card must be shown instead:
 * a write key, an owner the fresh settings no longer allow, a finished run, or a stale save.
 */
export async function grantReadOnlyRunAccess(required: ReadOnlyRunAccessInput, optional: { readOnlyKeys?: readonly string[] } = {}): Promise<boolean> {
  const { name, agentId, keys } = required;
  if (keys.length === 0 || runHasWriteAccess({ keys }, optional)) return false;
  const fresh = await required.readFresh();
  if (!fresh.allowed || !(await required.isLive())) return false;
  if (!(await required.allow({ agentId, keys, expectedRevisionSeq: fresh.revisionSeq }))) return false;
  await required.disclose({ detail: readOnlyAccessDisclosure({ name, keys }) });
  return true;
}
