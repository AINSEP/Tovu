ACK_PACKET_RECEIVED CTX-SLASH-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

**Held: Option 1 (presence-only deferral + host-side capability projection) is still the recommendation.** What changed this run is everything *underneath* it — reading Codex's real Round 2 text (packet appendix lines 149–1144) surfaced one architectural fact I had wrong, one self-consistency gap in my own contract that I'd only previously enforced against someone else's code, and one live bug in Codex's own implementation of an idea I'm now adopting. None of these flip the recommendation; all three change what "final" code has to look like.

**1. Reconciling with Codex's real design, by name — where it's right and I move.**

Codex's central architectural claim is that descriptors must be **data, not closures**, because Tovu's real capability sources aren't reachable by direct import (`ComposerHostBinding { type: string; data?: JSON }`, packet lines 233–237). I checked this against `files/tovu/AssistantDock.tsx:114-119` myself rather than taking either Codex's or Opus's citation on faith, and it's right: *"Tool execution is not a prop here — it happens server-side: the spawned coding-agent CLI gets `.mcp.json`-injected access to Tovu's registered tools (`src/assistant/tool-registrations.ts`) and calls them through the daemon's `/api/delegated-tool-calls` gate."* That sentence kills my own Round 2/3 code outright: section 7 of my R3 answer had `import { runResearchTool } from "../../assistant/tool-registrations"` — a same-process import of a module the file I'm importing it into itself documents as daemon-side, reached only through an HTTP gate the agent CLI calls, never the browser. I flagged that import as "illustrative, not verified" last round; it's worse than unverified, it contradicts evidence already in the packet. **Correction, credited to Codex's real text: withdrawn.**

But I don't take Codex's whole remedy. Codex's fix is a serializable `execute.binding` resolved by an opaque `executeTovuComposerCapability({capabilityId, argumentText})` (packet lines 987-1042) whose actual body is never shown — it's asserted, not coded, exactly the same "trust me" gap my own `runResearchTool` import had, just pushed one layer further into an unshown host function. Tracing *why* the browser can't call `tool-registrations.ts` directly — no UI→tool-call path exists, only the agent CLI's own reasoning loop does — leads to the same place Opus's R2 "Strongest Counter-Argument" named and half-answered: **`/search` cannot be a direct API call on today's evidence; it can only be a well-formed instruction the user reviews and sends, which the agent's own already-proven tool loop then acts on.** Opus called the risk of this "Option A wearing a costume." On the evidence actually in front of me, that's not a risk to avoid, it's the honest shape: `/search <query>` composes `"Use the search tool: <query>"` into the draft and stops — no `ComposerHostBinding`, no execute-binding-type dispatch, no unshown resolver function, because there is nothing left for either of those to route to that a macro doesn't already cover. This simplifies the leading option relative to both my own and Codex's Round 2 code: the elaborate binding-type union solves a problem (routing execution to different backends) that, once the agent-CLI constraint is taken seriously, doesn't exist for either of the two required commands.

Where Codex is right and I'm adopting it beyond that one correction:

- **Registry *enumeration* must be async, not a static array.** If `tool-registrations.ts` metadata lives daemon-side, the composer can't even *list* those ~20 capabilities from a compile-time constant — same problem as execution, one layer earlier. I'm adopting Codex's `TovuCapabilityProjectionSource.snapshot(): Promise<...>` shape (packet lines 825-829), but grounded in evidence Codex didn't cite: this exact file already has the pattern proven and working — `fetchAgents()` (`AssistantDock.tsx:142-149`, `credentials: "same-origin"`, tolerant `if (!response.ok) return []`). My async projection source below is that pattern, not Codex's abstract one.
- **Filtering must exact-match the command once an argument is being typed.** Codex's own regression test (packet lines 501-526, `/mcp` vs `/mcp-docs`) exercises something my R2/R3 `filterComposerDiscovery` never did: I passed `slashQuery.command` through the *same substring search* used for bare-word typing, at every stage. Once a user types `/mcp supabase`, my old code would still show a hypothetical `/mcp-docs` row (any row whose keywords/label contain "mcp" as a substring survives `searchable.includes("mcp")`), and worse — if that row were selected, my `argument` value (derived fresh from the current draft, not tied to which row matched) would hand `mcp-docs`'s handler an argument string that was actually typed for `/mcp`. That's a real bug, not a hypothetical; fixed below, credited to Codex's test shape.
- **A double-invocation guard.** Codex's `runDiscovery` guards re-entrancy with `if (discoveryPendingRef.current) return;` (packet line 569). My R2/R3 `notifyDiscovery` had no such guard — a fast double-Enter during an in-flight await could fire a second `onDiscoverySelect` before the first resolves, which for a future `needsConfirmation`-gated capability means the effect could run twice. Adopted below.

Where I checked Codex's code carefully and it doesn't hold up — see "Critique" below for the two I can prove from the packet text itself.

**2. Prior conclusions carried forward, one explicitly retracted.** The recommendation (Option 1), the anchored-grammar argument, the "package never learns `kind`" boundary, and the Lexical rejection are unchanged — nothing in Codex's real text touches them. **Retracted:** the `runResearchTool` same-process import and the synchronous `TovuCapabilityDescriptor[]` array as the *whole* registry story (see above) — that's the one place Codex's real text changed a conclusion rather than just hardening it.

