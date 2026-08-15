I’ll read the complete Round 2 packet first, then inspect only the in-scope source files needed to support the response with exact path-and-line citations.
The packet changes the design materially: arguments, live-registry projection, preview, and real `/search` execution are now hard requirements. I’m tracing the existing types, composer state/ARIA paths, Tovu registries, preview modal, and confirmation flow so the proposed code matches their current shapes.
ACK_PACKET_RECEIVED CTX-SLASH-R2-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

My position changed materially this round.

I still support the settled boundary: Jini owns parsing, filtering, keyboard/ARIA behavior, preview placement, pending/error presentation, and draft mutation; Tovu owns registry projection, authorization, binding resolution, confirmation, execution, and outcomes. That boundary is already explicit: `kind` is open and Jini must never switch on the host taxonomy (`files/jini/slots.ts:74-80`).

I no longer recommend separate manually maintained resource and command catalogs. N2 and N4 make the better model a single, data-only capability envelope projected from Tovu’s live registries. A capability opts into composer surfaces through optional `command`, `preview`, and `execute` facets. Slash filtering includes only descriptors with `command`; the plus menu may expose the broader inventory. No second source of truth is created.

I also withdraw Round 1’s acceptance of “no arguments.” Open Design’s earlier contract already recognized that a trailing space distinguishes argument collection from immediate submission and carried an `argHint` (`files/opendesign/ChatComposer.head.tsx:157-169`). The new target confirms this is required.

The coordinator correction is also right: the plus path skips `insertText: ""` because it uses a truthiness guard (`files/jini/Composer.tsx:101-105`). The slash path does replace with `""` (`files/jini/Composer.tsx:92-99`), but today that only clears the matched trigger because the parser accepts nothing else (`files/jini/composer-discovery.ts:9-12`). Parser and range replacement must therefore change together.

## Solution Slate

Ranking criteria:

1. Package boundary and unknown-kind extensibility — 30%.
2. Completeness for arguments, preview, execution, and confirmation — 30%.
3. Live-registry, authorization, and serialization safety — 25%.
4. Migration and testing cost — 15%.

| Rank | Option | Weighted assessment |
|---|---|---:|
| 1 | Data-only capability envelope + host binding resolver | 88/100 |
| 2 | Function-bearing descriptors injected by Tovu | 65/100 |
| 3 | Closed `macro \| client \| tool \| skill` union | 44/100 |

### 1. Data-only capability envelope + host resolver — recommended

Every live registry projects into a common descriptor. Execution and preview carry opaque, serializable host bindings. Jini branches only on generic facets such as “has a command,” “has a preview,” or “argument is required”; Tovu resolves binding types and reauthorizes against the current registry.

Advantages:

- Supports `/mcp` and `/mcp <server-id>` because the selection contains parsed arguments, unlike the current id-only route resolver (`files/tovu/agent-plugin-catalog.ts:101-104`, `files/tovu/AssistantDock.tsx:270-273`).
- `/search` can enter Tovu’s real server-side execution path. That matters because tool execution currently occurs behind the CLI/daemon delegated-tool gate, not as a direct ChatPane prop (`files/tovu/AssistantDock.tsx:114-119`).
- Descriptors can cross an authenticated HTTP boundary; arbitrary browser functions cannot.
- A future `kind: "workflow-template"` works without touching Composer.
- Preview is driven by a generic source binding. The existing Open Design preview demonstrates the useful interaction—preview metadata and content before committing (`files/opendesign/ComposerPluginPreview.tsx:66-107`)—without requiring that pattern’s plugin-specific imports in Jini.

Genuine sacrifice: this introduces a versioned protocol, registry-to-descriptor adapters, a capability endpoint, and a host resolver. A bad implementation could become a shadow registry. The defense is that descriptors must be computed from registry snapshots, never separately stored. Preview bindings also add asynchronous loading and cache invalidation.

### 2. Function-bearing descriptors

