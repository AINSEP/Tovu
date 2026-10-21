/**
 * @file DNS plan / instructions / verify over the Jini DNS kernel (`@jini-ai/devops/dns`, lots D1–D3).
 *
 * Planning and verification are the kernel's; this file only orders the steps for one Tovu
 * workspace: requirements (from the caller or the saved `domain_binding`) → zone → NS delegation
 * → current records → plan. Nothing here writes DNS (no apply engine in v1): a person enters the
 * `dns_instructions` rows at their DNS host, then `dns_verify` checks the authoritative servers.
 *
 * `verifyDomainDns` is the single writer of `domain_binding.status`.
 */
import { ToolInputError } from "@jini-ai/core";
import {
  canonicalJson,
  checkDelegation,
  isExpired,
  MANUAL_DNS_PROVIDER_ID,
  nextCheckDelayMs,
  normalizeDnsName,
  planDnsChanges,
  renderDnsInstructions,
  settlePort,
  verifyRequirements,
  type AuthoritativeDnsPort,
  type DelegationCheck,
  type DnsChangePlan,
  type DnsInstructions,
  type DnsInventory,
  type DnsPlanRequirement,
  type DnsProvider,
  type DnsProviderContext,
  type DnsProviderRegistry,
  type DnsRecord,
  type DnsVerification,
} from "@jini-ai/devops/dns";
import type { DomainBinding, DomainBindingStatus, DomainBindingStore } from "./binding.repo.js";
import { withMailRequirements, type DnsRequirementInclude, type MailRequirementsPort } from "./mail-requirements.js";

/** Kernel blockers plus the host-level ones found before a plan can be trusted. */
export interface DomainDnsBlocker {
  code: string;
  name: string;
  message: string;
  suggestion?: string;
}

export interface DomainDnsPlan {
  hostname: string;
  providerId: string;
  zone: string;
  /** False when no zone could be located; the zone shown is then the hostname itself. */
  zoneFound: boolean;
  delegation: DelegationCheck | null;
  plan: DnsChangePlan;
  blockers: DomainDnsBlocker[];
}

/** Ports for one workspace. `context` carries the pre-resolved provider credentials. */
export interface DnsChangePorts {
  registry: DnsProviderRegistry;
  resolver: AuthoritativeDnsPort;
  context: DnsProviderContext;
  bindings?: DomainBindingStore;
  /** The resolved mailer's `domainRequirements`, read for `include: ["mail"]`. Absent: that include refuses. */
  mailRequirements?: MailRequirementsPort;
}

/** A hostname, optionally its requirements, and what to add to them. */
export interface DnsChangeRequest {
  hostname: string;
  requirements?: DnsPlanRequirement[];
  include?: DnsRequirementInclude[];
}

interface Target {
  hostname: string;
  providerId: string;
  provider: DnsProvider;
  requirements: DnsPlanRequirement[];
  binding: DomainBinding | null;
}

interface Zone { zone: string; ref: string; found: boolean }

/** The registered provider, or a caller error naming the saved id. */
function providerFor(required: { providerId: string; hostname: string; errorPrefix: string }, ports: DnsChangePorts): DnsProvider {
  const provider = ports.registry.get({ id: required.providerId })?.provider;
  if (provider === undefined) throw new ToolInputError({ message: `${required.errorPrefix}: the DNS provider '${required.providerId}' saved for ${required.hostname} is not installed.` });
  return provider;
}

/**
 * Caller requirements win; otherwise the binding's persisted ones. `include: ["mail"]` then adds the
 * active mail provider's records (through the port). No requirements is a caller error.
 */
