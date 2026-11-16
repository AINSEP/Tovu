/** Tovu's host contract for the optional Jini learning engine. Structural ports let boot defer
 * a new package export until its build exists, without taking the owner's dev server down.
 * Topic and fact shapes are Jini's; the service result stays opaque so contract tests can fake
 * the engine. */
import type { GuideFact, GuideTopic } from "@jini-ai/agentic/core";

export interface SiteGuideService {
  run(input: { caller: { principalId: string }; operation: "overview" | "explain"; topic?: string }, options?: Record<string, never>): Promise<unknown>;
}
export interface SiteGuideEngine {
  createSiteGuide(input: {
    builtInTopics: readonly GuideTopic[];
    authorize: (input: { caller: { principalId: string }; permission: string }) => Promise<boolean>;
    facts: { read(input: { caller: { principalId: string }; topics: readonly string[] }): Promise<Readonly<Record<string, GuideFact>>> };
    loadContributions: (input: { caller: { principalId: string } }) => Promise<{ items: readonly { pluginId: string; topics: readonly GuideTopic[] }[]; refusals: readonly string[] }>;
  }, options?: Record<string, never>): SiteGuideService;
  parseGuideTopics(input: { raw: string }, options?: Record<string, never>):
    { ok: true; descriptors: readonly GuideTopic[] } | { ok: false; reason: string };
}