Tovu passes descriptors containing `execute(args)` and `renderPreview()` closures directly into Composer. This is closest to the existing callback seam, whose type already permits asynchronous work (`files/jini/slots.ts:119-125`).

Advantages: smallest client-only patch, strong local TypeScript inference, and easy navigation/modal integration.

Genuine sacrifice: closures cannot be serialized from server-side tool or MCP registries, cannot safely represent CLI execution authorization, become stale when capabilities change, and invite privileged implementation details into browser bundles. It therefore does not adequately solve N2 or confirmation-gated execution.

### 3. Closed discriminated union

Declare `kind: "macro" | "client" | "tool" | "skill" | "plugin"` and switch in Composer.

Advantage: explicit behavior and exhaustive compile-time switches.

Genuine sacrifice: it directly fails N4 and violates the written package boundary. The current contract explicitly permits host-defined kinds while forbidding Jini from switching on them (`files/jini/slots.ts:77-80`). Every future capability category would require a package release.

Recommendation: Option 1.

The cheapest falsification test is one React component test using `kind: "previously-unknown-kind"` with a command, preview binding, and execute binding. Type `/future abc`, assert the list remains open, `aria-activedescendant` names an existing option, the preview renderer receives the binding, the host receives `argumentText: "abc"`, and its returned draft outcome is applied. If implementing that requires any `kind` branch in Jini, the recommendation is false.

## Leading Option — Code

### Descriptor contract — `files/jini/slots.ts`

This replaces the narrow item shape at `files/jini/slots.ts:82-101` and upgrades the callback at `files/jini/slots.ts:119-125`.

```ts
import type { ReactNode } from "react";

export type ComposerJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ComposerJsonValue[]
  | { readonly [key: string]: ComposerJsonValue };

export interface ComposerHostBinding {
  /** Open host-owned namespace; Jini never interprets this value. */
  readonly type: string;
  readonly data?: { readonly [key: string]: ComposerJsonValue };
}

export interface ComposerArgumentContract {
  /** Rendered verbatim, e.g. "<query>" or "<server-id> to insert hint". */
  readonly usage: string;
  /** When true, selecting the row stages "/name " instead of executing. */
  readonly required: boolean;
  /** Host-validated JSON Schema. Jini does not treat this as authorization. */
  readonly schema?: { readonly [key: string]: ComposerJsonValue };
}

export interface ComposerCommandContract {
  /** Command name without the leading slash. */
  readonly name: string;
  readonly arguments?: ComposerArgumentContract;
}

export interface ComposerCapabilityPreview {
  /** Resolved only by the host preview renderer. */
  readonly source: ComposerHostBinding;
  readonly accessibleLabel?: string;
}

export interface ComposerCapabilityExecution {
  /** Serializable resolver key, not a browser function. */
  readonly binding: ComposerHostBinding;
  /** Host permission identifier; Jini may display it but never authorizes it. */
  readonly permission?: string;
  /** Static minimum. Runtime authorization may still escalate to confirmation. */
  readonly confirmation: "never" | "required";
}

export interface ComposerCapabilityDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly kind?: string;
  readonly keywords?: readonly string[];

  /** Legacy/default draft-only behavior. */
  readonly insertText?: string;

  readonly command?: ComposerCommandContract;
  readonly preview?: ComposerCapabilityPreview;
  readonly execute?: ComposerCapabilityExecution;
}

export type ComposerDiscoveryItem = ComposerCapabilityDescriptor;

export interface ComposerDiscoveryGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly ComposerCapabilityDescriptor[];
}

export interface ComposerSlashInvocation {
  readonly name: string;
  readonly argumentText: string;
  /** Distinguishes "/mcp" from "/mcp ", while argument presence uses trim(). */
  readonly hasArgumentInput: boolean;
  readonly trigger: {
    readonly start: number;
    readonly end: number;
    readonly text: string;
  };
}

export interface ComposerDiscoverySelection {
  readonly item: ComposerCapabilityDescriptor;
  readonly source: "plus" | "slash";
  readonly slash?: ComposerSlashInvocation;
}

export interface ComposerDiscoveryOutcome {
  readonly draft?: {
    readonly operation: "replace-trigger" | "append";
    readonly text: string;
  };
  readonly announcement?: string;
  /** Navigation and modals should retain host focus. */
  readonly focus?: "composer" | "host";
}

export interface ComposerPreviewRequest {
  readonly item: ComposerCapabilityDescriptor;
  readonly preview: ComposerCapabilityPreview;
}

export interface ComposerSlots {
  discoveryGroups?: readonly ComposerDiscoveryGroup[];

  onDiscoverySelect?: (
    selection: ComposerDiscoverySelection,
  ) =>
    | ComposerDiscoveryOutcome
    | void
    | Promise<ComposerDiscoveryOutcome | void>;

  /** Optional host renderer; Jini merely places its returned node. */
  renderDiscoveryPreview?: (request: ComposerPreviewRequest) => ReactNode;

  // Existing fields remain unchanged.
}
```

