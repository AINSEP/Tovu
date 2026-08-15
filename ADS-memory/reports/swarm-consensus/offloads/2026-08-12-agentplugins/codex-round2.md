I’ll read the packet first, then inspect only the in-scope source files it identifies and shape the response to its exact debate format.
The packet’s key design constraint is now clear: the composer needs a source-neutral descriptor and dispatcher, while executable authority must remain host-owned. I’m checking the actual composer, preview, registry, and federation seams before writing the code slate.
ACK_PACKET_RECEIVED CTX-AGENTPLUGINS-R2-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

I recommend a host-owned capability registry with source adapters. The composer receives one source-neutral descriptor format and never dispatches by capability kind. Preview and execution are opaque host bindings resolved server-side.

My position changed this round: I previously accepted `extensions["org.tovu.commands"]` for presentation and binding metadata. I now reject it for the leading option. Once first-party tools, connectors, federated tools, Skills, and future unknown kinds all need the same projection, an Agent-Plugin-only namespace is redundant. More importantly, executable bindings and authoritative argument schemas must be produced by the host adapter, not by the package being classified.

The shipped structure makes this boundary necessary:

- Composer discovery is four hardcoded groups, with only MCP settings backed by a route (files/tovu/agent-plugin-catalog.ts:42-104).
- Composer utilities only filter and insert text; they have neither arguments nor invocation semantics (files/jini/composer-discovery.ts:9-45).
- Preview content is tied to fourteen Vite raw imports and one plugin-specific allowlist (files/tovu/agent-plugin-source-catalog.ts:1-14, files/tovu/agent-plugin-source-catalog.ts:21-58).
- Native tool catalogs already carry descriptions, JSON Schema, and independently meaningful side-effect metadata (files/tovu/plugin-runtime/agent-tools.ts:43-59, files/tovu/plugin-runtime/agent-tools.ts:92-108).
- Federated tools already converge into the live `ToolRegistry` with real handlers (files/tovu/mcp-federation/bootstrap.ts:110-130, files/tovu/mcp-federation/registrations.ts:90-131).

The strongest counterargument is that a presentation-only extension is standards-sanctioned, improves publisher control over labels and aliases, and costs no execution authority. That is true. The sacrifice in my recommendation is that publishers cannot ship Tovu-specific ordering or friendly aliases; those become synthesized defaults or workspace-owned profiles.

## Solution Slate

Ranking criteria, in priority order: fail-closed trust and honest UI; no composer changes for new source kinds; reuse of real execution paths; collision/version safety; implementation cost and publisher ergonomics.

1. **Host capability registry, no Agent Plugin extension — recommended.**

   Every source contributes `CapabilityRegistration` objects. Public descriptors contain data and opaque binding IDs; closures remain server-side. The composer lists, previews, renders arguments, confirms, and invokes without inspecting `kind`.

   Agent Plugin packages contribute package previews and context-only Skill capabilities. Their `mcp.json` contributes a visible but blocked preview until an independently authored admission and process sandbox exist. Existing native and independently admitted federated tools are projected from the live tool registry and execute through their existing handlers.

   Trade-offs: one new server registry/API, a backend preview service, revision-aware invocation, and projection metadata for current tools. Genuine sacrifices: arbitrary Agent Plugin MCP does not ship, and package authors cannot prescribe Tovu aliases or ordering.

2. **The same registry plus `org.tovu.commands` as an optional presentation overlay.**

   This improves labels, aliases, keywords, and grouping. It would be applied only after a host adapter had created a capability; it could neither create one nor contain `arguments`, `execute`, `confirmation`, trust, or permissions.

   Trade-offs: better publisher ergonomics, but a Tovu dialect, its own schema/version lifecycle, malformed-extension diagnostics, and aliases that still require workspace collision resolution. Genuine sacrifice: command presentation ceases to be portable even though the underlying Skill or MCP component remains portable.

