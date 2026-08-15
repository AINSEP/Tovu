I’ll read the packet and every Round 2 appendix entry first, then inspect the referenced source implementations and verify the decisive technical claims against primary online sources. I’ll keep all local reads inside the working directory and return the exact packet-prescribed structure.
I’ve completed the packet, including all participant responses. The main implementation question is now narrower than several Round 2 answers assumed: the final contract must fit the provided source exactly, and the “live projection” must be derived from the real Tovu registration modules represented here—not from invented hooks, transports, confirmation stores, or preview APIs. I’m checking each concrete contract and line now.
The source check exposes two important corrections to Round 2. First, the package should not add host concepts such as confirmation or preview execution just to solve this debate; `kind` is explicitly display/filter-only at `files/jini/slots.ts:77-80`. Second, importing server-side tool modules into `AssistantDock.tsx` would leak Node-only registration code into the browser bundle. The sound “real projection” boundary is a sanitized catalog emitted from the already-assembled server registry, then projected into composer descriptors client-side. I’m validating the comparable slash-command and ARIA behavior now.
The converged behavior is now concrete: selecting a partial command completes it (for example, `/se` → `/search `) without firing the host; selecting a complete invocation calls the host with `null` for “no separator,” `""` for “separator but no value,” or the typed argument. Host failures are caught, visible, and cannot overwrite a draft the user changed while the effect was pending. The ARIA fix uses per-composer, stable option IDs and revalidates the active option after filtering; the typed argument itself is not an accessibility problem.
ACK_PACKET_RECEIVED CTX-SLASH-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

I recommend a synthesis of **primary-opus5-round2** and **sonnet5-round2**:

- From Opus: slash discovery is a projection of Tovu’s authoritative capability registry, never a second hand-maintained registry; Jini owns parsing and interaction while Tovu owns effects.
- From Sonnet: keep the parser anchored end-to-end and represent the command and trailing argument separately.
- Correction to both: selecting an incomplete command must **finish it**, not call the host or clear the draft. `/se` selecting Search becomes `/search `; only a complete invocation reaches `onDiscoverySelect`.
- Correction to the Round 2 projections: the four-item literal at [agent-plugin-catalog.ts:42](/tmp/ads-peer-dispatch/debate-slash/files/tovu/agent-plugin-catalog.ts:42) cannot be replaced by invented hooks or six new hand-written descriptors. The browser must consume a sanitized snapshot of the already-assembled server registry used by the approximately twenty registration modules.

No Lexical port is justified. Open Design’s hints are ordinary row metadata (`argHint`) at [ChatComposer.head.tsx:157](/tmp/ads-peer-dispatch/debate-slash/files/opendesign/ChatComposer.head.tsx:157); its Lexical implementation adds caret/state machinery at [LexicalComposerInput.tsx:311](/tmp/ads-peer-dispatch/debate-slash/files/opendesign/LexicalComposerInput.tsx:311) and [LexicalComposerInput.tsx:748](/tmp/ads-peer-dispatch/debate-slash/files/opendesign/LexicalComposerInput.tsx:748) that this whole-draft grammar does not need.

## Sources

