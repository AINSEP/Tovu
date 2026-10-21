/** @file In-memory DNS fakes shared by the DNS change tests: no network, deterministic answers. */
import { providerOk, providerRejected, providerUnknown, type ProviderResult } from "@jini-ai/core/provider-registry";
import type { AuthoritativeDnsPort, DnsPlanRequirement, DnsProviderContext } from "@jini-ai/devops/dns";
import type { DomainBinding, DomainBindingStore } from "../binding.repo.js";

/**
 * `zones`: zone → its NS set (absent = NXDOMAIN, `"unknown"` = transport failure).
 * `records`: `name|type` → answers on every nameserver, or `ns|name|type` for one nameserver;
 * `"unknown"` = transport failure. Unlisted names answer NODATA.
 */
export function fakeAuthoritative(required: { zones: Record<string, string[] | "unknown">; records?: Record<string, string[] | "unknown"> }): AuthoritativeDnsPort & { calls: string[] } {
  const calls: string[] = [];
  const records = required.records ?? {};
  return {
    calls,
    queryNs: async ({ zone }): Promise<ProviderResult<readonly string[]>> => {
      calls.push(`ns:${zone}`);
      const set = required.zones[zone];
      if (set === "unknown") return providerUnknown({ code: "timeout", message: "slow" });
      return set === undefined ? providerRejected({ code: "not_found", message: "nx" }) : providerOk({ value: set });
    },
    query: async ({ name, type, nameserver }) => {
      calls.push(`q:${nameserver}:${name}:${type}`);
      const answers = records[`${nameserver}|${name}|${type}`] ?? records[`${name}|${type}`] ?? [];
      return answers === "unknown" ? providerUnknown({ code: "timeout", message: "slow" }) : providerOk({ value: { answers, ttl: 300 } });
    },
  };
}

export const context: DnsProviderContext = { workspaceId: "ws", mode: "live", credentials: {}, httpClient: { send: async () => { throw new Error("no network in tests"); } }, now: () => 0 };

export const siteRequirement = (value = "203.0.113.10"): DnsPlanRequirement => ({ purpose: "site", domain: "www.example.com", providerId: "host", records: [{ type: "A", name: "www.example.com", value }] });

export const mailRequirement: DnsPlanRequirement = {
  purpose: "mail", domain: "example.com", providerId: "mailer",
  records: [{ type: "MX", name: "example.com", value: "mx.mailer.test", priority: 10 }, { type: "TXT", name: "example.com", value: "v=spf1 include:mailer.test ~all" }],
};

/** A Map-backed binding store recording each write, with the SQL store's compare-and-swap semantics. */
export function memoryBindings(initial: DomainBinding[] = []): DomainBindingStore & { rows: Map<string, DomainBinding>; writes: DomainBinding[]; refused: DomainBinding[] } {
  const rows = new Map(initial.map(binding => [binding.hostname, binding]));
  const writes: DomainBinding[] = [];
  const refused: DomainBinding[] = [];
  return {
    rows, writes, refused,
    get: async ({ hostname }) => rows.get(hostname) ?? null,
    put: async ({ binding, expectedVersion }) => {
      if ((rows.get(binding.hostname)?.version ?? null) !== expectedVersion) {
        refused.push(binding);
        return false;
      }
      rows.set(binding.hostname, binding);
      writes.push(binding);
      return true;
    },
    listDue: async ({ now, limit }) => [...rows.values()].filter(binding => binding.nextCheckAt !== null && binding.nextCheckAt <= now).sort((a, b) => a.nextCheckAt!.localeCompare(b.nextCheckAt!)).slice(0, limit),
  };
}