3. **Workspace-authored command profiles only, with no synthesized short aliases.**

   This is strongest for administration: an operator explicitly chooses every alias, argument presentation, and exposed subset. It also supplies genuinely independent MCP admission metadata.

   Trade-offs: lowest ambiguity and best local governance, but poor zero-configuration UX and no publisher intent. Genuine sacrifice: installing a valid package produces previews but no convenient slash names until an administrator configures them.

The cheapest falsifying test is one integration fixture registering a made-up `dataset-snapshot` kind with `<dataset-id>` arguments, Markdown preview, confirmation, and an executable mock binding. If it cannot render, preview, and invoke without editing composer code, the leading architecture fails N3. The same test should register two `/review` aliases and require an ambiguity result rather than registration-order execution.

## Leading Option — Code

### Source-neutral contract and dispatcher

```ts
// capability-contract.ts
export type JsonSchemaObject = Readonly<Record<string, unknown>>;

export interface CapabilityArgumentPresentation {
  readonly name: string;       // JSON-Schema property name
  readonly placeholder: string;
  readonly order: number;
}

export type CapabilityAvailability =
  | { readonly state: "ready" }
  | { readonly state: "preview-only"; readonly message: string }
  | { readonly state: "blocked"; readonly message: string };

export type ConfirmationRequirement =
  | { readonly mode: "none" }
  | { readonly mode: "required"; readonly prompt: string }
  | { readonly mode: "policy"; readonly policyId: string };

export interface CapabilityDescriptor {
  readonly contractVersion: 1;

  /** Stable logical identity; revision is checked separately. */
  readonly id: string;
  readonly revision: string; // immutable package/tool-surface digest

  /** `kind` is display/search data, never a dispatch discriminator. */
  readonly kind: string;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly group: { readonly id: string; readonly label: string };

  readonly command: {
    /** No leading slash. Source-qualified and globally unique. */
    readonly canonical: string;
    /** Convenience names; ambiguity must prevent execution. */
    readonly aliases: readonly string[];
  };

  readonly args: {
    readonly schema: JsonSchemaObject;
    readonly presentation: readonly CapabilityArgumentPresentation[];
  };

  /** These IDs are minted by the host registry, never accepted from package JSON. */
  readonly preview?: { readonly bindingId: string; readonly title: string };
  readonly execute?: { readonly bindingId: string };

  readonly confirmation: ConfirmationRequirement;
  readonly availability: CapabilityAvailability;

  readonly provenance: {
    readonly sourceKind: string;
    readonly sourceId: string;
    readonly sourceVersion?: string;
    readonly contentDigest?: string;
    readonly publisherClaim?: string;
  };

  /** A host decision kept separate from publisher claims. */
  readonly trust: {
    readonly decision: string;
    readonly assignedBy: { readonly kind: string; readonly id: string };
    readonly basis: readonly string[];
  };
}

export interface PreviewDocument {
  readonly path: string;
  readonly mediaType: string;
  readonly content: string;
}

export interface PreviewBundle {
  readonly title: string;
  readonly documents: readonly PreviewDocument[];
}

export interface CapabilityExecutionContext {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly signal?: AbortSignal;
}

export interface CapabilityRegistration {
  readonly descriptor: CapabilityDescriptor;
  readonly preview?: {
    readonly bindingId: string;
    load(): Promise<PreviewBundle>;
  };
  readonly execute?: {
    readonly bindingId: string;
    run(
      args: Record<string, unknown>,
      ctx: CapabilityExecutionContext,
    ): Promise<unknown>;
  };
}

export interface CapabilitySource {
  readonly sourceId: string;
  load(): Promise<readonly CapabilityRegistration[]>;
}
```

