import { act, render, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSourceControlCredentialSummary } from "@/features/source-control/api/source-control-api.types";
import { defaultGitBackupPort, useWiredGitBackup } from "../hooks/use-git-backup.hooks";

/**
 * @file The host wiring of the Git backup card: the live port's request shapes and the wired hook on
 * the live port. The card, its hook, the rules and the fake port are tested in `@jini-ai/admin`
 * (`screens/import-export/__tests__/GitBackupCard.unit.test.tsx`).
 */

const t = (key: string): string => key;

function connection(overrides: Partial<AdminSourceControlCredentialSummary> = {}): AdminSourceControlCredentialSummary {
  return { id: "c1", providerId: "github", label: "GitHub", configured: true, isDefault: true, createdAt: "", updatedAt: "", ...overrides } as AdminSourceControlCredentialSummary;
}

afterEach(() => vi.unstubAllGlobals());

describe("live Git backup port", () => {
  it("lists connections from Source Control and posts plan and push to the backup routes", async () => {
    const seen: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push({ url, method: init?.method ?? "GET", body: init?.body === undefined ? undefined : JSON.parse(init.body as string) });
      return Response.json(url.endsWith("/credentials") ? { credentials: [connection()] } : { ok: true });
    });
    expect(await defaultGitBackupPort.listConnections()).toEqual([connection()]);
    await defaultGitBackupPort.plan({ credential: "GitHub", owner: "me", repo: "r" });
    await defaultGitBackupPort.push({ planId: "plan-1" });
    expect(seen.map(({ url, method, body }) => [url.replace(/^.*\/workspaces\/[^/]+/, ""), method, body])).toEqual([
      ["/system/source-control/credentials", "GET", undefined],
      ["/site-backups/plan", "POST", { credential: "GitHub", owner: "me", repo: "r" }],
      ["/site-backups/push", "POST", { planId: "plan-1" }],
    ]);
  });

  it("the wired hook uses the live port", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ credentials: [] }));
    let controller!: ReturnType<typeof useWiredGitBackup>;
    function Probe() { controller = useWiredGitBackup({ t }); return null; }
    render(<Probe />);
    await waitFor(() => expect(controller.connections).toEqual([]));
    act(() => { controller.setField({ field: "owner", value: "me" }); });
    expect(controller.form.connection).toBe("");
  });
});
