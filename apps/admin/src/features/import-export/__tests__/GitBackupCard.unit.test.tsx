import { act, fireEvent, render, screen, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type AdminSourceControlCredentialSummary } from "@/lib/api";
import { GitBackupCard, SOURCE_CONTROL_HREF } from "../GitBackupCard";
import { backupConnectionLabels, gitBackupPlanInput, gitBackupRefusalMessage } from "../git-backup-rules";
import { createFakeGitBackupPort, defaultGitBackupPort, type GitBackupPlan, type GitBackupPort } from "../hooks/git-backup-port.hooks";
import { useGitBackup, useWiredGitBackup } from "../hooks/use-git-backup.hooks";

/**
 * @file The Git backup card driven end to end through `useGitBackup` against a fake port: no
 * connection → link to Source Control; plan → summary; push with polling → commit link; refusals
 * in plain words. Plus the pure rules and the live port's request shapes.
 */

const t = (key: string): string => key;

function connection(overrides: Partial<AdminSourceControlCredentialSummary> = {}): AdminSourceControlCredentialSummary {
  return { id: "c1", providerId: "github", label: "GitHub", configured: true, isDefault: true, createdAt: "", updatedAt: "", ...overrides } as AdminSourceControlCredentialSummary;
}

const PLAN: GitBackupPlan = { planned: true, planId: "plan-1", repository: "me/site-backups", branch: "main", folder: "mysite", folderExists: true, fileCount: 12, totalSize: "3.4 MB", skipped: [{ path: "big.mov" }] };

function Harness({ port, maxPushPolls }: { port: GitBackupPort; maxPushPolls?: number }) {
  return <GitBackupCard controller={useGitBackup({ port, t }, maxPushPolls === undefined ? {} : { maxPushPolls })} t={t} />;
}

function fillForm(owner = "me", repo = "site-backups") {
  fireEvent.change(screen.getByLabelText("Owner"), { target: { value: owner } });
  fireEvent.change(screen.getByLabelText("Repository"), { target: { value: repo } });
}

afterEach(() => vi.unstubAllGlobals());

