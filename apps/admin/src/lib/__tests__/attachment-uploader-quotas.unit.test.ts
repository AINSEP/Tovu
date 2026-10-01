import { afterEach, describe, expect, it, vi } from "vitest";
import { createDaemonAttachmentUploader } from "@jini-ai/chat/react";

afterEach(() => vi.unstubAllGlobals());

const file = (name: string, size = 4) => new File([new Uint8Array(size)], name);
const options = (batchId = "turn-1", signal = new AbortController().signal) => ({ batchId, signal });
const success = (name: string) => Response.json({ attachment: { kind: "file", name, path: `/uploads/${name}`, size: 4 } });

describe("the installed daemon attachment uploader", () => {
  it("rejects the count and aggregate-byte limits before posting, including earlier uploads in the same turn", async () => {
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => success((init.body as File).name));
    vi.stubGlobal("fetch", fetch);
    const upload = createDaemonAttachmentUploader("", { maxAttachmentCount: 2, maxBatchBytes: 8 });
    await upload([file("first.txt")], options());
    await expect(upload([file("second.txt"), file("third.txt")], options())).rejects.toThrow("at most 2 files");
    await expect(upload([file("large.txt", 5)], options())).rejects.toThrow("total 8 bytes");
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(upload([file("second.txt")], options())).resolves.toEqual([expect.objectContaining({ name: "second.txt" })]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reserves quota while an earlier upload is still in flight", async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const upload = createDaemonAttachmentUploader("", { maxAttachmentCount: 1 });
    const first = upload([file("first.txt")], options());
    await expect(upload([file("overlap.txt")], options())).rejects.toThrow("at most 1 files");
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(success("first.txt"));
    await expect(first).resolves.toEqual([expect.objectContaining({ name: "first.txt" })]);
  });

  it("deletes a landed file after a sibling failure, returns no partial result, and permits a full retry", async () => {
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      const name = (init.body as File).name;
      return name === "failed.txt" ? Response.json({ error: { message: "rejected fixture" } }, { status: 400 }) : success(name);
    });
    vi.stubGlobal("fetch", fetch);
    const upload = createDaemonAttachmentUploader("", { concurrency: 1, maxAttachmentCount: 2, maxBatchBytes: 8 });
    await expect(upload([file("landed.txt"), file("failed.txt")], options())).rejects.toThrow("rejected fixture");
    const cleanup = fetch.mock.calls.find(([, init]) => init.method === "DELETE");
    expect(cleanup?.[0]).toBe("/api/attachments");
    expect(JSON.parse(cleanup?.[1].body as string)).toEqual({ batchId: "turn-1", paths: ["/uploads/landed.txt"] });
    await expect(upload([file("retry-1.txt"), file("retry-2.txt")], options())).resolves.toEqual([
      expect.objectContaining({ name: "retry-1.txt" }), expect.objectContaining({ name: "retry-2.txt" }),
    ]);
  });

  it("aborts the in-flight request on cancellation, cleans up the landed file, and releases the reservation", async () => {
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      const name = (init.body as File).name;
      if (name !== "pending.txt") return success(name);
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
        started();
      });
    });
    vi.stubGlobal("fetch", fetch);
    const upload = createDaemonAttachmentUploader("", { concurrency: 1, maxAttachmentCount: 2 });
    const controller = new AbortController();
    const pending = upload([file("landed.txt"), file("pending.txt")], options("turn-1", controller.signal));
    const rejected = expect(pending).rejects.toThrow("cancelled fixture");
    await waiting;
    controller.abort(new Error("cancelled fixture"));
    await rejected;
    const cleanup = fetch.mock.calls.find(([, init]) => init.method === "DELETE");
    expect(JSON.parse(cleanup?.[1].body as string)).toEqual({ batchId: "turn-1", paths: ["/uploads/landed.txt"] });
    await expect(upload([file("retry-1.txt"), file("retry-2.txt")], options())).resolves.toHaveLength(2);
  });
});
