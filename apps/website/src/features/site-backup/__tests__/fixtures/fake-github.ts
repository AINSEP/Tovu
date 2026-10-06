import assert from "node:assert/strict";

import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../../platform/http/index.js";

/**
 * @file The fake GitHub every site-backup suite pushes to: the unit suite drives the tools with it
 * directly, and the composition suite (`site-backup-wiring.integration.test.ts`) swaps it in for
 * the composed runtime's real egress client, so the plan and the push run through the real wiring.
 */

/** What the next blob POST does instead of storing the blob: answer with this status (and headers),
 *  or throw this transport error. */
export type BlobFault = { readonly status: number; readonly headers?: Record<string, string>; readonly message?: string } | { readonly throws: Error };

/** A GitHub stand-in for `octo/backups`, answering from mutable state so a test can change the world
 *  between the plan and the push. Every request is recorded; an unknown one is recorded as
 *  `unexpected` and answered 599 so it cannot pass silently. A tree entry may carry its file inline
 *  (`content`, UTF-8) instead of a blob `sha`, as the backup push sends small text files. */
export class FakeGitHub implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  readonly unexpected: string[] = [];
  readonly blobContents: Buffer[] = [];
  /** Consumed one per blob POST, before the blob is stored. */
  readonly blobFaults: BlobFault[] = [];
  /** When set, every blob POST waits on it before answering (to hold a push mid-upload). */
  blobGate: Promise<void> | undefined;
  /** Blob POSTs being answered right now, and the most there ever were at once. */
  blobsInFlight = 0;
  maxBlobsInFlight = 0;
  readonly files = new Map<string, Buffer>([["README.md", Buffer.from("Outside the backup folder")]]);
  private readonly treeFiles = new Map<string, Map<string, Buffer>>();
  private commitTree: string | undefined;
  readonly state = { visibility: "private", push: true, tip: "tip-1", folderExists: false, patchStatus: 200, networkDown: false };
  private trees = 0;

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    if (this.state.networkDown) throw Object.assign(new Error("connect ECONNREFUSED 140.82.112.6:443"), { code: "ECONNREFUSED" });
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname.replace(/^\/repos\/octo\/backups/, "")}${url.search}`;
    const s = this.state;
    if (route === "GET ") {
      return json(200, { private: s.visibility === "private", visibility: s.visibility, default_branch: "main", html_url: "https://github.com/octo/backups", permissions: { push: s.push } });
    }
    if (route === "GET /git/ref/heads/main") return json(200, { object: { sha: s.tip } });
    if (route === `GET /git/commits/${s.tip}`) {
      this.treeFiles.set(`tree-of-${s.tip}`, new Map(this.files));
      return json(200, { tree: { sha: `tree-of-${s.tip}` } });
    }
    if (route === "GET /contents/demo-site?ref=main") return s.folderExists ? json(200, [{ name: "tovu-backup.json" }]) : json(404, { message: "Not Found" });
    if (route === "POST /git/blobs") return this.createBlob(request);
    if (route === "POST /git/trees") {
      const body = JSON.parse(request.body ?? "{}");
      if (body.base_tree) assert.ok(this.treeFiles.has(body.base_tree), "base tree must exist");
      const files = new Map(this.treeFiles.get(body.base_tree) ?? []);
      for (const entry of body.tree) {
        for (const old of files.keys()) if (old === entry.path || old.startsWith(`${entry.path}/`)) files.delete(old);
        if (entry.type === "tree") {
          const subtree = this.treeFiles.get(entry.sha);
          assert.ok(subtree, "subtree must exist");
          for (const [name, bytes] of subtree) files.set(`${entry.path}/${name}`, bytes);
        } else if (typeof entry.content === "string") {
          assert.equal(entry.type, "blob");
          assert.equal(entry.sha, undefined, "an inline entry carries content OR a sha, never both");
          files.set(entry.path, Buffer.from(entry.content, "utf8"));
        } else {
          assert.equal(entry.type, "blob");
          const bytes = this.blobContents[Number(entry.sha.replace("blob-", "")) - 1];
          assert.ok(bytes, "referenced blob must exist");
          files.set(entry.path, bytes);
        }
      }
      const sha = `new-tree-${++this.trees}`;
      this.treeFiles.set(sha, files);
      return json(201, { sha });
    }
    if (route === "POST /git/commits") {
      const body = JSON.parse(request.body ?? "{}");
      assert.deepEqual(body.parents, [s.tip]);
      assert.ok(this.treeFiles.has(body.tree));
      this.commitTree = body.tree;
      return json(201, { sha: "new-commit" });
    }
    if (route === "PATCH /git/refs/heads/main") {
      if (s.patchStatus !== 200) return json(s.patchStatus, { message: "Update is not a fast forward" });
      const body = JSON.parse(request.body ?? "{}");
      assert.equal(body.sha, "new-commit");
      assert.notEqual(body.force, true);
      assert.ok(this.commitTree);
      this.files.clear();
      for (const [name, bytes] of this.treeFiles.get(this.commitTree)!) this.files.set(name, bytes);
      s.tip = "new-commit";
      return json(200, { object: { sha: "new-commit" } });
    }
    this.unexpected.push(route);
    return json(599, { message: "unexpected request" });
  }

  private async createBlob(request: HttpRequest): Promise<HttpResponse> {
    this.blobsInFlight += 1;
    this.maxBlobsInFlight = Math.max(this.maxBlobsInFlight, this.blobsInFlight);
    try {
      if (this.blobGate) await this.blobGate;
      // Yields once so blob requests started together are all in flight before any answers.
      await new Promise((resolve) => setImmediate(resolve));
      const fault = this.blobFaults.shift();
      if (fault && "throws" in fault) throw fault.throws;
      if (fault) return { status: fault.status, headers: fault.headers ?? {}, bodyText: JSON.stringify({ message: fault.message ?? "fault" }) };
      const body = JSON.parse(request.body ?? "{}") as { content: string; encoding: string };
      this.blobContents.push(Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8"));
      return json(201, { sha: `blob-${this.blobContents.length}` });
    } finally {
      this.blobsInFlight -= 1;
    }
  }

  /** The git Data API writes in order, as `METHOD /path` relative to the repository. */
  writeRoutes(): string[] {
    return this.writes().map((c) => `${c.method} ${new URL(c.url).pathname.replace(/^\/repos\/octo\/backups/, "")}`);
  }

  writes(): HttpRequest[] {
    return this.calls.filter((c) => c.method !== "GET");
  }
}

function json(status: number, body: unknown): HttpResponse {
  return { status, headers: {}, bodyText: JSON.stringify(body) };
}