async function resolveTarget(required: DnsChangeRequest & { errorPrefix: string }, ports: DnsChangePorts): Promise<Target> {
  const binding = (await ports.bindings?.get({ hostname: required.hostname })) ?? null;
  const providerId = binding?.providerId ?? MANUAL_DNS_PROVIDER_ID;
  const provider = providerFor({ ...required, providerId }, ports);
  const base = required.requirements ?? binding?.requirements ?? [];
  const requirements = required.include?.includes("mail") ? await withMailRequirements({ ...required, requirements: base }, { ...ports, provider }) : base;
  if (requirements.length === 0) {
    throw new ToolInputError({ message: `${required.errorPrefix}: no DNS requirements are saved for ${required.hostname}; pass requirements (the records the host or mail provider asked for).` });
  }
  return { hostname: required.hostname, providerId, provider, requirements, binding };
}

/** The provider's zone for the hostname; the saved zone (or the hostname) when none answers. */
async function locateZone(target: Target, ports: DnsChangePorts): Promise<Zone> {
  const result = await settlePort({ call: () => target.provider.findZone(ports.context, { hostname: target.hostname }) });
  if (result.status === "ok" && result.value !== null) return { zone: result.value.zone, ref: result.value.ref, found: true };
  const fallback = target.binding?.zone ?? target.hostname;
  return { zone: fallback, ref: fallback, found: false };
}

/** Current records at the required names; anything unreadable is `unknown`, never "empty". */
async function listCurrent(target: Target, zone: Zone, ports: DnsChangePorts): Promise<{ records: readonly DnsRecord[]; inventory: DnsInventory }> {
  const names = [...new Set(target.requirements.flatMap(requirement => requirement.records).map(record => normalizeDnsName({ name: record.name })))];
  const result = await settlePort({ call: () => target.provider.listRecords(ports.context, { zoneRef: zone.ref, names }) });
  return result.status === "ok" ? result.value : { records: [], inventory: "unknown" };
}

function hostBlockers(hostname: string, delegation: DelegationCheck | null): DomainDnsBlocker[] {
  // No delegation is read only when no zone was found.
  if (delegation === null) {
    return [{ code: "zone_not_found", name: hostname, message: `No DNS zone serving ${hostname} could be found, so its current records were not read.`, suggestion: "Check that the domain is registered and has nameservers, then plan again." }];
  }
  if (delegation.state === "delegated") return [];
  // Registrar vs DNS host split: records edited at a host the zone is not delegated to resolve nowhere.
  return [{ code: delegation.state === "not_delegated" ? "not_delegated" : "delegation_unknown", name: delegation.zone, message: delegation.reason }];
}

async function planTarget(target: Target, ports: DnsChangePorts): Promise<DomainDnsPlan> {
  const zone = await locateZone(target, ports);
  const delegation = zone.found ? await checkDelegation({ zone: zone.zone }, { resolver: ports.resolver }) : null;
  const current = delegation?.state === "delegated" ? await listCurrent(target, zone, ports) : { records: [], inventory: "unknown" as const };
  const { capabilities } = target.provider;
  const plan = planDnsChanges(
    { providerId: target.providerId, zone: zone.zone, current: current.records, requirements: target.requirements, inventory: current.inventory },
    { apexFlattening: capabilities.apexFlattening, recordTypes: capabilities.recordTypes },
  );
  return { hostname: target.hostname, providerId: target.providerId, zone: zone.zone, zoneFound: zone.found, delegation, plan, blockers: [...hostBlockers(target.hostname, delegation), ...plan.blockers] };
}

/**
 * Plan the record changes that would satisfy the hostname's requirements. Read-only.
 * @complexity O(names · types) DNS reads for the manual provider, then the kernel's O(r·c) plan.
 */
export async function planDomainDns(required: DnsChangeRequest, ports: DnsChangePorts): Promise<DomainDnsPlan> {
  return planTarget(await resolveTarget({ ...required, errorPrefix: "dns_plan" }, ports), ports);
}

