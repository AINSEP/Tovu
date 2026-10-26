import { afterEach, describe, expect, it, vi } from "vitest";

import { createInstalledSkillsComposerCapabilitySource } from "../installed-skills-composer-source";

/**
 * @file Regression coverage for the installed-skills `ComposerCapabilitySource`
 * (`skills-composer-typeahead` Phase 1B, C-004) — the browser-side consumer of
 * `GET /api/admin/v1/workspaces/:workspaceId/skills` (Phase 1A). `fetch` is injected via
 * `vi.stubGlobal` rather than hitting a real server, so these assert this source's own
 * mapping/degradation contract in isolation. The real route is covered end to end by the
 * integration tests, and the
 * degrade-to-empty property this file asserts directly is what INV-001
 * (`composer-capabilities.ts`'s duplicate-id/rejection guard) depends on to keep a routine
 * fetch failure from taking the whole composer menu down.

 */

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; headers?: HeadersInit } = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? (init.ok === false ? 500 : 200), ...(init.headers ? { headers: init.headers } : {}) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createInstalledSkillsComposerCapabilitySource", () => {
  it("caches reads, preserves identity on 304 and an equal ETag, and replaces a changed 200", async () => {
    const skill = { toolId: "skill_one", name: "one", description: "First" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ skills: [skill, { ...skill, toolId: "skill_disabled", enabled: false }] }, { headers: { ETag: 'W/"one"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(jsonResponse({ skills: [{ ...skill, description: "Changed" }] }, { headers: { ETag: 'W/"two"' } }))
      .mockResolvedValueOnce(jsonResponse({ skills: [{ ...skill, description: "Changed" }] }, { headers: { ETag: 'W/"two"' } }));
    vi.stubGlobal("fetch", fetchMock);
    const source = createInstalledSkillsComposerCapabilitySource();
    const first = await source.list();
    expect(first).toHaveLength(1);
    expect(await source.list()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await source.reload()).toBe(first);
    expect(fetchMock.mock.calls[1]?.[1].headers["If-None-Match"]).toBe('W/"one"');
    const changed = await source.reload();
    expect(changed).not.toBe(first);
    expect(changed[0]?.item.description).toBe("Changed");
    expect(await source.reload()).toBe(changed);
    expect(fetchMock.mock.calls[3]?.[1].headers["If-None-Match"]).toBe('W/"two"');
  });

  it("never caches malformed or failed initial responses, including an unbacked 304", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(jsonResponse({ notSkills: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ skills: [{ toolId: "skill_recovered", name: "Recovered", description: "Ready" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const source = createInstalledSkillsComposerCapabilitySource();
    for (let attempt = 0; attempt < 3; attempt++) expect(await source.list()).toEqual([]);
    expect((await source.list())[0]?.item.id).toBe("installed-skill:skill_recovered");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("keeps the last good list when a revalidation fails, without caching the failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ skills: [{ toolId: "skill_one", name: "one", description: "First" }] }, { headers: { ETag: 'W/"one"' } }))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);
    const source = createInstalledSkillsComposerCapabilitySource();
    const first = await source.list();
    expect(await source.reload()).toBe(first);
    expect(await source.reload()).toBe(first);
    expect(fetchMock.mock.calls[2]?.[1].headers["If-None-Match"]).toBe('W/"one"');
  });

  it("deduplicates pending reads and lets force supersede an older response with its validator", async () => {
    let release!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ skills: [] }, { headers: { ETag: 'W/"initial"' } }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ skills: [{ toolId: "skill_new", name: "New", description: "Current" }] }, { headers: { ETag: 'W/"new"' } }));
    vi.stubGlobal("fetch", fetchMock);
    const source = createInstalledSkillsComposerCapabilitySource();
    const initial = source.list();
    expect(source.list()).toBe(initial);
    await initial;
    const older = source.reload();
    expect(source.reload()).toBe(older);
    const forced = await source.reload({}, { force: true });
    expect(fetchMock.mock.calls[2]?.[1].headers["If-None-Match"]).toBe('W/"initial"');
    release(jsonResponse({ skills: [] }, { headers: { ETag: 'W/"old"' } }));
    await older;
    expect(await source.list()).toBe(forced);
    expect(forced[0]?.item.id).toBe("installed-skill:skill_new");
  });

  it("silently degrades when navigation cancels installed-skills enumeration", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const cancellation = new DOMException("request cancelled: the page is unloading", "AbortError");
    const request = vi.fn(async () => { throw cancellation; });
    const source = createInstalledSkillsComposerCapabilitySource({}, { request });

    await expect(source.list()).resolves.toEqual([]);
    expect(request).toHaveBeenCalledExactlyOnceWith({ path: "/workspaces/workspace-local/skills", method: "GET" }, {
      headers: {}, onOk: expect.any(Function),
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("still reports a genuine enumeration failure while preserving the bundled-catalog fallback", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new TypeError("fetch failed");
    const source = createInstalledSkillsComposerCapabilitySource({}, {
      request: async () => { throw failure; },
    });

    await expect(source.list()).resolves.toEqual([]);
    expect(errorLog).toHaveBeenCalledExactlyOnceWith(
      "[installed-skills-composer-source] installed-skills enumeration failed; falling back to the bundled catalog only",
      failure,
    );
  });

  it("maps a real installed-skill summary into a capability with an installed-skill: id and a guidance-loading resolve", async () => {
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
    expect(binding).toEqual({ kind: "installed-skill", toolId: "skill_incident_response" });

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