```ts
// capability-registry.ts
export interface JsonSchemaValidator {
  assert(schema: JsonSchemaObject, value: unknown): void;
}

export interface ConfirmationPort {
  authorize(input: {
    descriptor: CapabilityDescriptor;
    args: Record<string, unknown>;
    workspaceId: string;
    principalId: string;
    token?: string;
  }): Promise<
    | { readonly allowed: true }
    | { readonly allowed: false; readonly challenge: string }
  >;
}

export class CapabilityRegistry {
  private readonly registrations = new Map<string, CapabilityRegistration>();
  private readonly canonicalIds = new Map<string, string>();
  private readonly aliasIds = new Map<string, Set<string>>();

  constructor(
    private readonly schemas: JsonSchemaValidator,
    private readonly confirmations: ConfirmationPort,
  ) {}

  register(registration: CapabilityRegistration): void {
    const { descriptor } = registration;

    if (this.registrations.has(descriptor.id)) {
      throw new Error(`duplicate capability id '${descriptor.id}'`);
    }
    if (this.canonicalIds.has(descriptor.command.canonical)) {
      throw new Error(
        `duplicate canonical command '/${descriptor.command.canonical}'`,
      );
    }
    if (descriptor.preview?.bindingId !== registration.preview?.bindingId) {
      throw new Error(`preview binding mismatch for '${descriptor.id}'`);
    }
    if (descriptor.execute?.bindingId !== registration.execute?.bindingId) {
      throw new Error(`execute binding mismatch for '${descriptor.id}'`);
    }
    if (descriptor.availability.state === "ready" && !registration.execute) {
      throw new Error(`ready capability '${descriptor.id}' has no handler`);
    }

    this.registrations.set(descriptor.id, registration);
    this.canonicalIds.set(descriptor.command.canonical, descriptor.id);

    for (const alias of descriptor.command.aliases) {
      const ids = this.aliasIds.get(alias) ?? new Set<string>();
      ids.add(descriptor.id);
      this.aliasIds.set(alias, ids);
    }
  }

  async loadSources(sources: readonly CapabilitySource[]): Promise<void> {
    for (const source of sources) {
      for (const registration of await source.load()) {
        this.register(registration);
      }
    }
  }

  list(): readonly CapabilityDescriptor[] {
    return [...this.registrations.values()].map((entry) => entry.descriptor);
  }

  resolveCommand(command: string):
    | { readonly state: "found"; readonly capabilityId: string }
    | { readonly state: "missing" }
    | { readonly state: "ambiguous"; readonly capabilityIds: readonly string[] } {
    const canonical = this.canonicalIds.get(command);
    if (canonical) return { state: "found", capabilityId: canonical };

    const aliases = [...(this.aliasIds.get(command) ?? [])];
    if (aliases.length === 0) return { state: "missing" };
    if (aliases.length > 1) {
      return { state: "ambiguous", capabilityIds: aliases };
    }
    return { state: "found", capabilityId: aliases[0]! };
  }

  async preview(capabilityId: string): Promise<PreviewBundle> {
    const registration = this.require(capabilityId);
    if (!registration.preview) {
      throw new Error(`capability '${capabilityId}' has no preview`);
    }
    return registration.preview.load();
  }

  async invoke(
    request: {
      readonly capabilityId: string;
      readonly revision: string;
      readonly args: Record<string, unknown>;
      readonly confirmationToken?: string;
    },
    ctx: CapabilityExecutionContext,
  ): Promise<
    | { readonly state: "completed"; readonly result: unknown }
    | { readonly state: "confirmation-required"; readonly challenge: string }
  > {
    const registration = this.require(request.capabilityId);
    const { descriptor } = registration;

    if (request.revision !== descriptor.revision) {
      throw new Error("capability changed; refresh its descriptor before invoking");
    }
    if (descriptor.availability.state !== "ready" || !registration.execute) {
      throw new Error(descriptor.availability.message ?? "capability unavailable");
    }

    this.schemas.assert(descriptor.args.schema, request.args);

    if (descriptor.confirmation.mode !== "none") {
      const decision = await this.confirmations.authorize({
        descriptor,
        args: request.args,
        workspaceId: ctx.workspaceId,
        principalId: ctx.principalId,
        token: request.confirmationToken,
      });
      if (!decision.allowed) {
        return { state: "confirmation-required", challenge: decision.challenge };
      }
    }

    return {
      state: "completed",
      result: await registration.execute.run(request.args, ctx),
    };
  }

  private require(id: string): CapabilityRegistration {
    const registration = this.registrations.get(id);
    if (!registration) throw new Error(`unknown capability '${id}'`);
    return registration;
  }
}

export function renderCommandSignature(
  descriptor: CapabilityDescriptor,
): string {
  const suffix = [...descriptor.args.presentation]
    .sort((a, b) => a.order - b.order)
    .map((argument) => `<${argument.placeholder}>`)
    .join(" ");

  return `/${descriptor.command.canonical}${suffix ? ` ${suffix}` : ""}`;
}
```

