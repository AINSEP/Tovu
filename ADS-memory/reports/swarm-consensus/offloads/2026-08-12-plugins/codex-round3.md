I’m using the `understand-diff` workflow because this round is an implementation comparison. I’ll first read its instructions and the entire packet, then inspect only the packet’s in-scope source tree, verify external claims online, and implement the leading option.
The diff skill expects a prebuilt knowledge graph, but the packet governs this exercise and explicitly disallows treating missing scaffolding as a blocker. I’m applying its risk-and-blast-radius review structure while continuing directly against the supplied implementations.
The supplied graph index is absent and no graph-query tool is available, so I’m using the permitted source fallback. The key design question now is whether quarantine can reuse the activation gateway without creating a recursive hook/runtime dependency, and I’m tracing the real types and state transitions before drafting code.
The real contracts expose two important implementation constraints: `addFilter` is a registration callback, so `setup()` should not “return a filter”; and `setPluginEnabled()` itself is below the gateway, so quarantine must call a shared gateway command—not call that feature function directly. I’m checking official prior art now for failure thresholds/quarantine behavior, declared permissions, and ABI stability.
ACK_PACKET_RECEIVED CTX-PLUGINS-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

Wiring, recovery, and the ABI correction must land as one change.

The call-site audit found more than the already-settled discarded import:

- `loadPlugin()` discards the imported namespace and returns success without setup or attachment (files/plugin-runtime/loader.ts:141-158).
- The agent-facing activation composition also omits `onEnabled` and `onDisabled`, despite claiming the catalog is fully wired (files/plugin-runtime/tool-registrations.ts:126-130).
- Activation is persisted before loading, so a failed setup can leave durable `enabled:true` state (files/plugin-runtime/activation.ts:116-133).
- Hook inputs share nested references with core state (files/plugin-runtime/hook-registry.ts:160-170).
- The ABI drift is broader than the packet identified: `content.read`, `content.extend`, and `addFilter` are also synchronous today (files/plugin-runtime/capability-sdk.ts:55-63,107-116), contradicting ADR-024’s asynchronous, transport-ready boundary (files/adr/ADR-024-plugin-execution-and-trust-model.md:56-69).

One external contradiction matters loudly: changing a callback to return `Promise<ExtPatch>` does **not** prevent it from blocking the event loop. Node’s guidance explicitly says expensive work inside callbacks, promises, and `await` continuations can still block. Promise-only is an ABI/transport guarantee; execution isolation or enforceable budgets remain necessary for latency containment.

## Sources