Unknown kinds ride this contract by supplying a different `kind` and host binding. Neither is a Jini discriminant.

### Parser, safe replacement, filtering, and stable option ids

`files/jini/composer-discovery.ts`:

```ts
import type {
  ComposerDiscoveryGroup,
  ComposerDiscoveryItem,
  ComposerSlashInvocation,
} from "../slots.js";

export interface ComposerDiscoveryMatch {
  groupId: string;
  groupLabel: string;
  item: ComposerDiscoveryItem;
}

const SLASH_COMMAND =
  /^\/([^\s/\r\n]*)(?:[ \t]+([^\r\n]*))?$/;

export function parseComposerSlashQuery(
  draft: string,
): ComposerSlashInvocation | null {
  const match = SLASH_COMMAND.exec(draft);
  if (!match) return null;

  return {
    name: match[1] ?? "",
    argumentText: match[2] ?? "",
    hasArgumentInput: match[2] !== undefined,
    trigger: {
      start: 0,
      end: draft.length,
      text: match[0],
    },
  };
}

export function replaceComposerSlashTrigger(
  draft: string,
  invocation: ComposerSlashInvocation,
  insertText: string,
): string {
  const { start, end, text } = invocation.trigger;

  // Prevent a stale async completion from overwriting a newer draft.
  if (draft.slice(start, end) !== text) return draft;

  return `${draft.slice(0, start)}${insertText}${draft.slice(end)}`;
}

export function filterComposerDiscovery(
  groups: readonly ComposerDiscoveryGroup[],
  invocation: ComposerSlashInvocation,
): ComposerDiscoveryMatch[] {
  const query = invocation.name.trim().toLowerCase();
  const matches: ComposerDiscoveryMatch[] = [];

  for (const group of groups) {
    for (const item of group.items) {
      // Resources without a command facet remain in the plus menu only.
      if (!item.command) continue;

      const commandName = item.command.name.toLowerCase();

      // Once argument entry begins, keep only the resolved command. Arguments
      // must never accidentally filter the command out of the palette.
      if (invocation.hasArgumentInput) {
        if (commandName !== query) continue;
      } else {
        const searchable = [
          commandName,
          item.label,
          item.description,
          item.kind,
          ...(item.keywords ?? []),
        ]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase();

        if (query !== "" && !searchable.includes(query)) continue;
      }

      matches.push({
        groupId: group.id,
        groupLabel: group.label,
        item,
      });
    }
  }

  return matches;
}

export function composerSlashOptionId(
  match: ComposerDiscoveryMatch,
): string {
  return `jini-composer-slash-option-${encodeURIComponent(
    `${match.groupId}:${match.item.id}`,
  )}`;
}
```

Tests:

