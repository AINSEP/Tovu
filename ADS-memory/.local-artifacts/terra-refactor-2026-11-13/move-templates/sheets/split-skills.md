# website/features/skills — 2 READY slices (W1 #24). Written 2026-11-16 (group F) from Tovu `b28d38c6` / Jini `b7666092` (refactor/terra).
Skeleton facts: `make-sheet.py website/features/skills --kind all` + CLASSIFY-files.tsv. Backlog files: `live-registration.ts` (MIXED 45 today), `tool-registrations.ts` (MIXED 427 today). KIND-SUSPECT: none; both stay SPLIT.
untangle_overlap: none (no `*.repoint.tsv` row names a skills file). Both slices may run now. Order: SP-skills-1, then SP-skills-2 (SP-2's Tovu file imports SP-1's Tovu binding, unchanged by SP-1).
Owner decisions needed: none.

## CORE-CONTRACT-NEEDED — resolved (the contract design)
The survey flagged the generic half of `tool-registrations.ts` as needing a core contract because it calls `createSkillFileReader` (`@jini-ai/agent-plugins/lifecycle`), Tovu's frontmatter reader, Tovu's install-state reader, `console.warn` and Tovu's tool metadata. Decision: **no `@jini-ai/core` change.** The contract is two interfaces declared in the moved Jini file itself, following the existing precedent `AgentPluginHostToolPorts` (`packages/agent-plugins/src/lifecycle/host-tools/ports.ts`, which already injects `readFrontmatterField`, `metadata` and `permissions` the same way):
- `InstalledSkillToolPorts` (loader effects): `readFrontmatterField`, `createFileReader({ skillRoot }) => { read }`, `isEnabled({ directory })`, `report({ message })`.
- `SkillToolRegistrationHost` (registration values): `metadata`, `permission`, `catalogModule`, `fileRoot`, `withExtensionApprovalPolicy`.
- `SkillFileReadPort` / `SkillFileReadResult`: the structural shape of agent-plugins' `SkillFileReader.read` / `SkillFileResult` (`skill-file-reader.ts:47-55`), redeclared so `@jini-ai/agentic` never imports `@jini-ai/agent-plugins` (COMMON rule 5). Tovu wires the real reader; agent-plugins' type is assignable, so nothing in agent-plugins changes.
Why not core: only one Jini package consumes each shape; a core contract would be a second declaration with no second consumer (owner: smallest change). Revisit only if a second package needs `SkillFileReadPort`.
Why a NEW subpath `./skills/tools`: the moved code imports `@jini-ai/core` at RUNTIME (`ToolInputError`, `buildDomainRegistrations`, ...). `@jini-ai/core` is an OPTIONAL peer of `@jini-ai/agentic` (`package.json` `jini.optionalPeers`), and no file behind `./skills/install` loads it at runtime today; putting the code behind that barrel would make every installer import require core (KINDS §3 risk "optional peers loaded through a barrel"). SP-skills-1 imports core TYPES only, so it stays in `./skills/install`.

