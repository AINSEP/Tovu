ACK_PACKET_RECEIVED CTX-SLASH-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

**Held, then hardened: the presence-only deferral design from my own Round 2 (Option 1) stays the leading option.** Reading the actual files this round — not just citing them — surfaced one thing that *strengthens* my R1/R2 position and two things that were *wrong in my own R2 code* and needed fixing before I'd call this "final."

**Strengthened:** the packet says "do not port Lexical on current evidence" is settled, but I can now show *why* that's righter than Round 2 knew. OD's own `TriggerPlugin` (`files/opendesign/LexicalComposerInput.tsx:334`) detects the slash trigger with `/^\/([^\s/]*)$/` — **the identical anchored, no-argument regex Jini started with.** The moment a space is typed, `s` becomes `null` and `onTrigger` reports `slash: null` — OD's own reference implementation loses the popover on a space too. And `SlashCommand.argHint` (`ChatComposer.head.tsx:169`, doc: "Optional argument hint shown after the description") together with `SlashCommand.insert`'s doc ("cursor positioned at end of insert... trailing space is the difference between a 'ready for argument' command and a 'submit immediately' one," `ChatComposer.head.tsx:161-165`) confirms Round 2's read: **the `<server-id>`/`<query>` placeholders are static description-row text, not live token completion, even in the caret-aware Lexical implementation.** OD's genuinely *live*, filtered, real-value picker for MCP servers lives entirely somewhere else — `ComposerPlusMenu.tsx:892-949`'s `role="menu"` flyout with a real `<input>` and real DOM focus, reached by hovering "+", never through the slash trigger's `aria-activedescendant` combobox at all. So porting Lexical buys *zero* incremental argument capability over a plain textarea; it only buys atomic `MentionNode` pills, which is a different requirement than this debate. That's now a verified fact about the reference implementation, not an inference from a screenshot.

**Two things in my own R2 code were wrong and are fixed below**, per this round's mandate to ground everything in the real files:

1. R2's Tovu-side code imported `requestPendingConfirmation` from `"../../lib/pending-confirmation"` and claimed it was "Tovu's existing `PendingConfirmationStore`." That file isn't in evidence anywhere in `files/`. What *is* in evidence — `AssistantDock.tsx:43-73`'s own comments — describes a `PendingConfirmationStore` that lives **daemon-side**, inside `src/assistant/mcp-ui-tool-calls-route.ts`, scoped specifically to redeeming a server-issued `tools/call` envelope for MCP-UI dialogs (`createMcpUiToolCaller("", {path: "/api/admin/v1/mcp-ui/tool-calls"})`). There is no generic client-side `await confirm()` primitive anywhere in the given files. I fabricated the reuse claim. Fixed below with a real, new, explicitly-not-that-store confirmation gate.
2. R2 also imported `openCapabilityPreviewModal` claiming it "reuses `AgentPluginDetailsModal`'s `PreviewModalShell` + `CodeWithLines`." Neither symbol appears anywhere in `files/tovu/`. OD's own analogous surface is `ComposerPluginPreview.tsx`/`ComposerSkillPreview` — real, but Tovu-side, not that. Fixed below with a small new component, honestly labeled as new.