The browser calls generic list, preview, and invoke endpoints using `capabilityId`; it never submits or chooses a binding ID. A new source implements `CapabilitySource`. There is no `switch (descriptor.kind)`.

### Generic, traversal-safe preview

```ts
// capability-file-preview.ts
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const MAX_PREVIEW_FILES = 64;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

function normalizePackagePath(input: string): string {
  if (
    input.includes("\0") ||
    path.posix.isAbsolute(input) ||
    path.win32.isAbsolute(input)
  ) {
    throw new Error(`unsafe package path '${input}'`);
  }

  const portable = input.replaceAll("\\", "/");
  const normalized = path.posix.normalize(portable);
  if (
    normalized !== portable ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`package traversal rejected: '${input}'`);
  }
  return normalized;
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

async function readContainedText(
  packageRoot: string,
  relativePath: string,
): Promise<string> {
  const safeRelative = normalizePackagePath(relativePath);
  const realRoot = await realpath(packageRoot);
  const lexicalCandidate = path.resolve(realRoot, safeRelative);

  if (!isContained(realRoot, lexicalCandidate)) {
    throw new Error(`package traversal rejected: '${relativePath}'`);
  }

  // This second check also rejects a symlink inside the package that escapes it.
  const realCandidate = await realpath(lexicalCandidate);
  if (!isContained(realRoot, realCandidate)) {
    throw new Error(`package symlink escape rejected: '${relativePath}'`);
  }

  const metadata = await stat(realCandidate);
  if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) {
    throw new Error(`file is not previewable: '${relativePath}'`);
  }
  return readFile(realCandidate, "utf8");
}

function mediaType(relativePath: string): string {
  if (relativePath.endsWith(".md")) return "text/markdown";
  if (relativePath.endsWith(".json")) return "application/json";
  return "text/plain";
}

/**
 * allowedPaths comes from the validated package inventory. The UI never supplies
 * a filesystem path and cannot broaden this set.
 */
export function makeFilePreviewProvider(input: {
  readonly title: string;
  readonly packageRoot: string;
  readonly allowedPaths: readonly string[];
}): () => Promise<PreviewBundle> {
  return async () => {
    if (input.allowedPaths.length > MAX_PREVIEW_FILES) {
      throw new Error("preview file-count limit exceeded");
    }

    let total = 0;
    const documents: PreviewDocument[] = [];

    for (const rawPath of input.allowedPaths) {
      const relativePath = normalizePackagePath(rawPath);
      const content = await readContainedText(input.packageRoot, relativePath);
      total += Buffer.byteLength(content, "utf8");
      if (total > MAX_TOTAL_BYTES) {
        throw new Error("preview total-size limit exceeded");
      }
      documents.push({ path: relativePath, mediaType: mediaType(relativePath), content });
    }

    return { title: input.title, documents };
  };
}
```

This replaces the one-plugin import table while preserving—and strengthening—the current exact-path rejection at files/tovu/agent-plugin-source-catalog.ts:48-58. `PreviewModalShell` consumes `PreviewBundle.documents`; Markdown, JSON, and plain text use registered media renderers, with escaped plain text as the fallback. It does not know whether the source is a Skill, plugin, connector, or future capability.

