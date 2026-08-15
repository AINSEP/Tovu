ACK_PACKET_RECEIVED CTX-SLASH-R2-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

**Moved, on the point that mattered most; held, on the point that turns out to matter more.**

My Round 1 position was "B narrowed to the contract gap" (fix `insertText: ""`'s interaction with `selectSlashItem`'s `??`, fix the discarded promise at `Composer.tsx:89`), with an explicit sacrifice: "no argument grammar... a real UX ceiling I'm accepting rather than solving." N1 falsifies that sacrifice outright — arguments are a hard requirement, not a nice-to-have, and I retract it.

But working through *why* arguments break things, I no longer think they force the trigger-grammar rewrite Opus's R1 (and my own R1) flagged as "the expensive part of this work." Opus's warning was: relax the anchored regex and `replaceComposerSlashTrigger`'s whole-draft replacement "silently becomes destructive." That's true only if the grammar stops being anchored end-to-end. Keep it anchored — `/^\/([^\s/]*)(?:(\s+)([\s\S]*))?$/` still requires the draft to be *nothing but* the trigger, command, separator, and argument — and the exact same one-line guard in `replaceComposerSlashTrigger` (`parseComposerSlashQuery(draft) === null ? draft : insertText`) stays correct, unchanged, argument or not. The "coupled invariant" is real, but the fix is choosing the right anchor, not rewriting the replacement logic or porting the editor.

What survives from R1, now load-bearing rather than incidental: the package must stay ignorant of what an argument *means*. N4 ("capabilities I haven't even thought of yet") is the real constraint on this round, more than N1's screenshot — and it rules out D-style `kind`-branching even harder than R1's `slots.ts:77-80` citation did, because a `kind`-keyed dispatch table has to be edited for every new capability kind, which is precisely what N4 forbids. So my design keeps the package deciding only two structural, package-owned questions — "does this item need a value after the command name?" and "does its effect need to be deferred until the host resolves it?" — never "what *kind* of thing is this?"

The registry-ownership call from R1 ("already solved cleanly, don't relitigate") gets a real correction, not just a footnote: ownership was right, but N2 shows what's *inside* the host-owned box was a stub — four hand-typed entries standing in for the ~20-module registry Tovu actually has. That's not a new disagreement to debate; it's the concrete follow-on Opus's R1 "unlisted option" (projection over existing registries, not a second registry) predicted would be needed, and Codex's "two catalogs + intent resolver" and Gemini 3.6's "action-descriptor with host-driven draft middleware" both independently converge on the same shape. My Round 2 design is a synthesis of those three, not a solo idea — credit where due.

## Solution Slate

**Ranking criteria:** (1) satisfies N1–N4 literally without inventing UX the packet doesn't ask for; (2) never lets `@jini-ai/chat` learn a host taxonomy or grow a per-kind dispatch table (C1, `slots.ts:77-80`); (3) shippable this round — bounded diff, no new runtime dependency; (4) doesn't foreclose a bigger investment later if the product actually needs one.

### Option 1 — Declarative deferral + host-side capability projection (RECOMMENDED)

Two new presence-only fields on `ComposerDiscoveryItem` (`argument`, `needsConfirmation`) tell the package, structurally, "don't mutate the draft yourself for this one — defer to the host." A third (`previewable`) tells it "render a generic preview affordance for this row." `onDiscoverySelect`'s return value gains an optional `{ draft?: string }` outcome so the host can write back the *result* of resolving an argument (a real MCP hint, a search summary) without the package ever parsing or validating that argument. The trigger grammar grows one optional capture group but stays fully anchored, so `replaceComposerSlashTrigger` needs no logic change. Tovu-side, the static `TOVU_COMPOSER_DISCOVERY_GROUPS` array becomes a *projection* of a real `TovuCapabilityDescriptor[]` registry — the same shape any of the ~20 `tool-registrations.ts`/`agent-tools.ts` modules N2 names can also feed, satisfying N4 by construction: a brand-new capability kind is one more descriptor, not a composer change.

