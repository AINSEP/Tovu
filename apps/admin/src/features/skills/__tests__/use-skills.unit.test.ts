import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILLS_CHANGED_EVENT, type InstalledSkill } from "../api";
import { useSkills } from "../use-skills.hooks";

afterEach(() => vi.unstubAllGlobals());
const skill: InstalledSkill = {
  toolId: "skill_incident_response", name: "incident-response", description: "Respond to outages.",
  enabled: true, source: "uploaded",
};
const base = "/api/admin/v1/workspaces/workspace-local/skills";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useSkills", () => {
  it("refreshes on the shared event and ignores superseded success and failure", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const third = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSkills());
    expect(result.current.loading).toBe(true);
    act(() => window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT)));
    act(() => window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT)));
    await act(async () => third.resolve(Response.json({ skills: [skill] })));
    await waitFor(() => expect(result.current.skills).toEqual([skill]));
    await act(async () => second.reject(new Error("Stale error")));
    await act(async () => first.resolve(Response.json({ skills: [] })));
    expect(result.current.skills).toEqual([skill]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retains loaded rows on reload failure and removes its refresh listener on unmount", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ skills: [skill] })).mockRejectedValueOnce(new Error("Offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useSkills());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await act(async () => { await result.current.reload(); });
    expect(result.current.error).toBe("Offline");
    expect(result.current.skills).toEqual([skill]);
    unmount();
    window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps mutation errors and refuses remove cancellation while the API is busy", async () => {
    const deletion = deferred<Response>();
    const fetchMock = vi.fn(async (url, init) => {
      if (init?.method === "DELETE") {
        expect(url).toBe(`${base}/${skill.toolId}`);
        return deletion.promise;
      }
      expect(url).toBe(base);
      return Response.json({ skills: [skill] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSkills());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.rows[0]!.onRemove());
    act(() => result.current.onConfirmRemove());
    expect(result.current.busy).toBe(true);
    expect(result.current.rows[0]!.busy).toBe(true);
    expect(result.current.githubDisabled).toBe(true);
    act(() => result.current.onCancelRemove());
    expect(result.current.removing).toEqual(skill);
    await act(async () => deletion.resolve(Response.json({ error: "Cannot remove" }, { status: 500 })));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.error).toBe("Cannot remove");
    expect(result.current.removing).toEqual(skill);
    act(() => result.current.onCancelRemove());
    expect(result.current.removing).toBeNull();
  });

  it("toggles through the existing API and reloads the confirmed enabled state", async () => {
    let installed = skill;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (init?.method === "PATCH") {
        expect(url).toBe(`${base}/${skill.toolId}`);
        expect(JSON.parse(init.body)).toEqual({ enabled: false });
        installed = { ...skill, enabled: false };
        return Response.json({ updated: true });
      }
      expect(url).toBe(base);
      return Response.json({ skills: [installed] });
    }));
    const { result } = renderHook(() => useSkills());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.rows[0]!.onToggleEnabled());
    await waitFor(() => expect(result.current.rows[0]!.skill.enabled).toBe(false));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.error).toBeNull();
  });
});