### Agent Plugins adapter

```ts
// agent-plugin-capability-source.ts
import path from "node:path";

const EMPTY_ARGUMENTS = {
  schema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {},
  },
  presentation: [],
} as const;

interface AgentPluginManifest {
  readonly $schema: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly extensions?: unknown; // deliberately ignored by this adapter
}

interface IndexedAgentPlugin {
  readonly packageRoot: string;
  readonly digest: string;
  readonly manifest: AgentPluginManifest;
  /** Produced by package validation, then rechecked by the preview reader. */
  readonly files: readonly string[];
  readonly mcpManifest?: {
    readonly $schema?: string;
  };
}

interface ContextActivationPort {
  activate(input: {
    readonly workspaceId: string;
    readonly capabilityId: string;
    readonly markdown: string;
    readonly provenance: CapabilityDescriptor["provenance"];
    readonly trustLabel: "untrusted-plugin-instructions";
  }): Promise<unknown>;
}

function schemaVersion(schema: string | undefined): string | null {
  return schema?.match(
    /\/schemas\/(\d+\.\d+\.\d+)\/(?:plugin|mcp)\.schema\.json$/,
  )?.[1] ?? null;
}

function displayName(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

export function agentPluginCapabilitySource(
  pkg: IndexedAgentPlugin,
  context: ContextActivationPort,
): CapabilitySource {
  return {
    sourceId: `agent-plugin:${pkg.manifest.name}@${pkg.digest}`,

    async load(): Promise<readonly CapabilityRegistration[]> {
      const registrations: CapabilityRegistration[] = [];
      const baseProvenance: CapabilityDescriptor["provenance"] = {
        sourceKind: "agent-plugin",
        sourceId: pkg.manifest.name,
        sourceVersion: pkg.manifest.version,
        contentDigest: pkg.digest,
      };

      const packagePreviewId = `preview:agent-plugin:${pkg.digest}`;
      registrations.push({
        descriptor: {
          contractVersion: 1,
          id: `agent-plugin:${pkg.manifest.name}`,
          revision: pkg.digest,
          kind: "agent-plugin",
          label: displayName(pkg.manifest.name),
          description: pkg.manifest.description ?? "Portable Agent Plugin package",
          keywords: ["agent plugin", pkg.manifest.name],
          group: { id: "agent-plugins", label: "Agent Plugins" },
          command: {
            canonical: `agent-plugin:${pkg.manifest.name}`,
            aliases: [],
          },
          args: EMPTY_ARGUMENTS,
          preview: {
            bindingId: packagePreviewId,
            title: `${displayName(pkg.manifest.name)} package`,
          },
          confirmation: { mode: "none" },
          availability: {
            state: "preview-only",
            message: "Package inspection does not execute plugin code.",
          },
          provenance: baseProvenance,
          trust: {
            decision: "inspectable",
            assignedBy: { kind: "host", id: "tovu-agent-plugin-adapter" },
            basis: ["validated package inventory", "digest-pinned preview"],
          },
        },
        preview: {
          bindingId: packagePreviewId,
          load: makeFilePreviewProvider({
            title: `${displayName(pkg.manifest.name)} package`,
            packageRoot: pkg.packageRoot,
            allowedPaths: pkg.files,
          }),
        },
      });

      const skillPaths = pkg.files
        .filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file))
        .sort();

      for (const skillPath of skillPaths) {
        const skillName = skillPath.split("/")[1]!;
        const skillRoot = path.posix.dirname(skillPath);
        const previewPaths = pkg.files.filter(
          (file) =>
            file === skillPath ||
            file.startsWith(`${skillRoot}/references/`),
        );

        const id = `agent-plugin:${pkg.manifest.name}:skill:${skillName}`;
        const previewBinding = `preview:${id}:${pkg.digest}`;
        const executeBinding = `execute:${id}:${pkg.digest}`;
        const preview = makeFilePreviewProvider({
          title: `${displayName(skillName)} Skill`,
          packageRoot: pkg.packageRoot,
          allowedPaths: previewPaths,
        });

        registrations.push({
          descriptor: {
            contractVersion: 1,
            id,
            revision: pkg.digest,
            kind: "skill",
            label: displayName(skillName),
            description: `Context-only Skill from ${pkg.manifest.name}`,
            keywords: ["skill", skillName, pkg.manifest.name],
            group: { id: "skills", label: "Skills" },
            command: {
              canonical: `agent-plugin:${pkg.manifest.name}:skill:${skillName}`,
              aliases: [skillName],
            },
            args: EMPTY_ARGUMENTS,
            preview: {
              bindingId: previewBinding,
              title: `${displayName(skillName)} Skill`,
            },
            execute: { bindingId: executeBinding },
            confirmation: { mode: "none" },
            availability: { state: "ready" },
            provenance: baseProvenance,
            trust: {
              decision: "admitted-context-only",
              assignedBy: { kind: "host", id: "tovu-agent-plugin-adapter" },
              basis: [
                "digest-pinned package",
                "instruction injection only",
                "does not grant tools or process execution",
              ],
            },
          },
          preview: { bindingId: previewBinding, load: preview },
          execute: {
            bindingId: executeBinding,
            run: async (_args, ctx) => {
              const bundle = await preview();
              const skill = bundle.documents.find(
                (document) => document.path === skillPath,
              );
              if (!skill) throw new Error(`missing pinned Skill '${skillPath}'`);

              return context.activate({
                workspaceId: ctx.workspaceId,
                capabilityId: id,
                markdown: skill.content,
                provenance: baseProvenance,
                trustLabel: "untrusted-plugin-instructions",
              });
            },
          },
        });
      }

      if (pkg.mcpManifest) {
        const pluginSchema = schemaVersion(pkg.manifest.$schema);
        const mcpSchema = schemaVersion(pkg.mcpManifest.$schema);
        const mismatch =
          pluginSchema === null ||
          mcpSchema === null ||
          pluginSchema !== mcpSchema;

        const message = mismatch
          ? `Skills remain available. MCP is disabled because plugin.json schema '${pluginSchema ?? "invalid"}' and mcp.json schema '${mcpSchema ?? "invalid"}' do not match.`
          : "Skills remain available. Agent Plugin MCP execution is not available in this release because this package has no independent tool allowlist or process sandbox.";

        const previewBinding = `preview:agent-plugin-mcp:${pkg.digest}`;
        registrations.push({
          descriptor: {
            contractVersion: 1,
            id: `agent-plugin:${pkg.manifest.name}:mcp-config`,
            revision: pkg.digest,
            kind: "mcp-config",
            label: `${displayName(pkg.manifest.name)} MCP configuration`,
            description: message,
            keywords: ["mcp", pkg.manifest.name],
            group: { id: "mcp", label: "MCP" },
            command: {
              canonical: `agent-plugin:${pkg.manifest.name}:mcp`,
              aliases: [],
            },
            args: EMPTY_ARGUMENTS,
            preview: {
              bindingId: previewBinding,
              title: `${displayName(pkg.manifest.name)} mcp.json`,
            },
            confirmation: { mode: "none" },
            availability: { state: "blocked", message },
            provenance: baseProvenance,
            trust: {
              decision: "not-admitted",
              assignedBy: { kind: "host", id: "tovu-agent-plugin-adapter" },
              basis: mismatch
                ? ["component schema mismatch"]
                : ["plugin-authored configuration is not an independent allowlist"],
            },
          },
          preview: {
            bindingId: previewBinding,
            load: makeFilePreviewProvider({
              title: `${displayName(pkg.manifest.name)} mcp.json`,
              packageRoot: pkg.packageRoot,
              allowedPaths: ["mcp.json"],
            }),
          },
        });
      }

      return registrations;
    },
  };
}
```

