import { act, render, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILLS_CHANGED_EVENT, type InstalledSkill } from "../api";
import { useSkills } from "../use-skills.hooks";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
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

function skillsPort() {
  return {
    listSkills: async () => [skill],
    enableSkill: async (_id: string, _enabled: boolean): Promise<void> => { throw new Error("Unexpected skill toggle"); },
    removeSkill: async (_id: string): Promise<void> => { throw new Error("Unexpected skill removal"); },
  };
}

describe("useSkills", () => {
  it("finishes an accepted install and returns to Skills even when refreshing the list fails", async () => {
    window.history.replaceState(null, "", "/admin/addons/skills?tab=add");
    let accepted = false;
    const port = { ...skillsPort(), listSkills: async () => {
      if (accepted) throw new Error("Refresh unavailable");
      return [skill];
    } };
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe(base);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ githubUrl: "https://github.com/acme/skill", confirmed: true });
      accepted = true;
      return Response.json({ skill });
    });
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.skills).toEqual([skill]));
    act(() => result.current.install.propose({ githubUrl: "https://github.com/acme/skill" }));
    await act(async () => { await result.current.install.confirm(); });
    expect(accepted).toBe(true);
    expect(result.current.install.pending).toBeNull();
    expect(result.current.install.error).toBeNull();
    expect(result.current.install.busy).toBe(false);
    expect(result.current.activeTabId).toBe("skills");
    expect(result.current.error).toBe("Refresh unavailable");
    expect(result.current.skills).toEqual([skill]);
  });

  it("closes accepted removal confirmation even when refreshing the remaining list fails", async () => {
    let installed = [skill];
    const port = { ...skillsPort(), listSkills: async () => {
      if (!installed.length) throw new Error("Refresh unavailable");
      return installed;
    }, removeSkill: async (id: string) => { expect(id).toBe(skill.toolId); installed = []; } };
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.rows[0]!.onRemove());
    act(() => result.current.onConfirmRemove());
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(installed).toEqual([]);
    expect(result.current.removing).toBeNull();
    expect(result.current.error).toBe("Refresh unavailable");
  });

  it("does not navigate when an install completes after the screen unmounts", async () => {
    window.history.replaceState(null, "", "/admin/addons/skills?tab=add");
    const response = deferred<Response>();
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe(base);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ githubUrl: "https://github.com/acme/skill", confirmed: true });
      return response.promise;
    });
    const port = skillsPort();
    const { result, unmount } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.install.propose({ githubUrl: "https://github.com/acme/skill" }));
    let completion!: Promise<void>;
    act(() => { completion = result.current.install.confirm(); });
    unmount();
    await act(async () => { response.resolve(Response.json({ skill })); await completion; });
    expect(window.location.pathname + window.location.search).toBe("/admin/addons/skills?tab=add");
  });

  it.each(["accepted", "refused"] as const)("settles a pending removal %s after leaving the screen", async outcome => {
    const removal = deferred<void>();
    let installed = [skill];
    let writes = 0;
    const readbacks: InstalledSkill[][] = [];
    const port = { ...skillsPort(), listSkills: async () => {
      readbacks.push([...installed]);
      return installed;
    }, removeSkill: async (id: string) => {
      expect(id).toBe(skill.toolId);
      writes++;
      await removal.promise;
      installed = [];
    } };
    const { result, unmount } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.rows[0]!.onRemove());
    act(() => result.current.onConfirmRemove());
    await waitFor(() => expect(writes).toBe(1));
    unmount();
    await act(async () => {
      if (outcome === "accepted") removal.resolve();
      else removal.reject(new Error("Removal refused"));
      await removal.promise.catch(() => {});
    });
    expect(writes).toBe(1);
    expect(installed).toEqual(outcome === "accepted" ? [] : [skill]);
    expect(readbacks).toEqual(outcome === "accepted" ? [[skill], []] : [[skill]]);
  });

  it("shows the load fallback for a non-Error rejection and recovers on reload", async () => {
    let offline = true;
    const port = { ...skillsPort(), listSkills: async () => { if (offline) throw "offline"; return [skill]; } };
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.error).toBe("Could not load skills."));
    expect(result.current.loading).toBe(false);
    expect(result.current.skills).toBeNull();
    offline = false;
    await act(async () => { await result.current.reload(); });
    expect(result.current.error).toBeNull();
    expect(result.current.skills).toEqual([skill]);
  });

  it("shows the change fallback for non-Error failures and clears it after a successful retry", async () => {
    let fail = true;
    let installed = skill;
    const port = { ...skillsPort(), listSkills: async () => [installed], enableSkill: async (id: string, enabled: boolean) => {
      expect(id).toBe(skill.toolId);
      if (fail) throw "offline";
      installed = { ...skill, enabled };
    } };
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.rows[0]!.onToggleEnabled());
    await waitFor(() => expect(result.current.error).toBe("Could not change skill."));
    expect(result.current.busy).toBe(false);
    expect(result.current.rows[0]!.skill.enabled).toBe(true);
    fail = false;
    act(() => result.current.rows[0]!.onToggleEnabled());
    await waitFor(() => expect(result.current.rows[0]!.skill.enabled).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it("opens and closes inspection and expands then collapses the selected skill", async () => {
    const port = skillsPort();
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.rows[0]!.onToggleExpanded());
    expect(result.current.rows[0]!.expanded).toBe(true);
    act(() => result.current.rows[0]!.onToggleExpanded());
    expect(result.current.rows[0]!.expanded).toBe(false);
    act(() => result.current.rows[0]!.onInspect());
    expect(result.current.inspecting).toEqual(skill);
    act(() => result.current.onCloseFiles());
    expect(result.current.inspecting).toBeNull();
  });

  it("confirming without a selected skill leaves the list unchanged", async () => {
    const removed: string[] = [];
    const port = { ...skillsPort(), removeSkill: async (id: string) => { removed.push(id); } };
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.onConfirmRemove());
    expect(result.current.removing).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.skills).toEqual([skill]);
    expect(removed).toEqual([]);
  });

  it("opens each native picker and tolerates detached picker refs", () => {
    let controller!: ReturnType<typeof useSkills>;
    let fileClicks = 0;
    let folderClicks = 0;
    const port = skillsPort();
    function Pickers() {
      controller = useSkills({ port });
      return createElement("div", null,
        createElement("input", { type: "file", ref: controller.filesInput, onClick: () => { fileClicks++; } }),
        createElement("input", { type: "file", ref: controller.folderInput, onClick: () => { folderClicks++; } }));
    }
    const { unmount } = render(createElement(Pickers));
    act(() => { controller.onChooseFiles(); controller.onChooseFolder(); });
    expect([fileClicks, folderClicks]).toEqual([1, 1]);
    unmount();
    controller.onChooseFiles();
    controller.onChooseFolder();
    expect([fileClicks, folderClicks]).toEqual([1, 1]);
  });

  it("clears a cancelled file selection without proposing an install", async () => {
    const port = skillsPort();
    const { result } = renderHook(() => useSkills({ port }));
    const target = { files: null, value: "previous-selection" };
    await act(async () => result.current.onFilesChange({ target } as unknown as Parameters<typeof result.current.onFilesChange>[0]));
    expect(target.value).toBe("");
    expect(result.current.install.pending).toBeNull();
    expect(result.current.install.error).toBe("Choose up to 256 files, 8 MiB total.");
  });

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