**Genuine sacrifice:** no live value-completion inside an argument. Typing `/mcp sup` does not filter a dropdown of real connected server ids the way OD's own MCP submenu search does (`ComposerPlusMenu.tsx:892-949`) — the palette shows a static placeholder (`<server-id>`), and the *host* validates/resolves whatever the user finally typed when they submit. This matches N1's screenshot literally (static placeholder text, not a live filtered list) but does not scale to "argument needs its own searchable picker" without more work.

### Option 2 — Port the trigger surface to a caret-aware model (OD's Lexical `TriggerPlugin`)

Adopt OD's shape wholesale: `LexicalComposerInput.tsx:311-348`'s `TriggerPlugin` derives `{mention, slash}` from the live caret position via `textBeforeCaretOnLine` + regex, independent of where in the draft the trigger sits, and `replaceActiveTrigger`/`insertMention` (`LexicalComposerInput.tsx:748-763`, `721-747`) mutate only the *token span*, not the whole draft. This is the only path that supports argument entry as a genuinely separate, richly-interactive sub-surface — e.g. a real filtered list of MCP server ids rendered as the user types the argument, or non-text argument widgets.

**Genuine sacrifice:** this is a different package, not a bigger diff. It adds a hard runtime dependency (`lexical`, `@lexical/react`) to a package whose R1-established value proposition is "plain textarea + regex, drop-in for any host" (Gemini 3.1's own words: "pure, unopinionated UI projection layer"). `TriggerPlugin` + `KeyboardPlugin` + `MentionAtomicNavigationPlugin` alone are ~230 lines before a single new command is added, none of it exercised by today's actual requirement (a static placeholder hint, not live completion). It also reopens a settled R1 question — "is there only ever one host" — because a Lexical-based composer is a materially bigger ask of every future host than a textarea is.

**Recommendation:** Option 1. **Cheapest falsifying test:** ship `/mcp <server-id>` and `/search <query>` accepting free-form typed text, validated/resolved by the host's `execute` binding at selection time (real code below). Watch what actually happens the first time a user types `/mcp sup` expecting to see their real connected servers. If the honest host-side error path (now visible, per the #3 fix below, instead of silently vanishing) is enough — users retype correctly, or the argument space is small enough that guessing is fine — Option 1 stands. If users consistently need to *see* the list to pick correctly, that's the signal Option 2's investment is justified, and nothing in Option 1's contract has to be thrown away to get there (the `argument` field and the `{draft}` outcome channel are still exactly what a future picker-based UI would key off of).

## Leading Option — Code

### 1. The descriptor contract (`files/jini/slots.ts`)

```ts
/**
 * Declares that a `ComposerDiscoveryItem` accepts a trailing argument, e.g. `/mcp <server-id>`.
 * The package reads only its PRESENCE — never a value, never a host taxonomy (see the existing
 * `kind` law two paragraphs below). When present, `Composer.tsx`'s `selectSlashItem` skips its
 * own draft mutation and lets `ComposerSlots.onDiscoverySelect`'s resolved outcome own the final
 * draft text instead, because only the host knows what a given argument value resolves to.
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
  /** See {@link ComposerDiscoveryArgument}. Unused (and safely ignorable) for macro-only items. */
  argument?: ComposerDiscoveryArgument;
  /**
   * True when the host must gate this item's effect behind a confirmation step (Tovu's existing
   * `PendingConfirmationStore` + redemption route, ADR-053 Decision 3) before it commits. Same
   * deferral as `argument` — package skips its own draft mutation, host owns the outcome — so a
   * declined confirmation leaves the draft exactly as the user typed it, nothing to restore.
   */
  needsConfirmation?: boolean;
  /**
   * True when this item has host-owned preview content worth surfacing before selection (N3).
   * The package renders a generic preview affordance (see `ComposerSlashMenu` below) that calls
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
   * `undefined` means no argument was typed at all (a bare `/command`). This is exactly N1.2's
   * "one command, two behaviors, chosen by argument presence" split, expressed as data the host
   * switches on — never as a decision the package makes.
   */
  argument?: string;
}

/**
 * What a host's `onDiscoverySelect` may resolve to besides nothing. `draft`, when present,
 * becomes the composer's new draft — the channel an argument-bearing or confirmation-gated item
 * uses to write back its real outcome (an inserted hint, a cleared draft after navigating)
 * without the package ever parsing what the argument meant.
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
  /**
   * Optional per-item preview trigger — see `ComposerDiscoveryItem.previewable`. Omit to hide the
   * affordance entirely; the package never renders a preview SURFACE itself, only the button that
   * calls this. What "preview" means (a modal, a flyout, `PreviewModalShell` + `CodeWithLines`) is
   * entirely the host's concern, same neutrality posture as `onDiscoverySelect`.
   */
  onDiscoveryPreview?: (item: ComposerDiscoveryItem) => void;
  mentionSources?: MentionSource[];
  leadingAccessories?: ReactNode;
  footerAccessories?: ReactNode;
  onAttach?: (a: ChatAttachment) => void;
  annotationAdapter?: AnnotationAdapter;
}
```

### 2. The trigger grammar (`files/jini/composer-discovery.ts`) + tests

```ts
import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from '../slots.js';

export interface ComposerDiscoveryMatch {
  groupId: string;
  groupLabel: string;
  item: ComposerDiscoveryItem;
}

/**
 * A parsed `/command` or `/command argument…` token, anchored to the WHOLE draft. `command` is
 * the substring between `/` and the first run of whitespace (or the rest of the draft when there
 * is none yet); `argument` is `null` until the user has typed at least one space after the
 * command name, then holds everything after that whitespace (possibly `""`).
 *
 * Keeping the anchor (`^...$`) end-to-end — not just at the start — is what keeps
 * `replaceComposerSlashTrigger` safe even with arguments: when this returns non-null, the draft
 * contains nothing but the trigger (command + separator + argument), so replacing the entire
 * draft can never eat text the user typed outside the command. Round 1 (Opus, primary) correctly
 * flagged the *risk* of "regex and replacement are coupled invariants that must change together";
 * the resolution is choosing an anchor that keeps the invariant true, not changing the
 * replacement function.
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
 * is what keeps `/mcp supabase` still matching the `/mcp` row instead of the argument text
 * pruning it out of the list the moment it stops resembling any label/keyword.
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
 * present. Unchanged from Round 1: still a one-line guard, still correct with arguments, because
 * `parseComposerSlashQuery` staying anchored end-to-end guarantees there is nothing else in the
 * draft to accidentally destroy. Only called for items that do NOT declare `argument` or
 * `needsConfirmation` — see `Composer.tsx`'s `selectSlashItem` for the deferral this pairs with.
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

Tests (`files/jini/__tests__/composer-discovery.test.ts`, vitest):

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

  it('parses a bare command with no argument typed yet (unchanged from Round 1 behavior)', () => {
    expect(parseComposerSlashQuery('/mcp')).toEqual({ command: 'mcp', argument: null });
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

  it('rejects a second slash in the COMMAND position (pre-argument) — same as Round 1', () => {
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
});
```

### 3 & 5. The execution seam + confirmation (`files/jini/Composer.tsx` call sites)

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

// ...ComposerProps unchanged...

export function Composer({ composer, onSend, disabled = false, sendDisabled = false, placeholder, slots, attachmentPicker, running = false, onCancel }: ComposerProps) {
  const t = useT();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [discoveryMenuOpen, setDiscoveryMenuOpen] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [dismissedSlashDraft, setDismissedSlashDraft] = useState<string | null>(null);
  // NEW: surfaces a rejected/failed onDiscoverySelect (Round 1's `void slots?.onDiscoverySelect?.(...)`
  // finding — Composer.tsx:89 discarded the promise, so a failing async host handler vanished
  // silently). Cleared on the next keystroke or the next successful selection.
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
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
   * Awaits the host's effect instead of discarding the promise (fixes Round 1's `Composer.tsx:89`
   * finding). `restoreDraft` is the draft as it stood BEFORE this selection — captured by the
   * caller, not read fresh here, because for argument/confirmation-deferred items nothing has
   * mutated the draft yet at call time, and for macro items the caller already applied its own
   * synchronous mutation before this runs. On success, an `outcome.draft` (if the host supplied
   * one) becomes the new draft — this is the channel an argument-bearing item's real outcome
   * (a resolved hint, a cleared draft after navigating) reaches the UI through, without this
   * component ever parsing what the argument meant. On rejection, the draft is restored and a
   * generic, non-diagnostic message is shown; the package never inspects *why* the host failed.
   */
  async function notifyDiscovery(
    item: ComposerDiscoveryItem,
    source: 'plus' | 'slash',
    restoreDraft: string,
    argument?: string,
  ) {
    setDiscoveryError(null);
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
    }
  }

  function selectSlashItem(index: number) {
    const match = slashMatches[index];
    if (!match) return;
    const priorDraft = composer.draft;
    // Structural decision only — presence of `argument`/`needsConfirmation`, never `item.kind`.
    // This is the whole of the package's "policy": defer, or apply the macro text myself.
    const deferToHost = Boolean(match.item.argument || match.item.needsConfirmation);
    const argument = match.item.argument ? (slashQuery?.argument ?? '') : undefined;
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
      {discoveryError ? (
        <div className="jini-composer-discovery-error" role="alert">
          {discoveryError}
        </div>
      ) : null}
      <div className="jini-composer-footer">
        {/* ...attachment picker / ComposerDiscoveryMenu / footerAccessories / plusMenuItems /
            send-or-stop button all unchanged from Round 1... */}
      </div>
    </div>
  );
}
```

Preview affordance (`files/jini/ComposerDiscovery.tsx`, `ComposerSlashMenu` only — `ComposerDiscoveryMenu` unchanged):

```tsx
export interface ComposerSlashMenuProps {
  matches: readonly ComposerDiscoveryMatch[];
  activeIndex: number;
  onSelect: (item: ComposerDiscoveryItem) => void;
  /** See `ComposerDiscoveryItem.previewable` / `ComposerSlots.onDiscoveryPreview`. */
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

### 4. Preview + N4 extensibility + N2 registry (Tovu-side)

New file, `apps/admin/src/features/plugins/capability-registry.ts` — this is the "capability projection" every Round 1 participant converged toward under a different name (Opus's "projection, not a second registry"; Codex's "two catalogs + intent resolver"; Gemini 3.6's "action-descriptor with host-driven draft middleware"):

```ts
import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from "@jini-ai/chat/react";

/**
 * One entry in Tovu's own capability registry — deliberately richer than `ComposerDiscoveryItem`.
 * `preview` and `execute` are Tovu concepts `@jini-ai/chat` never sees; only `toDiscoveryItem()`'s
 * output crosses the package boundary. Every real source — the plugin catalog below, the
 * `tool-registrations.ts`/`agent-tools.ts` modules N2 names, MCP federation, tool-catalog-query's
 * keyword/doc2query layer — feeds the composer through this ONE shape. That is what makes N4
 * ("capabilities I haven't even thought of yet") true by construction: a new kind is one more
 * descriptor pushed into this array, never a composer change or a new switch arm anywhere in
 * `@jini-ai/chat`.
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
  /**
   * Lazily loaded preview content, keyed by this same `id`. This is what turns
   * `AgentPluginDetailsModal.tsx`'s existing `PreviewModalShell` + `CodeWithLines` rendering (N3)
   * from "hardcoded to one bundled plugin's `UI_UX_DESIGN_SOURCE_FILES`" into generic — any
   * descriptor that supplies this function gets a working preview button for free.
   */
  preview?: () => Promise<{ title: string; files: ReadonlyArray<{ path: string; content: string }> }>;
  /**
   * The actual effect. Receives the parsed argument (`undefined` for a bare selection) and
   * returns an outcome the host's `onDiscoverySelect` translates into a `ComposerDiscoveryOutcome`
   * — see `AssistantDock.tsx` below.
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
    description: descriptor.description,
    kind: descriptor.kind,
    keywords: descriptor.keywords,
    ...(descriptor.argument ? { argument: descriptor.argument } : {}),
    ...(descriptor.needsConfirmation ? { needsConfirmation: true } : {}),
    ...(descriptor.preview ? { previewable: true } : {}),
    // Deferred items never take the package's synchronous macro path (Composer.tsx's
    // selectSlashItem), so insertText here is unused for them — omitted rather than left stale.
    ...(deferred ? {} : { insertText: descriptor.label }),
  };
}

/** Groups descriptors by `groupId`, preserving first-seen order. Replaces the hand-authored
 * `TOVU_COMPOSER_DISCOVERY_GROUPS` array literal (N2) with a real projection. */
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

/** Registry-keyed lookup `AssistantDock`'s `onDiscoverySelect`/`onDiscoveryPreview` handlers use
 * to go from a selected `item.id` back to its full descriptor — the half of the contract that
 * never crosses into `@jini-ai/chat`. */
export function buildCapabilityIndex(
  descriptors: readonly TovuCapabilityDescriptor[],
): ReadonlyMap<string, TovuCapabilityDescriptor> {
  return new Map(descriptors.map((d) => [d.id, d] as const));
}
```

`agent-plugin-catalog.ts`, rewritten to produce descriptors instead of a `ComposerDiscoveryGroup[]` literal — the four existing rows plus N1's two new commands:

```ts
import { projectCapabilitiesToDiscoveryGroups, buildCapabilityIndex, type TovuCapabilityDescriptor } from "./capability-registry";
import { navigate } from "../../lib/router";
// Illustrative bindings — the real functions live in AgentPluginDetailsModal's loader (N3) and
// one of the tool-registrations.ts modules (N2); naming them here is a contract, not a claim that
// these exact exports exist yet.
import { loadAgentPluginPreview } from "./agent-plugin-source-catalog";
import { runResearchTool } from "../../assistant/tool-registrations";

// ...TOVU_BUNDLED_AGENT_PLUGINS unchanged...

/**
 * The composer's capability list as descriptors (N2), not a hand-authored `ComposerDiscoveryGroup[]`.
 * Wiring the full ~20-module registry N2 names into this array is follow-up work using this exact
 * contract — this slice covers the four existing rows plus N1's two additions with real `execute`
 * bindings instead of catalog-only text.
 */
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
    preview: () => loadAgentPluginPreview("ui-ux-design"),
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
    // N1: /mcp is now argument-bearing. Bare selection navigates (matches today's
    // `insertText: ""` behavior exactly, but now via an explicit outcome instead of relying on
    // `""` surviving a `??` check — N1's coordinator finding that today's blanking is
    // *intentional*, not a bug, is preserved, just made structural instead of incidental).
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
    // N1: /search genuinely executes. required:true means the palette can decline to select this
    // row with Enter until a space + at least one character has been typed — same enforcement
    // shape `resolveComposerSlashKeyAction`'s 'select' action already checks against, no new
    // package mechanism needed beyond reading `required` the same way `argument` is already read.
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

`AssistantDock.tsx` call site (`handleComposerDiscoverySelect`, replacing `resolveTovuComposerDiscoveryRoute`; new `handleComposerDiscoveryPreview`):

```tsx
import {
  TOVU_CAPABILITY_INDEX,
  TOVU_COMPOSER_DISCOVERY_GROUPS,
} from "../../features/plugins/agent-plugin-catalog";
import { requestPendingConfirmation } from "../../lib/pending-confirmation"; // ADR-053's existing store
import { openCapabilityPreviewModal } from "../../features/plugins/capability-preview-modal"; // reuses AgentPluginDetailsModal's PreviewModalShell

// ...inside AssistantDock()...
const handleComposerDiscoverySelect = useCallback(
  async (selection: ComposerDiscoverySelection): Promise<{ draft?: string } | void> => {
    const descriptor = TOVU_CAPABILITY_INDEX.get(selection.item.id);
    if (!descriptor) return;
    if (descriptor.needsConfirmation) {
      // Two-phase shape per #5: same PendingConfirmationStore + redemption route the MCP-UI
      // "Delete" dialog already uses (AssistantDock.tsx:53-64 in Round 1's file set). Declining
      // resolves without throwing — nothing was destroyed, since selection never mutated the
      // draft for a needsConfirmation item in the first place.
      const confirmed = await requestPendingConfirmation({
        title: descriptor.label,
        description: descriptor.description,
      });
      if (!confirmed) return;
    }
    const outcome = await descriptor.execute({ argument: selection.argument });
    if (outcome.type === "navigated") return { draft: "" };
    if (outcome.type === "inserted") return { draft: outcome.text };
    return; // "noop" — leave the user's typed text alone (e.g. /search with no query yet)
  },
  [],
);

const handleComposerDiscoveryPreview = useCallback((item: ComposerDiscoveryItem) => {
  const descriptor = TOVU_CAPABILITY_INDEX.get(item.id);
  if (!descriptor?.preview) return;
  openCapabilityPreviewModal(descriptor); // same PreviewModalShell + CodeWithLines N3 already ships
}, []);

// ...in the <ChatPane> JSX...
composerSlots={{
  discoveryGroups: TOVU_COMPOSER_DISCOVERY_GROUPS,
  onDiscoverySelect: handleComposerDiscoverySelect,
  onDiscoveryPreview: handleComposerDiscoveryPreview,
}}
```

### 6. Boundary check — proof against `slots.ts:77-80`

Every new conditional `@jini-ai/chat` runs is a presence/type check on a package-declared field, never a value comparison against a host taxonomy:

- `Composer.tsx`: `Boolean(match.item.argument || match.item.needsConfirmation)` — booleans/optionals the package itself defines the shape of.
- `Composer.tsx`: `match.item.argument ? (slashQuery?.argument ?? '') : undefined` — same.
- `ComposerDiscovery.tsx`: `match.item.previewable && props.onPreview` — same.
- `notifyDiscovery`: `outcome && 'draft' in outcome && outcome.draft !== undefined` — reading the shape of a value the package itself defined (`ComposerDiscoveryOutcome`), not interpreting host semantics.

Nowhere does `@jini-ai/chat` read `item.kind` for anything but the existing search/render path (`filterComposerDiscovery`'s `searchable` string, `ComposerDiscoveryMenu`'s label rendering) — both unchanged from today, both already sanctioned by `slots.ts:77-80`'s own wording ("filters and renders the value but never switches on it"). No `if (kind === 'mcp')` or dispatch table exists anywhere in the package. A future host adding a `'tool'`-kind capability needs zero package changes — it needs one more `TovuCapabilityDescriptor` with an `execute` binding, entirely on Tovu's side of the boundary.

## Strongest Counter-Argument

Codex's R1 "E: intent-first, host-executed, separate argument-collection UI" and my own Option 2 both point at the same real weakness: cramming argument entry into "more characters at the end of an already-typed draft" is a hack that reads fine for one static placeholder hint, and reads increasingly strained the moment a command's argument wants to be anything richer than free text — a filtered list of real values (live MCP servers), a structured multi-field input, or non-textual selection. OD's own `ComposerPlusMenu` MCP submenu (`ComposerPlusMenu.tsx:892-949`) already proves the *product* wants exactly that kind of live-filtered picker for MCP servers elsewhere in the same UI — it would be a strange product to accept "type the server id and hope" in the slash palette while offering a searchable list two pixels away in the "+" menu for the identical resource. If that inconsistency turns out to be user-visible and bothersome rather than acceptable, Option 1's static-placeholder-then-host-validates model is the wrong shape, and no amount of extending `ComposerDiscoveryItem` fixes it — only a caret-aware, token-range-based input (Option 2) can host a live sub-picker inside an in-progress argument span.

## What Would Change My Mind

Concrete evidence — not speculation — that an argument needs LIVE VALUE COMPLETION (a filtered list of real, already-known values shown while the user types, the way OD's MCP submenu search already does for the "+" menu) or a genuinely non-textual input (a date, a multi-select, a structured form). Either would falsify Option 1's "static placeholder is enough" premise and justify Option 2's dependency and blast-radius cost. Absent that, I'd also reconsider if the `{draft}` outcome channel turns out to be too coarse in practice — e.g. if a host needs to insert a *rich* (non-plain-text) draft element, which today's `composer.draft: string` model has no way to express regardless of which option wins.

<<SWARM_END>>