`extensions["org.tovu.commands"]` is not read. Labels and aliases are synthesized, while workspace profiles may override presentation outside the package. Consequently, package JSON cannot mint an execute binding, alter confirmation, supply trust, or promote MCP tools.

The actual bundled manifest uses Agent Plugins schema `1.0.0` while independently carrying package version `1.1.0`; these are correctly treated as different concepts (files/tovu/plugin.json:1-6).

### Projection of the live tool registry

```ts
// tool-registry-capability-source.ts
interface LiveToolDescriptor {
  readonly id: string;
  readonly description: string;
  readonly inputSchema?: unknown;
}

interface LiveToolRegistry {
  list(): readonly LiveToolDescriptor[];
}

interface ToolExecutionPort {
  execute(
    toolId: string,
    args: Record<string, unknown>,
    ctx: CapabilityExecutionContext,
  ): Promise<unknown>;
}

interface ToolProjectionPolicy {
  readonly kind: string;
  readonly label: string;
  readonly group: { readonly id: string; readonly label: string };
  readonly canonical: string;
  readonly aliases: readonly string[];
  readonly argumentPresentation: readonly CapabilityArgumentPresentation[];
  readonly confirmation: ConfirmationRequirement;
  readonly provenance: CapabilityDescriptor["provenance"];
  readonly trust: CapabilityDescriptor["trust"];
  readonly revision: string;
}

function isSchemaObject(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function liveToolCapabilitySource(input: {
  readonly registry: LiveToolRegistry;
  readonly executor: ToolExecutionPort;
  readonly policyFor: (toolId: string) => ToolProjectionPolicy | null;
  readonly reportMissingPolicy: (toolId: string) => void;
}): CapabilitySource {
  return {
    sourceId: "live-tool-registry",

    async load(): Promise<readonly CapabilityRegistration[]> {
      return input.registry.list().map((tool) => {
        const policy = input.policyFor(tool.id);
        const hasSchema = isSchemaObject(tool.inputSchema);

        if (!policy || !hasSchema) {
          input.reportMissingPolicy(tool.id);
          return {
            descriptor: {
              contractVersion: 1,
              id: `tool:${tool.id}`,
              revision: "unclassified",
              kind: "tool",
              label: tool.id,
              description: tool.description,
              keywords: [tool.id],
              group: { id: "unclassified-tools", label: "Unavailable tools" },
              command: { canonical: tool.id, aliases: [] },
              args: EMPTY_ARGUMENTS,
              confirmation: { mode: "none" },
              availability: {
                state: "blocked",
                message: !policy
                  ? "Registered tool has no host-authored projection policy."
                  : "Registered tool has no valid argument schema.",
              },
              provenance: { sourceKind: "tool-registry", sourceId: tool.id },
              trust: {
                decision: "not-projected",
                assignedBy: { kind: "host", id: "capability-registry" },
                basis: ["missing independently authored projection metadata"],
              },
            },
          };
        }

        const bindingId = `tool-executor:${tool.id}:${policy.revision}`;
        return {
          descriptor: {
            contractVersion: 1,
            id: `tool:${tool.id}`,
            revision: policy.revision,
            kind: policy.kind,
            label: policy.label,
            description: tool.description,
            keywords: [tool.id, ...policy.aliases],
            group: policy.group,
            command: {
              canonical: policy.canonical,
              aliases: policy.aliases,
            },
            args: {
              schema: tool.inputSchema,
              presentation: policy.argumentPresentation,
            },
            execute: { bindingId },
            confirmation: policy.confirmation,
            availability: { state: "ready" },
            provenance: policy.provenance,
            trust: policy.trust,
          },
          execute: {
            bindingId,
            run: (args, ctx) => input.executor.execute(tool.id, args, ctx),
          },
        };
      });
    },
  };
}
```