describe("GitBackupCard", () => {
  it("links to Source Control when no default connection exists", async () => {
    render(<Harness port={createFakeGitBackupPort({ listConnections: async () => [connection({ isDefault: false })] })} />);
    expect(screen.getByText("Loading connections…")).toBeTruthy();
    const link = await screen.findByRole("link", { name: "Open Source Control" });
    expect(link.getAttribute("href")).toBe(SOURCE_CONTROL_HREF);
    expect(screen.getByText("No Git connection yet.")).toBeTruthy();
  });

  it("shows a connections load failure", async () => {
    render(<Harness port={createFakeGitBackupPort({ listConnections: () => Promise.reject(new ApiError("Boom", 500)) })} />);
    expect((await screen.findByRole("alert")).textContent).toBe("Boom");
  });

  it("plans with the only connection, shows the plan, pushes with polling and links the commit", async () => {
    const plans: unknown[] = [];
    const pushes = [
      { pushed: false as const, inProgress: true as const, planId: "plan-1", progress: { filesDone: 4, filesTotal: 12 } },
      { pushed: true as const, commitUrl: "https://github.com/me/site-backups/commit/abc", repository: "me/site-backups" },
    ];
    let releasePlan!: () => void;
    const port = createFakeGitBackupPort({
      listConnections: async () => [connection()],
      plan: (input) => { plans.push(input); return new Promise((resolve) => { releasePlan = () => resolve(PLAN); }); },
      push: async () => pushes.shift()!,
    });
    render(<Harness port={port} />);
    expect(await screen.findByText("Uses GitHub.")).toBeTruthy();
    expect(screen.queryByLabelText("Connection")).toBeNull();
    const plan = screen.getByRole("button", { name: "Plan backup" }) as HTMLButtonElement;
    expect(plan.disabled).toBe(true);
    fillForm("  me ", "site-backups");
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: " " } });
    fireEvent.click(plan);
    expect((await screen.findByRole("button", { name: "Planning…" })).getAttribute("aria-busy")).toBe("true");
    await act(async () => releasePlan());
    expect(plans).toEqual([{ credential: "GitHub", owner: "me", repo: "site-backups" }]);
    expect(await screen.findByText("Replaces folder mysite.")).toBeTruthy();
    expect(screen.getByText("12 files, 3.4 MB")).toBeTruthy();
    expect(screen.getByText("1 skipped")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Push backup" }));
    const commit = await screen.findByRole("link", { name: "View commit" });
    expect(commit.getAttribute("href")).toBe("https://github.com/me/site-backups/commit/abc");
    expect(commit.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Backed up to me/site-backups.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back up again" }));
    expect((screen.getByLabelText("Owner") as HTMLInputElement).value).toBe("  me ");
  });

  it("shows upload progress while the push is still running", async () => {
    let finish!: () => void;
    let calls = 0;
    const port = createFakeGitBackupPort({
      listConnections: async () => [connection()],
      plan: async () => ({ ...PLAN, folderExists: false, skipped: [] }),
      push: () => {
        calls += 1;
        if (calls === 1) return Promise.resolve({ pushed: false as const, inProgress: true as const, planId: "plan-1", progress: { filesDone: 4, filesTotal: 12 } });
        return new Promise((resolve) => { finish = () => resolve({ pushed: false, code: "DIVERGED_BRANCH", message: "server words" }); });
      },
    });
    render(<Harness port={port} />);
    await screen.findByLabelText("Owner");
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Plan backup" }));
    expect(await screen.findByText("Creates folder mysite.")).toBeTruthy();
    expect(screen.queryByText("1 skipped")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Push backup" }));
    expect(await screen.findByText("Uploaded 4 of 12 files…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pushing…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await act(async () => finish());
    expect((await screen.findByRole("alert")).textContent).toBe("The branch changed since the plan. Nothing was written. Plan again.");
  });

  it("offers a choice of connections, cancels a plan, and shows refusals and failures", async () => {
    const plans: Array<{ credential: string }> = [];
    const results: Array<() => Promise<GitBackupPlan | { planned: false; code: string; message: string }>> = [
      async () => PLAN,
      async () => ({ planned: false, code: "REPOSITORY_NOT_PRIVATE", message: "me/site-backups is public." }),
      () => Promise.reject(new ApiError("You do not have permission to back up this site.", 403)),
    ];
    const port = createFakeGitBackupPort({
      listConnections: async () => [connection(), connection({ id: "c2", providerId: "gitlab" as AdminSourceControlCredentialSummary["providerId"], label: "GitLab" })],
      plan: (input) => { plans.push(input); return results.shift()!(); },
    });
    render(<Harness port={port} />);
    const select = (await screen.findByLabelText("Connection")) as HTMLSelectElement;
    expect(select.value).toBe("GitHub");
    fireEvent.change(select, { target: { value: "GitLab" } });
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Plan backup" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Plan backup" }));
    expect((await screen.findByRole("alert")).textContent).toBe("me/site-backups is public.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.submit(screen.getByRole("button", { name: "Plan backup" }).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe("You do not have permission to back up this site.");
    expect(plans.map((input) => input.credential)).toEqual(["GitLab", "GitLab", "GitLab"]);
  });

  it("reports a push that throws", async () => {
    const port = createFakeGitBackupPort({
      listConnections: async () => [connection()],
      plan: async () => PLAN,
      push: () => Promise.reject(new Error("socket closed")),
    });
    render(<Harness port={port} />);
    await screen.findByLabelText("Owner");
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Plan backup" }));
    fireEvent.click(await screen.findByRole("button", { name: "Push backup" }));
    expect((await screen.findByRole("alert")).textContent).toBe("socket closed");
  });

  it("gives up after the poll cap with a plain line", async () => {
    const port = createFakeGitBackupPort({
      listConnections: async () => [connection()],
      plan: async () => PLAN,
      push: async () => ({ pushed: false as const, inProgress: true as const, planId: "plan-1", progress: { filesDone: 1, filesTotal: 12 } }),
    });
    render(<Harness port={port} maxPushPolls={2} />);
    await screen.findByLabelText("Owner");
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Plan backup" }));
    fireEvent.click(await screen.findByRole("button", { name: "Push backup" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The backup is taking too long. Check the repository later.");
  });
});

describe("useGitBackup guards", () => {
  it("ignores a second plan while planning, a push with no plan, and answers after unmount", async () => {
    let release!: () => void;
    const plan = vi.fn(() => new Promise<GitBackupPlan>((resolve) => { release = () => resolve(PLAN); }));
    const push = vi.fn();
    let controller!: ReturnType<typeof useGitBackup>;
    function Probe() { controller = useGitBackup({ port: createFakeGitBackupPort({ listConnections: async () => [connection()], plan, push }), t }); return null; }
    const view = render(<Probe />);
    await waitFor(() => expect(controller.connections).toEqual(["GitHub"]));
    await act(async () => { await controller.pushBackup(); });
    expect(push).not.toHaveBeenCalled();
    await act(async () => { await controller.planBackup(); });
    expect(plan).not.toHaveBeenCalled();
    act(() => { controller.setField("owner", "me"); });
    act(() => { controller.setField("repo", "r"); });
    expect(controller.form).toEqual({ connection: "GitHub", owner: "me", repo: "r", branch: "" });
    let first!: Promise<void>;
    act(() => { first = controller.planBackup(); });
    await act(async () => { await controller.planBackup(); });
    expect(plan).toHaveBeenCalledTimes(1);
    view.unmount();
    release();
    await first;
  });

  it("stops polling once unmounted", async () => {
    let controller!: ReturnType<typeof useGitBackup>;
    let pushes = 0;
    let unmount!: () => void;
    const port = createFakeGitBackupPort({
      listConnections: async () => [connection()],
      plan: async () => PLAN,
      push: async () => { pushes += 1; if (pushes === 2) unmount(); return { pushed: false as const, inProgress: true as const, planId: "plan-1", progress: { filesDone: 1, filesTotal: 2 } }; },
    });
    function Probe() { controller = useGitBackup({ port, t }); return null; }
    unmount = render(<Probe />).unmount;
    await waitFor(() => expect(controller.connections).toEqual(["GitHub"]));
    act(() => { controller.setField("owner", "me"); controller.setField("repo", "r"); });
    await act(async () => { await controller.planBackup(); });
    await act(async () => { await controller.pushBackup(); });
    expect(pushes).toBe(2);
  });

  it("the plan result arriving after unmount and a failed plan after unmount change nothing", async () => {
    let controller!: ReturnType<typeof useGitBackup>;
    let reject!: (error: Error) => void;
    const port = createFakeGitBackupPort({ listConnections: async () => [connection()], plan: () => new Promise((_resolve, rejectPlan) => { reject = rejectPlan; }) });
    function Probe() { controller = useGitBackup({ port, t }); return null; }
    const view = render(<Probe />);
    await waitFor(() => expect(controller.connections).toEqual(["GitHub"]));
    act(() => { controller.setField("owner", "me"); controller.setField("repo", "r"); });
    let pending!: Promise<void>;
    act(() => { pending = controller.planBackup(); });
    view.unmount();
    reject(new Error("late"));
    await pending;
  });
});

describe("git-backup rules", () => {
  it("offers each default connection once", () => {
    expect(backupConnectionLabels([connection(), connection({ id: "c2" }), connection({ id: "c3", label: "Other", isDefault: false })])).toEqual(["GitHub"]);
  });

  it("sends a trimmed branch only when one is typed", () => {
    expect(gitBackupPlanInput({ connection: "GitHub", owner: " me ", repo: " r ", branch: " dev " })).toEqual({ credential: "GitHub", owner: "me", repo: "r", branch: "dev" });
  });

  it.each([
    [{ code: "PLAN_EXPIRED", message: "call site_backup_plan" }, "The plan expired. Plan again."],
    [{ code: "PLAN_NOT_FOUND" }, "That plan is gone. Plan again."],
    [{ code: "CREDENTIAL_NOT_FOUND", message: "credential_save" }, "That connection is gone. Check Source Control."],
    [{ reason: "expired" as const }, "The backup stopped. Nothing was committed. Plan again."],
    [{ cancelled: true }, "The backup stopped. Nothing was committed. Plan again."],
    [{ code: "NO_PUSH_PERMISSION", message: "This token cannot push." }, "This token cannot push."],
    [{}, "Git backup failed."],
  ])("says %j as %s", (refusal, line) => {
    expect(gitBackupRefusalMessage(refusal, t)).toBe(line);
  });
});

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

  it("the fake rejects calls a test did not describe, and the wired hook uses the live port", async () => {
    const fake = createFakeGitBackupPort();
    await expect(fake.plan({ credential: "a", owner: "b", repo: "c" })).rejects.toThrow("plan was not expected");
    await expect(fake.push({ planId: "p" })).rejects.toThrow("push was not expected");
    vi.stubGlobal("fetch", async () => Response.json({ credentials: [] }));
    let controller!: ReturnType<typeof useWiredGitBackup>;
    function Probe() { controller = useWiredGitBackup({ t }); return null; }
    render(<Probe />);
    await waitFor(() => expect(controller.connections).toEqual([]));
    act(() => { controller.setField("owner", "me"); });
    expect(controller.form.connection).toBe("");
  });
});
