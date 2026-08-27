import { afterEach, describe, expect, it, vi } from "vitest";

import { createInstalledSkillsComposerCapabilitySource } from "../installed-skills-composer-source";

/**
 * @file Regression coverage for the installed-skills `ComposerCapabilitySource`
 * (`skills-composer-typeahead` Phase 1B, C-004) — the browser-side consumer of
 * `GET /api/admin/v1/workspaces/:workspaceId/skills` (Phase 1A). `fetch` is injected via
 * `vi.stubGlobal` rather than hitting a real server, so these assert this source's own
 * mapping/degradation contract in isolation, mirroring
 * `tool-catalog-composer-source.unit.test.ts`'s own precedent for the same reason: the real
 * route is certified end to end by Phase 1A's own integration tests, and the
 * degrade-to-empty property this file asserts directly is what INV-001
 * (`composer-capabilities.ts`'s duplicate-id/rejection guard) depends on to keep a routine
 * fetch failure from taking the whole composer menu down.
 *
 * The happy-path fixture below is the exact `{skills: [...]}` shape the Coordinator verified
 * live against the running server (`curl` against `:3000` with `incident-response` installed),
 * not invented data — see the implementation outline's "Phase 1A is DONE" section.
 */

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createInstalledSkillsComposerCapabilitySource", () => {
  it("maps a real installed-skill summary into a capability with an installed-skill: id and a working compose-text resolve", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        skills: [
          {
            toolId: "skill_incident_response",
            name: "incident-response",
            description:
              "Use when handling production incidents, defining severity and escalation, writing runbooks, or facilitating blameless post-mortems and SLO-driven follow-up.",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const capabilities = await createInstalledSkillsComposerCapabilitySource().list();

    expect(capabilities).toHaveLength(1);
    const [capability] = capabilities;
    expect(capability?.groupId).toBe("installed-skills");
    expect(capability?.item).toEqual({
      id: "installed-skill:skill_incident_response",
      label: "incident-response",
      description:
        "Use when handling production incidents, defining severity and escalation, writing runbooks, or facilitating blameless post-mortems and SLO-driven follow-up.",
      kind: "skill",
      keywords: ["skill", "incident-response"],
      insertText: "",
    });

    // The `resolve` output is what makes this row non-inert (Q2): it must name the real,
    // callable tool id, not just the skill's display name.
    expect(capability?.resolve).toBeTypeOf("function");
    const binding = capability?.resolve?.(undefined);
    expect(binding?.kind).toBe("compose-text");
    expect((binding as { text: string }).text).toContain("skill_incident_response");

    // The route this source actually calls, same-origin, workspace-scoped.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/skills");
    expect(init).toMatchObject({ credentials: "same-origin" });
  });

  it("degrades to an empty list on a non-2xx response, rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, { ok: false, status: 500 })));

    await expect(createInstalledSkillsComposerCapabilitySource().list()).resolves.toEqual([]);
  });

  it("degrades to an empty list on a network failure, rather than rejecting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    // The load-bearing assertion (INV-001): this must RESOLVE, not reject —
    // `projectComposerCapabilities` runs every source through one `Promise.all`, so a
    // rejection here would take the bundled catalog down with it (see this source's own
    // module doc).
    await expect(createInstalledSkillsComposerCapabilitySource().list()).resolves.toEqual([]);
  });

  it("degrades to an empty list on a malformed body — no 'skills' array — rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ notSkills: [] })));

    await expect(createInstalledSkillsComposerCapabilitySource().list()).resolves.toEqual([]);
  });

  it("filters out a malformed individual entry rather than letting it corrupt the whole batch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          skills: [
            { toolId: "skill_incident_response", name: "incident-response", description: "Real entry." },
            { toolId: 42, name: "not a string id", description: "bad" },
            { toolId: "skill_missing_fields" },
          ],
        }),
      ),
    );

    const capabilities = await createInstalledSkillsComposerCapabilitySource().list();

    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]?.item.id).toBe("installed-skill:skill_incident_response");
  });
});