---------------------------------------------------------------------------------------------------
## Slice SP-skills-1 (template T-SPLIT) — core `ToolRegistry` adapter for live skill registration
```
id: SP-skills-1
feature: website/features/skills
tovu_files:
  - apps/website/src/features/skills/live-registration.ts | blob eefe6b202c92022e8a9ed628ee4054822f887d83
split:
  - SkillsRefreshRegistry (type, line 5) | STAY-WIRING
  - createLiveSkillRegistration (lines 7-37) | MOVE -> packages/agentic/src/skills/install/tool-registry-live-registration.ts as `createLiveToolRegistration`; Tovu keeps `createLiveSkillRegistration(registry)` as a binding that passes its inactive-skill error (STAY-WIRING; same signature, so tool-registrations.ts:413 and the tests are untouched)
  - createSkillRefreshMiddleware (lines 39-45) | STAY-WIRING (Express `(req, res, next)` shape; COMMON rule 3)
ports: -   (the inactive-skill error is a required plain value `inactiveError`)
shape_changes:
  - createLiveToolRegistration (Jini, new): ({ registry, inactiveError }, _optional = {}) | callers: Tovu binding only
jini_guards:
  - packages/agentic/src/skills/install/tool-registry-live-registration.ts must not exist; packages/agentic/src/skills/install/__tests__/tool-registry-live-registration.test.ts must not exist
  - packages/agentic/src/skills/install/index.ts blob d1814fa3a8f3c7e23fa2c5b73b4125047fb43bb5
  - rg -n "createLiveToolRegistration" packages/agentic/src -> prints nothing
jini_code: |
  NEW packages/agentic/src/skills/install/tool-registry-live-registration.ts, exactly:
  /**
   * @module tool-registry-live-registration
   *
   * Live skill registration on the core `ToolRegistry`: skill slots stay on the append-only registry
   * while their active registrations change. Removed slots deny both authorization and execution;
   * the registry identity remains intact.
   */
  import type { ToolRegistration, ToolRegistry } from '@jini-ai/core';
  import { createLiveSkillRegistration, type SkillRegistryPort } from './live-registration.js';

  /**
   * Wraps `registry` so the returned `replace(tools)` swaps the active skill registrations in place.
   * @returns `replace`; it reports whether the active set changed.
   * @complexity O(n) per replacement, O(total distinct skill ids) retained slots.
   */
  export function createLiveToolRegistration(
    { registry, inactiveError }: { registry: ToolRegistry; inactiveError: (required: { id: string }) => Error },
    _optional = {},
  ): (tools: readonly ToolRegistration[]) => boolean {
  <Tovu live-registration.ts lines 13-23 verbatim (type Frame ... the closing `  };` of `adapter`)>
    const replace = createLiveSkillRegistration({ registry: adapter, inactiveError });
  <Tovu live-registration.ts lines 25-37 verbatim (registry.list = ... through the function's closing `}`)>
  File ends with a newline. Bodies keep their double-quoted strings ("Live skill tool has no authorization context" etc.) verbatim.
jini_index: packages/agentic/src/skills/install/index.ts: after "export * from \"./live-registration.js\";" insert "export * from \"./tool-registry-live-registration.js\";"
tovu_reduced: |
  apps/website/src/features/skills/live-registration.ts:
  (a) line 1 OLD: import { createLiveSkillRegistration as createRegistration, createSkillRefreshMiddleware as createMiddleware, type SkillRegistryPort } from "@jini-ai/agentic/skills/install";
      NEW: import { createLiveToolRegistration, createSkillRefreshMiddleware as createMiddleware } from "@jini-ai/agentic/skills/install";
  (b) replace lines 7-37 (from "/**\n * Keeps skill slots on the core's append-only registry" through the closing "}" of createLiveSkillRegistration) with exactly:
  /** Live skill slots on the core registry (`createLiveToolRegistration` in `@jini-ai/agentic/skills/install`) with this product's inactive-skill wording. */
  export function createLiveSkillRegistration(registry: ToolRegistry): (tools: readonly ToolRegistration[]) => boolean {
    return createLiveToolRegistration({ registry, inactiveError: () => new ToolInputError({ message: "This skill is no longer enabled or installed. Choose an installed skill." }) });
  }
  Lines 2-5 and 39-45 unchanged.
binding_edits: -
tests_split:
  - apps/website/src/features/skills/__tests__/unit/jini-adapters.hwa.test.ts (blob 4efc476451b2d7dbdd92426b033a61ea2d6f4294): stays in Tovu, NO edit (drives the binding; asserts the ToolInputError class of the inactive error).
  - NEW packages/agentic/src/skills/install/__tests__/tool-registry-live-registration.test.ts = the Tovu tests at lines 1-42 and 70-78 (the three adapter tests; NOT the two middleware tests at 44-68), then:
    - 'import test from "node:test";' -> 'import { test } from "vitest";'
    - 'import { createLiveSkillRegistration, createSkillRefreshMiddleware } from "../../live-registration.js";' -> 'import { createLiveToolRegistration } from "../tool-registry-live-registration.js";'
    - after the imports insert: 'const live = (registry: Parameters<typeof createLiveToolRegistration>[0]["registry"]) => createLiveToolRegistration({ registry, inactiveError: () => new ToolInputError({ message: "inactive" }) });'
    - every 'createLiveSkillRegistration(registry)' -> 'live(registry)' (3 places)
    - assertions verbatim (line 24 `assert.throws(() => slot!.handler(execution), ToolInputError)` holds: the injected error is a ToolInputError).
    The `@jini-ai/core` runtime import (`createToolRegistry`, `ToolInputError`) is test-only; agentic has `@jini-ai/core` in devDependencies (package.json line 97).
changeset: .changeset/agentic-live-tool-registration.md: '---\n"@jini-ai/agentic": minor\n---\n\nAdd `createLiveToolRegistration` to `@jini-ai/agentic/skills/install`: live skill registration bound to the core `ToolRegistry`.\n'
census: rg -n --no-heading "createLiveSkillRegistration|createLiveToolRegistration" apps --glob '!**/node_modules/**' | allowed: [skills/live-registration.ts (binding), skills/tool-registrations.ts:12,413, skills/__tests__/unit/jini-adapters.hwa.test.ts:4,11,32,72]
jini_msg: "feat(agentic): createLiveToolRegistration binds live skill slots to the core ToolRegistry" | tovu_msg: "refactor(skills): live skill registration from @jini-ai/agentic createLiveToolRegistration" | body "Tovu keeps its inactive-skill wording and the Express refresh middleware."
extra_stops: if `rg -n "from ['\"]@jini-ai/core" packages/agentic/src/skills/install/tool-registry-live-registration.ts` shows a line without `import type`, STOP (runtime core import behind ./skills/install).
```