- [Slack’s official slash-command documentation](https://docs.slack.dev/interactivity/implementing-slash-commands/) confirms the useful grammar: a command followed by one opaque `text` value containing everything after the first separator. It also explicitly recommends a short Usage Hint displayed in the autocomplete entry. This supports `{ command, argument }` plus row-level `<query>` metadata.
- [GitHub Copilot CLI’s official command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) documents an `argument-hint` string shown in the skill picker, including examples such as `[target] [mode]`. This directly confirms that argument hints do not require a rich-text editor.
- [VS Code’s Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat) confirms that registered slash commands appear in a composer list with declarative descriptions and can be followed by normal prompt text.
- [Discord’s application-command documentation](https://docs.discord.com/developers/interactions/application-commands) confirms that structured options and dynamic option autocomplete are a viable richer alternative. It does **not** show that every slash composer needs that machinery; it establishes the threshold for Option 2.
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria/) confirms that a focused `textbox` may reference an option in a controlled `listbox` through `aria-activedescendant`. The typed token becoming longer does not invalidate that relationship. The referenced ID must, however, identify a real owned option and the active option should remain visible.
- [WAI’s editable list-autocomplete example](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/) confirms that DOM focus may remain in the textbox while the suggestion list is filtered, provided `aria-activedescendant`, visual selection, and scrolling are updated together.
- [ARIA in HTML](https://www.w3.org/TR/html-aria/) contradicts a tempting “fix”: a `<textarea>` may not be changed to `role="combobox"`; its permitted role remains `textbox`. Keep its native textbox semantics.
- [React’s `useId` reference](https://react.dev/reference/react/useId) confirms it is intended for unique accessibility relationship IDs. This replaces the globally hardcoded listbox and index-only option IDs at [ComposerDiscovery.tsx:124](/tmp/ads-peer-dispatch/debate-slash/files/jini/ComposerDiscovery.tsx:124).

The loud contradiction: argument-bearing commands do **not** force Lexical, and dynamic filtering does **not** inherently break `aria-activedescendant`. What breaks accessibility is retaining a stale/nonexistent active option, reusing fixed IDs across multiple composers, or failing to scroll the active option into view.

## Solution Slate

Ranking criteria, in order:

1. Preserve Jini’s provider-neutral boundary at [slots.ts:77](/tmp/ads-peer-dispatch/debate-slash/files/jini/slots.ts:77).
2. Correctly distinguish incomplete commands, bare commands, empty arguments, and populated arguments.
3. Project every registered Tovu tool exactly once without shipping server registration modules to the browser.
4. Preserve drafts across asynchronous failures and races.
5. Meet the documented textbox/listbox accessibility relationship without porting editors.

1. **Anchored parser + finish/invoke state machine + server-registry projection — recommended.**

   The package completes partial commands and delegates complete invocations. Tovu exposes a sanitized catalog from its assembled tool registry and projects that data into composer rows.

   Trade-offs: smallest dependency and UI increase; directly compatible with the current textarea; new registered tools appear automatically.

   Genuine sacrifice: arguments remain one opaque trailing string. A tool needing individually typed fields, choices, or live server-name completion must interpret that string in Tovu or move to Option 2.

2. **Structured argument mode with a second listbox/form stage.**

   After command selection, retain the textarea but open a dedicated argument picker driven by JSON-schema fields, choices, and host-provided autocomplete.

   Trade-offs: supports Discord-like typed fields and live MCP-server completion without Lexical.

   Genuine sacrifice: substantially more state, keyboard routing, validation, ARIA relationships, and host APIs. It also makes arbitrary free-form command text slower.

Recommendation: Option 1.

Cheapest falsifying test: one integration test types `/se`, presses Enter, verifies the draft becomes `/search ` without invoking Tovu, then types `accessibility`, presses Enter, and verifies exactly one host call with `argument: "accessibility"`. While each character is typed, assert that any `aria-activedescendant` names an existing `role="option"`. A failure in any assertion falsifies the design.

## Leading Option — Code

**1. Descriptor contract — `files/jini/slots.ts`**

This is additive and never switches on `kind`.

```ts
export interface ComposerDiscoveryArgument {
  /** Machine-readable name, e.g. "query". */
  name: string;
  /** Menu chrome, e.g. "<query>". */
  placeholder: string;
  required?: boolean;
}

export interface ComposerDiscoveryCommand {
  /** Command without the leading slash. */
  name: string;
  /** Omit when the command accepts no trailing value. */
  argument?: ComposerDiscoveryArgument;
}

export interface ComposerDiscoveryItem {
  id: string;
  label: string;
  description?: string;
  /**
   * Open host taxonomy. Jini may search/render it but must never dispatch on it.
   */
  kind?: string;
  keywords?: readonly string[];
  /** Backward-compatible text insertion for non-command discovery items. */
  insertText?: string;
  /** Optional slash-command surface for this item. */
  command?: ComposerDiscoveryCommand;
}

export interface ComposerDiscoveryGroup {
  id: string;
  label: string;
  items: readonly ComposerDiscoveryItem[];
}

export interface ComposerDiscoveryInvocation {
  command: string;
  /**
   * null: no separator was typed (`/mcp`)
   * "": a separator exists but no argument follows (`/mcp `)
   * otherwise: the verbatim trailing argument
   */
  argument: string | null;
}

export interface ComposerDiscoverySelection {
  item: ComposerDiscoveryItem;
  source: 'plus' | 'slash';
  /** Draft at activation time, before an optimistic legacy insertion. */
  draft: string;
  /** Present only for a completed slash-command invocation. */
  invocation?: ComposerDiscoveryInvocation;
}

export interface ComposerDiscoveryOutcome {
  /** Replace the draft only when the host explicitly supplies this property. */
  draft?: string;
}

export type ComposerDiscoverySelect = (
  selection: ComposerDiscoverySelection,
) =>
  | void
  | ComposerDiscoveryOutcome
  | Promise<void | ComposerDiscoveryOutcome>;

export interface ComposerSlots {
  plusMenuItems?: ComposerPlusItem[];
  discoveryGroups?: readonly ComposerDiscoveryGroup[];
  onDiscoverySelect?: ComposerDiscoverySelect;
  mentionSources?: MentionSource[];
  leadingAccessories?: ReactNode;
  footerAccessories?: ReactNode;
  onAttach?: (a: ChatAttachment) => void;
  annotationAdapter?: AnnotationAdapter;
}
```

At [ComposerDiscovery.tsx:150](/tmp/ads-peer-dispatch/debate-slash/files/jini/ComposerDiscovery.tsx:150), replace the now-stale duplicate type with:

```ts
export type { ComposerDiscoverySelect } from '../slots.js';
```

**2. Parser, filtering, completion planning — `files/jini/composer-discovery.ts`**

```ts
import type {
  ComposerDiscoveryGroup,
  ComposerDiscoveryInvocation,
  ComposerDiscoveryItem,
} from '../slots.js';

export interface ComposerDiscoveryMatch {
  groupId: string;
  groupLabel: string;
  item: ComposerDiscoveryItem;
}

export interface ComposerSlashQuery {
  command: string;
  /**
   * null until a separator is typed; afterwards contains the complete
   * trailing argument, including internal spaces and slashes.
   */
  argument: string | null;
}

const SLASH_QUERY_RE = /^\/([^\s/]*)(?:(\s+)([\s\S]*))?$/;

export function parseComposerSlashQuery(
  draft: string,
): ComposerSlashQuery | null {
  const match = SLASH_QUERY_RE.exec(draft);
  if (!match) return null;

  return {
    command: match[1] ?? '',
    argument: match[2] === undefined ? null : (match[3] ?? ''),
  };
}

function commandKey(value: string): string {
  return value.replace(/^\/+/, '').toLocaleLowerCase();
}

/**
 * Before an argument separator, ordinary fuzzy discovery applies, with an
 * exact command match placed first. After a separator, the option set locks
 * to the exact argument-bearing command.
 *
 * The string overload preserves existing non-parser callers.
 */
export function filterComposerDiscovery(
  groups: readonly ComposerDiscoveryGroup[],
  query: string | ComposerSlashQuery,
): ComposerDiscoveryMatch[] {
  const parsed =
    typeof query === 'string'
      ? { command: query, argument: null }
      : query;

  const normalizedCommand = commandKey(parsed.command.trim());
  const exact: ComposerDiscoveryMatch[] = [];
  const fuzzy: ComposerDiscoveryMatch[] = [];

  for (const group of groups) {
    for (const item of group.items) {
      const match = {
        groupId: group.id,
        groupLabel: group.label,
        item,
      };

      const declaredCommand = item.command
        ? commandKey(item.command.name)
        : null;

      if (parsed.argument !== null) {
        if (
          declaredCommand === normalizedCommand &&
          item.command?.argument
        ) {
          exact.push(match);
        }
        continue;
      }

      const searchable = [
        item.label,
        item.description,
        item.kind,
        item.command?.name,
        item.command?.argument?.placeholder,
        ...(item.keywords ?? []),
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLocaleLowerCase();

      if (
        normalizedCommand === '' ||
        searchable.includes(normalizedCommand)
      ) {
        if (declaredCommand === normalizedCommand) exact.push(match);
        else fuzzy.push(match);
      }
    }
  }

  return [...exact, ...fuzzy];
}

export type ComposerSlashSelectionResolution =
  | {
      /**
       * The command was partial or lacked a required argument. Update the
       * draft and do not notify the host.
       */
      type: 'finish';
      draft: string;
    }
  | {
      /** A legacy macro or complete invocation is ready for selection. */
      type: 'select';
      draft?: string;
      invocation?: ComposerDiscoveryInvocation;
    };

function commandPrefix(item: ComposerDiscoveryItem): string {
  const command = item.command;
  if (!command) return item.insertText ?? item.label;
  return `/${command.name}${command.argument ? ' ' : ''}`;
}

export function resolveComposerSlashSelection(
  draft: string,
  item: ComposerDiscoveryItem,
): ComposerSlashSelectionResolution | null {
  const query = parseComposerSlashQuery(draft);
  if (!query) return null;

  if (!item.command) {
    return {
      type: 'select',
      draft: replaceComposerSlashTrigger(
        draft,
        item.insertText ?? item.label,
      ),
    };
  }

  const exact =
    commandKey(query.command) === commandKey(item.command.name);

  if (!exact) {
    return { type: 'finish', draft: commandPrefix(item) };
  }

  if (
    item.command.argument?.required &&
    !(query.argument ?? '').trim()
  ) {
    return { type: 'finish', draft: commandPrefix(item) };
  }

  return {
    type: 'select',
    invocation: {
      command: item.command.name,
      argument: query.argument,
    },
  };
}

/**
 * Whole-draft replacement remains safe because the parser remains anchored
 * at both ends even after admitting arguments.
 */
export function replaceComposerSlashTrigger(
  draft: string,
  insertText: string,
): string {
  return parseComposerSlashQuery(draft) === null ? draft : insertText;
}

export function appendComposerDiscovery(
  draft: string,
  insertText: string,
): string {
  if (draft.trim() === '') return insertText;
  return `${draft.trimEnd()} ${insertText}`;
}

export type ComposerSlashKeyAction =
  | { type: 'move'; offset: -1 | 1 }
  | { type: 'select' }
  | { type: 'dismiss' }
  | { type: 'none' };

export function resolveComposerSlashKeyAction(
  key: string,
  shiftKey: boolean,
): ComposerSlashKeyAction {
  if (key === 'ArrowDown') return { type: 'move', offset: 1 };
  if (key === 'ArrowUp') return { type: 'move', offset: -1 };
  if ((key === 'Enter' || key === 'Tab') && !shiftKey) {
    return { type: 'select' };
  }
  if (key === 'Escape') return { type: 'dismiss' };
  return { type: 'none' };
}

export function composerSlashOptionId(
  listboxId: string,
  match: ComposerDiscoveryMatch,
): string {
  return `${listboxId}-option-${encodeURIComponent(
    `${match.groupId}:${match.item.id}`,
  )}`;
}
```

**Parser and finish/invoke tests — Vitest**

```ts
import { describe, expect, it } from 'vitest';
import type { ComposerDiscoveryGroup } from '../../slots.js';
import {
  filterComposerDiscovery,
  parseComposerSlashQuery,
  replaceComposerSlashTrigger,
  resolveComposerSlashSelection,
} from '../composer-discovery.js';

const groups: ComposerDiscoveryGroup[] = [
  {
    id: 'commands',
    label: 'Commands',
    items: [
      {
        id: 'mcp:settings',
        label: '/mcp',
        command: {
          name: 'mcp',
          argument: {
            name: 'server-id',
            placeholder: '<server-id>',
          },
        },
      },
      {
        id: 'tool:search',
        label: '/search',
        keywords: ['web', 'research'],
        command: {
          name: 'search',
          argument: {
            name: 'query',
            placeholder: '<query>',
            required: true,
          },
        },
      },
    ],
  },
];

describe('parseComposerSlashQuery', () => {
  it.each([
    ['/', { command: '', argument: null }],
    ['/mcp', { command: 'mcp', argument: null }],
    ['/mcp ', { command: 'mcp', argument: '' }],
    [
      '/search open design composer',
      { command: 'search', argument: 'open design composer' },
    ],
    [
      '/search site:example.com/a/b',
      { command: 'search', argument: 'site:example.com/a/b' },
    ],
  ])('parses %s', (draft, expected) => {
    expect(parseComposerSlashQuery(draft)).toEqual(expected);
  });

  it.each(['', 'hello', 'hello /mcp', '/mc/p'])(
    'rejects non-trigger draft %s',
    (draft) => {
      expect(parseComposerSlashQuery(draft)).toBeNull();
    },
  );
});

describe('filterComposerDiscovery', () => {
  it('keeps ordinary command discovery before the separator', () => {
    const query = parseComposerSlashQuery('/sea')!;
    expect(filterComposerDiscovery(groups, query).map((m) => m.item.id))
      .toEqual(['tool:search']);
  });

  it('locks argument typing to the exact declared command', () => {
    const query = parseComposerSlashQuery('/mcp supabase')!;
    expect(filterComposerDiscovery(groups, query).map((m) => m.item.id))
      .toEqual(['mcp:settings']);
  });

  it('does not reinterpret an unknown argument-bearing token', () => {
    const query = parseComposerSlashQuery('/unknown value')!;
    expect(filterComposerDiscovery(groups, query)).toEqual([]);
  });
});

describe('resolveComposerSlashSelection', () => {
  const mcp = groups[0]!.items[0]!;
  const search = groups[0]!.items[1]!;

  it('finishes a partial command without invoking it', () => {
    expect(resolveComposerSlashSelection('/se', search)).toEqual({
      type: 'finish',
      draft: '/search ',
    });
  });

  it('finishes a required argument prefix', () => {
    expect(resolveComposerSlashSelection('/search', search)).toEqual({
      type: 'finish',
      draft: '/search ',
    });
  });

  it('preserves a multi-word argument for the host', () => {
    expect(
      resolveComposerSlashSelection('/search aria listbox', search),
    ).toEqual({
      type: 'select',
      invocation: {
        command: 'search',
        argument: 'aria listbox',
      },
    });
  });

  it('distinguishes a bare optional command from an empty argument', () => {
    expect(resolveComposerSlashSelection('/mcp', mcp)).toMatchObject({
      type: 'select',
      invocation: { command: 'mcp', argument: null },
    });
    expect(resolveComposerSlashSelection('/mcp ', mcp)).toMatchObject({
      type: 'select',
      invocation: { command: 'mcp', argument: '' },
    });
  });
});

describe('replaceComposerSlashTrigger', () => {
  it('replaces a complete anchored invocation', () => {
    expect(
      replaceComposerSlashTrigger('/search some query', 'replacement'),
    ).toBe('replacement');
  });

  it('does not replace slash-like text embedded in a prompt', () => {
    expect(
      replaceComposerSlashTrigger('please /search some query', 'x'),
    ).toBe('please /search some query');
  });
});
```

**3. `Composer.tsx` changed call sites and promise/race fix**

Replace the imports and slash-selection portion with:

```tsx
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import type {
  ComposerDiscoveryItem,
  ComposerDiscoverySelection,
  ComposerSlots,
} from '../slots.js';
import {
  appendComposerDiscovery,
  composerSlashOptionId,
  filterComposerDiscovery,
  parseComposerSlashQuery,
  resolveComposerSlashKeyAction,
  resolveComposerSlashSelection,
} from './composer-discovery.js';

// Inside Composer:

const textareaRef = useRef<HTMLTextAreaElement | null>(null);
const slashListboxId = useId();
const draftRef = useRef(composer.draft);
draftRef.current = composer.draft;

const discoveryOperationRef = useRef(0);
const [discoveryMenuOpen, setDiscoveryMenuOpen] = useState(false);
const [slashActiveIndex, setSlashActiveIndex] = useState(0);
const [dismissedSlashDraft, setDismissedSlashDraft] =
  useState<string | null>(null);
const [discoveryError, setDiscoveryError] =
  useState<string | null>(null);

const discoveryGroups = slots?.discoveryGroups ?? [];
const hasDiscoveryItems = discoveryGroups.some(
  (group) => group.items.length > 0,
);
const slashQuery = parseComposerSlashQuery(composer.draft);
const slashMatches =
  slashQuery === null
    ? []
    : filterComposerDiscovery(discoveryGroups, slashQuery);

const activeSlashIndex =
  slashMatches.length === 0
    ? -1
    : Math.min(slashActiveIndex, slashMatches.length - 1);
const activeSlashMatch =
  activeSlashIndex < 0 ? undefined : slashMatches[activeSlashIndex];
const activeSlashOptionId = activeSlashMatch
  ? composerSlashOptionId(slashListboxId, activeSlashMatch)
  : undefined;

const slashOpen =
  activeSlashIndex >= 0 &&
  dismissedSlashDraft !== composer.draft;

function writeDraft(next: string): void {
  draftRef.current = next;
  composer.setDraft(next);
}

function restoreComposerFocus(): void {
  textareaRef.current?.focus();
}

function reportUnexpectedDiscoveryFailure(): void {
  setDiscoveryError(t('That action failed. Your draft was preserved.'));
}

function runDiscovery(task: Promise<void>): void {
  task.catch(reportUnexpectedDiscoveryFailure);
}

interface DraftTransaction {
  expectedDraft: string;
  rollbackDraft?: string;
}

async function notifyDiscovery(
  selection: ComposerDiscoverySelection,
  transaction: DraftTransaction,
): Promise<void> {
  const handler = slots?.onDiscoverySelect;
  if (!handler) return;

  const operationId = ++discoveryOperationRef.current;
  setDiscoveryError(null);

  try {
    // This is the Composer.tsx:89 fix: the host promise is awaited inside
    // a rejection boundary instead of being discarded with `void`.
    const outcome = await handler(selection);

    // Never overwrite text entered after the effect started, and never let
    // an older selection win a race against a newer one.
    if (
      discoveryOperationRef.current !== operationId ||
      draftRef.current !== transaction.expectedDraft
    ) {
      return;
    }

    if (outcome?.draft !== undefined) {
      writeDraft(outcome.draft);
      setDismissedSlashDraft(outcome.draft);
    }
  } catch {
    if (
      discoveryOperationRef.current === operationId &&
      draftRef.current === transaction.expectedDraft
    ) {
      if (transaction.rollbackDraft !== undefined) {
        writeDraft(transaction.rollbackDraft);
        setDismissedSlashDraft(null);
      }
      setDiscoveryError(
        t('That action failed. Your draft was preserved.'),
      );
    }
  }
}

async function selectSlashItem(index: number): Promise<void> {
  const match = slashMatches[index];
  if (!match) return;

  const priorDraft = draftRef.current;
  const resolution = resolveComposerSlashSelection(
    priorDraft,
    match.item,
  );
  if (!resolution) return;

  if (resolution.type === 'finish') {
    // Invalidate any older host effect, complete the token, and keep the
    // argument-bearing listbox open. No host effect fires here.
    discoveryOperationRef.current += 1;
    writeDraft(resolution.draft);
    setSlashActiveIndex(0);
    setDismissedSlashDraft(null);
    restoreComposerFocus();
    return;
  }

  const expectedDraft = resolution.draft ?? priorDraft;
  if (resolution.draft !== undefined) {
    writeDraft(resolution.draft);
  }

  setDismissedSlashDraft(expectedDraft);

  await notifyDiscovery(
    {
      item: match.item,
      source: 'slash',
      draft: priorDraft,
      ...(resolution.invocation
        ? { invocation: resolution.invocation }
        : {}),
    },
    {
      expectedDraft,
      ...(resolution.draft !== undefined
        ? { rollbackDraft: priorDraft }
        : {}),
    },
  );

  restoreComposerFocus();
}

async function selectPlusItem(
  item: ComposerDiscoveryItem,
): Promise<void> {
  const priorDraft = draftRef.current;
  const nextDraft = item.insertText
    ? appendComposerDiscovery(priorDraft, item.insertText)
    : priorDraft;

  if (nextDraft !== priorDraft) writeDraft(nextDraft);
  setDiscoveryMenuOpen(false);

  await notifyDiscovery(
    {
      item,
      source: 'plus',
      draft: priorDraft,
    },
    {
      expectedDraft: nextDraft,
      ...(nextDraft !== priorDraft
        ? { rollbackDraft: priorDraft }
        : {}),
    },
  );

  restoreComposerFocus();
}

function handleKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
): void {
  if (event.nativeEvent.isComposing) return;

  if (slashOpen) {
    const action = resolveComposerSlashKeyAction(
      event.key,
      event.shiftKey,
    );

    if (action.type !== 'none') {
      event.preventDefault();

      if (action.type === 'move') {
        setSlashActiveIndex(
          (current) =>
            (current + action.offset + slashMatches.length) %
            slashMatches.length,
        );
      } else if (action.type === 'select') {
        runDiscovery(selectSlashItem(activeSlashIndex));
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
```

The corresponding JSX is:

```tsx
<textarea
  ref={textareaRef}
  className="jini-composer-input"
  value={composer.draft}
  placeholder={resolvedPlaceholder}
  disabled={disabled}
  onChange={(event) => {
    // Makes every outstanding async outcome stale before updating text.
    discoveryOperationRef.current += 1;
    writeDraft(event.target.value);
    setSlashActiveIndex(0);
    setDismissedSlashDraft(null);
    setDiscoveryError(null);
  }}
  onKeyDown={handleKeyDown}
  aria-controls={slashOpen ? slashListboxId : undefined}
  aria-haspopup="listbox"
  aria-expanded={slashOpen}
  aria-activedescendant={
    slashOpen ? activeSlashOptionId : undefined
  }
  rows={3}
/>

{slashOpen && activeSlashOptionId ? (
  <ComposerSlashMenu
    listboxId={slashListboxId}
    matches={slashMatches}
    activeIndex={activeSlashIndex}
    activeOptionId={activeSlashOptionId}
    onSelect={(item) => {
      const index = slashMatches.findIndex(
        (match) => match.item === item,
      );
      runDiscovery(selectSlashItem(index));
    }}
    t={t}
  />
) : null}

{discoveryError ? (
  <div className="jini-composer-discovery-error" role="alert">
    {discoveryError}
  </div>
) : null}

<ComposerDiscoveryMenu
  groups={discoveryGroups}
  open={discoveryMenuOpen}
  disabled={disabled}
  {...(attachmentPicker ? { attachmentPicker } : {})}
  attachmentInputRef={attachmentInputRef}
  onToggle={() => setDiscoveryMenuOpen((open) => !open)}
  onClose={() => setDiscoveryMenuOpen(false)}
  onSelect={(item) => runDiscovery(selectPlusItem(item))}
  onAttachmentChange={handleAttachmentChange}
  t={t}
/>
```

**4. Stable options and argument hints — `ComposerDiscovery.tsx`**

```tsx
import {
  useEffect,
  useRef,
  type ChangeEvent,
  type RefObject,
} from 'react';
import type {
  ComposerDiscoveryItem,
} from '../slots.js';
import {
  composerSlashOptionId,
  type ComposerDiscoveryMatch,
} from './composer-discovery.js';

export interface ComposerSlashMenuProps {
  listboxId: string;
  matches: readonly ComposerDiscoveryMatch[];
  activeIndex: number;
  activeOptionId: string;
  onSelect: (item: ComposerDiscoveryItem) => void;
  t: (key: string) => string;
}

export function ComposerSlashMenu(
  props: ComposerSlashMenuProps,
) {
  const listboxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const active = document.getElementById(props.activeOptionId);
    if (
      active &&
      listboxRef.current?.contains(active) &&
      typeof active.scrollIntoView === 'function'
    ) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [props.activeOptionId]);

  if (props.matches.length === 0) return null;

  return (
    <div
      ref={listboxRef}
      id={props.listboxId}
      className="jini-composer-slash-menu"
      role="listbox"
      aria-label={props.t('Composer commands')}
    >
      {props.matches.map((match, index) => {
        const optionId = composerSlashOptionId(
          props.listboxId,
          match,
        );

        return (
          <button
            key={`${match.groupId}:${match.item.id}`}
            id={optionId}
            type="button"
            role="option"
            aria-selected={index === props.activeIndex}
            className={
              `jini-composer-discovery-item` +
              (index === props.activeIndex ? ' is-active' : '')
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onSelect(match.item)}
          >
            <span>
              {props.t(match.item.label)}
              {match.item.command?.argument ? (
                <code className="jini-composer-slash-argument">
                  {' '}
                  {match.item.command.argument.placeholder}
                </code>
              ) : null}
            </span>
            <small>
              {props.t(
                match.item.description ?? match.groupLabel,
              )}
            </small>
          </button>
        );
      })}
    </div>
  );
}
```

**5. Real Tovu projection — replace the literal in `agent-plugin-catalog.ts`**

The browser receives descriptions, schemas, and names—not executable registration modules.

```ts
import type {
  ComposerDiscoveryGroup,
  ComposerDiscoveryItem,
} from '@jini-ai/chat/react';

export interface TovuAgentToolCatalogItem {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema?: {
    readonly properties?: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
  };
}

export type TovuComposerEffect =
  | {
      readonly type: 'mcp-settings';
      readonly route: string;
    }
  | {
      readonly type: 'agent-tool-prompt';
      readonly toolName: string;
    };

export interface TovuComposerCapabilityDescriptor {
  readonly groupId: string;
  readonly groupLabel: string;
  readonly item: ComposerDiscoveryItem;
  readonly effect: TovuComposerEffect;
}

export interface TovuComposerProjection {
  readonly groups: readonly ComposerDiscoveryGroup[];
  readonly byId: ReadonlyMap<
    string,
    TovuComposerCapabilityDescriptor
  >;
}

const MCP_SETTINGS_CAPABILITY: TovuComposerCapabilityDescriptor = {
  groupId: 'navigation',
  groupLabel: 'Commands',
  item: {
    id: 'mcp:settings',
    label: '/mcp',
    description:
      'Open External MCP settings or specify a server',
    kind: 'navigation',
    keywords: ['mcp', 'server', 'settings'],
    command: {
      name: 'mcp',
      argument: {
        name: 'server-id',
        placeholder: '<server-id>',
      },
    },
  },
  effect: {
    type: 'mcp-settings',
    route: '/settings?tab=external-mcp',
  },
};

function slashName(toolName: string): string {
  return toolName
    .trim()
    .toLocaleLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toolArgument(
  tool: TovuAgentToolCatalogItem,
):
  | {
      name: string;
      placeholder: string;
      required?: boolean;
    }
  | undefined {
  const properties = Object.keys(
    tool.inputSchema?.properties ?? {},
  );
  if (properties.length === 0) return undefined;

  const required = (tool.inputSchema?.required ?? []).filter(
    (name) => properties.includes(name),
  );
  const hinted = (required.length > 0 ? required : properties)
    .slice(0, 2);

  return {
    name: 'arguments',
    placeholder:
      hinted.length > 0
        ? hinted.map((name) => `<${name}>`).join(' ')
        : '<arguments>',
    ...(required.length > 0 ? { required: true } : {}),
  };
}

function toolCapability(
  tool: TovuAgentToolCatalogItem,
): TovuComposerCapabilityDescriptor {
  const commandName = slashName(tool.name);
  if (!commandName) {
    throw new Error(
      `Agent tool ${JSON.stringify(tool.name)} has no usable slash name`,
    );
  }

  const argument = toolArgument(tool);

  return {
    groupId: 'agent-tools',
    groupLabel: 'Assistant tools',
    item: {
      id: `agent-tool:${tool.name}`,
      label: `/${commandName}`,
      description:
        tool.description ??
        tool.title ??
        `Use the ${tool.name} tool`,
      kind: 'agent-tool',
      keywords: [tool.name, tool.title]
        .filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0,
        ),
      command: {
        name: commandName,
        ...(argument ? { argument } : {}),
      },
    },
    effect: {
      type: 'agent-tool-prompt',
      toolName: tool.name,
    },
  };
}

export function projectTovuComposerCapabilities(
  tools: readonly TovuAgentToolCatalogItem[],
): TovuComposerProjection {
  const descriptors = [
    MCP_SETTINGS_CAPABILITY,
    ...tools.map(toolCapability),
  ];

  // Command collisions are unsafe: selecting one must never invoke another.
  const commandOwners = new Map<string, string>();
  for (const descriptor of descriptors) {
    const name =
      descriptor.item.command?.name.toLocaleLowerCase();
    if (!name) continue;

    const previous = commandOwners.get(name);
    if (previous) {
      throw new Error(
        `Duplicate composer command /${name}: ` +
          `${previous} and ${descriptor.item.id}`,
      );
    }
    commandOwners.set(name, descriptor.item.id);
  }

  const groupOrder: string[] = [];
  const grouped = new Map<
    string,
    { label: string; items: ComposerDiscoveryItem[] }
  >();

  for (const descriptor of descriptors) {
    let group = grouped.get(descriptor.groupId);
    if (!group) {
      group = {
        label: descriptor.groupLabel,
        items: [],
      };
      grouped.set(descriptor.groupId, group);
      groupOrder.push(descriptor.groupId);
    }
    group.items.push(descriptor.item);
  }

  return {
    groups: groupOrder.map((id) => {
      const group = grouped.get(id)!;
      return {
        id,
        label: group.label,
        items: group.items,
      };
    }),
    byId: new Map(
      descriptors.map((descriptor) => [
        descriptor.item.id,
        descriptor,
      ]),
    ),
  };
}

function isToolCatalogItem(
  value: unknown,
): value is TovuAgentToolCatalogItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    (candidate.description === undefined ||
      typeof candidate.description === 'string') &&
    (candidate.title === undefined ||
      typeof candidate.title === 'string') &&
    (candidate.inputSchema === undefined ||
      (typeof candidate.inputSchema === 'object' &&
        candidate.inputSchema !== null))
  );
}

export async function fetchTovuAgentToolCatalog(
  signal?: AbortSignal,
): Promise<readonly TovuAgentToolCatalogItem[]> {
  const response = await fetch(
    '/api/admin/v1/assistant/tool-catalog',
    {
      credentials: 'same-origin',
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Tool catalog request failed with ${response.status}`,
    );
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') {
    throw new Error('Tool catalog response is not an object');
  }

  const tools = (payload as Record<string, unknown>).tools;
  if (
    !Array.isArray(tools) ||
    !tools.every(isToolCatalogItem)
  ) {
    throw new Error('Tool catalog response has invalid tools');
  }

  return tools;
}
```

The server adapter maps the single assembled registry—the same collection populated by all `tool-registrations.ts` and `agent-tools.ts` modules—rather than importing those Node modules into React:

```ts
export interface PublicAgentToolDefinition {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema?: {
    readonly properties?: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
  };
}