```ts
import { describe, expect, it } from "vitest";
import {
  filterComposerDiscovery,
  parseComposerSlashQuery,
  replaceComposerSlashTrigger,
} from "./composer-discovery.js";

describe("parseComposerSlashQuery", () => {
  it.each([
    ["/", "", "", false],
    ["/mcp", "mcp", "", false],
    ["/mcp ", "mcp", "", true],
    ["/mcp supabase", "mcp", "supabase", true],
    ["/search design system tokens", "search", "design system tokens", true],
  ])("parses %s", (draft, name, argumentText, hasArgumentInput) => {
    expect(parseComposerSlashQuery(draft)).toMatchObject({
      name,
      argumentText,
      hasArgumentInput,
      trigger: { start: 0, end: draft.length, text: draft },
    });
  });

  it.each(["hello /mcp", "//mcp", "/mcp\nsupabase"])(
    "rejects non-command draft %j",
    (draft) => {
      expect(parseComposerSlashQuery(draft)).toBeNull();
    },
  );

  it("replaces only the parsed trigger and refuses a stale invocation", () => {
    const invocation = parseComposerSlashQuery("/mcp supabase")!;

    expect(
      replaceComposerSlashTrigger(
        "/mcp supabase",
        invocation,
        "@mcp:supabase ",
      ),
    ).toBe("@mcp:supabase ");

    expect(
      replaceComposerSlashTrigger(
        "/mcp changed-after-await",
        invocation,
        "@mcp:supabase ",
      ),
    ).toBe("/mcp changed-after-await");
  });

  it("filters on the command name, not its arguments", () => {
    const invocation = parseComposerSlashQuery("/mcp supabase")!;
    const groups = [{
      id: "commands",
      label: "Commands",
      items: [
        {
          id: "mcp",
          label: "/mcp",
          command: { name: "mcp" },
        },
        {
          id: "mcp-docs",
          label: "/mcp-docs",
          command: { name: "mcp-docs" },
        },
      ],
    }] as const;

    expect(
      filterComposerDiscovery(groups, invocation).map(
        (match) => match.item.id,
      ),
    ).toEqual(["mcp"]);
  });
});
```

### `Composer.tsx` call sites

The current implementation computes filtering and dismissal from the whole draft (`files/jini/Composer.tsx:74-82`), discards the host promise (`files/jini/Composer.tsx:88-90`), and constructs an index-based active descendant (`files/jini/Composer.tsx:151-157`). The coupled replacement is:

```tsx
const [slashActiveIndex, setSlashActiveIndex] = useState(0);
const [dismissedSlashKey, setDismissedSlashKey] =
  useState<string | null>(null);
const [discoveryPending, setDiscoveryPending] = useState(false);
const [discoveryStatus, setDiscoveryStatus] = useState<{
  tone: "status" | "error";
  text: string;
} | null>(null);
const discoveryPendingRef = useRef(false);

const slashInvocation = parseComposerSlashQuery(composer.draft);
const slashDismissKey = slashInvocation
  ? `${slashInvocation.trigger.start}:${slashInvocation.trigger.end}:` +
    slashInvocation.trigger.text
  : null;

const slashMatches = slashInvocation
  ? filterComposerDiscovery(discoveryGroups, slashInvocation)
  : [];

const slashOpen =
  slashMatches.length > 0 &&
  dismissedSlashKey !== slashDismissKey;

const activeSlashMatch = slashOpen
  ? slashMatches[
      Math.min(slashActiveIndex, slashMatches.length - 1)
    ]
  : undefined;

async function runDiscovery(
  item: ComposerDiscoveryItem,
  source: "plus" | "slash",
  slash?: ComposerSlashInvocation,
): Promise<void> {
  if (discoveryPendingRef.current) return;

  const originalDraft = composer.draft;
  discoveryPendingRef.current = true;
  setDiscoveryPending(true);
  setDiscoveryStatus({
    tone: "status",
    text: `Running ${item.command ? `/${item.command.name}` : item.label}…`,
  });

  try {
    const outcome = await slots?.onDiscoverySelect?.({
      item,
      source,
      ...(slash ? { slash } : {}),
    });

    const legacyText =
      item.insertText ??
      (!item.execute && source === "slash" ? item.label : undefined);

    const mutation =
      outcome?.draft ??
      (legacyText === undefined
        ? undefined
        : {
            operation:
              source === "slash" ? "replace-trigger" : "append",
            text: legacyText,
          } as const);

    let nextDraft = originalDraft;

    if (mutation?.operation === "replace-trigger" && slash) {
      nextDraft = replaceComposerSlashTrigger(
        originalDraft,
        slash,
        mutation.text,
      );
    } else if (
      mutation?.operation === "append" &&
      mutation.text !== ""
    ) {
      nextDraft = appendComposerDiscovery(
        originalDraft,
        mutation.text,
      );
    }

    if (nextDraft !== originalDraft) composer.setDraft(nextDraft);

    setDismissedSlashKey(
      source === "slash" && nextDraft === originalDraft
        ? slashDismissKey
        : null,
    );

    setDiscoveryStatus(
      outcome?.announcement
        ? { tone: "status", text: outcome.announcement }
        : null,
    );

    if (outcome?.focus !== "host") restoreComposerFocus();
  } catch {
    // No draft mutation occurred before the awaited host operation.
    setDiscoveryStatus({
      tone: "error",
      text: "Command failed. Your draft was kept. Try again.",
    });
    restoreComposerFocus();
  } finally {
    discoveryPendingRef.current = false;
    setDiscoveryPending(false);
  }
}

async function selectSlashItem(index: number): Promise<void> {
  const match = slashMatches[index];
  if (!match || !slashInvocation) return;

  const argumentContract = match.item.command?.arguments;
  if (
    argumentContract?.required &&
    slashInvocation.argumentText.trim() === ""
  ) {
    composer.setDraft(
      replaceComposerSlashTrigger(
        composer.draft,
        slashInvocation,
        `/${match.item.command!.name} `,
      ),
    );
    setDismissedSlashKey(null);
    restoreComposerFocus();
    return;
  }

  await runDiscovery(match.item, "slash", slashInvocation);
}

async function selectPlusItem(
  item: ComposerDiscoveryItem,
): Promise<void> {
  setDiscoveryMenuOpen(false);
  await runDiscovery(item, "plus");
}
```

The keyboard boundary may use `void` only after the promise is internally awaited and caught:

```tsx
if (action.type === "select") {
  void selectSlashItem(
    Math.min(slashActiveIndex, slashMatches.length - 1),
  );
} else if (action.type === "dismiss") {
  setDismissedSlashKey(slashDismissKey);
}
```

The textarea and menu wiring become:

```tsx
<textarea
  ref={textareaRef}
  value={composer.draft}
  disabled={disabled}
  readOnly={discoveryPending}
  aria-busy={discoveryPending}
  aria-controls={
    slashOpen ? "jini-composer-slash-menu" : undefined
  }
  aria-expanded={slashOpen}
  aria-activedescendant={
    activeSlashMatch
      ? composerSlashOptionId(activeSlashMatch)
      : undefined
  }
  onChange={(event) => {
    composer.setDraft(event.target.value);
    setSlashActiveIndex(0);
    setDismissedSlashKey(null);
    setDiscoveryStatus(null);
  }}
  onKeyDown={handleKeyDown}
/>

{slashOpen ? (
  <ComposerSlashMenu
    matches={slashMatches}
    activeIndex={Math.min(
      slashActiveIndex,
      slashMatches.length - 1,
    )}
    onSelect={(item) => {
      void selectSlashItem(
        slashMatches.findIndex(
          (match) => match.item === item,
        ),
      );
    }}
    renderPreview={slots?.renderDiscoveryPreview}
    t={t}
  />
) : null}

{discoveryStatus ? (
  <div
    role={discoveryStatus.tone === "error" ? "alert" : "status"}
    aria-live={
      discoveryStatus.tone === "error"
        ? "assertive"
        : "polite"
    }
  >
    {discoveryStatus.text}
  </div>
) : null}
```