it.each([{ installed: [] }, { installed: [skill] }])("keeps list availability consistent before and after loading %j", async ({ installed }) => {
  const read = deferred<InstalledSkill[]>();
  const port = { ...skillsPort(), listSkills: () => read.promise };
  const { result } = renderHook(() => useSkills({ port }));
  expect(result.current.loading).toBe(true);
  // Availability now exposes a boolean; loading must not display an empty-list state.
  expect(result.current.empty).toBe(false);
  expect(result.current.addBusy).toBe(false);
  expect(result.current.githubDisabled).toBe(true);
  act(() => result.current.onGithubUrlChange({ target: { value: "   " } } as Parameters<typeof result.current.onGithubUrlChange>[0]));
  expect(result.current.githubDisabled).toBe(true);
  act(() => result.current.onGithubUrlChange({ target: { value: " https://github.com/acme/skill " } } as Parameters<typeof result.current.onGithubUrlChange>[0]));
  expect(result.current.githubDisabled).toBe(false);
  await act(async () => read.resolve(installed));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.empty).toBe(installed.length === 0);
  expect(result.current.skills).toEqual(installed);
});

it("disables GitHub submission during an install and restores it after acceptance", async () => {
  const response = deferred<Response>();
  vi.stubGlobal("fetch", () => response.promise);
  const port = skillsPort();
  const { result } = renderHook(() => useSkills({ port }));
  await waitFor(() => expect(result.current.rows).toHaveLength(1));
  act(() => {
    result.current.onGithubUrlChange({ target: { value: "https://github.com/acme/skill" } } as Parameters<typeof result.current.onGithubUrlChange>[0]);
    result.current.install.propose({ githubUrl: "https://github.com/acme/skill" });
  });
  expect(result.current.githubDisabled).toBe(false);
  let completion!: Promise<void>;
  act(() => { completion = result.current.install.confirm(); });
  expect(result.current.busy).toBe(false);
  expect(result.current.addBusy).toBe(true);
  expect(result.current.githubDisabled).toBe(true);
  await act(async () => { response.resolve(Response.json({ skill })); await completion; });
  expect(result.current.addBusy).toBe(false);
  expect(result.current.githubDisabled).toBe(false);
});