/**
 * `getRegisteredTools` is wired to the authoritative assembled registry at
 * Tovu's server composition root. Every module already feeding that registry
 * is therefore included without a second list of module imports.
 */
export function createAssistantToolCatalogHandler<T>(
  getRegisteredTools: () => readonly T[],
  toPublicDefinition: (tool: T) => PublicAgentToolDefinition,
): (request: Request) => Response {
  return (request) => {
    if (request.method !== 'GET') {
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET' },
      });
    }

    const tools = getRegisteredTools().map(toPublicDefinition);
    const names = new Set<string>();

    for (const tool of tools) {
      if (names.has(tool.name)) {
        return Response.json(
          {
            error: `Duplicate registered agent tool ${tool.name}`,
          },
          { status: 500 },
        );
      }
      names.add(tool.name);
    }

    return Response.json(
      { tools },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  };
}
```

That generic adapter is intentional: the packet supplies no bodies or exact exported types for the twenty server modules, so inventing their filenames or registration fields would repeat Round 2’s mistake. The adapter attaches once where their actual registrations are already assembled.

**6. `AssistantDock.tsx` projection and host effect**

The actual source states that tools execute through the spawned agent and `/api/delegated-tool-calls`, not through a UI transport method, at [AssistantDock.tsx:114](/tmp/ads-peer-dispatch/debate-slash/files/tovu/AssistantDock.tsx:114). Therefore tool selection produces an agent instruction in the draft; it does not fabricate a direct tool call.

```tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ComposerDiscoveryOutcome,
  ComposerDiscoverySelection,
} from '@jini-ai/chat/react';
import {
  fetchTovuAgentToolCatalog,
  projectTovuComposerCapabilities,
  type TovuAgentToolCatalogItem,
} from '../../features/plugins/agent-plugin-catalog';

