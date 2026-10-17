// @vitest-environment jsdom
import { File as NativeFile } from "node:buffer";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { SkillInstallPayload } from "../api";
import { useSkillInstall } from "../use-skill-install.hooks";

afterEach(() => vi.unstubAllGlobals());

const proposal: SkillInstallPayload = { githubUrl: "https://github.com/acme/skill" };
const replacement: SkillInstallPayload = { githubUrl: "https://github.com/acme/new-skill" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** A browser File read whose completion the test controls; the upload implementation stays real. */
function heldFile(read: ReturnType<typeof deferred<ArrayBuffer>>) {
  return { name: "SKILL.md", size: 5, arrayBuffer: () => read.promise } as File;
}

function installEndpoint(response: () => Promise<Response> = async () => Response.json({ skill: {} })) {
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/skills");
    expect(init?.method).toBe("POST");
    requests.push(JSON.parse(String(init?.body)));
    return response();
  });
  return requests;
}

it("confirming without a proposal sends no install request", async () => {
  const requests = installEndpoint();
  const { result } = renderHook(() => useSkillInstall());
  await act(async () => { await result.current.confirm(); });
  expect(requests).toEqual([]);
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toBeNull();
});

it("a file selection error is shown and a new proposal clears it", async () => {
  const { result } = renderHook(() => useSkillInstall());
  await act(async () => { await result.current.proposeFiles([]); });
  expect(result.current.error).toBe("Choose up to 256 files, 8 MiB total.");
  expect(result.current.pending).toBeNull();
  act(() => result.current.propose(proposal));
  expect(result.current.error).toBeNull();
  expect(result.current.pending).toEqual(proposal);
});

it("a non-Error thrown by the browser file reader uses the safe read fallback", async () => {
  const file = { name: "SKILL.md", size: 5, arrayBuffer: () => { throw "reader unavailable"; } } as unknown as File;
  const { result } = renderHook(() => useSkillInstall());
  await act(async () => { await result.current.proposeFiles([file]); });
  expect(result.current.error).toBe("Could not read skill.");
  expect(result.current.pending).toBeNull();
});

it("a superseded file read failure cannot replace the newer proposal or its error", async () => {
  const read = deferred<ArrayBuffer>();
  const { result } = renderHook(() => useSkillInstall());
  let completion!: Promise<void>;
  act(() => { completion = result.current.proposeFiles([heldFile(read)]); });
  act(() => { result.current.propose(replacement); result.current.fail("New proposal needs review"); });
  await act(async () => { read.reject(new Error("old disk failure")); await completion; });
  expect(result.current.pending).toEqual(replacement);
  expect(result.current.error).toBe("New proposal needs review");
});

it("cancel invalidates a pending file read and clears a displayed error", async () => {
  const read = deferred<ArrayBuffer>();
  const { result } = renderHook(() => useSkillInstall());
  let completion!: Promise<void>;
  act(() => { result.current.propose(proposal); completion = result.current.proposeFiles([heldFile(read)]); });
  act(() => result.current.fail("Review interrupted"));
  act(() => result.current.cancel());
  await act(async () => { read.resolve(Uint8Array.of(115, 107, 105, 108, 108).buffer); await completion; });
  expect(result.current.pending).toBeNull();
  expect(result.current.error).toBeNull();
});

it("a current file read preserves the supplied relative path for confirmation", async () => {
  const { result } = renderHook(() => useSkillInstall());
  const file = new NativeFile(["skill"], "SKILL.md") as unknown as File;
  await act(async () => { await result.current.proposeFiles([file], ["folder/SKILL.md"]); });
  expect(result.current.pending).toEqual({ files: [{ path: "folder/SKILL.md", contentBase64: "c2tpbGw=" }] });
  expect(result.current.error).toBeNull();
});

it("an in-flight confirmation ignores duplicate confirms and cancellation", async () => {
  const response = deferred<Response>();
  const requests = installEndpoint(() => response.promise);
  const { result } = renderHook(() => useSkillInstall());
  act(() => result.current.propose(proposal));
  let completion!: Promise<void>;
  act(() => { completion = result.current.confirm(); });
  expect(result.current.busy).toBe(true);
  act(() => result.current.cancel());
  await act(async () => { await result.current.confirm(); });
  expect(result.current.pending).toEqual(proposal);
  expect(requests).toEqual([{ ...proposal, confirmed: true }]);
  await act(async () => { response.resolve(Response.json({ skill: {} })); await completion; });
  expect(result.current.pending).toBeNull();
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toBeNull();
});

it("an older install cannot dismiss a newer proposal and waits for the installed callback", async () => {
  const response = deferred<Response>();
  const refreshed = deferred<void>();
  const started = deferred<void>();
  const requests = installEndpoint(() => response.promise);
  const { result } = renderHook(() => useSkillInstall(async () => { started.resolve(); await refreshed.promise; }));
  act(() => result.current.propose(proposal));
  let completion!: Promise<void>;
  act(() => { completion = result.current.confirm(); });
  act(() => result.current.propose(replacement));
  await act(async () => { response.resolve(Response.json({ skill: {} })); await started.promise; });
  expect(result.current.pending).toEqual(replacement);
  expect(result.current.busy).toBe(true);
  await act(async () => { refreshed.resolve(); await completion; });
  expect(result.current.pending).toEqual(replacement);
  expect(result.current.busy).toBe(false);
  expect(requests).toEqual([{ ...proposal, confirmed: true }]);
});

it("a refused install retains the proposal and releases the confirmation lock for retry", async () => {
  let refused = true;
  const requests = installEndpoint(async () => refused
    ? Response.json({ error: "Skill archive refused" }, { status: 400 })
    : Response.json({ skill: {} }));
  let installed = 0;
  const { result } = renderHook(() => useSkillInstall(() => { installed++; }));
  act(() => result.current.propose(proposal));
  await act(async () => { await result.current.confirm(); });
  expect(result.current.error).toBe("Skill archive refused");
  expect(result.current.pending).toEqual(proposal);
  expect(result.current.busy).toBe(false);
  expect(installed).toBe(0);
  refused = false;
  await act(async () => { await result.current.confirm(); });
  expect(result.current.error).toBeNull();
  expect(result.current.pending).toBeNull();
  expect(result.current.busy).toBe(false);
  expect(installed).toBe(1);
  expect(requests).toEqual([{ ...proposal, confirmed: true }, { ...proposal, confirmed: true }]);
});

it("a non-Error callback failure uses the install fallback and releases busy state", async () => {
  const requests = installEndpoint();
  const { result } = renderHook(() => useSkillInstall(async () => { throw "refresh unavailable"; }));
  act(() => result.current.propose(proposal));
  await act(async () => { await result.current.confirm(); });
  expect(requests).toEqual([{ ...proposal, confirmed: true }]);
  expect(result.current.pending).toBeNull();
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toBe("Could not install skill.");
});