Thus `/search <query>` is a real executor call when the host profile maps the registered search tool to canonical `search`; it is never an insertion string. Federated calls continue through their existing permission check, remote `tools/call`, and untrusted-result wrapper (files/tovu/mcp-federation/registrations.ts:90-131).

Two plugins contributing alias `/review` produce an ambiguous alias set. Neither wins. Their canonical commands remain distinct, for example `/agent-plugin:alpha:skill:review` and `/agent-plugin:beta:skill:review`.

Invocation includes `revision`, so an open palette cannot invoke different bytes after an update. Workspace activation should persist version plus digest; the first-party runtime already demonstrates workspace-scoped active versions and preserves the actually active version on disable (files/tovu/plugin-runtime/activation.ts:27-45, files/tovu/plugin-runtime/activation.ts:112-127).

Honest release copy should be:

> Agent Plugin Skills can be previewed and added as untrusted instructions for the next assistant turn. This does not run plugin code. Agent Plugin MCP servers are preview-only and cannot run in this release.

That replaces the current broader “does not execute Agent Plugins yet” statement (files/tovu/AgentPlugins.tsx:65-67) only when the context activation binding is genuinely connected.

## The Trust Gap

The Agent Plugin MCP half does not ship in this slate.

`mcp-federation` requires `allowedToolNames` to come from the site owner or a reviewed vendor preset; discovery alone grants nothing (files/tovu/mcp-federation/ports.ts:111-137, files/tovu/mcp-federation/trust.ts:65-74). Its implementation actually refuses non-allowlisted tools before considering self-declared hints (files/tovu/mcp-federation/trust.ts:244-303).