// Inside AssistantDock:

const [agentToolCatalog, setAgentToolCatalog] = useState<
  readonly TovuAgentToolCatalogItem[]
>([]);

useEffect(() => {
  const controller = new AbortController();

  fetchTovuAgentToolCatalog(controller.signal).then(
    setAgentToolCatalog,
    (error: unknown) => {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        return;
      }
      // MCP navigation remains available; server tools fail closed.
      setAgentToolCatalog([]);
    },
  );

  return () => controller.abort();
}, []);

const composerProjection = useMemo(
  () => projectTovuComposerCapabilities(agentToolCatalog),
  [agentToolCatalog],
);

const handleComposerDiscoverySelect = useCallback(
  (
    selection: ComposerDiscoverySelection,
  ): ComposerDiscoveryOutcome | void => {
    const descriptor = composerProjection.byId.get(
      selection.item.id,
    );
    if (!descriptor) return;

    const argument =
      selection.invocation?.argument?.trim() ?? '';

    if (descriptor.effect.type === 'mcp-settings') {
      if (!argument) {
        navigate(descriptor.effect.route);
        // Deliberately no `{ draft: "" }`: navigation does not delete
        // what the user typed.
        return;
      }

      return {
        draft:
          `Use the MCP server ${JSON.stringify(argument)} ` +
          'for this request: ',
      };
    }

    const instruction = argument
      ? `Use the ${JSON.stringify(
          descriptor.effect.toolName,
        )} tool for this request: ${argument}`
      : `Use the ${JSON.stringify(
          descriptor.effect.toolName,
        )} tool.`;

    if (
      selection.source === 'plus' &&
      selection.draft.trim() !== ''
    ) {
      return {
        draft: `${selection.draft.trimEnd()} ${instruction}`,
      };
    }

    return { draft: instruction };
  },
  [composerProjection],
);
```

Replace [AssistantDock.tsx:429](/tmp/ads-peer-dispatch/debate-slash/files/tovu/AssistantDock.tsx:429) with:

```tsx
composerSlots={{
  discoveryGroups: composerProjection.groups,
  onDiscoverySelect: handleComposerDiscoverySelect,
}}
```

Projection tests:

```ts
import { describe, expect, it } from 'vitest';
import { projectTovuComposerCapabilities } from '../agent-plugin-catalog.js';