---------------------------------------------------------------------------------------------------
## Slice SP-skills-2 (template T-SPLIT) — installed-skill tool loader + registrations into new `@jini-ai/agentic/skills/tools`
Tovu keeps every exported Tovu name with its exact signature (`loadInstalledSkillToolSources(ctx)`, `buildSkillToolRegistrations({ sources, withExtensionApprovalPolicy })`, `registerInstalledSkillTools`), so its 9 production/test importers (manage.ts, files.ts, install-service.ts, installed-extension-tools.ts, 5 tests) need no edit. Only `skillToolDerivedRisk` and the type `SkillToolSource` leave Tovu; their 2 test importers are repointed.
```
id: SP-skills-2
feature: website/features/skills
tovu_files:
  - apps/website/src/features/skills/tool-registrations.ts | blob 0ce704be93f3a604597d4ef4bb2375df9479ad7a
split:
  - imports (lines 1-14) | STAY-WIRING (rewritten, below)
  - @file header (lines 16-92) | STAY (product history: owner quotes, agent-plugins paths; the generic gist is in the Jini @module block)
  - SkillFrontmatter, parseSkillFrontmatter, toSkillToolId, BUNDLED_SUBDIRS, SkillBundledFileKind, SkillBundledFile, listBundledFiles, walkFiles, isEnoent, describeSkillMdReadFailure, SkillEntryResolution, resolveSkillEntry, SKILL_INPUT_SCHEMA, buildSkillToolResult (lines 94-348) | MOVE -> packages/agentic/src/skills/tools/installed-skill-tools.ts
  - SkillToolSource (195-209) | MOVE, renamed `InstalledSkillToolSource` (agentic `ports.ts:23` already exports a narrower `SkillToolSource`; the name would collide)
  - loadInstalledSkillToolSources (283-315) | MOVE (reshaped) + Tovu binding of the same name (STAY-WIRING)
  - skillToolDerivedRisk (317-322) | MOVE (positional -> `({ sources }, _optional = {})`)
  - buildSkillToolRegistrations (350-390) | MOVE (reshaped) + Tovu binding of the same name (STAY-WIRING)
  - liveRegistrations, registerInstalledSkillTools (392-427) | STAY-WIRING, unchanged
ports:
  - InstalledSkillToolPorts.readFrontmatterField: ({ markdown, key }) => string | undefined | Tovu binds `readFrontmatterField` (#src/platform/markdown/frontmatter) in tool-registrations.ts
      why: Tovu's YAML frontmatter reader (js-yaml dep stays in Tovu)
  - InstalledSkillToolPorts.createFileReader: ({ skillRoot }) => { read: SkillFileReadPort } | Tovu binds `({ skillRoot }) => createSkillFileReader({ skillRoot, filesystem })` (@jini-ai/agent-plugins/lifecycle)
      why: the contained reader lives in another Jini package (COMMON rule 5)
  - InstalledSkillToolPorts.isEnabled: ({ directory }) => Promise<boolean> | Tovu binds `async ({ directory }) => (await readSkillState({ directory })).enabled`
      why: Tovu's install-state file name `.tovu-install.json`
  - InstalledSkillToolPorts.report: ({ message }) => void | Tovu binds `({ message }) => console.warn(message)`
      why: COMMON rule 7 (no console in Jini); output text is byte-identical
  - SkillToolRegistrationHost values: metadata (Tovu `toolMetadata`), permission ("admin.assistant.use"), catalogModule ("features/skills/tool-registrations.ts"), fileRoot ("site"), withExtensionApprovalPolicy (caller's)
      why: product tool metadata, permission name, Tovu module path and the fs tool's root name
shape_changes:
  - loadInstalledSkillToolSources (Jini): ({ workspaceRoot, siteDir, ports }, { includeDisabled } = {}) | callers: Tovu binding only
  - buildSkillToolRegistrations (Jini): ({ sources, host }, _optional = {}) | callers: Tovu binding only
  - skillToolDerivedRisk: (sources) -> ({ sources }, _optional = {}) | callers: Jini buildSkillToolRegistrations; apps/website/src/features/skills/__tests__/unit/tool-registrations.unit.test.ts:285
jini_guards:
  - packages/agentic/src/skills/tools/ must not exist
  - packages/agentic/package.json blob 2297b5adf368b737ae024aecd9cbb1f59be7e081
  - rg -n "InstalledSkillToolSource|loadInstalledSkillToolSources|buildSkillToolRegistrations|skillToolDerivedRisk" packages/agentic -> prints nothing
jini_code: |
  NEW packages/agentic/src/skills/tools/installed-skill-tools.ts = this prologue, then Tovu tool-registrations.ts lines 94-390 copied verbatim with the substitutions S1-S16 below (nothing else changes):
  /**
   * @module installed-skill-tools
   *
   * Registers each installed standalone Agent Skill (a folder holding `SKILL.md`) as ONE tool. Discovery
   * sees only the skill's own frontmatter `name`/`description`, and the description is indexed verbatim
   * (it is the author's trigger text). The handler returns the full `SKILL.md` and lists bundled
   * `references/`, `scripts/`, `assets/` files by path, never inlined (progressive disclosure). A bad
   * folder is skipped and reported, never fatal to the others; two folders whose names mint the same
   * tool id are a thrown error.
   */
  import { readFile, readdir } from 'node:fs/promises';
  import path from 'node:path';
  import { ToolInputError, buildDomainRegistrations, indexCatalogById, requireInputRecord, optionalString, type AgentToolSideEffect, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolMetadataById, type ToolRegistration } from '@jini-ai/core';

  /** What a skill-file read returns: text, the readable supporting files, and an optional refusal note. */
  export interface SkillFileReadResult {
    readonly text: string;
    readonly files: readonly string[];
    readonly note?: string;
  }

  /** Progressive-disclosure read of one skill folder; omit `file` for SKILL.md. */
  export type SkillFileReadPort = (input: Record<string, never>, options?: { readonly file?: string }) => Promise<SkillFileReadResult>;

  /** Host effects the loader needs. */
  export interface InstalledSkillToolPorts {
    /** One frontmatter field of a SKILL.md, or `undefined`. */
    readonly readFrontmatterField: (required: { readonly markdown: string; readonly key: string }) => string | undefined;
    /** The supporting-file reader for one skill folder, contained to that folder. */
    readonly createFileReader: (required: { readonly skillRoot: string }) => { readonly read: SkillFileReadPort };
    /** Whether the skill folder is enabled in the host's install record. */
    readonly isEnabled: (required: { readonly directory: string }) => Promise<boolean>;
    /** Receives one line per skipped folder. */
    readonly report: (required: { readonly message: string }) => void;
  }

  /** Host values the registrations carry. */
  export interface SkillToolRegistrationHost {
    readonly metadata: ToolMetadataById;
    /** Permission a principal needs to call a skill tool. */
    readonly permission: string;
    /** Module name recorded in the registration catalog. */
    readonly catalogModule: string;
    /** Name of the file-tool root the bundled paths are relative to. */
    readonly fileRoot: string;
    /** Applies the host's approval policy to installed guidance. */
    readonly withExtensionApprovalPolicy: (required: { registration: ToolRegistration; family: 'installed-guidance' }) => ToolRegistration;
  }

  <blank line, then Tovu lines 94-390 with:>
  S1  lines 103-106 (" * Extracts `name:` ..." through " * block scalar `description:` value needs a real parse to resolve, not a regex over its marker line).") -> exactly:
       * Extracts `name:` and `description:` from a `SKILL.md`'s YAML frontmatter block through the injected
       * `readFrontmatterField` port (a folded/literal block scalar `description:` needs a real YAML parse,
       * not a regex over its marker line).
  S2  line 113 -> function parseSkillFrontmatter({ markdown, readFrontmatterField }: { markdown: string; readFrontmatterField: InstalledSkillToolPorts["readFrontmatterField"] }, _optional = {}): SkillFrontmatter | undefined {
  S3  lines 121-123 -> exactly:
      /** `skill_<sanitized name>`: the reserved prefix for standalone skill tools. Sanitizes more aggressively
       *  than a plugin tool id (which only folds hyphens): a skill's `name` frontmatter field is
  S4  line 144 -> /** One bundled file, with a path relative to the host's file root (`fileRoot`). */
  S5  lines 153-154 -> " * error: the Agent Skills spec marks all three optional."
  S6  every whole-word `SkillToolSource` in the copied block -> `InstalledSkillToolSource` (declaration line 195, lines 222, 225, 334-336 area, 359 area; count them: the census after the copy must show 0 bare `SkillToolSource`)
  S7  line 200 -> "  /** The skill's own frontmatter `description`, verbatim: discovery indexes the author's own trigger text. */"
  S8  lines 202-203 -> "  /** The full `SKILL.md` file content, frontmatter included; the handler returns the exact file. */"
  S9  line 207 -> "  readonly readFile?: SkillFileReadPort;"; and both `Awaited<ReturnType<SkillFileReader["read"]>>` (in buildSkillToolResult) -> `SkillFileReadResult`
  S10 lines 219-220 -> exactly:
      /** One entry-resolution outcome: `"skip"` covers every tolerated bad-folder case (not a directory, disabled,
       *  missing/unreadable SKILL.md, unparseable
  S11 line 233 -> " * present in `seenDirById` (two folders would mint the same tool id)."
  S12 resolveSkillEntry (236-281):
      - after line 241 "  readonly includeDisabled?: boolean;" -> "  readonly includeDisabled?: boolean | undefined;" and insert a new line "  readonly ports: InstalledSkillToolPorts;"
      - line 246 -> "  if (!(await input.ports.isEnabled({ directory: skillDir })) && !input.includeDisabled) return { kind: \"skip\" };"
      - each of the 3 statements `console.warn(<template literal>);` -> `input.ports.report({ message: <same template literal> });` (template text byte-identical)
      - "  const frontmatter = parseSkillFrontmatter({ markdown });" -> "  const frontmatter = parseSkillFrontmatter({ markdown, readFrontmatterField: input.ports.readFrontmatterField });"
      - "readFile: createSkillFileReader({ skillRoot: skillDir, filesystem }).read" -> "readFile: input.ports.createFileReader({ skillRoot: skillDir }).read"
  S13 loadInstalledSkillToolSources: lines 291-297 (from "export async function loadInstalledSkillToolSources(ctx: {" through "  const workspaceRoot = ctx.skillLayout.forWorkspace({ workspaceId: ctx.workspaceId }).root;") -> exactly:
      export async function loadInstalledSkillToolSources(
        { workspaceRoot, siteDir, ports }: { readonly workspaceRoot: string; readonly siteDir: string; readonly ports: InstalledSkillToolPorts },
        optional: { readonly includeDisabled?: boolean } = {},
      ): Promise<readonly InstalledSkillToolSource[]> {
      and in its loop "resolveSkillEntry({ siteDir: ctx.siteBinding.dir, workspaceRoot, entry, seenDirById, includeDisabled: ctx.includeDisabled })" -> "resolveSkillEntry({ siteDir, workspaceRoot, entry, seenDirById, includeDisabled: optional.includeDisabled, ports })"
  S14 lines 318-322 (skillToolDerivedRisk doc tail + function) -> exactly:
       *  operator-trusted local content — no domain call, no write path. */
      export function skillToolDerivedRisk({ sources }: { sources: readonly InstalledSkillToolSource[] }, _optional = {}): DerivedRiskByToolId {
        return new Map<string, AgentToolSideEffect>(sources.map((source) => [source.id, "none"]));
      }
  S15 buildSkillToolResult: in its parameter type add "  readonly fileRoot: string;" after "  readonly file: string | undefined;"; destructure `{ source, content, file }` -> `{ source, content, file, fileRoot }`; `root: "site"` -> `root: fileRoot`
  S16 buildSkillToolRegistrations:
      - "  { sources, withExtensionApprovalPolicy }: { sources: readonly SkillToolSource[]; withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy }," -> "  { sources, host }: { sources: readonly InstalledSkillToolSource[]; host: SkillToolRegistrationHost },"
      - "  _optional: Record<string, never> = {}," -> "  _optional = {},"
      - 'authorization: { permission: "admin.assistant.use" },' -> "authorization: { permission: host.permission },"
      - "      return buildSkillToolResult({ source, content, file });" -> "      return buildSkillToolResult({ source, content, file, fileRoot: host.fileRoot });"
      - "  return buildDomainRegistrations({ metadata: toolMetadata," -> "  return buildDomainRegistrations({ metadata: host.metadata,"
      - '    catalogModule: "features/skills/tool-registrations.ts",' -> "    catalogModule: host.catalogModule,"
      - "    derivedRisk: skillToolDerivedRisk(sources)," -> "    derivedRisk: skillToolDerivedRisk({ sources }),"
      - "  }).map(registration => withExtensionApprovalPolicy({ registration, family: 'installed-guidance' }));" -> "  }).map(registration => host.withExtensionApprovalPolicy({ registration, family: 'installed-guidance' }));"
  After the copy: `rg -n "readSkillState|createSkillFileReader|toolMetadata|console\.|ApplyExtensionApprovalPolicy|SkillFileReader\b|filesystem\b|admin\.assistant|features/" <file>` prints nothing (else STOP).
  NEW packages/agentic/src/skills/tools/index.ts, exactly:
  /** Installed standalone skills as tools; needs `@jini-ai/core` at runtime. */
  export * from './installed-skill-tools.js';
jini_index: (new subpath; edits to packages/agentic/package.json)
  - "jini.entries": after the line '      "./skills/install/node": "node"' change it to '      "./skills/install/node": "node",' and insert '      "./skills/tools": "node"'
  - "exports": after the "./skills/install/node" block's closing '    }' (the one following '"default": "./dist/skills/install/node-filesystem.js"') change '    }' to '    },' and insert:
        "./skills/tools": {
          "types": "./dist/skills/tools/index.d.ts",
          "import": "./dist/skills/tools/index.js",
          "default": "./dist/skills/tools/index.js"
        }
  - README packages/agentic/README.md: after the table row starting "| `./skills/install/node` |" insert the row
    | `./skills/tools` | `loadInstalledSkillToolSources`, `buildSkillToolRegistrations`, `skillToolDerivedRisk`: installed skills as one tool each, with host-injected frontmatter reader, file reader, enable check and report. | Node runtime; requires `@jini-ai/core` |
  - Validate package.json (COMMON checks).
tovu_reduced: |
  apps/website/src/features/skills/tool-registrations.ts:
  (a) lines 1-14 (imports through `import type { SkillLayout } from "./layout.js";`) -> exactly:
  import { toolMetadata } from '../../contracts/core/tool-metadata/skills.js';
  import type { ApplyExtensionApprovalPolicy } from "#src/contracts/headless/assistant-tool-approval-policy";
  import * as filesystem from "node:fs/promises";
  import { createSkillFileReader } from "@jini-ai/agent-plugins/lifecycle";
  import { buildSkillToolRegistrations as buildRegistrations, loadInstalledSkillToolSources as loadSources, type InstalledSkillToolPorts, type InstalledSkillToolSource } from "@jini-ai/agentic/skills/tools";
  import type { ToolRegistration } from "@jini-ai/core";

  import { readFrontmatterField } from "#src/platform/markdown/frontmatter";

  import { createLiveSkillRegistration, type SkillsRefreshRegistry } from "./live-registration.js";
  import { readSkillState } from "./state.js";
  import type { SkillLayout } from "./layout.js";
  (b) the @file header (old lines 16-92) unchanged.
  (c) old lines 94-390 -> exactly:
  /** This product's loader effects for `@jini-ai/agentic/skills/tools`: its frontmatter reader, the contained
   *  agent-plugins file reader, its install-state file, and console warnings for skipped folders. */
  const SKILL_TOOL_PORTS: InstalledSkillToolPorts = {
    readFrontmatterField,
    createFileReader: ({ skillRoot }) => createSkillFileReader({ skillRoot, filesystem }),
    isEnabled: async ({ directory }) => (await readSkillState({ directory })).enabled,
    report: ({ message }) => console.warn(message),
  };

  /** Installed skills of one workspace under this site's skill layout; see `loadInstalledSkillToolSources` in `@jini-ai/agentic/skills/tools`. */
  export async function loadInstalledSkillToolSources(ctx: {
    readonly includeDisabled?: boolean;
    readonly workspaceId: string;
    readonly skillLayout: SkillLayout;
    readonly siteBinding: { readonly dir: string };
  }, _optional = {}): Promise<readonly InstalledSkillToolSource[]> {
    const workspaceRoot = ctx.skillLayout.forWorkspace({ workspaceId: ctx.workspaceId }).root;
    return loadSources({ workspaceRoot, siteDir: ctx.siteBinding.dir, ports: SKILL_TOOL_PORTS },
      ctx.includeDisabled === undefined ? {} : { includeDisabled: ctx.includeDisabled });
  }

  /** Skill tools with this product's metadata, `admin.assistant.use` permission and `site` file root;
   *  see `buildSkillToolRegistrations` in `@jini-ai/agentic/skills/tools`. */
  export function buildSkillToolRegistrations(
    { sources, withExtensionApprovalPolicy }: { sources: readonly InstalledSkillToolSource[]; withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy },
    _optional = {},
  ): ToolRegistration[] {
    return buildRegistrations({ sources, host: { metadata: toolMetadata, permission: "admin.assistant.use",
      catalogModule: "features/skills/tool-registrations.ts", fileRoot: "site", withExtensionApprovalPolicy } });
  }
  (d) old lines 392-427 (liveRegistrations + registerInstalledSkillTools) unchanged.
binding_edits: -
tests_split:
  - apps/website/src/features/skills/__tests__/unit/tool-registrations.unit.test.ts: stays in Tovu (real disk, real layout; drives the bindings). Edits: in the import block (lines 12-17) delete the line "  skillToolDerivedRisk,"; after line 17 ('} from "../../tool-registrations.js";') insert 'import { skillToolDerivedRisk } from "@jini-ai/agentic/skills/tools";'; line 285 "    const risk = skillToolDerivedRisk(sources);" -> "    const risk = skillToolDerivedRisk({ sources });"
  - apps/website/src/features/skills/__tests__/unit/tool-handler-characterization.unit.test.ts: lines 6-9 OLD:
      import {
        buildSkillToolRegistrations,
        type SkillToolSource,
      } from "../../tool-registrations.js";
    NEW:
      import { buildSkillToolRegistrations } from "../../tool-registrations.js";
      import type { InstalledSkillToolSource as SkillToolSource } from "@jini-ai/agentic/skills/tools";
  - every other Tovu test: no edit.
  - NEW packages/agentic/src/skills/tools/__tests__/installed-skill-tools.test.ts, exactly:
    import fs from 'node:fs/promises';
    import os from 'node:os';
    import path from 'node:path';
    import { afterEach, describe, expect, it } from 'vitest';
    import { buildSkillToolRegistrations, loadInstalledSkillToolSources, skillToolDerivedRisk, type InstalledSkillToolPorts } from '../installed-skill-tools.js';

    const made: string[] = [];
    afterEach(async () => { for (const dir of made.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });

    async function site(files: Record<string, string>) {
      const siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jini-skill-tools-'));
      made.push(siteDir);
      for (const [relative, text] of Object.entries(files)) {
        const file = path.join(siteDir, relative);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, text);
      }
      return { siteDir, workspaceRoot: path.join(siteDir, 'skills') };
    }

    function fakePorts(overrides: Partial<InstalledSkillToolPorts> = {}) {
      const reports: string[] = [];
      const ports: InstalledSkillToolPorts = {
        readFrontmatterField: ({ markdown, key }) => new RegExp(`^${key}: (.+)$`, 'm').exec(markdown)?.[1],
        createFileReader: () => ({ read: async () => ({ text: 'reader text', files: ['references/guide.md'] }) }),
        isEnabled: async () => true,
        report: ({ message }) => { reports.push(message); },
        ...overrides,
      };
      return { reports, ports };
    }

    const SKILL = '---\nname: Code Review\ndescription: Use when reviewing a diff.\n---\nSteps.\n';
    const host = { metadata: {}, permission: 'skills.use', catalogModule: 'skills/tools', fileRoot: 'root',
      withExtensionApprovalPolicy: ({ registration }: { registration: import('@jini-ai/core').ToolRegistration }) => registration };

    describe('installed skill tools', () => {
      it('loads one source per enabled folder with a sanitized id and bundled files relative to the site', async () => {
        const dirs = await site({ 'skills/review/SKILL.md': SKILL, 'skills/review/references/guide.md': 'g' });
        const { ports } = fakePorts();
        const [source, ...rest] = await loadInstalledSkillToolSources({ ...dirs, ports });
        expect(rest).toEqual([]);
        expect(source).toMatchObject({ id: 'skill_code_review', skillName: 'Code Review', description: 'Use when reviewing a diff.', directory: 'review',
          bundledFiles: [{ kind: 'references', path: 'skills/review/references/guide.md' }] });
      });

      it('skips and reports a folder without frontmatter, and a disabled folder unless includeDisabled', async () => {
        const dirs = await site({ 'skills/bad/SKILL.md': 'no frontmatter', 'skills/off/SKILL.md': SKILL });
        const { ports, reports } = fakePorts({ isEnabled: async ({ directory }) => !directory.endsWith('off') });
        expect(await loadInstalledSkillToolSources({ ...dirs, ports })).toEqual([]);
        expect(reports).toEqual(["[skills] 'bad': SKILL.md has no parseable frontmatter with both 'name' and 'description' — skipped"]);
        expect((await loadInstalledSkillToolSources({ ...dirs, ports }, { includeDisabled: true })).map(s => s.id)).toEqual(['skill_code_review']);
      });

      it('throws when two folders mint the same tool id, and returns [] for a missing workspace root', async () => {
        const dirs = await site({ 'skills/a/SKILL.md': SKILL, 'skills/b/SKILL.md': SKILL });
        await expect(loadInstalledSkillToolSources({ ...dirs, ports: fakePorts().ports })).rejects.toThrow(/more than one installed skill folder/);
        expect(await loadInstalledSkillToolSources({ workspaceRoot: path.join(dirs.siteDir, 'none'), siteDir: dirs.siteDir, ports: fakePorts().ports })).toEqual([]);
      });

      it('registers one tool per source with the host permission, file root and approval policy', async () => {
        const dirs = await site({ 'skills/review/SKILL.md': SKILL, 'skills/review/assets/x.txt': 'x' });
        const sources = await loadInstalledSkillToolSources({ ...dirs, ports: fakePorts().ports });
        const seen: string[] = [];
        const [registration] = buildSkillToolRegistrations({ sources, host: { ...host, withExtensionApprovalPolicy: ({ registration, family }) => { seen.push(family); return registration; } } });
        expect(registration!.descriptor.id).toBe('skill_code_review');
        expect(seen).toEqual(['installed-guidance']);
        expect(skillToolDerivedRisk({ sources }).get('skill_code_review')).toBe('none');
        const result = await registration!.handler({ input: { file: 'references/guide.md' } } as never) as { guidance: string; bundledFiles: unknown[] };
        expect(result.guidance).toBe('reader text');
        expect(result.bundledFiles).toEqual([{ kind: 'assets', root: 'root', path: 'skills/review/assets/x.txt' }]);
        // A wrapper in buildDomainRegistrations may refuse the extra key before the handler does; either refusal is correct.
        await expect(registration!.handler({ input: { other: 1 } } as never)).rejects.toThrow();
      });
    });
    The handler call shape matches core `ToolHandler = (required: ToolExecutionContext, optional?) => Promise<unknown>` (`packages/core/src/tool-registry.ts:203`); the handler reads only `ctx.input`. Never drop an assertion.
changeset: .changeset/agentic-skill-tools.md: '---\n"@jini-ai/agentic": minor\n---\n\nAdd the `@jini-ai/agentic/skills/tools` subpath: installed standalone skills as one tool each, with an injected frontmatter reader, file reader, enable check and report port.\n'
census: rg -n --no-heading "skillToolDerivedRisk|SkillToolSource|SkillBundledFile" apps --glob '!**/node_modules/**' | allowed AFTER: [tool-registrations.ts (InstalledSkillToolSource import + 2 uses), tool-registrations.unit.test.ts (new import + line 285), tool-handler-characterization.unit.test.ts (import + line 21)]
jini_msg: "feat(agentic): skills/tools subpath, installed skills as tools behind host ports" | tovu_msg: "refactor(skills): skill tool loader and registrations from @jini-ai/agentic/skills/tools" | body "Tovu keeps its frontmatter reader, install-state file, tool metadata, permission and site root as bindings."
extra_stops: |
  - Any of resolveSkillEntry / loadInstalledSkillToolSources / buildSkillToolRegistrations in the Jini file over 50 lines (blank and comment lines not counted): STOP (no split given).
  - `rg -n "exactOptionalPropertyTypes" packages/agentic/tsconfig*.json tsconfig.base.json` shows true (it does, base line 9): the S12 `| undefined` edit is required; any other optional-property error in the copy = STOP.
  - If Tovu `toolMetadata`'s type is not assignable to `ToolMetadataById` (eslint/tsc unresolved is not checked here; read `apps/website/src/contracts/core/tool-metadata/skills.ts`: it is `satisfies ToolMetadataById<ToolApprovalPolicy>`, so it is), proceed.
```
Expected cloud run: Jini `npm --prefix packages/agentic run test -- tool-registry-live-registration installed-skill-tools public-surface`, agentic typecheck + subpath isolation (`./skills/tools` runtime node). Tovu typecheck, `node --test` of the skills unit tests, `extension-approval-classification.test.ts`, `skills-http.integration.test.ts`, `booted-request-layouts.integration.test.ts`.