A plugin-authored `mcp.json` cannot supply that allowlist. Doing so would make the author and classifier the same party. Nor is federation a process sandbox: the current adapter directly calls `spawn()` and inherits `PATH`, `HOME`, and `TMPDIR` (files/tovu/mcp-federation/adapter.stdio.ts:307-312, files/tovu/mcp-federation/adapter.stdio.ts:372-395). The trust module itself explicitly disclaims making external code safe (files/tovu/mcp-federation/trust.ts:98-103).

Future admission requires a record stored outside the package:

```ts
export interface AgentPluginMcpAdmission {
  readonly workspaceId: string;
  readonly pluginDigest: string;
  readonly serverId: string;
  readonly schemaVersion: string;

  /** Independently selected; never copied wholesale from tools/list or mcp.json. */
  readonly allowedToolNames: readonly string[];
  readonly reviewedToolSurfaceDigest: string;

  readonly reviewedBy: string;
  readonly reviewedAt: string;

  /** Names an enforced OS/container policy, not a descriptive trust label. */
  readonly sandboxProfileId: string;
}
```

That record may be created by a workspace operator after isolated inspection or imported from a signed Tovu-curated review index. Runtime admission must verify the package digest, frozen tool-surface digest, explicit names, and a real sandbox profile before constructing `FederatedMcpConnectionConfig`. Until both independent classification and containment exist, `mcp.json` remains previewable but blocked.

Schema mismatch is loud and component-scoped: Skills remain available, while the MCP configuration receives a blocked descriptor explaining both versions. There is no silently half-working plugin.

## What Would Change My Mind

I would accept the presentation-only `org.tovu.commands` overlay if user testing showed synthesized labels and workspace profiles materially harmed discoverability, provided the extension remained incapable of defining arguments, bindings, confirmation, permissions, or trust.

I would ship Agent Plugin MCP execution after an independently authored admission store, immutable package/tool-surface digests, and an enforced subprocess sandbox pass adversarial tests for filesystem, credentials, network, resource limits, and lifecycle cleanup.

An upstream Agent Plugins command component with normative argument and binding semantics would also change the extension decision, though Tovu would still translate it into host-owned bindings rather than execute package-provided handler references directly.

Finally, if the invented-kind falsifying test requires composer changes, I would abandon this descriptor as insufficiently general and move extensibility down one level to renderer and interaction plugins with an explicit compatibility protocol.

<<SWARM_END>>