describe('projectTovuComposerCapabilities', () => {
  it('projects every registered tool exactly once', () => {
    const tools = Array.from({ length: 20 }, (_, index) => ({
      name: `tool_${index}`,
      description: `Tool ${index}`,
      inputSchema: {
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    }));

    const projection = projectTovuComposerCapabilities(tools);
    const projectedToolIds = projection.groups
      .flatMap((group) => group.items)
      .filter((item) => item.kind === 'agent-tool')
      .map((item) => item.id);

    expect(projectedToolIds).toHaveLength(tools.length);
    expect(new Set(projectedToolIds).size).toBe(tools.length);
    expect(projectedToolIds).toEqual(
      tools.map((tool) => `agent-tool:${tool.name}`),
    );
  });

  it('derives required argument hints from registered schemas', () => {
    const projection = projectTovuComposerCapabilities([
      {
        name: 'research_search',
        inputSchema: {
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    ]);

    expect(
      projection.byId.get('agent-tool:research_search')?.item.command,
    ).toEqual({
      name: 'research-search',
      argument: {
        name: 'arguments',
        placeholder: '<query>',
        required: true,
      },
    });
  });

  it('fails closed on normalized command collisions', () => {
    expect(() =>
      projectTovuComposerCapabilities([
        { name: 'content_search' },
        { name: 'content-search' },
      ]),
    ).toThrow(/Duplicate composer command/);
  });
});
```

The pure parser and selection cases above were also executed directly: seven parser cases and five finish/invoke cases passed.

## Critique Of Another Participant's Round 2 Code

**sonnet5-round2** has the strongest overall direction, but its implementation is not final:

- `const argument = match.item.argument ? (slashQuery?.argument ?? '') : undefined` collapses bare `/mcp` (`null`) and `/mcp ` (`""`) despite its own contract claiming those values are distinct. The host cannot reliably implement argument-presence behavior afterward.
- Its Tovu section explicitly says wiring the approximately twenty modules is “follow-up work.” That leaves the real requirement unsatisfied and preserves a second manual descriptor registry.
- `setDismissedSlashDraft(null)` immediately before invoking an unchanged argument-bearing draft allows the listbox to remain or reopen; invocation should dismiss the exact draft, while command completion should deliberately keep it open.

**gemini-3.1-pro-high-round2** contains two concrete bugs:

- `replaceComposerSlashTrigger` uses only `draft.startsWith('/')`, so drafts the parser rejects—such as `/mc/p`—can still be destroyed. That breaks the parser/replacement invariant.
- Its dismissal expression suppresses any draft starting with the dismissed value. Dismissing `/mcp` and then typing `/mcp supabase` leaves the palette closed because the longer draft still starts with `/mcp`.

**gemini-3.6-flash-high-round2** calls `transport.executeResearchCommand({ query })`, but no such method is present in the supplied implementation. More importantly, [AssistantDock.tsx:114](/tmp/ads-peer-dispatch/debate-slash/files/tovu/AssistantDock.tsx:114) says agent tools execute server-side through the spawned CLI. That Round 2 call both invents an API and bypasses the documented execution path.

## What Would Change My Mind

I would move to Option 2 if an instrumented `/mcp <server-id>` trial shows users repeatedly need live server-name completion, or if one projected tool needs independently validated typed fields rather than an opaque request string.

I would reconsider the whole-draft grammar only if product evidence requires commands embedded after ordinary prose or multiple commands in one draft. That would invalidate the anchored replacement invariant and justify caret-range tracking—but still would not, by itself, require Lexical.

Finally, I would reject this projection if the actual central Tovu registry cannot expose a sanitized list of its registered definitions. In that case, each registration module should export data through a common server-side registrar, with an integration test comparing registered tool IDs to projected catalog IDs; a second hand-authored browser catalog remains unacceptable.

<<SWARM_END>>