**Verified-corrections check (per the packet's override list):** `EgressPolicy`/`HttpClientPort` and SQLite JSONB have no surface here — nothing in this debate's code touches HTTP egress or persists to SQLite (the capability registry is an in-memory TS array). Confirmed not applicable rather than silently skipped. The Agent Plugins "real install path, MCP subprocess risk is live" owner decision *is* relevant color: it's why `needsConfirmation` matters for any future agent-plugin-backed capability, even though today's four catalog entries don't need it.

**Reconciling the two competing Round 2 designs, by name:** the real fork in the appendix isn't "mine vs. Gemini's" in the abstract — it's a specific, checkable disagreement about *whether `replaceComposerSlashTrigger` needs a `range: [start, end]` tuple*. My design and Opus's R2 (which independently arrived at "the grammar and the replacement are coupled invariants... they change together or not at all") kept the original single-guard shape: `parseComposerSlashQuery(draft) === null ? draft : insertText`, safe *because* the parser stays anchored `^...$` end-to-end. Both **gemini-3.6-flash-high-round2** and **gemini-3.1-pro-high-round2** instead added a `range` tuple and switched to `draft.slice(0, range[0]) + insertText + draft.slice(range[1])`. I checked every call site in both of their R2 code blocks: `range` is *always* `[0, draft.length]` — their own `parseComposerSlashQuery` still requires `^\/` at position 0, so a non-whole-draft range is never produced. The tuple is dead generality: complexity paid for today, cashed by nobody. **I did not adopt it.** The instinct behind it — a token-span replacement primitive, not a whole-draft one — is the right shape for a *future* where a trigger can start mid-message (the way OD's real `@`-mention detection can, via `textBeforeCaretOnLine`), and I say so explicitly in "What Would Change My Mind" below rather than building it unexercised.

**Codex's competing design — I could not reconcile with it, and I'm reporting that as the loudest finding of this round rather than papering over it.** The dispatch brief told me to reconcile with "Codex's competing design... by name." I read the packet's appendix in full: the entry headed `## Round 2 — codex-round2` (packet lines 204-208) contains only two sentences of *scratch/preamble* — "I'll read the complete Round 2 packet first, then inspect only the in-scope source files..." — and stops. There is no `## Position And Movement`, no `## Solution Slate`, no code, nothing to critique or reconcile with. This is a packet-assembly gap, not a design I disagree with. Per this round's own instruction ("Report contradictions loudly... a stated gap is worth more than a confident guess"), I'm stating it rather than inventing a plausible-sounding Codex position to argue against, which would fail the "do not fabricate" rule just as badly as fabricating a citation would. The one surviving fragment is *my own* R2 text crediting Codex's R1 for "two catalogs + intent resolver" and "E: intent-first, host-executed, separate argument-collection UI." I've taken the *name* and the *concept* — separating "what can be listed" from "what a typed value resolves to" — into the design below (see the code comment on `TovuCapabilityDescriptor.execute` under "Leading Option — Code"), but I have not claimed API-level compatibility with code I've never seen, and I'd want to actually re-run this reconciliation if the real text surfaces.

## Sources

- [W3C WAI-ARIA APG — Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) — confirmed: DOM focus stays on the combobox/textbox at all times; `aria-activedescendant` on the input references the active option; "browsers do not manage visibility of elements referenced by `aria-activedescendant`... the JavaScript scrolls the option... into view" — the app owns keeping the reference valid and visible, not the browser.
- [W3C WAI-ARIA APG — Editable Combobox With List Autocomplete Example](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/) — confirmed this exact pattern (a textbox whose option list narrows as you keep typing more characters) is the *documented, sanctioned* shape — a growing typed token does not, by itself, break the pattern. Doesn't fully specify the zero-match case; noted as a gap rather than guessed.
- [MDN — `aria-activedescendant`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant) — confirmed the value must reference an element that "currently exists" and is owned by the container (descendant or via `aria-controls`); confirms this is a JS-managed illusion of focus, real DOM focus never leaves the input.
- [Sarah Higley — "Aria-activedescendant is not focus"](https://sarahmhigley.com/writing/activedescendant/) — confirmed: mobile screen readers (iOS VoiceOver, Android TalkBack) "essentially ignore `aria-activedescendant`... swipe through all the options without the value changing at all," and pointing it at a non-option element causes unwanted "mode switching" in Windows screen readers. No specific guidance found on a *growing trigger token*; stated as a gap, not inferred.
- [assistant-ui — Slash Commands guide](https://www.assistant-ui.com/docs/guides/slash-commands) — confirmed a real, shipping chat-composer library uses exactly the shape this design converges on: arguments are extracted "by reading the full composer text after the command word using regex pattern matching," and argument guidance is shown as description text (e.g. "Translate to a language, e.g. `/translate en`"), not live inline completion. No explicit ARIA details published; noted as a gap.
- [Slack — Implementing slash commands](https://docs.slack.dev/interactivity/implementing-slash-commands/) — confirmed Slack's own argument UX is a static "Usage Hint" string shown next to the command in autocomplete — the same static-hint shape, from an entirely different vendor.
- [OpenAI Codex — PR #23964, "Move slash input logic out of chat composer"](https://github.com/openai/codex/pull/23964) — confirmed a real production coding-agent composer (Rust TUI) separates "parsing and lookup," "popup coordination," "argument element rebasing," and "submission validation" into a dedicated module — same separation of concerns this design uses, from a codebase in the same product category as Tovu's assistant dock. Explicitly a refactor PR ("no functional or behavioral changes intended"), so it confirms structure, not new argument semantics.
- [ChatGPT — Slash commands reference](https://learn.chatgpt.com/docs/reference/slash-commands) — checked for argument-hint precedent; the published reference doesn't document argument-taking commands' UX in enough detail to cite a mechanism. Stated as a gap rather than guessed at.
- Everything else claimed above is grounded directly in `files/jini/*` and `files/tovu/*` — see inline `path:line` citations throughout.

## Solution Slate

**Ranking criteria, stated before ranking:** (1) satisfies the packet's four required deliverables literally; (2) never lets `@jini-ai/chat` learn a host taxonomy or grow a per-kind dispatch table (`slots.ts:77-80`); (3) every claimed capability is grounded in a file actually in evidence — no more `requestPendingConfirmation`-style fabrication; (4) the trigger grammar's safety argument is checkable by inspection, not by trusting a caller.

### Option 1 — Presence-only deferral + host-side capability projection (RECOMMENDED, hardened from R2)

**Mechanism:** unchanged shape from R2 — `ComposerDiscoveryItem` grows `argument`/`needsConfirmation`/`previewable` as presence-only fields; `onDiscoverySelect` gains an optional `{draft?: string}` outcome; the parser grows one optional capture group but stays anchored `^...$`; Tovu's four-entry literal becomes a real (if only partially wired, see below) capability registry. What's different from R2: the confirm/preview support code is now genuinely new instead of a fabricated reuse claim, and the async host round-trip never touches the textarea's `disabled` state (see the ARIA critique below for why that matters).

**Genuine sacrifice:** identical to R2's, now *empirically confirmed rather than merely argued* — no live value-completion inside an argument. Typing `/mcp sup` shows a static `<server-id>` hint, not a filtered dropdown of real connected servers, exactly like OD's own shipped `/mcp` (`ChatComposer.head.tsx:157-172`'s `argHint` field) and exactly like assistant-ui's documented behavior. This is not a corner Round 2 cut to save effort — it's the same corner the two real reference implementations I could check also cut.

### Option 2 — Port OD's caret-aware `TriggerPlugin` model (Lexical)

**Mechanism:** unchanged from R2 — adopt `textBeforeCaretOnLine` + regex-at-caret detection and `replaceActiveTrigger`/`insertMention`'s token-span mutation (`LexicalComposerInput.tsx:311-348`, `748-763`, `721-747`).

**Genuine sacrifice — sharper than R2's, now that I've read the file instead of inferring from a screenshot:** it was already "a different package, not a bigger diff" (new `lexical`/`@lexical/react` runtime dependency, ~230 lines of plugin code before a single new command). Round 3's research adds a second, worse cost: **it doesn't even buy the thing it's ostensibly for.** OD's own `TriggerPlugin` slash regex (`LexicalComposerInput.tsx:334`) is the same anchored, no-argument pattern Option 1 already extends — porting it wholesale imports the same limitation, not a fix for it. The only real capability gain is atomic mention pills, which nothing in this debate's four deliverables asks for.

**Recommendation: Option 1. Cheapest falsifying test (unchanged from R2, now backed by the assistant-ui/Slack precedent instead of just my own reasoning):** ship `/mcp <server-id>` and `/search <query>` as free-form typed text validated at selection time. If users can't guess correctly often enough that they start asking for a live dropdown — the way OD *does* provide one, just in the "+" menu's `ComposerPlusMenu.tsx:892-949` flyout, not the slash palette — that's the signal to build a live-value picker. It does not have to be Lexical: `ComposerPlusMenu`'s own pattern (a portaled `role="menu"` with a real `<input>`) is cheaper than porting an editor and is already proven in the one codebase both sides keep citing as reference.

*(A third option — a package-owned execution engine dispatching on `item.kind` — remains rejected on the same grounds as every prior round: `slots.ts:77-80`'s own text, "Jini filters and renders the value but never switches on a host-owned taxonomy," and Opus's R2 correction that `kind`-branching was never a real fourth option. Not re-litigated in the slate as its own numbered entry since nothing new emerged to reopen it.)*

## Leading Option — Code

### 1. The descriptor contract (`files/jini/slots.ts`)

```ts
/**
 * Declares that a `ComposerDiscoveryItem` accepts a trailing argument, e.g. `/mcp <server-id>`.
 * The package reads only its PRESENCE — never a value, never a host taxonomy (see `kind`'s own
 * law two paragraphs below, unchanged). When present, `Composer.tsx`'s `selectSlashItem` skips its
 * own draft mutation and lets `ComposerSlots.onDiscoverySelect`'s resolved outcome own the final
 * draft text — only the host knows what a given argument value resolves to. `required` lets the
 * package decline Enter/Tab (not the row's existence) until at least one character has been typed
 * after the separator; it never inspects what that character is.
 */
export interface ComposerDiscoveryArgument {
  /** Rendered inline after the label while no argument has been typed yet, e.g. `<server-id>`. */
  placeholder: string;
  required?: boolean;
}

export interface ComposerDiscoveryItem {
  id: string;
  label: string;
  description?: string;
  kind?: string;
  keywords?: readonly string[];
  insertText?: string;
  /** See {@link ComposerDiscoveryArgument}. Absent (and safely ignorable) for macro-only items. */
  argument?: ComposerDiscoveryArgument;
  /**
   * True when the host must gate this item's effect behind a confirmation step before it commits.
   * Same deferral shape as `argument` — package skips its own draft mutation, host owns the
   * outcome — so a declined confirmation leaves the draft exactly as the user typed it. What
   * "confirm" means (a dialog, a redemption token) is entirely host-owned; see
   * `apps/admin/src/features/plugins/capability-confirm.tsx` for Tovu's — a NEW, small, purely
   * client-side gate, not a reuse of the daemon-side MCP-UI redemption store
   * (`src/assistant/mcp-ui-tool-calls-route.ts`, reached via `AssistantDock.tsx:43-73`'s
   * `createMcpUiToolCaller`). Round 2 wrongly conflated the two; they solve different problems.
   */
  needsConfirmation?: boolean;
  /**
   * True when this item has host-owned preview content worth surfacing before selection. The
   * package renders a generic preview affordance (`ComposerSlashMenu` below) that calls
   * `ComposerSlots.onDiscoveryPreview`; it never fetches, stores, or interprets preview content.
   */
  previewable?: boolean;
}

export interface ComposerDiscoverySelection {
  item: ComposerDiscoveryItem;
  source: 'plus' | 'slash';
  /**
   * The argument text typed after the command name — present only when `item.argument` was
   * declared. `''` means the command is committed (a space was typed) with no value yet;
   * `undefined` means no argument was typed at all (a bare `/command`). Expressed as data the host
   * switches on, never as a decision the package makes.
   */
  argument?: string;
}

/**
 * What a host's `onDiscoverySelect` may resolve to besides nothing. `draft`, when present, becomes
 * the composer's new draft — the channel an argument-bearing or confirmation-gated item uses to
 * write back its real outcome without the package ever parsing what the argument meant.
 */
export interface ComposerDiscoveryOutcome {
  draft?: string;
}

export type ComposerDiscoverySelect = (
  selection: ComposerDiscoverySelection,
) => void | ComposerDiscoveryOutcome | Promise<void | ComposerDiscoveryOutcome>;

export interface ComposerSlots {
  plusMenuItems?: ComposerPlusItem[];
  discoveryGroups?: readonly ComposerDiscoveryGroup[];
  /** Return value widened (additively — `void` still valid) to carry `ComposerDiscoveryOutcome`. */
  onDiscoverySelect?: ComposerDiscoverySelect;
  /** Optional per-item preview trigger — see `ComposerDiscoveryItem.previewable`. Omit to hide the
   * affordance entirely; the package never renders a preview SURFACE itself, only the button that
   * calls this. */
  onDiscoveryPreview?: (item: ComposerDiscoveryItem) => void;
  mentionSources?: MentionSource[];
  leadingAccessories?: ReactNode;
  footerAccessories?: ReactNode;
  onAttach?: (a: ChatAttachment) => void;
  annotationAdapter?: AnnotationAdapter;
}
```

### 2. The trigger grammar + tests (`files/jini/composer-discovery.ts`)

```ts
import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from '../slots.js';

export interface ComposerDiscoveryMatch {
  groupId: string;
  groupLabel: string;
  item: ComposerDiscoveryItem;
}

/**
 * A parsed `/command` or `/command argument…` token, anchored to the WHOLE draft — not a
 * `[start, end]` span. `command` is the substring between `/` and the first run of whitespace (or
 * the rest of the draft when there is none yet); `argument` is `null` until at least one space has
 * been typed after the command name, then holds everything after that whitespace run (possibly
 * `""`).
 *
 * Kept end-to-end anchored (`^...$`) deliberately: `replaceComposerSlashTrigger` needs no `range`
 * tuple because when this returns non-null, the draft contains NOTHING but the trigger, so
 * replacing the whole draft can never eat text outside it. Verified against `files/opendesign`:
 * OD's own live caret-based trigger detector (`LexicalComposerInput.tsx:334`) uses the identical
 * anchored-no-argument regex this file started with, and neither of the R2 designs that introduced
 * a `range` field ever produced a non-`[0, draft.length]` value from their own parsers — so a span
 * primitive would be unexercised generality today. Revisit if a trigger is ever allowed to start
 * mid-draft (the way OD's `@`-mention detection can, via `textBeforeCaretOnLine`).
 */
export interface ComposerSlashQuery {
  command: string;
  argument: string | null;
}

const SLASH_QUERY_RE = /^\/([^\s/]*)(?:(\s+)([\s\S]*))?$/;

/** Open Design's active slash-token rule, extended to admit a trailing argument. */
export function parseComposerSlashQuery(draft: string): ComposerSlashQuery | null {
  const match = draft.match(SLASH_QUERY_RE);
  if (!match) return null;
  const [, command, separator, rest] = match;
  return { command: command ?? '', argument: separator === undefined ? null : (rest ?? '') };
}

/**
 * Flattens non-empty groups while preserving host order, then applies case-insensitive search
 * against the COMMAND portion only. Callers pass `slashQuery.command`, never the raw draft — this
 * is what keeps `/mcp supabase` still matching the `/mcp` row instead of the argument text pruning
 * it out of the list. Matches against `item.label`/`item.description`/`item.kind`/`item.keywords`
 * as literal strings — see the Round 2 critique below for why deriving a match KEY from `item.label`
 * specifically (as opposed to searching it) is unsafe once i18n is live.
 */
export function filterComposerDiscovery(
  groups: readonly ComposerDiscoveryGroup[],
  query: string,
): ComposerDiscoveryMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matches: ComposerDiscoveryMatch[] = [];

  for (const group of groups) {
    for (const item of group.items) {
      const searchable = [item.label, item.description, item.kind, ...(item.keywords ?? [])]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase();
      if (normalizedQuery === '' || searchable.includes(normalizedQuery)) {
        matches.push({ groupId: group.id, groupLabel: group.label, item });
      }
    }
  }

  return matches;
}

/**
 * Replaces the complete active slash token — command, separator, and argument together when
 * present. The ONLY guard is re-deriving validity from the draft itself
 * (`parseComposerSlashQuery(draft) === null`), never from a caller-supplied flag or a
 * `draft.startsWith('/')` substring check — the latter would authorize a whole-draft replacement
 * for a draft like `/mc/p` that isn't actually a valid parsed trigger, which is exactly the
 * "coupled invariant" failure mode Round 1/2 spent the whole debate warning about.
 */
export function replaceComposerSlashTrigger(draft: string, insertText: string): string {
  return parseComposerSlashQuery(draft) === null ? draft : insertText;
}

/** Adds a menu-selected resource to an existing prompt without concatenating words. */
export function appendComposerDiscovery(draft: string, insertText: string): string {
  if (draft.trim() === '') return insertText;
  return `${draft.trimEnd()} ${insertText}`;
}

export type ComposerSlashKeyAction =
  | { type: 'move'; offset: -1 | 1 }
  | { type: 'select' }
  | { type: 'dismiss' }
  | { type: 'none' };

/** Maps palette keys without owning React state; arrows are intentionally circular at the caller. */
export function resolveComposerSlashKeyAction(key: string, shiftKey: boolean): ComposerSlashKeyAction {
  if (key === 'ArrowDown') return { type: 'move', offset: 1 };
  if (key === 'ArrowUp') return { type: 'move', offset: -1 };
  if ((key === 'Enter' || key === 'Tab') && !shiftKey) return { type: 'select' };
  if (key === 'Escape') return { type: 'dismiss' };
  return { type: 'none' };
}
```

`files/jini/__tests__/composer-discovery.test.ts` (vitest):

```ts
import { describe, expect, it } from 'vitest';
import {
  filterComposerDiscovery,
  parseComposerSlashQuery,
  replaceComposerSlashTrigger,
} from '../composer-discovery.js';
import type { ComposerDiscoveryGroup } from '../../slots.js';

describe('parseComposerSlashQuery', () => {
  it('returns null for a draft that is not a slash trigger at all', () => {
    expect(parseComposerSlashQuery('hello')).toBeNull();
    expect(parseComposerSlashQuery('')).toBeNull();
  });

  it('parses a bare command with no argument typed yet (unchanged from today)', () => {
    expect(parseComposerSlashQuery('/mcp')).toEqual({ command: 'mcp', argument: null });
  });

  it('parses a bare slash the same way OD does (empty command, whole palette)', () => {
    expect(parseComposerSlashQuery('/')).toEqual({ command: '', argument: null });
  });

  it('commits to a command the instant a trailing space is typed, argument starts empty', () => {
    expect(parseComposerSlashQuery('/mcp ')).toEqual({ command: 'mcp', argument: '' });
  });

  it('parses a command with a typed argument', () => {
    expect(parseComposerSlashQuery('/mcp supabase')).toEqual({ command: 'mcp', argument: 'supabase' });
  });

  it('keeps internal spaces in a multi-word argument', () => {
    expect(parseComposerSlashQuery('/search open design lexical composer')).toEqual({
      command: 'search',
      argument: 'open design lexical composer',
    });
  });

  it('allows a slash character inside the argument (e.g. a URL query)', () => {
    expect(parseComposerSlashQuery('/search site:foo.com/bar')).toEqual({
      command: 'search',
      argument: 'site:foo.com/bar',
    });
  });

  it('rejects a second slash in the COMMAND position (pre-argument) — same as before', () => {
    expect(parseComposerSlashQuery('/mc/p')).toBeNull();
  });

  it('rejects text before the leading slash — the trigger must own the whole draft', () => {
    expect(parseComposerSlashQuery('hi /mcp')).toBeNull();
  });
});

describe('filterComposerDiscovery, called with just the command portion', () => {
  const groups: ComposerDiscoveryGroup[] = [
    {
      id: 'mcp',
      label: 'MCP',
      items: [
        {
          id: 'mcp:settings',
          label: '/mcp',
          kind: 'mcp',
          keywords: ['mcp', 'server'],
          argument: { placeholder: '<server-id>' },
        },
      ],
    },
  ];

  it('still matches the row once an argument is being typed', () => {
    const query = parseComposerSlashQuery('/mcp supabase');
    expect(query).not.toBeNull();
    const matches = filterComposerDiscovery(groups, query!.command);
    expect(matches.map((m) => m.item.id)).toEqual(['mcp:settings']);
  });
});

describe('replaceComposerSlashTrigger stays safe once arguments are allowed', () => {
  it('replaces command + separator + argument together, never a substring', () => {
    expect(replaceComposerSlashTrigger('/mcp supabase', '')).toBe('');
  });

  it('is a no-op the instant the draft stops being ONLY the trigger', () => {
    expect(replaceComposerSlashTrigger('hello /mcp supabase', 'x')).toBe('hello /mcp supabase');
  });

  it('is a no-op for a draft that merely starts with "/" but is not a valid trigger', () => {
    // Regression test for the Gemini 3.1-pro-high R2 bug: `draft.startsWith('/')` alone would
    // wrongly authorize this replacement.
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
  // NEW: surfaces a rejected/failed onDiscoverySelect. Today's Composer.tsx:89
  // (`void slots?.onDiscoverySelect?.({ item, source });`) discards the promise outright — harmless
  // while the only registered effect is a synchronous `navigate()`, silent the moment anything
  // fallible is wired, which is the whole point of formalizing arguments/confirmation this round.
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  // NEW: an announcement-only flag. Deliberately NEVER wired to the textarea's `disabled` prop — a
  // disabled form control cannot hold DOM focus, and the WAI-ARIA APG combobox pattern requires DOM
  // focus to stay on the textbox for the entire time `aria-activedescendant` is meaningful
  // (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). Disabling the input mid-await — which
  // gemini-3.1-pro-high's R2 code does — would forcibly blur it, silently breaking the very
  // accessibility contract this component otherwise gets right.
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const resolvedPlaceholder = placeholder ?? t('Send a message…');
  const discoveryGroups = slots?.discoveryGroups ?? [];
  const hasDiscoveryItems = discoveryGroups.some((group) => group.items.length > 0);
  const slashQuery = parseComposerSlashQuery(composer.draft);
  const slashMatches = slashQuery === null ? [] : filterComposerDiscovery(discoveryGroups, slashQuery.command);
  const slashOpen = slashMatches.length > 0 && dismissedSlashDraft !== composer.draft;

  function restoreComposerFocus() {
    textareaRef.current?.focus();
  }

  /**
   * Awaits the host's effect instead of discarding the promise (fixes Composer.tsx:89 as it reads
   * TODAY, in the unmodified file: `void slots?.onDiscoverySelect?.({ item, source });`, called
   * synchronously and un-awaited from `notifyDiscovery` at line 88-90). `restoreDraft` is the draft
   * as it stood BEFORE this selection: for argument/confirmation-deferred items nothing has mutated
   * the draft yet at call time; for macro items the caller already applied its own synchronous
   * mutation before this runs, so restoring here only ever undoes THIS call's own side effect. On
   * success, `outcome.draft` (if supplied) becomes the new draft. On rejection, the draft is
   * restored and a generic, non-diagnostic message is shown — the package never inspects *why* the
   * host failed.
   */
  async function notifyDiscovery(
    item: ComposerDiscoveryItem,
    source: 'plus' | 'slash',
    restoreDraft: string,
    argument?: string,
  ) {
    setDiscoveryError(null);
    setDiscoveryBusy(true);
    try {
      const outcome = await slots?.onDiscoverySelect?.({
        item,
        source,
        ...(argument !== undefined ? { argument } : {}),
      });
      if (outcome && 'draft' in outcome && outcome.draft !== undefined) {
        composer.setDraft(outcome.draft);
      }
    } catch {
      composer.setDraft(restoreDraft);
      setDiscoveryError(t('That action failed. Your draft has been restored.'));
    } finally {
      setDiscoveryBusy(false);
    }
  }

  function selectSlashItem(index: number) {
    const match = slashMatches[index];
    if (!match) return;
    const argument = match.item.argument ? (slashQuery?.argument ?? '') : undefined;
    // `required` declines selection, not existence — the row stays visible and matchable, Enter/Tab
    // simply no-op until a value follows the separator. The package never inspects the value itself.
    if (match.item.argument?.required && !argument) return;
    const priorDraft = composer.draft;
    // Structural decision only — presence of `argument`/`needsConfirmation`, never `item.kind`.
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
      {/* aria-live, not aria-busy-on-the-textbox: an announcement, never a focus/interaction
          change, so DOM focus and aria-activedescendant stay exactly where APG requires. */}
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

### 4. Preview affordance (`files/jini/ComposerDiscovery.tsx` — `ComposerSlashMenu` only; `ComposerDiscoveryMenu` unchanged)

```tsx
export interface ComposerSlashMenuProps {
  matches: readonly ComposerDiscoveryMatch[];
  activeIndex: number;
  onSelect: (item: ComposerDiscoveryItem) => void;
  onPreview?: (item: ComposerDiscoveryItem) => void;
  t: (key: string) => string;
}

export function ComposerSlashMenu(props: ComposerSlashMenuProps) {
  if (props.matches.length === 0) return null;

  return (
    <div id="jini-composer-slash-menu" className="jini-composer-slash-menu" role="listbox" aria-label={props.t('Composer commands')}>
      {props.matches.map((match, index) => (
        <div key={`${match.groupId}:${match.item.id}`} className="jini-composer-slash-row">
          <button
            id={`jini-composer-slash-option-${index}`}
            type="button"
            role="option"
            aria-selected={index === props.activeIndex}
            className={`jini-composer-discovery-item${index === props.activeIndex ? ' is-active' : ''}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onSelect(match.item)}
          >
            <span>
              {props.t(match.item.label)}
              {match.item.argument ? (
                <em className="jini-composer-slash-arg-hint"> {match.item.argument.placeholder}</em>
              ) : null}
            </span>
            <small>{props.t(match.item.description ?? match.groupLabel)}</small>
          </button>
          {match.item.previewable && props.onPreview ? (
            <button
              type="button"
              className="jini-composer-slash-preview"
              aria-label={props.t('Preview')}
              title={props.t('Preview')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                props.onPreview?.(match.item);
              }}
            >
              <RemixIcon name="eye-line" size={14} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
```

`onMouseDown preventDefault` on every option (unchanged from today) is what keeps this whole widget APG-correct: clicking never moves real DOM focus into the popup, so `aria-activedescendant` on the textarea remains the only "position" assistive tech is told about, exactly as [the APG combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) requires.

### 5. Tovu-side capability registry (`apps/admin/src/features/plugins/capability-registry.ts`, NEW)

```ts
import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from "@jini-ai/chat/react";

/**
 * One entry in Tovu's own capability registry — deliberately richer than `ComposerDiscoveryItem`.
 * `preview` and `execute` are Tovu concepts `@jini-ai/chat` never sees; only `toDiscoveryItem()`'s
 * output crosses the package boundary. This is the "projection, not a second registry" shape Opus's
 * R1 named — every real source (the plugin catalog below, the ~20 `tool-registrations.ts`/
 * `agent-tools.ts` modules, MCP federation) is meant to feed the composer through this ONE shape,
 * making a brand-new capability kind "one more descriptor," never a composer change.
 *
 * `execute` is a single closure rather than Codex's apparently two-step "catalog + intent resolver"
 * shape (the only fragment of Codex's R2 design that survived into this packet's appendix — see
 * "Position And Movement" for why I couldn't reconcile with more than that fragment). I've taken the
 * NAME and the underlying idea — separate "what can be listed" from "what a typed value resolves
 * to" — but not split the API in two: nothing in the given files demonstrates a real need for a
 * resolve-without-execute step (confirmed this round: even OD's own reference composer has no live
 * value-completion for slash arguments, see "Sources"). Splitting the API now would be additive
 * complexity with no grounded justification; the split is one field away (`resolve?: (input) =>
 * Promise<Preview>` alongside `execute`) the day a real need appears.
 */
export interface TovuCapabilityDescriptor {
  /** Stable, namespaced id — matches the existing convention (`mcp:settings`, `agent-plugin:*`). */
  id: string;
  groupId: string;
  groupLabel: string;
  label: string;
  description?: string;
  /** Tovu's own taxonomy. Crosses into `ComposerDiscoveryItem.kind` for search/rendering only —
   * `@jini-ai/chat` is never allowed to branch on it (slots.ts:77-80). */
  kind: string;
  keywords?: readonly string[];
  argument?: { placeholder: string; required?: boolean };
  needsConfirmation?: boolean;
  /** Lazily loaded preview content, keyed by this same `id`. Rendered by the NEW
   * `CapabilityPreviewModal` component (below) — not a reuse of any existing Tovu preview surface;
   * none of the files in evidence show one with this exact shape. */
  preview?: () => Promise<{ title: string; files: ReadonlyArray<{ path: string; content: string }> }>;
  /** The actual effect. Receives the parsed argument (`undefined` for a bare selection) and returns
   * an outcome the host's `onDiscoverySelect` translates into a `ComposerDiscoveryOutcome`. */
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
    description: descriptor.description,
    kind: descriptor.kind,
    keywords: descriptor.keywords,
    ...(descriptor.argument ? { argument: descriptor.argument } : {}),
    ...(descriptor.needsConfirmation ? { needsConfirmation: true } : {}),
    ...(descriptor.preview ? { previewable: true } : {}),
    // Deferred items never take the package's synchronous macro path, so insertText is unused for
    // them — omitted rather than left stale.
    ...(deferred ? {} : { insertText: descriptor.label }),
  };
}

/** Groups descriptors by `groupId`, preserving first-seen order. Replaces the hand-authored
 * `TOVU_COMPOSER_DISCOVERY_GROUPS` array literal with a real projection. */
export function projectCapabilitiesToDiscoveryGroups(
  descriptors: readonly TovuCapabilityDescriptor[],
): ComposerDiscoveryGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, { label: string; items: ComposerDiscoveryItem[] }>();
  for (const descriptor of descriptors) {
    let group = byGroup.get(descriptor.groupId);
    if (!group) {
      group = { label: descriptor.groupLabel, items: [] };
      byGroup.set(descriptor.groupId, group);
      order.push(descriptor.groupId);
    }
    group.items.push(toDiscoveryItem(descriptor));
  }
  return order.map((id) => ({ id, label: byGroup.get(id)!.label, items: byGroup.get(id)!.items }));
}

/** Registry-keyed lookup `AssistantDock`'s handlers use to go from a selected `item.id` back to its
 * full descriptor — the half of the contract that never crosses into `@jini-ai/chat`. */
export function buildCapabilityIndex(
  descriptors: readonly TovuCapabilityDescriptor[],
): ReadonlyMap<string, TovuCapabilityDescriptor> {
  return new Map(descriptors.map((d) => [d.id, d] as const));
}

/**
 * Minimal structural shape a `tool-registrations.ts`/`agent-tools.ts` module's export would need to
 * satisfy to feed this registry. NOT verified against the real ~20 modules — none of them are in
 * `files/`, so this is an honest best guess at the seam, not a claim the exact shape is confirmed.
 * Wiring the real modules is follow-up integration work; this function is what that work would call.
 */
export interface ToolRegistrationLike {
  id: string;
  name: string;
  description: string;
  /** Whether invoking this tool has a side effect consequential enough to warrant a confirm gate —
   * left to each module to declare; defaults to requiring confirmation when unset (fail closed). */
  destructive?: boolean;
  invoke: (argument: string | undefined) => Promise<{ summary: string }>;
}

export function projectToolRegistrationsToCapabilities(
  registrations: readonly ToolRegistrationLike[],
  groupId = "tools",
  groupLabel = "Tools",
): TovuCapabilityDescriptor[] {
  return registrations.map((tool) => ({
    id: `tool:${tool.id}`,
    groupId,
    groupLabel,
    label: `/${tool.name}`,
    description: tool.description,
    kind: "tool",
    keywords: ["tool", tool.name.toLowerCase()],
    argument: { placeholder: "<args>", required: false },
    needsConfirmation: tool.destructive ?? true,
    execute: async ({ argument }) => {
      const result = await tool.invoke(argument);
      return { type: "inserted", text: result.summary };
    },
  }));
}
```

### 6. New, honest confirm + preview support (correcting Round 2's fabricated reuse claims)

`apps/admin/src/features/plugins/capability-confirm.tsx` (NEW):

```tsx
import { useCallback, useRef, useState } from "react";

interface ConfirmRequest {
  title: string;
  description?: string;
}

/**
 * A NEW, small, purely client-side confirmation gate for `ComposerDiscoveryItem.needsConfirmation`.
 * This is deliberately NOT the daemon-side `PendingConfirmationStore` (`src/assistant/
 * mcp-ui-tool-calls-route.ts`, reached via `AssistantDock.tsx:43-73`'s `createMcpUiToolCaller`),
 * which redeems a server-issued `tools/call` envelope through an admin-session-authenticated proxy
 * round trip. That mechanism is real but scoped specifically to MCP-UI dialogs; nothing here talks
 * to it. Round 2's code imported `requestPendingConfirmation` from a module that doesn't exist
 * anywhere in evidence and claimed it was that store — this file is the correction: a real,
 * self-contained "are you sure?" gate that runs entirely in this component's own state, resolved
 * before `TovuCapabilityDescriptor.execute()` is ever called.
 */
export function useCapabilityConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const requestConfirmation = useCallback((next: ConfirmRequest): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest(next);
    });
  }, []);

  const resolve = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const dialog = request ? (
    <div className="jini-composer-confirm-backdrop" role="presentation" onClick={() => resolve(false)}>
      <div
        className="jini-composer-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="jini-composer-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="jini-composer-confirm-title">{request.title}</h3>
        {request.description ? <p>{request.description}</p> : null}
        <div className="jini-composer-confirm-actions">
          <button type="button" onClick={() => resolve(false)}>
            Cancel
          </button>
          <button type="button" onClick={() => resolve(true)} autoFocus>
            Continue
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { requestConfirmation, dialog };
}
```

`apps/admin/src/features/plugins/capability-preview-modal.tsx` (NEW):

```tsx
import type { TovuCapabilityDescriptor } from "./capability-registry";

/**
 * A NEW, minimal preview surface for `TovuCapabilityDescriptor.preview()`. Round 2's code claimed
 * this reused `AgentPluginDetailsModal`'s `PreviewModalShell` + `CodeWithLines` — neither symbol
 * appears anywhere in the files provided this round, so that claim was unverifiable and is
 * withdrawn. This component is deliberately small; OD's own `ComposerPluginPreview.tsx`/
 * `ComposerSkillPreview` (title + description + hero content) is the closest real analogue in
 * evidence, adapted here for Tovu's file-list preview shape instead of OD's plugin-record shape.
 */
export function CapabilityPreviewModal({
  descriptor,
  onClose,
}: {
  descriptor: TovuCapabilityDescriptor;
  onClose: () => void;
}) {
  return (
    <div className="jini-composer-confirm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="jini-composer-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jini-composer-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="jini-composer-preview-title">{descriptor.label}</h3>
        {descriptor.description ? <p>{descriptor.description}</p> : null}
        <PreviewBody descriptor={descriptor} />
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function PreviewBody({ descriptor }: { descriptor: TovuCapabilityDescriptor }) {
  // Deliberately synchronous-looking but the caller (AssistantDock) is responsible for having
  // already resolved `descriptor.preview()` before mounting this modal — kept out of this
  // component so it stays a pure renderer, matching this package's own "renders the slots a host
  // supplies" posture (files/jini/Composer.tsx's own module doc, lines 1-13).
  return null; // Placeholder body wiring — the resolved { title, files } payload renders here.
}
```

### 7. Tovu-side projection (`files/tovu/agent-plugin-catalog.ts`, rewritten)

```ts
import {
  projectCapabilitiesToDiscoveryGroups,
  buildCapabilityIndex,
  type TovuCapabilityDescriptor,
} from "./capability-registry";
import { navigate } from "../../lib/router";
// Illustrative bindings for the two NEW commands (N1). The real functions live in whichever of the
// ~20 tool-registrations.ts/agent-tools.ts modules ends up owning web search — none of those
// modules are in the files provided this round, so naming an import here is a contract for what
// that module should export, not a claim it exists yet under this exact name.
import { runResearchTool } from "../../assistant/tool-registrations";

// ...TOVU_BUNDLED_AGENT_PLUGINS unchanged...

export const TOVU_CAPABILITY_DESCRIPTORS: readonly TovuCapabilityDescriptor[] = [
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
    // N1: /mcp is now argument-bearing. Bare selection navigates — same behavior the unmodified
    // file achieves today via `insertText: ""` (agent-plugin-catalog.ts:95), now via an explicit
    // outcome instead of relying on `""` surviving a `??` check.
    id: "mcp:settings",
    groupId: "mcp",
    groupLabel: "MCP",
    label: "/mcp",
    description: "Open settings, or type a server id to insert a hint",
    kind: "mcp",
    keywords: ["mcp", "server", "tools", "settings"],
    argument: { placeholder: "<server-id>" },
    execute: async ({ argument }) => {
      if (!argument) {
        navigate("/settings?tab=external-mcp");
        return { type: "navigated" };
      }
      return { type: "inserted", text: `Toggle, adopt, or jump to ${argument} settings.` };
    },
  },
  {
    // N1: /search genuinely executes. `required: true` means the package declines Enter/Tab until
    // a value follows the separator — see Composer.tsx's `selectSlashItem` guard.
    id: "search:web",
    groupId: "search",
    groupLabel: "Search",
    label: "/search",
    description: "Search the web through the OD research command",
    kind: "search",
    keywords: ["search", "research", "web"],
    argument: { placeholder: "<query>", required: true },
    execute: async ({ argument }) => {
      if (!argument) return { type: "noop" };
      const result = await runResearchTool(argument);
      return { type: "inserted", text: result.summary };
    },
  },
];

export const TOVU_COMPOSER_DISCOVERY_GROUPS = projectCapabilitiesToDiscoveryGroups(TOVU_CAPABILITY_DESCRIPTORS);
export const TOVU_CAPABILITY_INDEX = buildCapabilityIndex(TOVU_CAPABILITY_DESCRIPTORS);
```

### 8. `AssistantDock.tsx` call site (replacing the current `handleComposerDiscoverySelect`/`resolveTovuComposerDiscoveryRoute` at lines 270-273)

```tsx
import {
  TOVU_CAPABILITY_INDEX,
  TOVU_COMPOSER_DISCOVERY_GROUPS,
} from "../../features/plugins/agent-plugin-catalog";
import { useCapabilityConfirm } from "../../features/plugins/capability-confirm";
import { CapabilityPreviewModal } from "../../features/plugins/capability-preview-modal";

// ...inside AssistantDock()...
const { requestConfirmation, dialog: confirmDialog } = useCapabilityConfirm();
const [previewDescriptor, setPreviewDescriptor] = useState<TovuCapabilityDescriptor | null>(null);

const handleComposerDiscoverySelect = useCallback(
  async (selection: ComposerDiscoverySelection): Promise<{ draft?: string } | void> => {
    const descriptor = TOVU_CAPABILITY_INDEX.get(selection.item.id);
    if (!descriptor) return;
    if (descriptor.needsConfirmation) {
      const confirmed = await requestConfirmation({
        title: descriptor.label,
        description: descriptor.description,
      });
      if (!confirmed) return; // declined — draft was never mutated, nothing to restore
    }
    const outcome = await descriptor.execute({ argument: selection.argument });
    if (outcome.type === "navigated") return { draft: "" };
    if (outcome.type === "inserted") return { draft: outcome.text };
    return; // "noop" — leave the user's typed text alone (e.g. /search with no query yet)
  },
  [requestConfirmation],
);

const handleComposerDiscoveryPreview = useCallback((item: ComposerDiscoveryItem) => {
  const descriptor = TOVU_CAPABILITY_INDEX.get(item.id);
  if (descriptor?.preview) setPreviewDescriptor(descriptor);
}, []);

// ...in the returned JSX, alongside <ChatPane>...
{confirmDialog}
{previewDescriptor ? (
  <CapabilityPreviewModal descriptor={previewDescriptor} onClose={() => setPreviewDescriptor(null)} />
) : null}
<ChatPane
  /* ...unchanged props... */
  composerSlots={{
    discoveryGroups: TOVU_COMPOSER_DISCOVERY_GROUPS,
    onDiscoverySelect: handleComposerDiscoverySelect,
    onDiscoveryPreview: handleComposerDiscoveryPreview,
  }}
/>
```

### 9. Boundary check — proof against `slots.ts:77-80`

Every new conditional `@jini-ai/chat` runs is a presence/type check on a package-declared field, never a value comparison against a host taxonomy: `Boolean(match.item.argument || match.item.needsConfirmation)`, `match.item.argument?.required`, `match.item.previewable && props.onPreview`, `outcome && 'draft' in outcome`. Nowhere does `@jini-ai/chat` read `item.kind` for anything but the existing search/render path — both unchanged from today and already sanctioned by `slots.ts:77-80`'s own wording. A future host adding a `'tool'`-kind capability needs zero package changes.

## Critique Of Another Participant's Round 2 Code

**Target: `gemini-3.1-pro-high-round2`.** Three separate, grounded issues in one code block — not nitpicks, all three would ship a materially worse (in one case, a genuinely broken) product than what the packet's own Settled note demands.

**1. Disabling the textarea during the async host round-trip breaks the ARIA combobox contract it otherwise relies on.** Their R2 answer's final line: *"Bind `executing` to the textarea disabled state to lock it while awaiting the host."* Per [W3C's own combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/): "DOM Focus is maintained on the combobox and the assistive technology focus is moved within the listbox using `aria-activedescendant`." A `disabled` form control cannot hold DOM focus — the browser forcibly blurs it. Wiring `executing` to `disabled` means the exact moment a screen-reader user is mid-interaction with the slash palette (having just pressed Enter on an argument-bearing command), the input they're virtually "inside" via `aria-activedescendant` yanks real focus away underneath them. This isn't a corner case their own falsification test would catch either — "if the draft vanishes before the modal opens" checks the *visual* draft, not the *focus* state. [MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant) and [Sarah Higley's writeup](https://sarahmhigley.com/writing/activedescendant/) both confirm this focus-management rule is load-bearing, not decorative. My R3 code above (`discoveryBusy`) fixes this by using an `aria-live` announcement instead of ever touching `disabled`.

**2. `filterComposerDiscovery`'s post-space matching derives command identity from `item.label` — a value the package translates.** Their code (in the R2 appendix): `const itemCommand = item.label.startsWith('/') ? item.label.slice(1).toLowerCase() : ...`, then `if (item.acceptsArguments && itemCommand === normalizedCommand) matches.push(...)`. But `item.label` is rendered through `props.t(match.item.label)` in the real, unmodified `ComposerDiscovery.tsx:140`, and every user-facing string in this package flows through `useT()` per `slots.ts:159-164`'s own documented i18n policy ("the English string itself is the key"). Deriving a MATCH KEY from a value that's translated at render time means the moment a second locale exists, `/mcp` typed by a user reading a translated label no longer resolves to the same `itemCommand` the English-authored descriptor produces — a silent, locale-dependent breakage with no compile error and no test that would catch it without running in a non-English locale. `filterComposerDiscovery` should search `label` (fine, as every version including theirs does for the un-spaced case) but never use it as an identity key; a stable, untranslated `id` (as this design and Opus's/mine both use) is required for anything used as a lookup key, not display text.

**3. `replaceComposerSlashTrigger`'s guard is weaker than the version it replaces, reopening exactly the risk the packet's own Settled note warns about.** Original (`files/jini/composer-discovery.ts:38-39`): `parseComposerSlashQuery(draft) === null ? draft : insertText` — re-derives validity from the draft itself on every call. Their R2 replacement: `return draft.startsWith('/') ? insertText : draft;` — a substring check that says nothing about whether the draft is a *well-formed* trigger. `parseComposerSlashQuery('/mc/p')` returns `null` in both their code and mine (their special-case only covers the literal string `'/'`), yet `'/mc/p'.startsWith('/')` is `true` — so if this function is ever called with a draft that's out of sync with the render that computed `slashOpen` (a real risk in async-deferred flows exactly like the one their own R2 design introduces), it would authorize a whole-draft replacement for a draft their own parser considers invalid. This is the precise "coupled invariant" failure mode Opus's R1 and my own R1/R2 named as the central risk of this entire debate — reintroduced by simplifying the guard away from the parser instead of through it. See the regression test I added for this exact case in `composer-discovery.test.ts` above.

*(Lighter note, not the primary target: `gemini-3.6-flash-high-round2`'s `range: [0, draft.length]` field is never assigned any other value anywhere in their own code — see "Position And Movement" above for why I read that as dead generality rather than a defect worth a full critique slot.)*

## What Would Change My Mind

- **Concrete evidence of live value-completion need** — a filtered, real-value dropdown while typing an argument (the way `ComposerPlusMenu.tsx:892-949`'s MCP flyout already does, just reached through "+" instead of "/"). This is now backed by two independent reference implementations (OD, assistant-ui) that *also* don't do this in their slash palette, which raises my confidence the static-hint model is right, but it's still an empirical question about what Tovu's users actually need, not a settled one.
- **The real Codex R2 text**, if it turns up. I flagged the gap rather than guess at it; if the actual content shows a materially different, better-grounded contract than the single fragment I could reconcile with, I'd want to re-run this comparison for real.
- **A trigger that needs to start mid-draft** (not just mid-typing at position 0) — e.g., if `/`-commands are ever wanted alongside free text in one message the way OD's `@`-mentions already work via caret position. That's the concrete condition under which the `range`-tuple generality I declined to adopt from the Gemini R2 designs would stop being dead code and start being the right primitive.
- **If `apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx` (or an equivalent `PreviewModalShell`) turns out to actually exist** somewhere in the real Tovu tree outside this file set — my R2 code assumed it did; this round I couldn't verify it and built new instead. Confirmation either way would change whether `capability-preview-modal.tsx` above should be deleted in favor of reuse.

<<SWARM_END>>
