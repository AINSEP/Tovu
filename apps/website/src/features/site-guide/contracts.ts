/** Tovu's host contract for the optional Jini learning engine. Structural ports let boot defer
 * a new package export until its build exists, without taking the owner's dev server down. */
export interface CapabilityCard {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly explanation: string;
  readonly permissions: readonly string[];
  readonly pointers: readonly { readonly label: string; readonly tool?: string; readonly href?: string; readonly permissions: readonly string[] }[];
  readonly workflows: readonly { readonly title: string; readonly steps: readonly string[]; readonly permissions: readonly string[] }[];
}
export type SiteFact = { readonly status: "ok"; readonly data: unknown; readonly truncated?: boolean } | { readonly status: "forbidden" | "unavailable" };
export interface SiteGuideService {
  run(input: { caller: { principalId: string }; operation: "overview" | "explain"; topic?: string }, options?: Record<string, never>): Promise<unknown>;
}
export interface SiteGuideEngine {
  createSiteGuide(input: {
    builtInTopics: readonly CapabilityCard[];
    authorize: (input: { caller: { principalId: string }; permission: string }) => Promise<boolean>;
    facts: { read(input: { caller: { principalId: string }; topics: readonly string[] }): Promise<Readonly<Record<string, SiteFact>>> };
    loadContributions: (input: { caller: { principalId: string } }) => Promise<{ items: readonly { pluginId: string; topics: readonly CapabilityCard[] }[]; refusals: readonly string[] }>;
  }, options?: Record<string, never>): SiteGuideService;
  parseGuideTopics(input: { raw: string }, options?: Record<string, never>):
    { ok: true; descriptors: readonly CapabilityCard[] } | { ok: false; reason: string };
}
