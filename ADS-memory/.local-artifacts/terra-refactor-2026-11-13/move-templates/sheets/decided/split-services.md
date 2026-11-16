# SP-services-1..3: hosted MCP probe + federation admissions -> `@jini-ai/mcp` (template T-SPLIT)

Owner decision 2026-11-15 (#4, Codex decide-4.md §4): SPLIT and EXTRACT. Probe use case -> `@jini-ai/mcp/federation/hosted` (`probeExternalMcpServer`, `ExternalMcpProbePorts`, `ExternalMcpProbeResult`); admissions read -> `@jini-ai/mcp/federation` (`readFederationAdmissions`, `FederationAdmissionsPorts`, `FederationAdmissionsResult`); a TYPED configuration-failure discriminator at the shared hosted boundary replaces the English substring match (`reason.includes("authorization expired or was revoked")`). Tovu keeps permissions, rate limits, legacy codes/statuses, copy, settings links, tool metadata and runtime activation policy; the two `server/runtime/services/*` files are deleted and their Tovu halves live next to the feature (`features/external-mcp/`). The earlier "owner: hosted MCP" pilot block is LIFTED by this decision.
Written 2026-11-15 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092. Every blob below is identical on `integ/wave-b` (checked 2026-11-15).
untangle_overlap: YES -> **execute after wave B merge**. `probes-and-cards.test.ts` (C11.repoint.tsv:115) and `tool-catalog-manifest.ts` (C5.repoint.tsv:375) have wave rows on other lines; both are TEXT-guarded below, every other file blob-guarded. No Jini file here has a wave row.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
Order: J-a (discriminator, failing test first) -> J-b (probe + admissions) -> T (Tovu). Three commits. Tier: Sonnet 5.5 high executor, Opus review of the J-a RED/GREEN proof. est. executor tokens: ~110k.

## Design decisions made here (executor makes none)
- Discriminator: `ExternalMcpConfigFailure { serverId; reason; category?: "reauth_required" }` in `@jini-ai/core/contracts/hosted-mcp` (type-only). OPTIONAL and set only for reauthorization, so every existing non-reauth `toEqual` on failure entries stays valid; absent = ordinary resolution failure. The hosted store sets it at exactly its two reauth producers (stored `needs_reauth` status; resolver error carrying `reauthRequiredCode`). `reason` prose is unchanged byte for byte.
- Probe ports: `repo: Pick<ExternalMcpServerRepoPort, "findByServerId">`, `readEnabledConfigs` (the host binds its already-bound `readEnabledExternalMcpConfigs`, so credential resolution stays the one Jini store implementation, not a copy) and `connect` (required: the host owns `fetch`/HTTP session construction). No clock port: Tovu stamps `probedAt` after the call returns (same instant as today: after the session closes).
- Probe result is typed failure kinds, never HTTP statuses, bodies, copy or links. `unresolved.reason` is optional; Tovu supplies its fallback copy.
- Admissions: `readFederationAdmissions({ ports, timeoutMs })`; `ports.report` is the safe diagnostic sink (Tovu binds `console.error` + `describeErrorForLog`); result `{ ok: false }` carries no reason (Tovu maps every failure to one legacy answer; YAGNI).
- Tovu names stay: `probeExternalMcpServer({ deps, serverId })` and `readServerAdmissions(reader, {})` keep their signatures and result shapes, so the 2 route files, the composition files and the moved tests change only an import path. The Tovu probe imports the Jini one as `probeHostedMcpServer` (alias, Tovu side only).

---------------------------------------------------------------------------------------------------
## J-a: typed configuration-failure discriminator (BEHAVIOUR CHANGE -> failing test first, same commit)

Guards (Jini): `packages/core/src/contracts/hosted-mcp/config.ts` blob 775a7b154cff81198a377edc09bfad964e8956be; `packages/mcp/src/federation/hosted/store.ts` blob 21d65030c297ee5a7a6aa67237773ce9bbcb058c; `packages/mcp/src/federation/hosted/__tests__/second-host-store.test.ts` blob 51c40e360c10cd005c3eb51ec720b7447dc51e00; `rg -n "ExternalMcpConfigFailure" packages` prints nothing.

### J-a1 (test FIRST). `second-host-store.test.ts`: insert before the file's LAST line (`});`, line 131) this block:
```ts

  test("a reauthorization failure carries the typed reauth_required category; other failures carry none", async () => {
    const repo = new entry.InMemoryExternalMcpServerRepo(ports);
    const deps = { repo, sealer, keyring, clock, ...ports };
    await entry.saveExternalMcpServer(deps, { workspaceId: WS, enabled: true, serverId: "acme-env", transport: "stdio", command: "acme-mcp", args: "", env: "K=v", allowedToolNames: "" } as never);
    const saved = (await repo.findByServerId({ workspaceId: WS, serverId: "acme-env" }))!;
    const hosted = { ...saved, transport: "streamable_http", command: null, url: "https://mcp.acme.test/mcp", authMode: "oauth", sealedEnv: null };
    await repo.upsert({ ...hosted, serverId: "acme-stored", oauthStatus: "needs_reauth" } as never);
    await repo.upsert({ ...hosted, serverId: "acme-live", oauthStatus: "connected" } as never);
    await repo.upsert({ ...hosted, serverId: "acme-down", oauthStatus: "connected" } as never);
    const oauth = { resolveAccessToken: async ({ serverId }: { serverId: string }): Promise<string> => {
      if (serverId === "acme-live") throw Object.assign(new Error("idp said no"), { code: "ACME_SIGN_IN_AGAIN" });
      throw new Error("idp unreachable");
    } };
    const { failures } = await entry.readEnabledExternalMcpConfigs({ repo, sealer, oauth, ...ports }, WS);
    expect(Object.fromEntries(failures.map((failure) => [failure.serverId, failure.category ?? null])))
      .toEqual({ "acme-stored": "reauth_required", "acme-live": "reauth_required", "acme-down": null });
    expect(failures.find((failure) => failure.serverId === "acme-stored")?.reason)
      .toBe("its authorization expired or was revoked — reconnect it in Console › Tools › Remote servers");
  });
```
On the parent this test is RED (no `category` field: all three map to `null`); it must be GREEN on the J-a commit. Record "RED on parent expected: second-host-store.test.ts › a reauthorization failure carries the typed reauth_required category" in the report.

### J-a2. `packages/core/src/contracts/hosted-mcp/config.ts`: append at the end of the file (after its current last line `export type ExternalMcpConnectStart = ExternalMcpAuthorizationStart | ExternalMcpDeviceStart;`):
```ts

/** Machine-readable reason a saved, enabled server could not become a usable config. Only reauthorization is
 *  distinguished today; callers branch on this, never on `reason` wording. */
export type ExternalMcpConfigFailureCategory = "reauth_required";

/** @agent-note One saved, enabled server the hosted store could not resolve. `reason` is operator-facing prose
 *  (the host's settings link interpolated; never a secret or provider text). `category` is absent for an
 *  ordinary resolution failure (unreadable credentials, misconfigured row, token endpoint unreachable). */
export interface ExternalMcpConfigFailure {
  readonly serverId: string;
  readonly reason: string;
  readonly category?: ExternalMcpConfigFailureCategory;
}
```
(`hosted-mcp.ts` already does `export type * from './hosted-mcp/config.js'`: no index edit.)

### J-a3. `packages/mcp/src/federation/hosted/store.ts` (each OLD occurs exactly the stated number of times)
1. Import (line 45): in `import type { ExternalMcpTransport, ExternalMcpOAuthGrant, ExternalMcpServerRepoPort, ` replace `import type { ExternalMcpTransport, ` with `import type { ExternalMcpConfigFailure, ExternalMcpTransport, ` (1 occurrence).
2. `oauthStatusFailure` (lines 492-499). OLD:
```ts
function oauthStatusFailure(record: ExternalMcpServerRecord, settingsLink: string): string | null {
  const status = resolveExternalMcpOAuthStatus(record);
  if (status === "connected") return null;
  if (status === "needs_reauth") {
    return `its authorization expired or was revoked — reconnect it in ${settingsLink}`;
  }
  return `it has not been authorized yet (status '${status}') — connect it in ${settingsLink}`;
}
```
NEW:
```ts
function oauthStatusFailure(record: ExternalMcpServerRecord, settingsLink: string): Omit<ExternalMcpConfigFailure, "serverId"> | null {
  const status = resolveExternalMcpOAuthStatus(record);
  if (status === "connected") return null;
  if (status === "needs_reauth") {
    return { reason: `its authorization expired or was revoked — reconnect it in ${settingsLink}`, category: "reauth_required" };
  }
  return { reason: `it has not been authorized yet (status '${status}') — connect it in ${settingsLink}` };
}
```
3. In `resolveExternalMcpAccessToken`: OLD (1 occurrence) `): Promise<{ readonly ok: true; readonly token: string; readonly shared?: true } | { readonly ok: false; readonly reason: string }> {` -> NEW `): Promise<{ readonly ok: true; readonly token: string; readonly shared?: true } | ({ readonly ok: false } & Omit<ExternalMcpConfigFailure, "serverId">)> {`
   and OLD (1) `  if (statusFailure !== null) return { ok: false, reason: statusFailure };` -> NEW `  if (statusFailure !== null) return { ok: false, ...statusFailure };`
4. In `resolveOwnedAccessToken`: OLD (1) `): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: string }> {` -> NEW `): Promise<{ readonly ok: true; readonly token: string } | ({ readonly ok: false } & Omit<ExternalMcpConfigFailure, "serverId">)> {`
   and OLD (1):
```ts
    return { ok: false, reason: needsReauth
      ? `its authorization expired or was revoked — reconnect it in ${settingsLink}`
      : `its OAuth access token could not be obtained: OAuth token resolution failed — reconnect this server in ${settingsLink}` };
```
   NEW:
```ts
    return needsReauth
      ? { ok: false, reason: `its authorization expired or was revoked — reconnect it in ${settingsLink}`, category: "reauth_required" }
      : { ok: false, reason: `its OAuth access token could not be obtained: OAuth token resolution failed — reconnect this server in ${settingsLink}` };
```
5. `externalMcpFailure` (line 546-548). OLD:
```ts
function externalMcpFailure(record: ExternalMcpServerRecord, reason: string): { readonly ok: false; readonly failure: { serverId: string; reason: string } } {
  return { ok: false, failure: { serverId: record.serverId, reason } };
```
NEW:
```ts
function externalMcpFailure(
  record: ExternalMcpServerRecord, reason: string, category?: ExternalMcpConfigFailure["category"],
): { readonly ok: false; readonly failure: ExternalMcpConfigFailure } {
  return { ok: false, failure: { serverId: record.serverId, reason, ...(category === undefined ? {} : { category }) } };
```
6. Replace ALL 3 remaining occurrences of `{ readonly ok: false; readonly failure: { serverId: string; reason: string } }` (lines 565, 601, 681) with `{ readonly ok: false; readonly failure: ExternalMcpConfigFailure }`. Count before: 3 (after step 5). Else STOP.
7. Replace BOTH occurrences (lines 578, 609) of `    if (!token.ok) return externalMcpFailure(record, token.reason);` with `    if (!token.ok) return externalMcpFailure(record, token.reason, token.category);` Count before: 2.
8. `readEnabledExternalMcpConfigs`: replace BOTH occurrences of `{ serverId: string; reason: string }[]` (lines 720 and 723) with `ExternalMcpConfigFailure[]`. Count before: 2.
After: `rg -n "serverId: string; reason: string" packages/mcp/src/federation/hosted/store.ts` prints nothing. Complexity: unchanged branch counts (ternaries/ifs moved, none added except the `category === undefined` spread in externalMcpFailure: cyclomatic 2).

### J-a4. Changeset `.changeset/mcp-config-failure-category.md`
```
---
"@jini-ai/core": minor
"@jini-ai/mcp": minor
---

Hosted MCP config failures carry a typed `category` (`"reauth_required"`) next to their unchanged `reason`, declared as `ExternalMcpConfigFailure` in `@jini-ai/core/contracts/hosted-mcp`, so hosts branch on a type instead of matching reason wording.
```
### J-a5. Checks + commit
COMMON rule checks on the 3 code files; eslint them. Commit paths: config.ts, store.ts, second-host-store.test.ts, the changeset.
jini_msg: `feat(mcp): typed reauth category on hosted MCP config failures` | body: "The hosted store marks its two reauthorization outcomes (stored needs_reauth status, resolver error carrying the host's reauth code) with category reauth_required; reason text is unchanged. The new second-host test is RED on the parent and GREEN here."

---------------------------------------------------------------------------------------------------
## J-b: probe + admissions use cases (pure moves of the generic halves; no behaviour change)

Guards (Jini, after J-a): `packages/mcp/src/federation/hosted/probe.ts`, `packages/mcp/src/federation/admissions.ts`, `packages/mcp/src/federation/hosted/__tests__/probe.test.ts`, `packages/mcp/src/federation/__tests__/admissions.test.ts` must not exist; `packages/mcp/src/federation/hosted/index.ts` blob 5a4a745874d1d648874ce4c3e3b796a05600f1f8; `packages/mcp/src/federation/index.ts` blob 053980cd5c17260e67f69ccdf97c36491fa850a7; `rg -n "probeExternalMcpServer|readFederationAdmissions" packages/mcp/src` prints nothing.

split (Tovu `server/runtime/services/external-mcp-probe.ts`, blob fc699f201215afd7b218f647de9edc479a4d2574, every declaration):
  - ExternalMcpProbeSessionFactory (16) | MOVE -> hosted/probe.ts (verbatim, doc reworded neutral)
  - ExternalMcpProbeServiceDeps (21) | STAY-WIRING -> features/external-mcp/external-mcp-probe.ts
  - defaultProbeConnect (41) | STAY-WIRING (host owns `fetch`)
  - ProbeTarget (47), ProbeTargetResolution (56) | MOVE (resolution now carries typed failures)
  - refuseBeforeResolving (63) | SPLIT: decisions MOVE (typed kinds), statuses/bodies/copy STAY (localCommandResponse, reauthResponse, probeFailureResponse)
  - respondToResolutionFailure (94) | SPLIT: substring match DELETED (typed category), 409/502 bodies + settings deep link STAY
  - resolveProbeTarget (120) | MOVE (ports instead of Tovu deps)
  - isProbeAuthFailure (153), isProbeTimeoutFailure (160), runProbe (170) | MOVE verbatim
  - probeExternalMcpServer (193) | SPLIT: orchestration MOVE; status/code table, `credentialText` copy, `probedAt` stamp STAY
split (Tovu `server/runtime/services/external-mcp-admissions.ts`, blob ef48ad4d4959be8f4eef555f982ea5a3c4ee65ad):
  - ServerAdmissionsReader (5) | MOVE as FederationAdmissionsPorts (+ `report`); Tovu keeps `type ServerAdmissionsReader = Omit<FederationAdmissionsPorts, "report">`
  - unavailable (13) | STAY-PRODUCT (legacy `AGENT_DAEMON_UNAVAILABLE` + copy)
  - readServerAdmissions (23) | SPLIT: wait/validate/catch MOVE (`readFederationAdmissions` + `admittedReport` helper: the Tovu original is on the complexity debt list at 11); legacy mapping + console logging STAY

### J-b1. NEW `packages/mcp/src/federation/hosted/probe.ts` (exact content)
```ts
/**
 * @file Probe one saved hosted MCP server: resolve its credentials through the host's bound store read,
 * connect once, list and describe its tools, close. Never spawns a local command and never invokes a
 * remote tool. OAuth resolution inside the store read can refresh and persist a grant, so a probe is
 * not read-only. Failures are typed kinds; the host owns statuses, response bodies, copy and links.
 */
import type { ExternalMcpConfigFailure, ExternalMcpServerConfig, ExternalMcpServerRecord, ExternalMcpServerRepoPort } from "@jini-ai/core/contracts/hosted-mcp";
import type { UUID } from "@jini-ai/core/primitives";
import { McpAuthFailedError, McpProtocolError } from "../mcp-protocol.js";
import type { FederatedMcpConnectionConfig, McpHttpLaunchSpec, McpSessionPort } from "../ports.js";
import { describeRemoteToolSurface } from "../trust.js";
import { resolveExternalMcpAuthMode, resolveExternalMcpOAuthStatus } from "./auth.js";
import { toResolvedFederatedConnections } from "./store.js";

/** Injectable session factory — the seam a test scripts instead of opening a real socket, so the
 *  protocol code under test is the real thing, not a second hand-rolled fake of it. */
export type ExternalMcpProbeSessionFactory = (
  required: { spec: McpHttpLaunchSpec; requestTimeoutMs: number },
  optional?: Record<string, never>,
) => Promise<McpSessionPort>;

/** @agent-note Host-wired. `readEnabledConfigs` is the host's already-bound hosted-store read (its vault,
 *  credential policy and settings link applied), so credential resolution is never re-implemented here. */
export interface ExternalMcpProbePorts {
  readonly repo: Pick<ExternalMcpServerRepoPort, "findByServerId">;
  readonly readEnabledConfigs: (required: { workspaceId: UUID }) => Promise<{
    readonly configs: readonly ExternalMcpServerConfig[];
    readonly failures: readonly ExternalMcpConfigFailure[];
  }>;
  /** One handshake bounded by the connection's own `connectTimeoutMs` (the session is closed right after one `listTools`). */
  readonly connect: ExternalMcpProbeSessionFactory;
}

/** Why a probe did not list tools. `stage` separates the record-level refusal from the defensive launch-shape check. */
export type ExternalMcpProbeFailure =
  | { readonly kind: "unknown_server" }
  | { readonly kind: "local_command"; readonly stage: "record" | "launch" }
  | { readonly kind: "disabled" }
  | { readonly kind: "reauth_required"; readonly stage: "stored"; readonly label: string | null }
  | { readonly kind: "reauth_required"; readonly stage: "resolve"; readonly reason: string }
  | { readonly kind: "unresolved"; readonly reason?: string }
  | { readonly kind: "auth" | "timeout" | "unreachable" };

export type ExternalMcpProbeResult =
  | { readonly ok: true; readonly tools: ReturnType<typeof describeRemoteToolSurface> }
  | { readonly ok: false; readonly failure: ExternalMcpProbeFailure };

/** One resolved, probeable target: the trust-tier config `describeRemoteToolSurface` needs, and the
 *  hosted launch spec to connect with. */
interface ProbeTarget {
  readonly federationConfig: FederatedMcpConnectionConfig;
  readonly launch: McpHttpLaunchSpec;
}

/** Either a usable target or the typed reason not to connect at all. A union rather than a throw:
 *  every branch (unknown id, wrong transport, disabled row, stale authorization) is an ordinary outcome. */
type ProbeTargetResolution = { readonly ok: true; readonly target: ProbeTarget } | { readonly ok: false; readonly failure: ExternalMcpProbeFailure };

/** Refuses a local-command row, a disabled row, and a row already parked `needs_reauth`, all from the
 *  record alone — before any credential is ever resolved.
 *  @returns The refusal, or `null` to continue resolving.
 *  @complexity O(1). */
function refuseBeforeResolving({ record }: { record: ExternalMcpServerRecord }, _optional = {}): ExternalMcpProbeFailure | null {
  if (record.transport === "stdio") return { kind: "local_command", stage: "record" };
  if (!record.enabled) return { kind: "disabled" };
  if (resolveExternalMcpAuthMode(record) === "oauth" && resolveExternalMcpOAuthStatus(record) === "needs_reauth") {
    return { kind: "reauth_required", stage: "stored", label: record.label };
  }
  return null;
}

/** Turns one store-read MISS into a typed failure. A row whose stored status was `"connected"` but whose
 *  live token refresh failed with an invalid grant during this exact call carries the typed
 *  `reauth_required` category; branching on the type (never the prose) keeps that distinction stable.
 *  @complexity O(1). */
function resolutionFailure({ failure }: { failure: ExternalMcpConfigFailure | undefined }, _optional = {}): ExternalMcpProbeFailure {
  if (failure?.category === "reauth_required") return { kind: "reauth_required", stage: "resolve", reason: failure.reason };
  return failure === undefined ? { kind: "unresolved" } : { kind: "unresolved", reason: failure.reason };
}

/** Resolves one `serverId` into a probeable target through the same store read a real connect uses,
 *  never a second, parallel reading of the row.
 *  @complexity O(n) in the workspace's configured server count (bounded by the store's per-workspace cap). */
async function resolveProbeTarget(
  { ports, workspaceId, serverId }: { ports: ExternalMcpProbePorts; workspaceId: UUID; serverId: string },
  _optional = {},
): Promise<ProbeTargetResolution> {
  const record = await ports.repo.findByServerId({ workspaceId, serverId });
  if (!record) return { ok: false, failure: { kind: "unknown_server" } };
  const earlyRefusal = refuseBeforeResolving({ record });
  if (earlyRefusal) return { ok: false, failure: earlyRefusal };

  const { configs, failures } = await ports.readEnabledConfigs({ workspaceId });
  const config = configs.find((candidate) => candidate.serverId === serverId);
  if (!config) return { ok: false, failure: resolutionFailure({ failure: failures.find((candidate) => candidate.serverId === serverId) }) };

  const [resolved] = toResolvedFederatedConnections([config]);
  // Defensive, not reachable given the transport check above (`config.transport` mirrors
  // `record.transport` — both come from the same row): a probe must never launch a child process,
  // and a launch-spec SHAPE check right before connecting is the cheapest second guarantee of that,
  // independent of whatever produced `resolved`.
  if (!resolved || !("url" in resolved.launch)) return { ok: false, failure: { kind: "local_command", stage: "launch" } };
  return { ok: true, target: { federationConfig: resolved.config, launch: resolved.launch } };
}

@@COPY Tovu external-mcp-probe.ts 152-187@@

/** Resolves credentials, probes once, then closes. OAuth resolution can refresh and persist a grant, so
 *  this operation is not read-only.
 *  @complexity O(n + t) time and space for saved servers and advertised tools, plus bounded I/O. */
export async function probeExternalMcpServer(
  { ports, workspaceId, serverId }: { readonly ports: ExternalMcpProbePorts; readonly workspaceId: UUID; readonly serverId: string },
  _optional: Record<string, never> = {},
): Promise<ExternalMcpProbeResult> {
  const resolution = await resolveProbeTarget({ ports, workspaceId, serverId });
  if (!resolution.ok) return resolution;
  const outcome = await runProbe(ports.connect, resolution.target);
  return outcome.ok ? outcome : { ok: false, failure: { kind: outcome.kind } };
}
```
Build: replace the marker line `@@COPY Tovu external-mcp-probe.ts 152-187@@` with lines 152-187 of `git -C $TOVU_CLONE show HEAD:apps/website/src/server/runtime/services/external-mcp-probe.ts` (isProbeAuthFailure, isProbeTimeoutFailure, runProbe with their docs, verbatim), then apply exactly ONE edit inside the copy: in runProbe's doc, `matching W-002's own framing in the implementation outline. Split out of the\n *  route handler purely to keep it under the shop ceiling.` -> `kept separate to stay under the complexity ceiling.` (the doc then reads "...the `finally` is the whole safety story for the outbound session, kept separate to stay under the complexity ceiling."). `rg -n "@@COPY|W-002|D-7|route handler" packages/mcp/src/federation/hosted/probe.ts` prints nothing. Sizes: resolveProbeTarget 17 lines / cyclomatic 6; runProbe unchanged (17 / 3).

### J-b2. `packages/mcp/src/federation/hosted/index.ts`: after the exact line `export * from "./connection-gate.js";` insert `export * from "./probe.js";`

### J-b3. NEW `packages/mcp/src/federation/admissions.ts` (exact content)
```ts
/**
 * @file Read one federation's admission report after its bounded startup wait. The essential invariant:
 * an unavailable report (not composed, still connecting, malformed, failed read) is never confused with an
 * available, empty roster. Constructs no runtime and no admission store; the host passes its live ones.
 */

/** @agent-note Host-wired from the running federation. Absent `awaitFederation`/`readAdmissions` = not composed, so the read fails closed. */
export interface FederationAdmissionsPorts {
  readonly awaitFederation?: ((required: { timeoutMs: number }, optional?: Record<string, never>) => Promise<{ readonly settled: boolean }>) | undefined;
  /** Live in-process accounting. The federation transport owns remote errors and their tracing. */
  readonly readAdmissions?: (() => Promise<{ readonly connections: unknown; readonly configFailures?: unknown }>) | undefined;
  /** Receives a wait/read failure. Transport errors can carry credentials: the host redacts before it logs. */
  readonly report: (required: { error: unknown }, optional?: Record<string, never>) => void;
}

export type FederationAdmissionsResult =
  | { readonly ok: true; readonly connections: readonly unknown[]; readonly configFailures?: readonly unknown[] }
  | { readonly ok: false };

const UNAVAILABLE: FederationAdmissionsResult = { ok: false };

/** Accepts a report only when its lists are lists; `configFailures` stays absent when the runtime omitted it. */
function admittedReport(
  { report }: { report: { readonly connections: unknown; readonly configFailures?: unknown } },
  _optional = {},
): FederationAdmissionsResult {
  if (!Array.isArray(report.connections)) return UNAVAILABLE;
  if (report.configFailures !== undefined && !Array.isArray(report.configFailures)) return UNAVAILABLE;
  return report.configFailures === undefined
    ? { ok: true, connections: report.connections }
    : { ok: true, connections: report.connections, configFailures: report.configFailures };
}

/** Waits (bounded by `timeoutMs`) for the federation to settle, then reads its current reports.
 * @complexity O(1) beyond federation startup and the report reader. */
export async function readFederationAdmissions(
  { ports, timeoutMs }: { readonly ports: FederationAdmissionsPorts; readonly timeoutMs: number },
  _optional: Record<string, never> = {},
): Promise<FederationAdmissionsResult> {
  const { awaitFederation, readAdmissions, report } = ports;
  if (!awaitFederation || !readAdmissions) return UNAVAILABLE;
  try {
    if (!(await awaitFederation({ timeoutMs })).settled) return UNAVAILABLE;
    return admittedReport({ report: await readAdmissions() });
  } catch (error) {
    // Only the sink sees the error: an opaque transport failure must not reach the caller.
    report({ error });
    return UNAVAILABLE;
  }
}
```

### J-b4. `packages/mcp/src/federation/index.ts`: after the exact line `export * from "./reload.js";` insert `export * from "./admissions.js";`
(Both subpaths exist with runtime `node`: no package.json/README edit.)

### J-b5. NEW `packages/mcp/src/federation/hosted/__tests__/probe.test.ts` (exact content)
```ts
import { describe, expect, test } from "vitest";
import { McpAuthFailedError, McpProtocolError } from "../../mcp-protocol.js";
import { probeExternalMcpServer, type ExternalMcpProbePorts } from "../probe.js";

const WS = "acme-ws-1";
const record = (over: Record<string, unknown> = {}) => ({ serverId: "remote", workspaceId: WS, label: "Remote", transport: "streamable_http", enabled: true, authMode: "none", oauthStatus: null, ...over });
const config = { serverId: "remote", label: "Remote", transport: "streamable_http", authMode: "none", enabled: true, allowedToolNames: ["read_thing"], writeAllowedToolNames: [],
  target: { kind: "streamable_http", url: "https://mcp.acme.test/mcp", headers: {} }, admissionRevision: "r1" };
function ports(over: Partial<ExternalMcpProbePorts> & { row?: Record<string, unknown> | null; failures?: unknown[]; configs?: unknown[] } = {}): ExternalMcpProbePorts {
  const row = over.row === undefined ? record() : over.row;
  return {
    repo: { findByServerId: async () => row as never },
    readEnabledConfigs: async () => ({ configs: (over.configs ?? [config]) as never, failures: (over.failures ?? []) as never }),
    connect: over.connect ?? (async () => ({ listTools: async () => [], callTool: async () => { throw new Error("never"); }, close: async () => undefined }) as never),
  };
}
const probe = (p: ExternalMcpProbePorts) => probeExternalMcpServer({ ports: p, workspaceId: WS, serverId: "remote" });

describe("probeExternalMcpServer", () => {
  test("record-level refusals never resolve credentials or connect", async () => {
    let reads = 0; let connects = 0;
    const counting = (p: ExternalMcpProbePorts): ExternalMcpProbePorts => ({ ...p, readEnabledConfigs: async (r) => { reads += 1; return p.readEnabledConfigs(r); }, connect: async (r) => { connects += 1; return p.connect(r); } });
    expect(await probe(counting(ports({ row: null })))).toEqual({ ok: false, failure: { kind: "unknown_server" } });
    expect(await probe(counting(ports({ row: record({ transport: "stdio" }) })))).toEqual({ ok: false, failure: { kind: "local_command", stage: "record" } });
    expect(await probe(counting(ports({ row: record({ enabled: false }) })))).toEqual({ ok: false, failure: { kind: "disabled" } });
    expect(await probe(counting(ports({ row: record({ authMode: "oauth", oauthStatus: "needs_reauth" }) })))).toEqual({ ok: false, failure: { kind: "reauth_required", stage: "stored", label: "Remote" } });
    expect([reads, connects]).toEqual([0, 0]);
  });

  test("a store miss maps by the typed category, never by reason wording", async () => {
    expect(await probe(ports({ configs: [], failures: [{ serverId: "remote", reason: "reworded entirely", category: "reauth_required" }] })))
      .toEqual({ ok: false, failure: { kind: "reauth_required", stage: "resolve", reason: "reworded entirely" } });
    expect(await probe(ports({ configs: [], failures: [{ serverId: "remote", reason: "its authorization expired or was revoked — reconnect it in Console" }] })))
      .toEqual({ ok: false, failure: { kind: "unresolved", reason: "its authorization expired or was revoked — reconnect it in Console" } });
    expect(await probe(ports({ configs: [], failures: [] }))).toEqual({ ok: false, failure: { kind: "unresolved" } });
  });

  test("connects with the connect timeout, lists once and always closes", async () => {
    const seen: unknown[] = []; let closed = 0;
    const result = await probe(ports({ connect: async ({ spec, requestTimeoutMs }) => {
      seen.push(spec.url, requestTimeoutMs);
      return { listTools: async () => [{ name: "read_thing", description: "Reads.", inputSchema: { type: "object" } }], callTool: async () => { throw new Error("never"); }, close: async () => { closed += 1; } } as never;
    } }));
    expect(result.ok).toBe(true);
    expect(seen[0]).toBe("https://mcp.acme.test/mcp");
    expect(typeof seen[1]).toBe("number");
    expect(closed).toBe(1);
  });

  test("connection failures collapse to closed categories", async () => {
    const failing = (error: unknown) => ports({ connect: async () => { throw error; } });
    expect(await probe(failing(new McpAuthFailedError({ message: "x" } as never)))).toEqual({ ok: false, failure: { kind: "auth" } });
    expect(await probe(failing(Object.assign(new Error("upstream said sk_secret"), { status: 403 })))).toEqual({ ok: false, failure: { kind: "auth" } });
    expect(await probe(failing(Object.assign(new Error("slow"), { name: "TimeoutError" })))).toEqual({ ok: false, failure: { kind: "timeout" } });
    expect(await probe(failing(new McpProtocolError({ message: "request timed out" } as never)))).toEqual({ ok: false, failure: { kind: "timeout" } });
    expect(await probe(failing(new Error("ECONNREFUSED")))).toEqual({ ok: false, failure: { kind: "unreachable" } });
  });
});
```
Note for the executor: if `McpProtocolError`/`McpAuthFailedError`'s constructor in `packages/mcp/src/federation/mcp-protocol.ts` is not `({ message, ... })`-shaped (read lines 50-66 first), use the construction `packages/mcp/src/federation/__tests__/` tests already use for them (`rg -n "new McpProtocolError\(" packages/mcp/src | head -3`) and record the difference; that is the one permitted adaptation. Any other mismatch: STOP.

### J-b6. NEW `packages/mcp/src/federation/__tests__/admissions.test.ts` (exact content)
```ts
import { describe, expect, test } from "vitest";
import { readFederationAdmissions, type FederationAdmissionsPorts } from "../admissions.js";

const settled = async () => ({ settled: true });
const read = (ports: Partial<FederationAdmissionsPorts>, reported: unknown[] = []) =>
  readFederationAdmissions({ ports: { report: ({ error }) => { reported.push(error); }, ...ports }, timeoutMs: 5_000 });

describe("readFederationAdmissions", () => {
  test("an unavailable report is never an empty roster", async () => {
    expect(await read({})).toEqual({ ok: false });
    expect(await read({ awaitFederation: async () => ({ settled: false }), readAdmissions: async () => ({ connections: [] }) })).toEqual({ ok: false });
    expect(await read({ awaitFederation: settled, readAdmissions: async () => ({ connections: "nope" }) })).toEqual({ ok: false });
    expect(await read({ awaitFederation: settled, readAdmissions: async () => ({ connections: [], configFailures: {} }) })).toEqual({ ok: false });
    expect(await read({ awaitFederation: settled, readAdmissions: async () => ({ connections: [] }) })).toEqual({ ok: true, connections: [] });
  });

  test("keeps configFailures only when the runtime reported them, and passes the timeout policy", async () => {
    let waited = 0;
    expect(await read({ awaitFederation: async ({ timeoutMs }) => { waited = timeoutMs; return { settled: true }; }, readAdmissions: async () => ({ connections: [1], configFailures: [2] }) }))
      .toEqual({ ok: true, connections: [1], configFailures: [2] });
    expect(waited).toBe(5_000);
  });

  test("a failed read goes to the sink only, and answers unavailable", async () => {
    const reported: unknown[] = [];
    const boom = new Error("transport said Bearer sk_secret");
    expect(await read({ awaitFederation: settled, readAdmissions: async () => { throw boom; } }, reported)).toEqual({ ok: false });
    expect(reported).toEqual([boom]);
  });
});
```

### J-b7. Changeset `.changeset/mcp-probe-admissions.md`
```
---
"@jini-ai/mcp": minor
---

Add `probeExternalMcpServer` (+ `ExternalMcpProbePorts`, `ExternalMcpProbeResult`, `ExternalMcpProbeFailure`, `ExternalMcpProbeSessionFactory`) to `@jini-ai/mcp/federation/hosted` and `readFederationAdmissions` (+ `FederationAdmissionsPorts`, `FederationAdmissionsResult`) to `@jini-ai/mcp/federation`: typed outcomes, host-wired ports, no HTTP statuses or copy.
```
### J-b8. Checks + commit
COMMON rules 2-9 on probe.ts, admissions.ts, both index.ts, both tests (no `console.`, no `process.env`, no `fetch`, no `@jini-ai/*` import other than `@jini-ai/core/*`). eslint. Commit paths: the 2 new sources, 2 index.ts, 2 new tests, the changeset.
jini_msg: `feat(mcp): hosted probe and federation admissions use cases` | body: "Probe resolves through the host's bound store read, connects once, lists, describes and closes; failures are typed kinds. Admissions waits (host timeout), validates and reports failures to a host sink, never confusing unavailable with empty."

---------------------------------------------------------------------------------------------------
## T: Tovu binds the Jini owners, keeps its response contract, deletes `server/runtime/services/` (execute after wave B merge)

Guards (blob): services/external-mcp-probe.ts fc699f201215afd7b218f647de9edc479a4d2574; services/external-mcp-admissions.ts ef48ad4d4959be8f4eef555f982ea5a3c4ee65ad; services/__tests__/external-mcp-admissions.observability.unit.test.ts 60ac1a6e13046dd7ef67b4770d448ecd2c7e6186; services/__tests__/external-mcp-operations.unit.test.ts bb4a558d2d84e5f4f07f9c3f6f38f7a9183138c0; routes/external-mcp/probe.ts d3c4ea64f4de59099285272e6fca0a26386a6177; routes/external-mcp/admissions.ts 2493372166841d08eee017eeb956311f286b5cf5; composition/modules/assistant-server-federation.ts 5d23862d9801f41aca6036294436b0d6af573cd3; server/__tests__/admin-external-mcp-probe-routes.test.ts 2d8848fcacb6311a17ee8953bee6ff917ad6a286; composition/modules/__tests__/assistant-cold-start.unit.test.ts 8fddea7ad706ed029d2d6f6b4a23febe427816fa; features/external-mcp/external-mcp-store.ts 27b06caefb951686f9b5205abf85546b2f25d006; features/external-mcp/__tests__/external-mcp-oauth.test.ts 0e11c64b7c7b2c03c28d0602fcdce9b686b0a74f; development/scripts/src-complexity-debt.json 312ed342c9452b7edd269022892a3d768f93fe3f; development/refactor-patterns/user-facing-errors.terra-prompt.md eb21fc9f7ccfadeb159d8c546d0e1abafcba43e6. TEXT-guarded (wave rows on other lines): composition/tool-catalog-manifest.ts, features/credential-safety/__tests__/probes-and-cards.test.ts. Must not exist: features/external-mcp/external-mcp-probe.ts, features/external-mcp/external-mcp-admissions.ts, features/external-mcp/__tests__/external-mcp-operations.unit.test.ts, features/external-mcp/__tests__/external-mcp-admissions.observability.unit.test.ts.
(All paths under `apps/website/src/` except the two `development/` files.)

census (before edits): `rg -n --no-heading "runtime/services|services/external-mcp|external-mcp-probe|external-mcp-admissions|ExternalMcpProbeSessionFactory" apps development content --glob '!**/node_modules/**'` -> allowed: the 2 service files, their 2 tests, routes/external-mcp/probe.ts:4,5, routes/external-mcp/admissions.ts:2, tool-catalog-manifest.ts:88,89, assistant-server-federation.ts:6, assistant-cold-start.unit.test.ts:7, probes-and-cards.test.ts:8, admin-external-mcp-probe-routes.test.ts:13 (+ its uses of the type at 60,161,191,224,242,309), src-complexity-debt.json:397, user-facing-errors.terra-prompt.md:155, operations-tools.ts:41 (comment, unchanged), and `apps/admin/**` hits for `probeExternalMcpServer` are a different symbol (admin API client) and are not matched by this census. Any other hit: STOP.

### T1. NEW `apps/website/src/features/external-mcp/external-mcp-probe.ts` (exact content)
```ts
/** Saved-server probe used by the admin route and assistant tools. Jini's hosted probe resolves, connects once and
 * classifies; this file binds Tovu's store read and HTTP session and keeps Tovu's response contract: statuses,
 * legacy codes, copy and settings links. Never spawns local commands or invokes remote tools (D-7). */
import { credentialText } from "../../contracts/core/credential-copy.js";
import { connectMcpHttpSession, createFetchMcpHttpExchange } from "../../assistant/index.js";
import type { McpHttpLaunchSpec, McpSessionPort } from "@jini-ai/mcp/federation";
import { probeExternalMcpServer as probeHostedMcpServer, type ExternalMcpProbeFailure, type ExternalMcpProbeSessionFactory } from "@jini-ai/mcp/federation/hosted";
import { ExternalMcpReauthRequiredError, externalMcpSettingsDeepLink } from "./external-mcp-oauth.js";
import { readEnabledExternalMcpConfigs } from "./external-mcp-store.js";
import type { ExternalMcpOAuthService } from "./contracts.js";
import type { ExternalMcpToolDeps } from "./deps.js";

export type ExternalMcpProbeServiceDeps = Pick<ExternalMcpToolDeps, "workspaceId" | "clock" | "externalMcpServerRepo" | "siteAssistantSecretSealer"> & {
@@COPY services/external-mcp-probe.ts 22-31@@

@@COPY services/external-mcp-probe.ts 33-43@@

type ProbeFailureResponse = { readonly ok: false; readonly status: number; readonly body: Record<string, unknown> };

const CONNECT_FAILURES = { auth: { status: 401, code: "MCP_AUTH_REJECTED" }, timeout: { status: 504, code: "MCP_TIMEOUT" }, unreachable: { status: 502, code: "MCP_SERVER_UNREACHABLE" } } as const;

/** The two local-command refusals: the record-level one points the operator at typing tool names. */
function localCommandResponse({ stage }: { stage: "record" | "launch" }, _optional = {}): ProbeFailureResponse {
  return stage === "record"
    ? { ok: false, status: 400, body: { error: "probe is not available for local-command servers yet — type tool names directly instead", code: "PROBE_UNSUPPORTED_TRANSPORT", details: { field: "transport" } } }
    : { ok: false, status: 400, body: { error: "probe is not available for local-command servers yet", code: "PROBE_UNSUPPORTED_TRANSPORT" } };
}

/** 409 for both reauthorization paths: a row parked `needs_reauth` (the error class's own copy and link), or a live
 *  refresh that failed with an invalid grant during this call (the store's reason, typed by Jini, plus the deep link). */
function reauthResponse(
  { failure, serverId }: { failure: Extract<ExternalMcpProbeFailure, { kind: "reauth_required" }>; serverId: string }, _optional = {},
): ProbeFailureResponse {
  if (failure.stage === "stored") {
    const error = new ExternalMcpReauthRequiredError({ serverId, label: failure.label });
    return { ok: false, status: 409, body: { error: error.message, code: error.code, details: { retryable: false, settingsLink: error.settingsLink } } };
  }
  return { ok: false, status: 409, body: { error: failure.reason, code: "EXTERNAL_MCP_REAUTH_REQUIRED", details: { retryable: false, settingsLink: externalMcpSettingsDeepLink({ serverId }) } } };
}

/** Tovu's admin response contract for each typed probe failure. Upstream bodies/errors may contain credentials;
 *  only the closed category crosses into a connect-failure answer. */
function probeFailureResponse({ failure, serverId }: { failure: ExternalMcpProbeFailure; serverId: string }, _optional = {}): ProbeFailureResponse {
  switch (failure.kind) {
    case "unknown_server":
      return { ok: false, status: 400, body: { error: `no external MCP server is configured as '${serverId}'`, code: "INVALID_MCP_SERVER", details: { field: "id" } } };
    case "local_command":
      return localCommandResponse({ stage: failure.stage });
    case "disabled":
      return { ok: false, status: 400, body: { error: "this server is disabled — enable it before probing", code: "MCP_SERVER_DISABLED", details: { field: "enabled" } } };
    case "reauth_required":
      return reauthResponse({ failure, serverId });
    case "unresolved":
      return { ok: false, status: 502, body: { error: failure.reason ?? "this server's connection could not be resolved", code: "MCP_SERVER_UNREACHABLE" } };
    default:
      return { ok: false, status: CONNECT_FAILURES[failure.kind].status, body: { error: credentialText({ id: failure.kind }), code: CONNECT_FAILURES[failure.kind].code } };
  }
}

/** Resolves credentials, probes once, then closes. Expected refusals retain the admin response contract.
 * OAuth resolution can refresh and persist a grant, so this operation is not declared read-only.
 * @complexity O(n + t) time and O(n + t) space for saved servers and advertised tools, plus bounded I/O.
 */
export async function probeExternalMcpServer({ deps, serverId }: { deps: ExternalMcpProbeServiceDeps; serverId: string }, _optional = {}) {
  const outcome = await probeHostedMcpServer({
    ports: {
      repo: deps.externalMcpServerRepo,
      readEnabledConfigs: ({ workspaceId }) => readEnabledExternalMcpConfigs(
        { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, oauth: deps.externalMcpOAuth?.tokenResolver }, workspaceId),
      connect: deps.connect ?? defaultProbeConnect,
    },
    workspaceId: deps.workspaceId,
    serverId,
  });
  if (!outcome.ok) return probeFailureResponse({ failure: outcome.failure, serverId });
  return { ok: true as const, body: { tools: outcome.tools, probedAt: new Date(deps.clock.nowMs()).toISOString() } };
}
```
Build: replace each `@@COPY services/external-mcp-probe.ts a-b@@` marker with lines a..b of `git -C $TOVU_CLONE show HEAD:apps/website/src/server/runtime/services/external-mcp-probe.ts` verbatim (22-31 = the rest of `ExternalMcpProbeServiceDeps` incl. its closing `};`; 33-43 = `defaultProbeConnect` with its doc). `rg -n "@@COPY" <file>` prints nothing. Notes: the `type { McpHttpLaunchSpec, McpSessionPort }` import is used by `defaultProbeConnect`'s copied signature; `ExternalMcpProbeSessionFactory` by the copied `connect?:` field; `ExternalMcpOAuthService` by the copied `externalMcpOAuth?:` field. If `deps.workspaceId`'s type is not assignable to `UUID` (eslint cannot tell; the cloud typecheck will), do not cast: record it as "typecheck to confirm" in the report. Sizes: probeFailureResponse 17 lines / cyclomatic 7; probeExternalMcpServer 14 / 3.
Why-comment check: D-7 (never spawn local commands) is kept on this file's header; the stored-vs-live reauth why is on `reauthResponse` and on Jini's `resolutionFailure`; the substring-coupling caveat (old lines 95-102) is deleted on purpose, because the coupling it warned about no longer exists.

### T2. NEW `apps/website/src/features/external-mcp/external-mcp-admissions.ts` (exact content)
```ts
import { readFederationAdmissions, type FederationAdmissionsPorts } from "@jini-ai/mcp/federation";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import type { ExternalMcpOperations } from "./operations-tools.js";

/** Live in-process accounting. The federation transport owns remote errors and their tracing. */
export type ServerAdmissionsReader = Omit<FederationAdmissionsPorts, "report">;

/** One failure contract for missing composition, a connecting server or a failed read.
 * Keep the legacy code until the admin client's unavailable-state contract migrates too:
 * an unavailable report must never look like an empty admitted roster. */
function unavailable(): Awaited<ReturnType<ExternalMcpOperations["admissions"]>> {
  return { ok: false, body: { error: "the server's external MCP admissions are unavailable — try again shortly", code: "AGENT_DAEMON_UNAVAILABLE" } };
}

/** Fixed metadata only: an opaque transport failure must not expose credentials to the client or the log. */
function reportAdmissionsFailure({ error }: { error: unknown }, _optional = {}): void {
  console.error("external-mcp server admissions read failed", describeErrorForLog({ err: error }));
}

/** Read the server's single federation after its bounded admission wait; never wake a daemon.
 * @param required - The existing surface's wait and live-report ports; absent ports fail closed.
 * @returns Current reports, preserving optional config failures, or the legacy distinguishable failure.
 * @example readServerAdmissions({ awaitFederation: surface.awaitFederation, readAdmissions })
 * @complexity O(1) beyond federation startup and the report reader; the wait is bounded to 5 seconds.
 */
export async function readServerAdmissions(
  { awaitFederation, readAdmissions }: ServerAdmissionsReader,
  _options: Record<string, never> = {},
): ReturnType<ExternalMcpOperations["admissions"]> {
  const result = await readFederationAdmissions({ ports: { awaitFederation, readAdmissions, report: reportAdmissionsFailure }, timeoutMs: 5_000 });
  if (!result.ok) return unavailable();
  return result.configFailures === undefined
    ? { ok: true, connections: result.connections }
    : { ok: true, connections: result.connections, configFailures: result.configFailures };
}
```

### T3. Delete (git rm): `apps/website/src/server/runtime/services/external-mcp-probe.ts`, `apps/website/src/server/runtime/services/external-mcp-admissions.ts`.

### T4. Tests move (git mv semantics: create new, git rm old; content byte for byte except the listed lines)
- `server/runtime/services/__tests__/external-mcp-operations.unit.test.ts` -> NEW `features/external-mcp/__tests__/external-mcp-operations.unit.test.ts`. Edits (each once):
  `import { InMemoryExternalMcpServerRepo } from "../../../../features/external-mcp/external-mcp-store.memory.js";` -> `import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";`
  `import { saveExternalMcpServer } from "../../../../features/external-mcp/external-mcp-store.js";` -> `import { saveExternalMcpServer } from "../external-mcp-store.js";`
  `import { ExternalMcpReauthRequiredError } from "../../../../features/external-mcp/external-mcp-oauth.js";` -> `import { ExternalMcpReauthRequiredError } from "../external-mcp-oauth.js";`
  (`../external-mcp-probe.js` and `../external-mcp-admissions.js` stay byte-identical: they now resolve to the T1/T2 files.) Then `rg -n "\.\./\.\./\.\./" <new file>` must print nothing; if it prints a line, that is an import the sheet did not map: STOP.
- `server/runtime/services/__tests__/external-mcp-admissions.observability.unit.test.ts` -> NEW `features/external-mcp/__tests__/external-mcp-admissions.observability.unit.test.ts`, byte for byte (its imports are `#src/…` and `../external-mcp-admissions.js`, both still valid). Same `rg` check.

### T5. Importer edits (each OLD occurs exactly once)
- `server/inbound/admin-http/routes/external-mcp/probe.ts`: `import { probeExternalMcpServer, type ExternalMcpProbeServiceDeps } from "#src/server/runtime/services/external-mcp-probe";` -> `import { probeExternalMcpServer, type ExternalMcpProbeServiceDeps } from "#src/features/external-mcp/external-mcp-probe";` and DELETE the line `export type { ExternalMcpProbeSessionFactory } from "#src/server/runtime/services/external-mcp-probe";` (re-export shell; its one importer is repointed below).
- `server/__tests__/admin-external-mcp-probe-routes.test.ts`: `import type { ExternalMcpProbeRouteDeps, ExternalMcpProbeSessionFactory } from "../inbound/admin-http/routes/external-mcp/probe.js";` -> two lines: `import type { ExternalMcpProbeSessionFactory } from "@jini-ai/mcp/federation/hosted";` then `import type { ExternalMcpProbeRouteDeps } from "../inbound/admin-http/routes/external-mcp/probe.js";`
- `server/inbound/admin-http/routes/external-mcp/admissions.ts`: `import { readServerAdmissions } from "#src/server/runtime/services/external-mcp-admissions";` -> `import { readServerAdmissions } from "#src/features/external-mcp/external-mcp-admissions";`
- `server/runtime/composition/tool-catalog-manifest.ts` (TEXT-guarded): `import { probeExternalMcpServer } from "#src/server/runtime/services/external-mcp-probe";` -> `import { probeExternalMcpServer } from "#src/features/external-mcp/external-mcp-probe";` and `import { readServerAdmissions } from "#src/server/runtime/services/external-mcp-admissions";` -> `import { readServerAdmissions } from "#src/features/external-mcp/external-mcp-admissions";`
- `server/runtime/composition/modules/assistant-server-federation.ts`: `import { readServerAdmissions } from "../../services/external-mcp-admissions.js";` -> `import { readServerAdmissions } from "#src/features/external-mcp/external-mcp-admissions";`
- `server/runtime/composition/modules/__tests__/assistant-cold-start.unit.test.ts`: `import { readServerAdmissions } from "../../../services/external-mcp-admissions.js";` -> `import { readServerAdmissions } from "#src/features/external-mcp/external-mcp-admissions";`
- `features/credential-safety/__tests__/probes-and-cards.test.ts` (TEXT-guarded): `import { probeExternalMcpServer } from '../../../server/runtime/services/external-mcp-probe.js';` -> `import { probeExternalMcpServer } from '../../external-mcp/external-mcp-probe.js';`

### T6. Typed-failure plumbing in Tovu
- `features/external-mcp/external-mcp-store.ts`: `): Promise<{ configs: ExternalMcpServerConfig[]; failures: { serverId: string; reason: string }[] }> {` -> `): Promise<{ configs: ExternalMcpServerConfig[]; failures: ExternalMcpConfigFailure[] }> {` and after the exact line `import type { UUID } from "@jini-ai/core/primitives";` insert `import type { ExternalMcpConfigFailure } from "@jini-ai/core/contracts/hosted-mcp";`
- `features/external-mcp/__tests__/external-mcp-oauth.test.ts` (the Jini change adds the field to this reauth entry; tightening, not removal): `    { serverId: SERVER, reason: "its authorization expired or was revoked — reconnect it in Settings → External MCP" },` -> `    { serverId: SERVER, reason: "its authorization expired or was revoked — reconnect it in Settings → External MCP", category: "reauth_required" },`

### T7. Baselines and path literals
- `development/scripts/src-complexity-debt.json`: delete the entry for the deleted function. OLD (lines 395-402):
```
    },
    {
      "file": "apps/website/src/server/runtime/services/external-mcp-admissions.ts",
      "function": "readServerAdmissions#1",
      "line": 23,
      "rule": "complexity",
      "value": 11
    }
```
NEW:
```
    }
```
Then validate the JSON (COMMON checks).
- `development/refactor-patterns/user-facing-errors.terra-prompt.md`: `33. \`apps/website/src/server/runtime/services/external-mcp-admissions.ts:37\` - "external-mcp server admissions read failed"` -> `33. \`apps/website/src/features/external-mcp/external-mcp-admissions.ts\` (reportAdmissionsFailure) - "external-mcp server admissions read failed"`

### T8. Re-census + checks + commit
Re-run the census: the only hits naming `runtime/services` must be none; `rg -n "server/runtime/services" apps development content --glob '!**/node_modules/**'` prints nothing (the `services/` folder is now empty: confirm `git ls-files apps/website/src/server/runtime/services` prints nothing). eslint every touched/new `.ts` (new Jini specifiers `readFederationAdmissions`/`probeExternalMcpServer`/`ExternalMcpConfigFailure` unresolved until D1 link: record, do not fix).
Commit paths (17): new T1, T2, the 2 new test files; deleted 2 service files + 2 old test files; edited probe.ts route, admissions.ts route, admin-external-mcp-probe-routes.test.ts, tool-catalog-manifest.ts, assistant-server-federation.ts, assistant-cold-start.unit.test.ts, probes-and-cards.test.ts, external-mcp-store.ts, external-mcp-oauth.test.ts, src-complexity-debt.json, user-facing-errors.terra-prompt.md.
tovu_msg: `refactor(external-mcp): probe and admissions from @jini-ai/mcp` | body: "Tovu keeps the admin response contract (statuses, legacy codes, copy, settings links), the 5-second wait policy, credential-safe logging, rate limits and permissions; reauthorization is read from Jini's typed category instead of matching reason wording. server/runtime/services is gone."

extra_stops:
- `ExternalMcpOAuthService` has no `tokenResolver` member, or `ExternalMcpToolDeps` lacks any picked key -> STOP (the copied deps type would not compile).
- A J-a OLD text count differs from the stated count -> STOP.
- Any `apps/admin` file needs an edit -> STOP (the admin client is untouched by design).

Cloud run owes: Jini — vitest second-host-store.test.ts (the new case RED on J-a's parent, GREEN on J-a), probe.test.ts, admissions.test.ts; mcp + core typecheck; subpath isolation; size/complexity gates. Tovu (after D1 link) — node:test for both moved tests, admin-external-mcp-probe-routes.test.ts, probes-and-cards.test.ts, assistant-cold-start.unit.test.ts, external-mcp-oauth.test.ts, external-mcp-store.test.ts; website typecheck. Every probe/admissions response must be byte-identical to today (the moved Tovu tests assert them).