`ComposerSlashMenu` uses `composerSlashOptionId(match)`, renders `item.command.arguments?.usage` beside the label, and places the active item’s generic preview alongside the list:

```tsx
const active = props.matches[props.activeIndex]?.item;

return (
  <div className="jini-composer-slash-layout">
    <div
      id="jini-composer-slash-menu"
      role="listbox"
      aria-label={props.t("Composer commands")}
    >
      {props.matches.map((match, index) => (
        <button
          key={`${match.groupId}:${match.item.id}`}
          id={composerSlashOptionId(match)}
          type="button"
          role="option"
          aria-selected={index === props.activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => props.onSelect(match.item)}
        >
          <span>{props.t(match.item.label)}</span>
          {match.item.command?.arguments ? (
            <span>
              {props.t(
                match.item.command.arguments.usage,
              )}
            </span>
          ) : null}
          <small>
            {props.t(
              match.item.description ?? match.groupLabel,
            )}
          </small>
        </button>
      ))}
    </div>

    {active?.preview && props.renderPreview ? (
      <aside aria-label={active.preview.accessibleLabel}>
        {props.renderPreview({
          item: active,
          preview: active.preview,
        })}
      </aside>
    ) : null}
  </div>
);
```

That preserves the current focus-in-textarea listbox model (`files/jini/ComposerDiscovery.tsx:118-145`) while ensuring the active descendant is stable and really exists.

### Tovu live projection

Delete `TOVU_COMPOSER_DISCOVERY_GROUPS`. It is currently a literal four-group snapshot (`files/tovu/agent-plugin-catalog.ts:42-99`) passed directly into ChatPane (`files/tovu/AssistantDock.tsx:426-432`).

A projection is computed from live registry sources:

```ts
// capability-projection.ts
import type {
  ComposerCapabilityDescriptor,
  ComposerDiscoveryGroup,
} from "@jini-ai/chat/react";

export interface TovuCapabilityContribution {
  readonly group: {
    readonly id: string;
    readonly label: string;
    readonly order: number;
  };
  readonly descriptor: ComposerCapabilityDescriptor;
}

export interface TovuCapabilityProjectionSource {
  snapshot(): Promise<
    readonly TovuCapabilityContribution[]
  >;
}

export async function projectTovuComposerCapabilities(
  sources: readonly TovuCapabilityProjectionSource[],
): Promise<readonly ComposerDiscoveryGroup[]> {
  const contributions = (
    await Promise.all(
      sources.map((source) => source.snapshot()),
    )
  ).flat();

  const groups = new Map<
    string,
    {
      id: string;
      label: string;
      order: number;
      items: ComposerCapabilityDescriptor[];
    }
  >();

  for (const contribution of contributions) {
    const current =
      groups.get(contribution.group.id) ?? {
        ...contribution.group,
        items: [],
      };
    current.items.push(contribution.descriptor);
    groups.set(current.id, current);
  }

  return [...groups.values()]
    .sort((left, right) => left.order - right.order)
    .map(({ id, label, items }) => ({
      id,
      label,
      items,
    }));
}
```

The tool-catalog adapter copies composer metadata from the same registration that owns execution. `/search` metadata therefore lives beside the OD research registration, not in a second command list:

```ts
export const OD_RESEARCH_COMPOSER_CAPABILITY = {
  group: {
    id: "research",
    label: "Research",
    order: 30,
  },
  descriptor: {
    id: "tool:od-research.search",
    label: "/search",
    description:
      "Search the web through the OD research command.",
    kind: "od-research-command",
    keywords: ["web", "research", "search"],
    command: {
      name: "search",
      arguments: {
        usage: "<query>",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
        },
      },
    },
    preview: {
      source: {
        type: "tovu.registry-documentation",
        data: {
          capabilityId: "tool:od-research.search",
        },
      },
      accessibleLabel: "Search command preview",
    },
    execute: {
      binding: {
        type: "tovu.registered-capability",
        data: {
          capabilityId: "tool:od-research.search",
        },
      },
      permission: "assistant.research",
      confirmation: "never",
    },
  },
} satisfies TovuCapabilityContribution;
```

The MCP adapter generates its argument schema from the live federation snapshot:

```ts
export function createMcpProjectionSource(
  listServers: () => Promise<
    readonly { id: string; label?: string }[]
  >,
): TovuCapabilityProjectionSource {
  return {
    async snapshot() {
      const servers = await listServers();

      return [{
        group: {
          id: "mcp",
          label: "MCP",
          order: 20,
        },
        descriptor: {
          id: "command:mcp",
          label: "/mcp",
          description:
            "Toggle, adopt, or jump to MCP settings.",
          kind: "mcp",
          keywords: ["server", "tools", "settings"],
          command: {
            name: "mcp",
            arguments: {
              usage:
                "<server-id> to insert hint",
              required: false,
              schema: {
                type: "string",
                enum: servers.map((server) => server.id),
              },
            },
          },
          preview: {
            source: {
              type: "tovu.mcp-catalog",
              data: {
                serverIds: servers.map(
                  (server) => server.id,
                ),
              },
            },
            accessibleLabel: "Available MCP servers",
          },
          execute: {
            binding: {
              type: "tovu.mcp-command",
              data: {
                serverIds: servers.map(
                  (server) => server.id,
                ),
              },
            },
            permission: "mcp.read",
            confirmation: "never",
          },
        },
      }];
    },
  };
}
```

The host selection resolver now receives arguments:

```ts
const handleComposerDiscoverySelect = useCallback(
  async (
    selection: ComposerDiscoverySelection,
  ): Promise<ComposerDiscoveryOutcome | void> => {
    const execution = selection.item.execute;
    if (!execution) return;

    const argumentText =
      selection.slash?.argumentText.trim() ?? "";

    if (execution.binding.type === "tovu.mcp-command") {
      if (argumentText === "") {
        navigate("/settings?tab=external-mcp");
        return {
          draft: {
            operation: "replace-trigger",
            text: "",
          },
          focus: "host",
          announcement: "Opened External MCP settings.",
        };
      }

      const serverIds =
        execution.binding.data?.serverIds;
      if (
        !Array.isArray(serverIds) ||
        !serverIds.includes(argumentText)
      ) {
        throw new Error("Unknown MCP server");
      }

      return {
        draft: {
          operation: "replace-trigger",
          text: `Use the ${argumentText} MCP server for this request. `,
        },
        focus: "composer",
        announcement: `Inserted ${argumentText} MCP context.`,
      };
    }

    // This endpoint re-resolves item.id against the current registry,
    // validates arguments, checks permission, and executes / prepares
    // confirmation. It never trusts the browser descriptor as authority.
    return executeTovuComposerCapability({
      capabilityId: selection.item.id,
      argumentText,
    });
  },
  [],
);
```

`AssistantDock` fetches the authenticated projection rather than importing the static literal:

```tsx
const discoveryGroups = useTovuComposerCapabilities();

<ChatPane
  // existing props
  composerSlots={{
    discoveryGroups,
    onDiscoverySelect:
      handleComposerDiscoverySelect,
    renderDiscoveryPreview:
      renderTovuCapabilityPreview,
  }}
/>
```

For source preview, replace the one-plugin allowlist with Vite glob loaders:

```ts
const capabilitySourceLoaders = import.meta.glob<string>(
  [
    "../../agent-plugins/**/SKILL.md",
    "../../agent-plugins/**/references/**/*.md",
  ],
  {
    query: "?raw",
    import: "default",
  },
);

export async function loadBundledCapabilitySource(
  root: string,
): Promise<
  readonly { path: string; content: string }[]
> {
  const normalizedRoot = `/${root.replace(
    /^\/+|\/+$/g,
    "",
  )}/`;

  const matches = Object.entries(
    capabilitySourceLoaders,
  ).filter(([path]) => path.includes(normalizedRoot));

  return Promise.all(
    matches.map(async ([path, load]) => ({
      path,
      content: await load(),
    })),
  );
}
```

Tovu’s preview renderer resolves `preview.source`, loads those documents, and passes them to its existing read-only preview shell. Jini sees neither “skill” nor “Agent Plugin”; it only places the returned node. Open Design’s existing preview component currently imports plugin-specific classification and rendering (`files/opendesign/ComposerPluginPreview.tsx:14-24`, `files/opendesign/ComposerPluginPreview.tsx:66-107`), which is exactly the host-specific knowledge that must remain outside Jini.

Confirmation is required only for consequential descriptors or runtime authorization escalation. Such a descriptor declares:

```ts
execute: {
  binding: {
    type: "tovu.registered-capability",
    data: { capabilityId: "content.delete" },
  },
  permission: "content.delete",
  confirmation: "required",
}
```

That must use the same two-phase shape as consequential MCP-UI actions: prepare creates a single-use pending record; only the explicit confirmation click redeems it. Tovu already routes confirmed MCP-UI calls through its authenticated proxy to the daemon-side `PendingConfirmationStore` redemption route (`files/tovu/AssistantDock.tsx:53-64`). Slash selection must not introduce a second one-shot execution bypass.

`confirmation` is display and minimum-policy metadata, not authorization. Tovu re-resolves the capability, permission, arguments, and current workspace state during prepare and again during redemption. `/search` ordinarily needs no confirmation; a destructive future command does.

Boundary proof: the proposed Jini code reads `item.command`, `item.preview`, `item.execute` presence, generic argument metadata, and generic outcomes. It never examines `item.kind`, `execute.binding.type`, or `permission` to choose an effect. All binding switches shown above are in Tovu. That preserves the law at `files/jini/slots.ts:77-80`.

## Strongest Counter-Argument

The strongest objection to Option 1 is that it can become needless protocol machinery around the callback that already exists. For `/mcp` navigation alone, awaiting the callback and adding an argument string would be dramatically cheaper.

That is also the strongest case for the opposing function-bearing option.

The answer is N2 plus real `/search`: the current composer receives a hardcoded literal (`files/tovu/agent-plugin-catalog.ts:42-99`), while actual execution is server-side behind delegated tooling (`files/tovu/AssistantDock.tsx:114-119`). Browser closures cannot be a live, serializable projection of that authority and cannot safely participate in prepare/redeem confirmation. They solve the one navigation command while leaving the structural registry and execution requirements untouched.

The protocol must nevertheless remain thin. If it accumulates its own enablement state, permissions, or executable implementations, it has become the duplicate registry this design is intended to avoid.

## What Would Change My Mind

I would choose function-bearing descriptors if all intended capabilities proved client-local, the live server registry disappeared from scope, preview content was already resident in the browser, and no command required confirmation or CLI/agent execution.

I would move more of the protocol into Jini only if multiple independent hosts converged on the same stable execution, validation, confirmation, and outcome standard. One Tovu-specific binding scheme is not sufficient evidence.

The immediate falsifier is the unknown-kind integration test described above. Additional release blockers are:

- `/search` without an argument stages `/search ` and does not execute.
- `/search cats` executes once and reports its outcome.
- `/mcp` navigates; `/mcp supabase` inserts a hint without navigating.
- A rejected async handler leaves the trigger intact and exposes the `role="alert"` message.
- A required-confirmation command performs no effect before token redemption.
- The package contains no execution branch over `item.kind` or host binding type.

<<SWARM_END>>