**3. Prior corrections held, unchanged:**
- The fabricated `requestPendingConfirmation`/`openCapabilityPreviewModal` reuse claims stay withdrawn; nothing in Codex's text bears on them (Codex's own confirmation story is prose, not code — see "What Would Change My Mind").
- The `disabled`-textarea critique of gemini-3.1-pro-high-round2 stands. New research this round actually *reinforces* the underlying caution rather than pointing at Codex's alternative as the fix: Codex avoided `disabled` in favor of `readOnly` (`readOnly={discoveryPending}`, packet line 696) — which does dodge the focus-loss problem ([MDN: "read-only controls can still function and are still focusable, whereas disabled controls can not receive focus"](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/readonly)) but trades it for a *different* one: [Adrian Roselli's analysis of read-only controls](http://adrianroselli.com/2024/11/avoid-read-only-controls.html) documents inconsistent AT exposure — JAWS announces `readonly`, NVDA doesn't announce `aria-readonly` on native inputs, and TalkBack "announce[s] the fields as 'disabled,' not 'read-only'" — meaning a mobile screen-reader user hits the exact same wrongly-perceived-as-disabled experience `readOnly` was supposed to avoid. My design touches neither `disabled` nor `readOnly` during the pending window — an `aria-live` announcement plus the new re-entrancy/staleness guards below — which this research makes a *stronger* choice than it was last round, not just an untested alternative to Codex's.
- The dead `range`-tuple critique of both Gemini R2 designs stands, and is now cross-checked against Codex's real code, not just Gemini's: Codex's own `ComposerSlashInvocation.trigger: {start, end, text}` (packet lines 297-301) is *also* never assigned anything but `{start: 0, end: draft.length, text: match[0]}` (packet lines 374-378) — the anchored grammar guarantees this in every design that keeps it anchored, including Codex's. So the *span* generality is confirmed dead a second time, independently. What I hadn't credited before finding it in Codex's code: the `text` field of that same tuple is used for something real — a staleness check before an async draft mutation. I'm taking that *idea* (see below) without taking the tuple shape that carries it, because Codex's own call site doesn't actually need the span, only a before/after string comparison.
- The `draft.startsWith('/')` regression (gemini R2) stands unchanged; not addressed by Codex's text either way.

## Sources

- [MDN — `readonly` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/readonly) — confirmed: "read-only controls can still function and are still focusable, whereas disabled controls can not receive focus." Grounds why Codex's `readOnly` choice avoids the specific `disabled`/focus-loss bug I found in gemini-3.1-pro-high-round2 last round.
- [Adrian Roselli — "Avoid Read-only Controls"](http://adrianroselli.com/2024/11/avoid-read-only-controls.html) — confirmed a *different* problem with `readonly`: inconsistent screen-reader exposure across JAWS/NVDA/TalkBack, with TalkBack specifically announcing `readonly` fields as "disabled." New this round — used to justify NOT adopting Codex's `readOnly` toggle even though it's a genuine improvement over `disabled`; the safest choice remains touching neither attribute.
- Everything else this round is grounded directly in `files/jini/*`, `files/tovu/*`, and the packet's own appendix text (`PACKET-R3.md`, cited by line number since Codex's Round 2 code isn't a checked-in file) — see inline `path:line` citations throughout.
- Carried forward unchanged from Round 2/3 (re-verified sources, not re-fetched this round since nothing about them is in question): [W3C WAI-ARIA APG — Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/), [MDN — `aria-activedescendant`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant), [Sarah Higley — "Aria-activedescendant is not focus"](https://sarahmhigley.com/writing/activedescendant/), [assistant-ui — Slash Commands guide](https://www.assistant-ui.com/docs/guides/slash-commands), [Slack — Implementing slash commands](https://docs.slack.dev/interactivity/implementing-slash-commands/), [OpenAI Codex — PR #23964](https://github.com/openai/codex/pull/23964).

## Solution Slate

**Ranking criteria, stated before ranking (unchanged from R3):** (1) satisfies the packet's four required deliverables literally; (2) never lets `@jini-ai/chat` learn a host taxonomy or grow a per-kind dispatch table (`slots.ts:77-80`); (3) every claimed capability is grounded in a file actually in evidence, or honestly flagged as a gap; (4) the trigger grammar's safety argument is checkable by inspection.

### Option 1 — Presence-only deferral + async host-side capability projection (RECOMMENDED, hardened again this round)

**Mechanism:** same shape as R2/R3 — `ComposerDiscoveryItem` grows `command`/`argument`/`needsConfirmation`/`previewable` as presence-only fields (see "the new `command` field" below for why one more field than R3 had); `onDiscoverySelect` gains an optional `{draft?: string}` outcome; the parser stays anchored `^...$`. What's different from R3: (a) the Tovu-side registry is now a genuine async projection over static + daemon-fetched sources, not a synchronous array; (b) `/search` and any future `tool-registrations.ts`-sourced command compose agent-directed draft text instead of assuming direct execution; (c) the async round-trip has a re-entrancy guard and a correctly-implemented staleness check (Codex had the right idea, wrong variable — see Critique).

**Genuine sacrifice, sharpened again:** no live value-completion inside an argument (unchanged — still empirically the same corner every reference implementation I can check also cuts) **and now also**: no synchronous "the answer appears in the draft instantly" UX for anything sourced from `tool-registrations.ts` — selecting `/search cats` inserts a request, it does not insert a result. That's not a corner this design chose to cut; it's the corner the actual execution architecture (`AssistantDock.tsx:114-119`) has already cut, upstream of any composer design. A design that hides this (mine did, through R3; so did Codex's, through an unshown resolver) is claiming a capability that isn't evidenced.

### Option 2 — Port OD's caret-aware `TriggerPlugin` model (Lexical) — still rejected, unchanged reasoning from R3

Nothing in Codex's real text bears on the Lexical question at all — Codex's Round 2 answer never discusses OD's Lexical composer. R3's finding stands: OD's own `TriggerPlugin` slash regex (`LexicalComposerInput.tsx:334`) is the identical anchored, no-argument pattern this design already extends, so porting it buys atomic mention pills and nothing else this debate's deliverables ask for.

### Option 3 — Codex's serializable `ComposerHostBinding` + execute-binding-type dispatch — considered and folded into Option 1, not adopted whole

Real design, real code, genuinely the thing to reconcile with this round. Its core insight (descriptors must be data, not closures, because the real capability sources aren't in-process) is *right* and is now load-bearing in Option 1's registry-enumeration story. What I'm not taking: the `ComposerHostBinding{type, data}` + `permission` + JSON-`schema` machinery for *execution*. Once the agent-CLI constraint is taken seriously, every argument-bearing capability in evidence reduces to "compose text, let the user send it" — there is no second binding type left to dispatch on. Building the dispatch union anyway would be protocol machinery paid for today and cashed by nobody, the same standard I applied to the Gemini R2 `range` tuple and now apply to Codex's `execute.binding.type` switch: it's declared, and in Codex's own shown code, only ever resolves through one path (`executeTovuComposerCapability`) whose body is never shown to actually branch on it either.

**Recommendation: Option 1. Cheapest falsifying test (unchanged core, restated against this round's evidence):** ship `/mcp <server-id>` (navigates or inserts a hint) and `/search <query>` (inserts an agent-directed instruction) exactly as specified below. If users report that `/search` "didn't do anything" because they expected an inline result rather than a composed request awaiting Send, that's the signal that a *direct*, non-agent-mediated search endpoint is wanted badly enough to justify building one (a new Tovu-owned route, following the `mcp-ui-tool-calls-route.ts`/`a2ui-actions-route.ts` precedent) — at which point `ComposerHostBinding`-style dispatch becomes worth its cost, because there would finally be two real binding types to switch on instead of one asserted and zero shown.

## Leading Option — Code

### 1. The descriptor contract (`files/jini/slots.ts`)

```ts
/**
 * Declares that a `ComposerDiscoveryItem` accepts a trailing argument, e.g. `/mcp <server-id>`.
 * The package reads only its PRESENCE — never a value, never a host taxonomy (see `kind`'s own
 * law below, unchanged across every round of this debate). `required` lets the package decline
 * Enter/Tab (not the row's existence) until at least one character has been typed after the
 * separator; it never inspects what that character is.
 */
export interface ComposerDiscoveryArgument {
  placeholder: string;
  required?: boolean;
}

export interface ComposerDiscoveryItem {
  id: string;
  /** Rendered for display; crosses `useT()` (`ComposerDiscovery.tsx`'s `props.t(match.item.label)`) —
   * may vary by locale. */
  label: string;
  description?: string;
  kind?: string;
  keywords?: readonly string[];
  insertText?: string;
  /**
   * NEW this round. Stable, UNTRANSLATED command word matched against typed input, e.g. `"mcp"` for
   * `/mcp`. Items with no `command` never participate in slash-trigger filtering (plus-menu only).
   * Added specifically because `label` cannot safely double as a match key once an argument is being
   * typed — see `filterComposerDiscovery` below and "Critique" for the concrete failure this closes.
   * This is the same rule I applied to gemini-3.1-pro-high-round2's `item.label`-derived match key
   * last round without noticing my own `label`-as-command shortcut had the identical latent defect;
   * closing it here is a self-correction, not just a critique of someone else's code.
   */
  command?: string;
  /** See {@link ComposerDiscoveryArgument}. Absent (and safely ignorable) for macro-only items. */
  argument?: ComposerDiscoveryArgument;
  /**
   * True when the host must gate this item's effect behind a confirmation step before it commits.
   * Same deferral shape as `argument`. Neither of today's two required commands (`/mcp`, `/search`)
   * sets this — it exists for N4's "capabilities I haven't thought of yet." Honest caveat, unchanged
   * from R3 but now informed by Codex's real text rather than a guess: Codex's Round 2 answer asserts
   * (packet lines 1100-1115) that a genuinely consequential capability needs the SAME two-phase
   * prepare/redeem shape Tovu already uses for MCP-UI (`PendingConfirmationStore`,
   * `src/assistant/mcp-ui-tool-calls-route.ts`, reached via `AssistantDock.tsx:53-73`'s
   * `createMcpUiToolCaller`) rather than a client-only boolean gate — and I think that's right as a
   * caution, but neither Codex's Round 2 code nor mine actually implements a working prepare/redeem
   * flow for THIS feature; it's prose in both cases. Left as a documented gap, not built unexercised,
   * consistent with this design's own ranking criterion #3.
   */
  needsConfirmation?: boolean;
  previewable?: boolean;
}

export interface ComposerDiscoverySelection {
  item: ComposerDiscoveryItem;
  source: 'plus' | 'slash';
  argument?: string;
}

export interface ComposerDiscoveryOutcome {
  draft?: string;
}

export type ComposerDiscoverySelect = (
  selection: ComposerDiscoverySelection,
) => void | ComposerDiscoveryOutcome | Promise<void | ComposerDiscoveryOutcome>;

export interface ComposerSlots {
  plusMenuItems?: ComposerPlusItem[];
  discoveryGroups?: readonly ComposerDiscoveryGroup[];
  onDiscoverySelect?: ComposerDiscoverySelect;
  onDiscoveryPreview?: (item: ComposerDiscoveryItem) => void;
  mentionSources?: MentionSource[];
  leadingAccessories?: ReactNode;
  footerAccessories?: ReactNode;
  onAttach?: (a: ChatAttachment) => void;
  annotationAdapter?: AnnotationAdapter;
}
```

### 2. Trigger grammar + FIXED filter + tests (`files/jini/composer-discovery.ts`)

```ts
import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from '../slots.js';

export interface ComposerDiscoveryMatch {
  groupId: string;
  groupLabel: string;
  item: ComposerDiscoveryItem;
}

/**
 * A parsed `/command` or `/command argument…` token, anchored to the WHOLE draft — not a
 * `[start, end]` span. Deliberately kept end-to-end anchored: `replaceComposerSlashTrigger` needs
 * no `range` tuple because when this returns non-null, the draft contains NOTHING but the trigger.
 * Checked against Codex's real Round 2 code this round, not just Gemini's: Codex's own
 * `ComposerSlashInvocation.trigger` (packet lines 297-301) is ALSO never assigned anything but
 * `{start: 0, end: draft.length}` (packet lines 374-378) under its own anchored grammar — three
 * independent Round 2 designs now confirm the span is unexercised generality under this grammar.
 * Revisit only if a trigger is ever allowed to start mid-draft.
 */
export interface ComposerSlashQuery {
  command: string;
  argument: string | null;
}

const SLASH_QUERY_RE = /^\/([^\s/]*)(?:(\s+)([\s\S]*))?$/;

export function parseComposerSlashQuery(draft: string): ComposerSlashQuery | null {
  const match = draft.match(SLASH_QUERY_RE);
  if (!match) return null;
  const [, command, separator, rest] = match;
  return { command: command ?? '', argument: separator === undefined ? null : (rest ?? '') };
}

/**
 * FIXED this round. R2/R3 took just `query.command: string` and always did a substring search
 * against translated `label`/`description`/`keywords`. That has two bugs, both closed here:
 *
 * 1. i18n match-key bug (self-correction — I only caught this in gemini-3.1-pro-high-round2's code
 *    last round, not my own): matching against `label`, which is translated at render time
 *    (`props.t(match.item.label)`), breaks the instant a second locale exists. Fixed by matching
 *    against the new, untranslated `item.command` once a command is locked in.
 * 2. Exact-match-after-argument bug, credited to Codex's Round 2 regression test (packet lines
 *    501-526, `/mcp` vs `/mcp-docs`): once a space has been typed (`query.argument !== null`), a
 *    substring search can still surface an unrelated row (e.g. a hypothetical `/mcp-docs`) whose
 *    keywords happen to contain "mcp". Worse than a display glitch — if that row were then
 *    selected, the typed argument (re-derived from the current draft, not tied to which row
 *    matched) would be handed to the WRONG item's effect. Fixed by requiring an exact
 *    `item.command` match once `query.argument !== null`.
 */
export function filterComposerDiscovery(
  groups: readonly ComposerDiscoveryGroup[],
  query: ComposerSlashQuery,
): ComposerDiscoveryMatch[] {
  const normalizedCommand = query.command.trim().toLowerCase();
  const commandLocked = query.argument !== null;
  const matches: ComposerDiscoveryMatch[] = [];

  for (const group of groups) {
    for (const item of group.items) {
      if (!item.command) continue; // no command word: plus-menu only, never slash-filterable
      const itemCommand = item.command.toLowerCase();

      if (commandLocked) {
        if (itemCommand !== normalizedCommand) continue;
      } else {
        const searchable = [item.command, item.label, item.description, item.kind, ...(item.keywords ?? [])]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .toLowerCase();
        if (normalizedCommand !== '' && !searchable.includes(normalizedCommand)) continue;
      }

      matches.push({ groupId: group.id, groupLabel: group.label, item });
    }
  }

  return matches;
}

/**
 * The ONLY guard is re-deriving validity from the draft itself, never a `draft.startsWith('/')`
 * substring check (the gemini-3.1-pro-high-round2 regression, unchanged finding from R2/R3).
 */
export function replaceComposerSlashTrigger(draft: string, insertText: string): string {
  return parseComposerSlashQuery(draft) === null ? draft : insertText;
}

export function appendComposerDiscovery(draft: string, insertText: string): string {
  if (draft.trim() === '') return insertText;
  return `${draft.trimEnd()} ${insertText}`;
}

export type ComposerSlashKeyAction =
  | { type: 'move'; offset: -1 | 1 }
  | { type: 'select' }
  | { type: 'dismiss' }
  | { type: 'none' };

export function resolveComposerSlashKeyAction(key: string, shiftKey: boolean): ComposerSlashKeyAction {
  if (key === 'ArrowDown') return { type: 'move', offset: 1 };
  if (key === 'ArrowUp') return { type: 'move', offset: -1 };
  if ((key === 'Enter' || key === 'Tab') && !shiftKey) return { type: 'select' };
  if (key === 'Escape') return { type: 'dismiss' };
  return { type: 'none' };
}
```

`files/jini/__tests__/composer-discovery.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  filterComposerDiscovery,
  parseComposerSlashQuery,
  replaceComposerSlashTrigger,
} from '../composer-discovery.js';
import type { ComposerDiscoveryGroup } from '../../slots.js';

describe('parseComposerSlashQuery', () => {
  it('returns null for a non-trigger draft', () => {
    expect(parseComposerSlashQuery('hello')).toBeNull();
    expect(parseComposerSlashQuery('')).toBeNull();
  });
  it('parses a bare command with no argument typed yet', () => {
    expect(parseComposerSlashQuery('/mcp')).toEqual({ command: 'mcp', argument: null });
  });
  it('commits to a command the instant a trailing space is typed', () => {
    expect(parseComposerSlashQuery('/mcp ')).toEqual({ command: 'mcp', argument: '' });
  });
  it('parses a command with a typed argument, keeping internal spaces/slashes', () => {
    expect(parseComposerSlashQuery('/search site:foo.com/bar baz')).toEqual({
      command: 'search',
      argument: 'site:foo.com/bar baz',
    });
  });
  it('rejects a second slash in the COMMAND position and text before the leading slash', () => {
    expect(parseComposerSlashQuery('/mc/p')).toBeNull();
    expect(parseComposerSlashQuery('hi /mcp')).toBeNull();
  });
});

describe('filterComposerDiscovery — exact match once an argument is being typed', () => {
  // Regression test for the bug credited to Codex's Round 2 test (packet lines 501-526): before
  // this fix, `/mcp-docs` would still substring-match once the user was mid-argument on `/mcp`.
  const groups: ComposerDiscoveryGroup[] = [
    {
      id: 'commands',
      label: 'Commands',
      items: [
        { id: 'mcp', label: '/mcp', command: 'mcp', keywords: ['mcp', 'server'], argument: { placeholder: '<server-id>' } },
        { id: 'mcp-docs', label: '/mcp-docs', command: 'mcp-docs', keywords: ['mcp-docs', 'mcp', 'docs'] },
      ],
    },
  ];

  it('shows both while the command word is still being typed', () => {
    const query = parseComposerSlashQuery('/mcp')!;
    expect(filterComposerDiscovery(groups, query).map((m) => m.item.id).sort()).toEqual(['mcp', 'mcp-docs']);
  });

  it('narrows to the exact command the instant an argument begins, even though "mcp" is a substring of "mcp-docs"', () => {
    const query = parseComposerSlashQuery('/mcp supabase')!;
    expect(filterComposerDiscovery(groups, query).map((m) => m.item.id)).toEqual(['mcp']);
  });

  it('never uses the translated label as the match key (i18n regression)', () => {
    // A translated label ("/servidor-mcp") must not affect matching — only `item.command` does.
    const localizedGroups: ComposerDiscoveryGroup[] = [
      { id: 'commands', label: 'Commands', items: [{ id: 'mcp', label: '/servidor-mcp', command: 'mcp' }] },
    ];
    const query = parseComposerSlashQuery('/mcp')!;
    expect(filterComposerDiscovery(localizedGroups, query).map((m) => m.item.id)).toEqual(['mcp']);
  });
});

describe('replaceComposerSlashTrigger stays safe once arguments are allowed', () => {
  it('replaces command + separator + argument together, never a substring', () => {
    expect(replaceComposerSlashTrigger('/mcp supabase', '')).toBe('');
  });
  it('is a no-op the instant the draft stops being ONLY the trigger', () => {
    expect(replaceComposerSlashTrigger('hello /mcp supabase', 'x')).toBe('hello /mcp supabase');
  });
  it('is a no-op for a draft that merely starts with "/" but is not a valid trigger (gemini-3.1-pro-high R2 regression)', () => {
    expect(replaceComposerSlashTrigger('/mc/p', 'x')).toBe('/mc/p');
  });
});
```

### 3. Execution seam + accessibility (`files/jini/Composer.tsx`)

```tsx
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { RemixIcon } from '@jini-ai/ui';
import { useT } from '../hooks/context.js';
import { AttachmentTray } from './AttachmentTray.js';
import type { UseComposerResult } from '../hooks/useComposer.js';
import type { ComposerDiscoveryItem, ComposerSlots } from '../slots.js';
import { ComposerDiscoveryMenu, ComposerSlashMenu } from './ComposerDiscovery.js';
import {
  appendComposerDiscovery,
  filterComposerDiscovery,
  parseComposerSlashQuery,
  replaceComposerSlashTrigger,
  resolveComposerSlashKeyAction,
} from './composer-discovery.js';

// ...ComposerProps unchanged from files/jini/Composer.tsx:29-52...

export function Composer({ composer, onSend, disabled = false, sendDisabled = false, placeholder, slots, attachmentPicker, running = false, onCancel }: ComposerProps) {
  const t = useT();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [discoveryMenuOpen, setDiscoveryMenuOpen] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [dismissedSlashDraft, setDismissedSlashDraft] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  // Deliberately never wired to the textarea's `disabled` OR `readOnly` prop. `disabled` breaks the
  // WAI-ARIA APG combobox contract (a disabled control cannot hold DOM focus). `readOnly` avoids
  // THAT specific problem but trades it for a different one, confirmed this round: Roselli's
  // analysis of read-only controls documents TalkBack announcing `readonly` fields as "disabled"
  // anyway, and NVDA not announcing `aria-readonly` at all on native inputs — so `readOnly` doesn't
  // reliably deliver the thing it's for. An `aria-live` announcement, with no attribute change on
  // the control itself, is the only choice with no known AT-inconsistency cost.
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  // NEW this round, credited to Codex's Round 2 `discoveryPendingRef` (packet line 542, guard at
  // line 569) — a fast double-Enter/double-click during an in-flight await could otherwise fire a
  // second `onDiscoverySelect` before the first resolves.
  const discoveryPendingRef = useRef(false);
  const resolvedPlaceholder = placeholder ?? t('Send a message…');
  const discoveryGroups = slots?.discoveryGroups ?? [];
  const hasDiscoveryItems = discoveryGroups.some((group) => group.items.length > 0);
  const slashQuery = parseComposerSlashQuery(composer.draft);
  const slashMatches = slashQuery === null ? [] : filterComposerDiscovery(discoveryGroups, slashQuery);
  const slashOpen = slashMatches.length > 0 && dismissedSlashDraft !== composer.draft;

  function restoreComposerFocus() {
    textareaRef.current?.focus();
  }

  /**
   * Awaits the host's effect instead of discarding the promise — fixes `Composer.tsx:89` as it
   * reads TODAY, unmodified: `void slots?.onDiscoverySelect?.({ item, source });`.
   *
   * Stale-write guard, credited to Codex's Round 2 `runDiscovery` (packet lines 561-644), which has
   * the identical idea in a comment — "Prevent a stale async completion from overwriting a newer
   * draft" — but doesn't actually deliver it: its call site is
   * `replaceComposerSlashTrigger(originalDraft, slash, mutation.text)` (packet lines 602-607), where
   * `originalDraft` is the SAME string `slash` (the invocation) was parsed from moments earlier at
   * the top of the same function (packet line 571: `const originalDraft = composer.draft;`, read
   * BEFORE the `await`). `replaceComposerSlashTrigger`'s internal check is
   * `draft.slice(start, end) !== text ? draft : ...` — called with `draft = originalDraft` and
   * `text` derived FROM `originalDraft`, that comparison is a string compared against itself and can
   * never be false. Their own isolated unit test (packet lines 481-499) calls the function directly
   * with a manually-substituted "changed" string and passes — proving the PRIMITIVE works — but
   * `runDiscovery`'s integration never exercises that path, so the guarantee the comment promises
   * ("a stale async completion" won't overwrite "a newer draft") does not actually hold at the one
   * call site that matters. Fixed here by comparing against the LIVE `composer.draft`, read AFTER
   * the await settles, against the snapshot taken before it.
   */
  async function notifyDiscovery(
    item: ComposerDiscoveryItem,
    source: 'plus' | 'slash',
    restoreDraft: string,
    argument?: string,
  ) {
    if (discoveryPendingRef.current) return;
    discoveryPendingRef.current = true;
    setDiscoveryError(null);
    setDiscoveryBusy(true);
    try {
      const outcome = await slots?.onDiscoverySelect?.({
        item,
        source,
        ...(argument !== undefined ? { argument } : {}),
      });
      if (outcome && 'draft' in outcome && outcome.draft !== undefined) {
        if (composer.draft === restoreDraft) {
          composer.setDraft(outcome.draft);
        }
        // else: the draft changed while we were awaiting the host (nothing in this design disables
        // typing during the wait — see the note above — so this is reachable, unlike Codex's own
        // guard). Leave the user's edit alone rather than silently overwrite it.
      }
    } catch {
      composer.setDraft(restoreDraft);
      setDiscoveryError(t('That action failed. Your draft has been restored.'));
    } finally {
      discoveryPendingRef.current = false;
      setDiscoveryBusy(false);
    }
  }

  function selectSlashItem(index: number) {
    const match = slashMatches[index];
    if (!match) return;
    const argument = match.item.argument ? (slashQuery?.argument ?? '') : undefined;
    if (match.item.argument?.required && !argument) return;
    const priorDraft = composer.draft;
    const deferToHost = Boolean(match.item.argument || match.item.needsConfirmation);
    if (!deferToHost) {
      composer.setDraft(replaceComposerSlashTrigger(composer.draft, match.item.insertText ?? match.item.label));
    }
    setDismissedSlashDraft(null);
    void notifyDiscovery(match.item, 'slash', priorDraft, argument);
    restoreComposerFocus();
  }

  function selectPlusItem(item: ComposerDiscoveryItem) {
    const priorDraft = composer.draft;
    const deferToHost = Boolean(item.argument || item.needsConfirmation);
    if (!deferToHost && item.insertText) {
      composer.setDraft(appendComposerDiscovery(composer.draft, item.insertText));
    }
    setDiscoveryMenuOpen(false);
    void notifyDiscovery(item, 'plus', priorDraft);
    restoreComposerFocus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (slashOpen) {
      const action = resolveComposerSlashKeyAction(event.key, event.shiftKey);
      if (action.type !== 'none') {
        event.preventDefault();
        if (action.type === 'move') {
          setSlashActiveIndex((current) => (current + action.offset + slashMatches.length) % slashMatches.length);
        } else if (action.type === 'select') {
          selectSlashItem(Math.min(slashActiveIndex, slashMatches.length - 1));
        } else {
          setDismissedSlashDraft(composer.draft);
        }
        return;
      }
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!disabled && !sendDisabled && composer.canSubmit) onSend();
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) void attachmentPicker?.onFiles(files);
  }

  return (
    <div className="jini-composer">
      {slots?.leadingAccessories ? <div className="jini-composer-leading">{slots.leadingAccessories}</div> : null}
      <AttachmentTray attachments={composer.attachments} onRemove={composer.removeAttachment} />
      <textarea
        ref={textareaRef}
        className="jini-composer-input"
        value={composer.draft}
        placeholder={resolvedPlaceholder}
        disabled={disabled}
        onChange={(e) => {
          composer.setDraft(e.target.value);
          setSlashActiveIndex(0);
          setDismissedSlashDraft(null);
          setDiscoveryError(null);
        }}
        onKeyDown={handleKeyDown}
        aria-controls={slashOpen ? 'jini-composer-slash-menu' : undefined}
        aria-expanded={slashOpen}
        aria-activedescendant={
          slashOpen ? `jini-composer-slash-option-${Math.min(slashActiveIndex, slashMatches.length - 1)}` : undefined
        }
        rows={3}
      />
      {slashOpen ? (
        <ComposerSlashMenu
          matches={slashMatches}
          activeIndex={Math.min(slashActiveIndex, slashMatches.length - 1)}
          onSelect={(item) => selectSlashItem(slashMatches.findIndex((match) => match.item === item))}
          onPreview={slots?.onDiscoveryPreview}
          t={t}
        />
      ) : null}
      {discoveryBusy ? (
        <span className="jini-composer-sr-only" role="status" aria-live="polite">
          {t('Running…')}
        </span>
      ) : null}
      {discoveryError ? (
        <div className="jini-composer-discovery-error" role="alert">
          {discoveryError}
        </div>
      ) : null}
      <div className="jini-composer-footer">
        {/* ...attachment picker / ComposerDiscoveryMenu / footerAccessories / plusMenuItems /
            send-or-stop button all unchanged from the current file... */}
      </div>
    </div>
  );
}
```

`ComposerDiscovery.tsx`'s `ComposerSlashMenu` is unchanged from R3 (renders `item.argument.placeholder` beside the label, `onMouseDown preventDefault` on every option keeps the APG combobox contract intact) — not reproduced again here since nothing about it changed this round.

### 4. Tovu-side capability registry — async projection, corrected execution model (`apps/admin/src/features/plugins/capability-registry.ts`, NEW)

```ts
import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from "@jini-ai/chat/react";

export interface TovuCapabilityDescriptor {
  id: string;
  groupId: string;
  groupLabel: string;
  label: string;
  /** Untranslated match key — see `slots.ts`'s `ComposerDiscoveryItem.command` doc. */
  command?: string;
  description?: string;
  kind: string;
  keywords?: readonly string[];
  argument?: { placeholder: string; required?: boolean };
  needsConfirmation?: boolean;
  preview?: () => Promise<{ title: string; files: ReadonlyArray<{ path: string; content: string }> }>;
  /**
   * Corrected this round. R2/R3 typed this as an opaque closure and, for `/search`, actually
   * imported a daemon-side module directly (`../../assistant/tool-registrations`) — wrong, per
   * `AssistantDock.tsx:114-119`'s own module doc: tool execution only happens through the agent
   * CLI's `/api/delegated-tool-calls` gate, never a same-process call. Every implementation below is
   * therefore one of: a real client-local action (`navigate`), or composing agent-directed text for
   * the user to review and send — nothing here pretends to call a daemon-side tool directly.
   */
  execute: (input: { argument?: string }) => Promise<CapabilityOutcome>;
}

export type CapabilityOutcome =
  | { type: "navigated" }
  | { type: "inserted"; text: string }
  | { type: "noop" };

function toDiscoveryItem(descriptor: TovuCapabilityDescriptor): ComposerDiscoveryItem {
  const deferred = Boolean(descriptor.argument || descriptor.needsConfirmation);
  return {
    id: descriptor.id,
    label: descriptor.label,
    command: descriptor.command,
    description: descriptor.description,
    kind: descriptor.kind,
    keywords: descriptor.keywords,
    ...(descriptor.argument ? { argument: descriptor.argument } : {}),
    ...(descriptor.needsConfirmation ? { needsConfirmation: true } : {}),
    ...(descriptor.preview ? { previewable: true } : {}),
    ...(deferred ? {} : { insertText: descriptor.label }),
  };
}

/**
 * NEW shape this round. Replaces R3's synchronous `projectCapabilitiesToDiscoveryGroups(descriptors:
 * TovuCapabilityDescriptor[])` with an async projection over SOURCES, credited to Codex's Round 2
 * `TovuCapabilityProjectionSource`/`projectTovuComposerCapabilities` (packet lines 810-868) for the
 * shape — but grounded here in a pattern this codebase already runs, not an abstract one: see
 * `createToolRegistrationCapabilitySource` below, modeled directly on this file's own `fetchAgents()`
 * (`AssistantDock.tsx:142-149`).
 */
export interface TovuCapabilityProjectionSource {
  snapshot(): Promise<readonly TovuCapabilityDescriptor[]>;
}

export async function projectTovuComposerCapabilities(sources: readonly TovuCapabilityProjectionSource[]): Promise<{
  groups: ComposerDiscoveryGroup[];
  index: ReadonlyMap<string, TovuCapabilityDescriptor>;
}> {
  const all = (await Promise.all(sources.map((s) => s.snapshot()))).flat();
  const order: string[] = [];
  const byGroup = new Map<string, { label: string; items: ComposerDiscoveryItem[] }>();
  for (const descriptor of all) {
    let group = byGroup.get(descriptor.groupId);
    if (!group) {
      group = { label: descriptor.groupLabel, items: [] };
      byGroup.set(descriptor.groupId, group);
      order.push(descriptor.groupId);
    }
    group.items.push(toDiscoveryItem(descriptor));
  }
  return {
    groups: order.map((id) => ({ id, label: byGroup.get(id)!.label, items: byGroup.get(id)!.items })),
    index: new Map(all.map((d) => [d.id, d] as const)),
  };
}

/** Today's four bundled entries — genuinely compile-time-known (checked-in constants in
 * `agent-plugin-catalog.ts` today), so a trivially-resolved source is correct, not a stub. */
export function createBundledCapabilitySource(
  descriptors: readonly TovuCapabilityDescriptor[],
): TovuCapabilityProjectionSource {
  return { snapshot: async () => descriptors };
}

interface ToolRegistrationSummary {
  id: string;
  name: string;
  description: string;
  argumentHint?: string;
  destructive?: boolean;
}

/**
 * NEW. Not verified against a real endpoint or the real ~20 `tool-registrations.ts`/`agent-tools.ts`
 * modules — none of those, nor a route that lists them, are in `files/` this round either. Named
 * `listPath` follows the admin-session-authenticated-proxy convention this exact file already
 * establishes TWICE for exactly this kind of daemon-relay need (`/api/admin/v1/mcp-ui/tool-calls`,
 * `/api/admin/v1/a2ui/actions`, `AssistantDock.tsx:53-91`) — an honest, precedent-following guess at
 * the seam, not a claim the endpoint exists.
 */
export function createToolRegistrationCapabilitySource(
  listPath = "/api/admin/v1/assistant/tool-registrations",
): TovuCapabilityProjectionSource {
  return {
    async snapshot() {
      const response = await fetch(listPath, { credentials: "same-origin" });
      if (!response.ok) return [];
      const { tools } = (await response.json()) as { tools: ToolRegistrationSummary[] };
      return tools.map((tool): TovuCapabilityDescriptor => ({
        id: `tool:${tool.id}`,
        groupId: "tools",
        groupLabel: "Tools",
        label: `/${tool.name}`,
        command: tool.name,
        description: tool.description,
        kind: "tool",
        keywords: ["tool", tool.name],
        ...(tool.argumentHint ? { argument: { placeholder: tool.argumentHint, required: false } } : {}),
        needsConfirmation: tool.destructive ?? true,
        // Composes agent-directed text; does NOT call the daemon-side tool directly — see the
        // module doc on `TovuCapabilityDescriptor.execute` above for why the browser can't.
        execute: async ({ argument }) => ({
          type: "inserted",
          text: argument ? `Use the ${tool.name} tool: ${argument}` : `Use the ${tool.name} tool.`,
        }),
      }));
    },
  };
}
```

### 5. Tovu-side static catalog (`files/tovu/agent-plugin-catalog.ts`, rewritten)

```ts
import type { TovuCapabilityDescriptor } from "../../features/plugins/capability-registry";
import { navigate } from "../../lib/router";

export const TOVU_BUNDLED_CAPABILITY_DESCRIPTORS: readonly TovuCapabilityDescriptor[] = [
  {
    id: "regular-plugin:word-count",
    groupId: "regular-plugins",
    groupLabel: "Plugins",
    label: "Word Count",
    description: "Built-in Tovu plugin",
    kind: "plugin",
    keywords: ["plugin", "content"],
    execute: async () => ({ type: "inserted", text: "Word Count plugin" }),
  },
  {
    id: "agent-plugin:ui-ux-design",
    groupId: "agent-plugins",
    groupLabel: "Agent Plugins",
    label: "UI/UX Design",
    description: "UI/UX Design Agent Plugin bundled with Tovu",
    kind: "agent-plugin",
    keywords: ["agent plugin", "design", "ui", "ux"],
    execute: async () => ({ type: "inserted", text: "UI/UX Design agent plugin" }),
  },
  {
    id: "skill:ui-ux-design",
    groupId: "skills",
    groupLabel: "Skills / Design toolbox",
    label: "UI/UX Design",
    description: "Portable skill from the ui-ux-design Agent Plugin",
    kind: "skill",
    keywords: ["skill", "design", "ui", "ux"],
    execute: async () => ({ type: "inserted", text: "UI/UX Design skill" }),
  },
  {
    id: "mcp:settings",
    groupId: "mcp",
    groupLabel: "MCP",
    label: "/mcp",
    command: "mcp",
    description: "Open settings, or type a server id to insert a hint",
    kind: "mcp",
    keywords: ["mcp", "server", "tools", "settings"],
    argument: { placeholder: "<server-id>" },
    // Real client-local action — unchanged from every round: this one genuinely doesn't need the
    // agent loop, `resolveTovuComposerDiscoveryRoute`/`navigate` already proves it works today.
    execute: async ({ argument }) => {
      if (!argument) {
        navigate("/settings?tab=external-mcp");
        return { type: "navigated" };
      }
      return { type: "inserted", text: `Toggle, adopt, or jump to ${argument} settings.` };
    },
  },
  {
    id: "search:web",
    groupId: "search",
    groupLabel: "Search",
    label: "/search",
    command: "search",
    description: "Ask the assistant to search the web",
    kind: "search",
    keywords: ["search", "research", "web"],
    argument: { placeholder: "<query>", required: true },
    // CHANGED this round. R2/R3 imported `runResearchTool` directly from
    // `"../../assistant/tool-registrations"` and called it as if it executed synchronously in the
    // browser — wrong, per `AssistantDock.tsx:114-119` (see the module doc on `execute` above).
    // Composes the request; the existing, already-proven agent tool loop does the rest once sent.
    execute: async ({ argument }) => {
      if (!argument) return { type: "noop" };
      return { type: "inserted", text: `Search the web for: ${argument}` };
    },
  },
];
```

### 6. `AssistantDock.tsx` call site (replacing lines 270-273 and the `TOVU_COMPOSER_DISCOVERY_GROUPS` import at line 26)

```tsx
import { useEffect, useState } from "react";
import {
  createBundledCapabilitySource,
  createToolRegistrationCapabilitySource,
  projectTovuComposerCapabilities,
  type TovuCapabilityDescriptor,
} from "../../features/plugins/capability-registry";
import { TOVU_BUNDLED_CAPABILITY_DESCRIPTORS } from "../../features/plugins/agent-plugin-catalog";

/**
 * Mirrors this file's own `fetchAgents()` (line 142-149): tolerant of a failed fetch (falls back to
 * the bundled-only groups rather than an empty palette), fetched once per mount. Not memoized
 * against `agentBridge`/config changes — the capability set genuinely doesn't depend on either.
 */
function useTovuComposerCapabilities() {
  const [state, setState] = useState<{
    groups: ReturnType<typeof projectTovuComposerCapabilities> extends Promise<infer R> ? R["groups"] : never;
    index: ReadonlyMap<string, TovuCapabilityDescriptor>;
  }>({ groups: [], index: new Map() });

  useEffect(() => {
    let cancelled = false;
    void projectTovuComposerCapabilities([
      createBundledCapabilitySource(TOVU_BUNDLED_CAPABILITY_DESCRIPTORS),
      createToolRegistrationCapabilitySource(),
    ]).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// ...inside AssistantDock()...
const { groups: discoveryGroups, index: capabilityIndex } = useTovuComposerCapabilities();

const handleComposerDiscoverySelect = useCallback(
  async (selection: ComposerDiscoverySelection): Promise<{ draft?: string } | void> => {
    const descriptor = capabilityIndex.get(selection.item.id);
    if (!descriptor) return;
    const outcome = await descriptor.execute({ argument: selection.argument });
    if (outcome.type === "navigated") return { draft: "" };
    if (outcome.type === "inserted") return { draft: outcome.text };
    return; // "noop" — leave the user's typed text alone (e.g. /search with no query yet)
  },
  [capabilityIndex],
);

// ...in the returned JSX...
<ChatPane
  /* ...unchanged props... */
  composerSlots={{
    discoveryGroups,
    onDiscoverySelect: handleComposerDiscoverySelect,
  }}
/>
```

`needsConfirmation`/preview UI (`capability-confirm.tsx`, `capability-preview-modal.tsx`) are unchanged from R3's honest-new-component correction and not reproduced again — neither required command uses them this round, and nothing in Codex's real text changes that correction (see "Position And Movement").

### 7. Boundary check — proof against `slots.ts:77-80`

Unchanged claim, re-verified against the new code: every conditional `@jini-ai/chat` runs is a presence/type check on a package-declared field — `Boolean(match.item.argument || match.item.needsConfirmation)`, `match.item.argument?.required`, `!item.command` (skip, don't branch), `outcome && 'draft' in outcome`. `item.kind` is read only for the existing search/render path, unchanged and already sanctioned. `item.command` (new) is read only for equality/substring matching — never switched on for behavior. A future `'workflow-template'`-kind capability needs zero package changes, same as every prior round's claim.

## Critique Of Another Participant's Round 2 Code

**Target: `codex-round2`** (packet appendix lines 149-1144) — the design I could not reconcile with last round and can now engage directly. Two specific, verified issues, not nitpicks.

**1. The stale-draft guard is unreachable at its own call site — it protects against nothing as written.** `replaceComposerSlashTrigger` (packet lines 382-393) is correctly implemented in isolation: `if (draft.slice(start, end) !== text) return draft;` — and their own unit test (packet lines 481-499) proves the primitive works when called with a manually-substituted "changed" string. But the only call site that matters, `runDiscovery` (packet lines 564-644), calls it as `replaceComposerSlashTrigger(originalDraft, slash, mutation.text)` where `originalDraft = composer.draft` is captured at function entry (packet line 571) — *before* the `await` — and `slash` (the invocation whose `.trigger.text` the guard checks against) was parsed from that exact same `originalDraft` moments earlier in `selectSlashItem` (packet lines 646-668), before `runDiscovery` was even called. `originalDraft.slice(start, end)` therefore always equals `text` by construction — the comparison is a string checked against itself, and `draft.slice(start, end) !== text` can never be `true` through this path. The guard's own module comment says exactly what it's for — "Prevent a stale async completion from overwriting a newer draft" — but the live draft (`composer.draft`, re-read *after* the `await` resolves) is never consulted anywhere in `runDiscovery`. A user who keeps typing during the async round-trip (nothing in their design disables the textarea's typing at the keystroke level while `discoveryPending` is `readOnly` — actually `readOnly` *does* block keyboard edits, so this specific bug may be inert under their own `readOnly={discoveryPending}` wiring — but the guard is still broken as written, and would silently fail to protect anything the moment that `readOnly` binding is loosened, removed, or bypassed by any non-keyboard draft mutation, e.g. a second concurrent `composer.setDraft` call from elsewhere). My fix (section 3 above) compares the LIVE `composer.draft` against the pre-await snapshot, which is what actually detects drift regardless of what else does or doesn't block typing.

**2. `filterComposerDiscovery`'s exact-match branch is right, and exposed a bug in my own Round 2/3 code that Codex's code does not itself have** — noted for completeness since it would be dishonest to critique Codex here without saying plainly that this one is a compliment, not a defect: their test (packet lines 501-526) is the reason section 2 above changed at all. Filed under "Position And Movement" rather than repeated as a defect.

**Carried forward unchanged from Round 2/3, not re-litigated in full: the three issues found in `gemini-3.1-pro-high-round2`** (binding `executing` to the textarea's `disabled` state and breaking the APG focus contract; deriving a match key from translated `item.label`; weakening `replaceComposerSlashTrigger`'s guard to a bare `draft.startsWith('/')` check) all stand exactly as reported in R3 — nothing in Codex's real text bears on any of them, and this round's new research (Roselli, above) only reinforces the first.

## What Would Change My Mind

- **A shown, real implementation of `executeTovuComposerCapability` (or an equivalent)** that proves a genuine second execution path exists beyond "compose text, let the agent's tool loop handle it" — e.g. a Tovu-owned route that calls a search provider directly and returns a real result synchronously. That would resurrect the case for `ComposerHostBinding`-style dispatch (Option 3) as something with two real arms instead of one asserted and zero shown.
- **Confirmation that a genuinely consequential capability is imminent** (a `needsConfirmation`-gated command that actually mutates something) — that's when Codex's warning about a client-only confirm boolean not being sufficient becomes load-bearing rather than a documented caveat, and a real prepare/redeem flow (following the `PendingConfirmationStore` precedent, not reusing it directly) would need to be built rather than deferred.
- **Evidence that `tool-registrations.ts`/`agent-tools.ts` modules are NOT actually daemon-side** — if a future round's evidence shows these are browser-importable after all (contradicting `AssistantDock.tsx:114-119`'s own module doc), the async-projection-source machinery in section 4 becomes unnecessary complexity and a static array (closer to my original R2/R3 shape) would be right again.
- **A trigger that needs to start mid-draft** — same condition as every prior round: the `range`-tuple generality (declined again this round, now checked against a third independent design that also never exercises it) would stop being dead weight the day `/`-commands are wanted alongside free text via caret position, the way OD's `@`-mentions already work.

<<SWARM_END>>