- [WordPress `WP_Recovery_Mode`](https://developer.wordpress.org/reference/classes/wp_recovery_mode/) confirms that WordPress attributes a fatal error to an extension and stores it so the extension can be paused.
- [WordPress paused-plugin notice](https://developer.wordpress.org/reference/functions/paused_plugins_notice/) confirms the complementary operator surface: administrators are explicitly told that plugins were paused and directed to the Plugins screen.
- [WordPress `resume_plugin()`](https://developer.wordpress.org/reference/functions/resume_plugin/) confirms that recovery requires an explicit resume operation which retests loading. It does **not** justify Tovu’s proposed three-failure threshold; that threshold is a deliberate Tovu policy.
- [Chrome extension permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) confirms prior art for manifest-declared, deny-by-default API permissions and operator warnings. It supports capability scoping, but does not turn Tovu’s in-process Tier-3 SDK into a sandbox.
- [VS Code proposed APIs](https://code.visualstudio.com/api/advanced-topics/using-proposed-api) confirms why the ABI must be settled before publication: VS Code states that stable extension APIs cannot easily change and keeps unstable APIs out of published extensions.
- [Node worker message semantics](https://nodejs.org/api/worker_threads.html) confirms that worker messages use structured cloning, functions cannot cross that boundary, and the receiver gets a clone rather than a shared object.
- [WHATWG structured cloning](https://html.spec.whatwg.org/multipage/structured-data.html) confirms that `structuredClone()` produces a deep copy and rejects non-serializable payloads.
- [Node event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) contradicts the Round 2 implication that a Promise return type itself prevents blocking: promise and `await` callbacks must still complete quickly.

## Solution Slate

Ranking criteria, in order: AC-01 correctness, REQ-07 gateway integrity, recovery time, ABI durability, operator visibility, and implementation/blast-radius cost.

1. **Shared activation gateway, three consecutive failures, durable disable, operator notice, and ABI freeze.**

   This wires setup and attachment, makes both HTTP and agent activation use one gateway service, and sends automatic disable through that same service. Each triggering save remains fail-closed; the third consecutive exception disables the plugin, detaches it, creates the ordinary audited activation change, and raises an operator notice. A successful filter invocation resets the counter.

   Sacrifice: the first three affected saves fail, the threshold is policy rather than externally established fact, and an in-memory consecutive counter resets on process restart. It also deliberately breaks the zero-third-party SDK now by making callbacks and capability handles asynchronous.

2. **Immediate quarantine on the first attributed exception.**

   This is simpler and closer to WordPress Recovery Mode. It minimizes repeated disruption and needs no counter.

   Sacrifice: one transient dependency failure or one malformed entry disables a healthy plugin, producing unnecessary operator intervention and change-set noise.

3. **Detach in memory after repeated errors, persist disable later.**

   Saves recover fastest because detachment does not wait for the gateway.

   Sacrifice: durable activation can say `enabled:true` while the filter is detached, the transition is not gateway-audited, restart silently reactivates the offender, and the operator receives conflicting state. This violates REQ-07/INV-05 and is rejected.

I recommend option 1. Its cheapest falsification test enables a throwing fixture, performs three saves, and asserts exactly one gateway disable plus one operator notice; a fourth save must succeed without invoking the plugin. If the disable is duplicated, bypasses the gateway, or the fourth save still fails, the design is falsified.

## Leading Option — Code

The public ABI must be frozen as genuinely asynchronous, including the capability handles—not only the filter.

```ts
// packages/sdk/src/index.ts — replacement public types

export type ExtValue = string | number | boolean;
export type ExtPatch = Readonly<Record<string, ExtValue>>;

export interface HookContext {
  readonly pluginId: string;
  readonly workspaceId: string;
}

export type BeforeSaveFilter = (
  entry: Readonly<ContentEntryDraft>,
  ctx: Readonly<HookContext>,
) => Promise<ExtPatch>;

export interface PluginSdk {
  readonly content: {
    read(): Promise<Readonly<ContentEntryDraft>>;
    extend(field: string, value: ExtValue): Promise<void>;
  };

  addFilter(
    hookName: typeof HOOK_CONTENT_ENTRY_BEFORE_SAVE,
    filter: BeforeSaveFilter,
  ): Promise<void>;
}

export interface PluginDefinition {
  setup(sdk: PluginSdk): Promise<void>;
}

export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition;
}
```

The runtime needs a real transport-boundary copy. A top-level `Object.freeze()` alone is insufficient.

```ts
// files/plugin-runtime/sdk-payload.ts

function freezeRecursively<T>(value: T, seen: WeakSet<object>): T {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value;
  }

  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeRecursively(child, seen);
  }

  return Object.freeze(value);
}

export function cloneSdkPayload<T>(value: T): T {
  // Also acts as the structured-clone conformance check for the future
  // worker/utilityProcess transport.
  return freezeRecursively(structuredClone(value), new WeakSet<object>());
}
```

The capability SDK becomes asynchronous and clones values returned through `content.read`.

```ts
// files/plugin-runtime/capability-sdk.ts — changed contracts and function

import type {
  BeforeSaveFilter,
  ContentEntryDraft,
  HOOK_CONTENT_ENTRY_BEFORE_SAVE,
  PluginSdk,
} from "../../../packages/sdk/src/index";
import type { PluginCapability } from "./manifest";
import { cloneSdkPayload } from "./sdk-payload";

export interface CapabilityScopedSdkCoreDeps {
  getCurrentEntry(): Promise<Readonly<ContentEntryDraft>>;
  writeExtField(
    field: string,
    value: string | number | boolean,
  ): Promise<void>;
  attachFilter(
    hookName: typeof HOOK_CONTENT_ENTRY_BEFORE_SAVE,
    filter: BeforeSaveFilter,
  ): Promise<void>;
}

export function buildCapabilityScopedSdk(required: {
  readonly pluginId: string;
  readonly capabilities: readonly PluginCapability[];
  readonly coreDeps: CapabilityScopedSdkCoreDeps;
}): PluginSdk {
  const { pluginId, capabilities, coreDeps } = required;
  const granted = new Set<PluginCapability>(capabilities);

  function gate<Args extends unknown[], Result>(
    capability: PluginCapability,
    implementation: (...args: Args) => Promise<Result>,
  ): (...args: Args) => Promise<Result> {
    if (granted.has(capability)) return implementation;

    return async () => {
      throw new CapabilityDeniedError(pluginId, capability);
    };
  }

  return {
    content: {
      read: gate("content.read", async () =>
        cloneSdkPayload(await coreDeps.getCurrentEntry()),
      ),
      extend: gate("content.extend", (field, value) =>
        coreDeps.writeExtField(field, value),
      ),
    },
    addFilter: gate("hooks.attach", (hookName, filter) =>
      coreDeps.attachFilter(hookName, filter),
    ),
  };
}
```

`loadPlugin()` must retain the module, validate its exported definition, run asynchronous setup, enforce manifest-declared registration, and clean up partial attachment.

```ts
// files/plugin-runtime/loader.ts — additions and replacement for lines 140-158

import type {
  PluginDefinition,
  PluginSdk,
} from "../../../packages/sdk/src/index";
import {
  buildCapabilityScopedSdk,
  type CapabilityScopedSdkCoreDeps,
} from "./capability-sdk";
import type { PluginCapability } from "./manifest";

export interface LoadPluginRuntime {
  readonly hookRegistry: HookRegistry;
  readonly sdkCore: CapabilityScopedSdkCoreDeps;
}

export interface LoadPluginRequired {
  readonly record: PluginDiscoveryRecord;
  readonly manifest: PluginManifest;
  readonly entryPath: string;
  readonly runtime: LoadPluginRuntime;
}

export type LoadPluginResult =
  | { readonly loaded: true }
  | {
      readonly loaded: false;
      readonly reason:
        | "INTEGRITY_FAILED"
        | "SDK_RANGE_UNSATISFIED"
        | "CODE_ENTRY_MISSING"
        | "PLUGIN_ENTRY_INVALID"
        | "PLUGIN_SETUP_FAILED";
    };

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function readPluginDefinition(namespace: unknown): PluginDefinition | null {
  if (typeof namespace !== "object" || namespace === null) return null;

  const exports = namespace as Record<string, unknown>;
  const candidates = [exports.default, exports.plugin, namespace];

  for (const candidate of candidates) {
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      typeof (candidate as { setup?: unknown }).setup === "function"
    ) {
      return candidate as PluginDefinition;
    }
  }

  return null;
}

// Inside loadPlugin(), after the existing integrity and sdkRange checks:
let namespace: unknown;
try {
  namespace = await importModule(entryPath);
} catch {
  return { loaded: false, reason: "CODE_ENTRY_MISSING" };
}

const definition = readPluginDefinition(namespace);
if (!definition) {
  return { loaded: false, reason: "PLUGIN_ENTRY_INVALID" };
}

const { record, manifest, runtime } = required;
const attachedHooks = new Set<string>();

const sdk: PluginSdk = buildCapabilityScopedSdk({
  pluginId: manifest.id,
  capabilities: manifest.capabilities as readonly PluginCapability[],
  coreDeps: {
    getCurrentEntry: runtime.sdkCore.getCurrentEntry,
    writeExtField: runtime.sdkCore.writeExtField,
    attachFilter: async (hookName, filter) => {
      if (!manifest.hooks.includes(hookName)) {
        throw new Error(
          `plugin '${manifest.id}' attached undeclared hook '${hookName}'`,
        );
      }
      if (attachedHooks.has(hookName)) {
        throw new Error(
          `plugin '${manifest.id}' attached hook '${hookName}' more than once`,
        );
      }

      attachLoadedPlugin({
        pluginId: manifest.id,
        source: record.source,
        hookRegistry: runtime.hookRegistry,
        filter,
        declaredFields: manifest.fields,
      });
      attachedHooks.add(hookName);
    },
  },
});

try {
  const setup = definition.setup(sdk);
  if (!isPromiseLike<void>(setup)) {
    throw new TypeError(
      `plugin '${manifest.id}' setup() must return Promise<void>`,
    );
  }
  await setup;

  const missing = manifest.hooks.filter((hook) => !attachedHooks.has(hook));
  if (missing.length > 0) {
    throw new Error(
      `plugin '${manifest.id}' did not attach declared hooks: ${missing.join(", ")}`,
    );
  }
} catch {
  runtime.hookRegistry.detach(manifest.id);
  return { loaded: false, reason: "PLUGIN_SETUP_FAILED" };
}

return { loaded: true };
```

Activation must not persist success before loading has succeeded.

```ts
// files/plugin-runtime/activation.ts — replace lines 127-133

if (input.enabled) {
  // Load and attach first. A rejected load leaves the existing durable
  // activation untouched.
  await deps.onEnabled?.(input.pluginId);

  try {
    await deps.repo.save(activation);
  } catch (error) {
    // Compensate the in-memory attachment if persistence fails.
    deps.onDisabled?.(input.pluginId);
    throw error;
  }
} else {
  await deps.repo.save(activation);
  deps.onDisabled?.(input.pluginId);
}

return { activation };
```

The registry clones inputs, enforces Promise-returning filters, counts consecutive thrown/rejected invocations, and invokes one quarantine command under concurrency.

```ts
// files/plugin-runtime/hook-registry.ts — changed error/options and createHookRegistry()

import { cloneSdkPayload } from "./sdk-payload";

export interface HookFailureIncident {
  readonly pluginId: string;
  readonly workspaceId: string;
  readonly hookName: "content.entry.beforeSave";
  readonly consecutiveFailures: number;
  readonly message: string;
}

export interface HookRegistryOptions {
  readonly failureThreshold: number;
  readonly onQuarantine: (incident: HookFailureIncident) => Promise<void>;
}

export class PluginHookFailedError extends Error {
  readonly pluginId: string;
  readonly quarantined: boolean;
  readonly quarantineError?: unknown;

  constructor(
    pluginId: string,
    message: string,
    options: {
      cause?: unknown;
      quarantined?: boolean;
      quarantineError?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "PluginHookFailedError";
    this.pluginId = pluginId;
    this.quarantined = options.quarantined ?? false;
    this.quarantineError = options.quarantineError;
  }
}

export function createHookRegistry(options: HookRegistryOptions): HookRegistry {
  if (
    !Number.isInteger(options.failureThreshold) ||
    options.failureThreshold < 1
  ) {
    throw new RangeError("failureThreshold must be a positive integer");
  }

  const attachments = new Map<string, Attachment>();
  const consecutiveFailures = new Map<string, number>();
  const quarantineInFlight = new Map<string, Promise<void>>();

  function attach(
    pluginId: string,
    source: AttachmentSource,
    filter: BeforeSaveFilter,
    declaredFields: readonly HookRegistryFieldDecl[],
  ): void {
    consecutiveFailures.delete(pluginId);
    attachments.set(pluginId, { source, filter, declaredFields });
  }

  function detach(pluginId: string): void {
    attachments.delete(pluginId);
    consecutiveFailures.delete(pluginId);
  }

  async function quarantineAfterFailure(
    incident: HookFailureIncident,
  ): Promise<{ quarantined: boolean; error?: unknown }> {
    if (incident.consecutiveFailures < options.failureThreshold) {
      return { quarantined: false };
    }

    let pending = quarantineInFlight.get(incident.pluginId);
    if (!pending) {
      pending = options
        .onQuarantine(incident)
        .then(() => {
          // The gateway's onDisabled normally does this too. Keeping this
          // local deletion makes the registry safe with any valid adapter.
          attachments.delete(incident.pluginId);
          consecutiveFailures.delete(incident.pluginId);
        })
        .finally(() => {
          quarantineInFlight.delete(incident.pluginId);
        });
      quarantineInFlight.set(incident.pluginId, pending);
    }

    try {
      await pending;
      return { quarantined: true };
    } catch (error) {
      // Keep the attachment and count so the next failure retries the
      // gateway. Never disguise the original plugin exception.
      return { quarantined: false, error };
    }
  }

  async function runBeforeSave(
    entry: Readonly<ContentEntryDraft>,
  ): Promise<JsonObject> {
    const ordered = [...attachments.entries()].sort(compareTb01);
    const merged: Record<string, JsonObject> = {};

    for (const [pluginId, attachment] of ordered) {
      const snapshot = cloneSdkPayload<ContentEntryDraft>({
        ...entry,
        ext: { ...entry.ext, ...merged },
      });
      const ctx = cloneSdkPayload({
        pluginId,
        workspaceId: entry.workspaceId,
      });

      let patch: unknown;
      try {
        const result = attachment.filter(snapshot, ctx);
        if (!isPromiseLike<unknown>(result)) {
          throw new TypeError(
            `plugin '${pluginId}' beforeSave filter must return Promise<ExtPatch>`,
          );
        }
        patch = await result;
        consecutiveFailures.delete(pluginId);
      } catch (cause) {
        const count = (consecutiveFailures.get(pluginId) ?? 0) + 1;
        consecutiveFailures.set(pluginId, count);

        const message =
          cause instanceof Error ? cause.message : String(cause);
        const quarantine = await quarantineAfterFailure({
          pluginId,
          workspaceId: entry.workspaceId,
          hookName: "content.entry.beforeSave",
          consecutiveFailures: count,
          message,
        });

        throw new PluginHookFailedError(
          pluginId,
          `plugin '${pluginId}' content.entry.beforeSave filter failed: ${message}`,
          {
            cause,
            quarantined: quarantine.quarantined,
            quarantineError: quarantine.error,
          },
        );
      }

      if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
        throw new PluginHookFailedError(
          pluginId,
          `plugin '${pluginId}' returned a non-object ext patch`,
        );
      }

      const declaredByField = new Map(
        attachment.declaredFields.map((field) => [
          fieldNameOf(field.path),
          field,
        ]),
      );
      const pluginPatch: Record<string, JsonObject[string]> = {};

      for (const [field, value] of Object.entries(
        patch as Record<string, unknown>,
      )) {
        const declaration = declaredByField.get(field);
        if (!declaration) {
          throw new PluginHookFailedError(
            pluginId,
            `plugin '${pluginId}' returned undeclared ext field '${field}' (FIELD_PATH_INVALID)`,
          );
        }
        if (!matchesDeclaredType(value, declaration.type)) {
          throw new PluginHookFailedError(
            pluginId,
            `plugin '${pluginId}' returned ext field '${field}' with the wrong type (FIELD_TYPE_MISMATCH)`,
          );
        }
        pluginPatch[field] = value as JsonObject[string];
      }

      merged[pluginId] = pluginPatch;
    }

    return merged;
  }

  return { attach, detach, runBeforeSave };
}
```

The composition root must use one activation gateway instance for HTTP, agent tools, revert, and quarantine.

```ts
// files/plugin-runtime/composition.ts

export interface PluginLifecycle {
  readonly onEnabled: (pluginId: string) => Promise<void>;
  readonly onDisabled: (pluginId: string) => void;
}

export interface PluginActivationGatewayPort {
  setEnabled(command: {
    readonly workspaceId: string;
    readonly pluginId: string;
    readonly enabled: boolean;
    readonly actor: {
      readonly id: string;
      readonly kind: "user" | "agent" | "system";
    };
    readonly summary: string;
  }): Promise<{ activation: PluginActivationRecord }>;
}

export interface PluginOperatorNoticePort {
  publish(notice: {
    readonly code: "PLUGIN_AUTO_QUARANTINED";
    readonly severity: "error";
    readonly workspaceId: string;
    readonly pluginId: string;
    readonly message: string;
  }): Promise<void>;
}

export function composePluginRuntime(deps: {
  readonly workspaceId: string;
  readonly resolveLoadTarget: (pluginId: string) => Promise<{
    readonly record: PluginDiscoveryRecord;
    readonly manifest: PluginManifest;
    readonly entryPath: string;
  }>;
  readonly sdkCoreFor: (
    pluginId: string,
  ) => CapabilityScopedSdkCoreDeps;
  readonly createActivationGateway: (
    lifecycle: PluginLifecycle,
  ) => PluginActivationGatewayPort;
  readonly notices: PluginOperatorNoticePort;
  readonly log: {
    error(message: string, details: Readonly<Record<string, unknown>>): void;
  };
}): {
  readonly hookRegistry: HookRegistry;
  readonly activationGateway: PluginActivationGatewayPort;
  readonly lifecycle: PluginLifecycle;
} {
  let activationGateway!: PluginActivationGatewayPort;

  const hookRegistry = createHookRegistry({
    failureThreshold: 3,
    onQuarantine: async (incident) => {
      await activationGateway.setEnabled({
        workspaceId: incident.workspaceId,
        pluginId: incident.pluginId,
        enabled: false,
        actor: { id: "plugin-auto-quarantine", kind: "system" },
        summary:
          `Auto-quarantined plugin '${incident.pluginId}' after ` +
          `${incident.consecutiveFailures} consecutive ` +
          `${incident.hookName} failures: ${incident.message}`,
      });

      try {
        await deps.notices.publish({
          code: "PLUGIN_AUTO_QUARANTINED",
          severity: "error",
          workspaceId: incident.workspaceId,
          pluginId: incident.pluginId,
          message:
            `Plugin '${incident.pluginId}' was automatically disabled after ` +
            `${incident.consecutiveFailures} consecutive hook failures. ` +
            "Review the plugin before enabling it again.",
        });
      } catch (error) {
        // The gateway summary remains durable and operator-visible even if
        // the secondary notice adapter is unavailable.
        deps.log.error("failed to publish plugin quarantine notice", {
          pluginId: incident.pluginId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  const lifecycle: PluginLifecycle = {
    onEnabled: async (pluginId) => {
      const target = await deps.resolveLoadTarget(pluginId);
      const result = await loadPlugin({
        ...target,
        runtime: {
          hookRegistry,
          sdkCore: deps.sdkCoreFor(pluginId),
        },
      });

      if (!result.loaded) {
        throw new Error(
          `plugin '${pluginId}' failed to load: ${result.reason}`,
        );
      }
    },
    onDisabled: (pluginId) => hookRegistry.detach(pluginId),
  };

  // This factory is the existing executeCommand/REQ-07 composition extracted
  // from the HTTP route and tool registration. It receives the lifecycle once,
  // and every caller receives this same gateway instance.
  activationGateway = deps.createActivationGateway(lifecycle);

  return { hookRegistry, activationGateway, lifecycle };
}
```

The existing agent call site must stop invoking `setPluginEnabled()` without lifecycle wiring:

```ts
// files/plugin-runtime/tool-registrations.ts

export interface PluginsToolDeps {
  // Existing read dependencies remain.
  readonly activationGateway: PluginActivationGatewayPort;
  // ...
}

// In plugins_set_enabled:
const result = await routeDeps.activationGateway.setEnabled({
  workspaceId: routeDeps.workspaceId,
  pluginId,
  enabled,
  actor: {
    id: ctx.principal.id,
    kind: "agent",
  },
  summary: `Agent set plugin '${pluginId}' enabled=${enabled}`,
});

const record = discovery.find((candidate) => candidate.id === pluginId);
if (!record) {
  throw new Error(
    `plugin '${pluginId}' was not found in the current discovery snapshot`,
  );
}
return {
  plugin: toAdminPluginResponse(record, result.activation),
};
```

The HTTP `PATCH` route must call the same `activationGateway.setEnabled()` instance with a user actor. Revert must likewise call it with the inverse `enabled` value; none of those paths may call `setPluginEnabled()` directly.

This regression test compiles against current `main` by intentionally casting the new load argument through the old signature. Current `main` imports the namespace but never invokes `setup`, so the final `count` assertion fails.

```ts
// __tests__/integration/plugin-enable-ac01.integration.test.ts

import { describe, expect, it, vi } from "vitest";
import type {
  ContentEntryDraft,
  PluginSdk,
} from "../../../packages/sdk/src/index";
import { setPluginEnabled } from "../../files/plugin-runtime/activation";
import { createHookRegistry } from "../../files/plugin-runtime/hook-registry";
import { loadPlugin } from "../../files/plugin-runtime/loader";
import type { PluginManifest } from "../../files/plugin-runtime/manifest";
import { InMemoryPluginActivationRepo } from "../../files/plugin-runtime/repo.memory";

function collectText(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    for (const child of value) collectText(child, output);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const node = value as Record<string, unknown>;
  if (node.type === "text" && typeof node.text === "string") {
    output.push(node.text);
  }
  for (const child of Object.values(node)) collectText(child, output);
}

function countWords(bodyJson: unknown): number {
  const text: string[] = [];
  collectText(bodyJson, text);
  const joined = text.join(" ").trim();
  return joined === "" ? 0 : joined.split(/\s+/).length;
}

describe("AC-01 through the SPEC-005 enable path", () => {
  it("runs word-count setup and writes ext.word-count.count on save", async () => {
    const manifest: PluginManifest = {
      id: "word-count",
      name: "Word Count",
      version: "1.0.0",
      sdkRange: "^0.1.0",
      engine: 1,
      tier: "tier-3",
      capabilities: [
        "content.read",
        "content.extend",
        "hooks.attach",
      ],
      hooks: ["content.entry.beforeSave"],
      fields: [
        {
          path: "ext.word-count.count",
          type: "integer",
          queryable: false,
        },
      ],
      integrity: {},
    };

    const discovery = [{
      id: "word-count",
      name: "Word Count",
      version: "1.0.0",
      source: "built-in" as const,
      tier: "tier-3" as const,
      status: "valid" as const,
      errors: [],
    }];

    const draft = {
      id: "entry-1",
      workspaceId: "workspace-1",
      title: "Five words",
      slug: "five-words",
      status: "draft",
      bodyJson: {
        type: "doc",
        children: [
          { type: "text", text: "one two" },
          { type: "text", text: "three four five" },
        ],
      },
      ext: {},
    } as unknown as ContentEntryDraft;

    const setup = vi.fn(async (sdk: PluginSdk) => {
      await sdk.addFilter(
        "content.entry.beforeSave",
        async (entry) => ({
          count: countWords(entry.bodyJson),
        }),
      );
    });

    const registry = createHookRegistry({
      failureThreshold: 3,
      onQuarantine: vi.fn(async () => undefined),
    });
    const repo = new InMemoryPluginActivationRepo();
    const changeSets: string[] = [];

    async function enableThroughGateway(): Promise<void> {
      changeSets.push("plugin-enable");
      await setPluginEnabled({
        deps: {
          clock: { nowIso: () => "2026-08-12T00:00:00.000Z" },
          repo,
          discovery,
          onEnabled: async () => {
            const newRequired = {
              record: discovery[0],
              manifest,
              entryPath: "builtin:word-count/server/index.mjs",
              runtime: {
                hookRegistry: registry,
                sdkCore: {
                  getCurrentEntry: async () => draft,
                  writeExtField: async () => undefined,
                  attachFilter: async () => undefined,
                },
              },
            };

            // Keeps the red test compilable against current main, whose
            // LoadPluginRequired lacks `runtime`.
            const result = await loadPlugin(
              newRequired as unknown as Parameters<typeof loadPlugin>[0],
              {
                runtimeSdkVersion: "0.1.0",
                importModule: async () => ({
                  default: { setup },
                }),
              },
            );
            expect(result.loaded).toBe(true);
          },
          onDisabled: (pluginId) => registry.detach(pluginId),
        },
        input: {
          workspaceId: "workspace-1",
          pluginId: "word-count",
          enabled: true,
        },
      });
    }

    async function saveEntry(): Promise<ContentEntryDraft> {
      const pluginExt = await registry.runBeforeSave(draft);
      changeSets.push("entry-save");
      return {
        ...structuredClone(draft),
        ext: { ...draft.ext, ...pluginExt },
      };
    }

    await enableThroughGateway();
    const stored = await saveEntry();

    expect(
      (stored.ext["word-count"] as { count: number }).count,
    ).toBe(5);
    expect(setup).toHaveBeenCalledOnce();
    expect(changeSets).toEqual(["plugin-enable", "entry-save"]);
  });
});
```

The quarantine and nested-reference regressions are independently testable:

```ts
// __tests__/integration/plugin-quarantine.integration.test.ts

it("gateway-disables once after three consecutive thrown filters", async () => {
  const gatewayDisable = vi.fn(async () => undefined);
  const notice = vi.fn(async () => undefined);

  const registry = createHookRegistry({
    failureThreshold: 3,
    onQuarantine: async (incident) => {
      await gatewayDisable({
        pluginId: incident.pluginId,
        enabled: false,
      });
      await notice(incident);
    },
  });

  registry.attach(
    "thrower",
    "site",
    async () => {
      throw new Error("boom");
    },
    [{ path: "ext.thrower.count", type: "integer" }],
  );

  const draft = {
    workspaceId: "workspace-1",
    bodyJson: {},
    ext: {},
  } as unknown as ContentEntryDraft;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(registry.runBeforeSave(draft)).rejects.toMatchObject({
      pluginId: "thrower",
    });
  }

  expect(gatewayDisable).toHaveBeenCalledOnce();
  expect(notice).toHaveBeenCalledOnce();
  await expect(registry.runBeforeSave(draft)).resolves.toEqual({});
});

it("does not expose nested core references to a plugin", async () => {
  const registry = createHookRegistry({
    failureThreshold: 3,
    onQuarantine: async () => undefined,
  });

  registry.attach(
    "mutator",
    "site",
    async (entry) => {
      const body = entry.bodyJson as {
        children: Array<{ text: string }>;
      };
      body.children[0].text = "corrupted";
      return { count: 1 };
    },
    [{ path: "ext.mutator.count", type: "integer" }],
  );

  const draft = {
    workspaceId: "workspace-1",
    bodyJson: { children: [{ text: "original" }] },
    ext: {},
  } as unknown as ContentEntryDraft;

  await expect(registry.runBeforeSave(draft)).rejects.toMatchObject({
    pluginId: "mutator",
  });
  expect(
    (draft.bodyJson as { children: Array<{ text: string }> })
      .children[0].text,
  ).toBe("original");
});
```

The SDK snapshot must also assert `Promise<ExtPatch>`, asynchronous capability methods, and `Promise<void>` setup. Corresponding REQ-05/state-spec signatures must change from `=> ExtPatch` to `=> Promise<ExtPatch>`.

## Critique Of Another Participant's Round 2 Code

Gemini 3.6’s proposed fallback construct—“replace deep clones with an `Object.freeze()` structural proxy contract”—is unsafe. `Object.freeze(snapshot)` freezes only the top-level object. `snapshot.bodyJson.children[0]` remains the same mutable object referenced by core under the current shallow spread at files/plugin-runtime/hook-registry.ts:165. The proposal therefore preserves the precise vulnerability Gemini correctly diagnosed. A clone followed by recursive freezing is required.

Gemini 3.6 also said that changing the signature to `Promise<ExtPatch>` would “enforce ADR-024 §3’s async-only rule.” It freezes the transport ABI, but it does not enforce non-blocking execution; a filter can perform unlimited synchronous work before returning its promise. Node’s official event-loop guidance explicitly contradicts that stronger implication.

Sonnet’s “exactly one missing composition-root wire” is also too narrow. The concrete agent activation call at files/plugin-runtime/tool-registrations.ts:126-130 passes only `clock`, `repo`, and `discovery`; it does not pass either lifecycle callback. Fixing `loadPlugin()` alone therefore still leaves `plugins_set_enabled` persisting activation without loading or detaching the plugin.

## What Would Change My Mind

I would choose immediate first-error quarantine if production telemetry showed that attributed hook exceptions are overwhelmingly deterministic and that allowing two additional failed saves provides no useful tolerance.

I would persist failure counts across restart if crash/restart testing showed a plugin could indefinitely evade quarantine by causing or coinciding with host restarts.

I would reject this implementation if the combined regression suite cannot prove all of the following: AC-01 fails on current `main`; exactly one gateway disable occurs at the threshold; a fourth save succeeds; the operator receives attribution; nested mutation cannot alter core state; and a synchronous filter return is rejected by the frozen ABI.

A structured-clone benchmark could change the copying mechanism, but never the no-shared-reference invariant. A shallow spread or top-level-only freeze would not be an acceptable optimization.

<<SWARM_END>>