/** Copyable rows for a person to enter at their DNS host. A blocked plan still lists what is required. */
export async function domainDnsInstructions(required: DnsChangeRequest, ports: DnsChangePorts): Promise<{ planned: DomainDnsPlan; instructions: DnsInstructions }> {
  const target = await resolveTarget({ ...required, errorPrefix: "dns_instructions" }, ports);
  const planned = await planTarget(target, ports);
  const input = [{ plan: planned.plan }, { requirements: target.requirements }] as const;
  const instructions = target.provider.instructions ? target.provider.instructions(...input) : renderDnsInstructions(...input);
  return { planned, instructions };
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** A propagated check is final; past the 48 h cap anything else is a timeout, reported not hidden. */
function statusFor(required: { state: DnsVerification["state"]; startedAt: string; now: number }): DomainBindingStatus {
  if (required.state === "propagated") return "propagated";
  return isExpired({ startedAt: Date.parse(required.startedAt), now: required.now }) ? "timeout" : required.state;
}

/** New requirements, a new zone or a timed-out binding start a fresh propagation window. */
function restarts(previous: DomainBinding | null, requirements: DnsPlanRequirement[], zone: string): boolean {
  return previous === null || previous.status === "timeout" || previous.zone !== zone
    || canonicalJson({ value: previous.requirements }) !== canonicalJson({ value: requirements });
}

/** Compact, persisted evidence of the last check (no per-nameserver answer dump). */
function summarize(verification: DnsVerification, delegation: DelegationCheck): unknown {
  return {
    state: verification.state, nameservers: verification.nameservers, delegation: delegation.reason,
    ...(verification.reason === undefined ? {} : { reason: verification.reason }),
    records: verification.records.map(({ record, state }) => ({ type: record.type, name: record.name, value: record.value, state })),
  };
}

function nextBinding(required: { target: Target; zone: string; delegation: DelegationCheck; verification: DnsVerification; now: number }): DomainBinding {
  const { target, zone, delegation, verification, now } = required;
  const previous = restarts(target.binding, target.requirements, zone) ? null : target.binding;
  const attempt = previous === null ? 0 : previous.attempt + 1;
  const startedAt = previous === null ? iso(now) : previous.startedAt;
  const status = statusFor({ state: verification.state, startedAt, now });
  const done = status === "propagated" || status === "timeout";
  return {
    hostname: target.hostname, providerId: target.providerId, zone, requirements: target.requirements, status,
    delegation: delegation.state, attempt, startedAt, nextCheckAt: done ? null : iso(now + nextCheckDelayMs({ attempt })),
    lastCheckedAt: iso(now), lastResult: summarize(verification, delegation),
  };
}

export interface DomainDnsVerifyResult {
  binding: DomainBinding;
  delegation: DelegationCheck;
  verification: DnsVerification;
}

/**
 * Start or continue propagation tracking: save the requirements, check every authoritative
 * nameserver once now, and schedule the next check (30 s doubling to 10 min, 48 h cap).
 * @complexity O(records · nameservers) DNS queries plus one keyed upsert.
 */
export async function verifyDomainDns(
  required: DnsChangeRequest,
  ports: DnsChangePorts & { bindings: DomainBindingStore; now: () => number },
): Promise<DomainDnsVerifyResult> {
  const target = await resolveTarget({ ...required, errorPrefix: "dns_verify" }, ports);
  const { zone } = await locateZone(target, ports);
  const delegation = await checkDelegation({ zone }, { resolver: ports.resolver });
  const verification = await verifyRequirements({ zone, requirements: target.requirements }, { resolver: ports.resolver });
  const now = ports.now();
  const binding = nextBinding({ target, zone, delegation, verification, now });
  await ports.bindings.put({ binding, now: iso(now) });
  return { binding, delegation, verification };
}

/**
 * One sweep over this workspace's due bindings, oldest first and one at a time (each check is
 * already O(records · nameservers) concurrent queries). Returns the hostnames checked.
 */
export async function verifyDueDomainBindings(
  required: { limit: number },
  ports: DnsChangePorts & { bindings: DomainBindingStore; now: () => number },
): Promise<string[]> {
  const due = await ports.bindings.listDue({ now: iso(ports.now()), limit: required.limit });
  const checked: string[] = [];
  for (const binding of due) {
    await verifyDomainDns({ hostname: binding.hostname }, ports);
    checked.push(binding.hostname);
  }
  return checked;
}
